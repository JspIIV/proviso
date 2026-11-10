// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Attestation} from "@eas/Common.sol";
import {IEAS} from "@eas/IEAS.sol";

interface ITrustedOracleArbiter {
    function arbitrate(bytes32 fulfillmentUid, bytes memory demand, bool decision) external;
}

/**
 * @title ProvisoOracle
 * @notice The oracle an Alkahest escrow names when it wants Internet Court to decide. It is the address Alkahest's
 * TrustedOracleArbiter keys decisions on, and it takes decisions from one caller only: the Proviso court on GenLayer,
 * set once. For each decision it checks again, on chain, that the escrow uses that arbiter, names this oracle, and that
 * the fulfillment references the escrow, then records the decision on the arbiter with the escrow's exact demand data.
 *
 * It also reads escrows and fulfillments as flat values, which an Intelligent Contract on GenLayer can decode: EAS's
 * Attestation struct, with its dynamic data, it cannot yet.
 */
contract ProvisoOracle {
    struct EscrowData {
        address arbiter;
        bytes demand;
        address token;
        uint256 amount;
    }

    struct OracleDemand {
        address oracle;
        bytes data;
    }

    struct StringData {
        string item;
        bytes32 schema;
    }

    IEAS public immutable eas;
    ITrustedOracleArbiter public immutable arbiter;
    address public immutable deployer;
    address public court;
    mapping(bytes32 => bool) public decided;
    mapping(bytes32 => bool) public approved;

    event CourtSet(address court);
    event Decided(bytes32 indexed escrowUid, bytes32 indexed fulfillmentUid, bool approved, bytes32 reason);

    constructor(IEAS _eas, ITrustedOracleArbiter _arbiter) {
        eas = _eas;
        arbiter = _arbiter;
        deployer = msg.sender;
    }

    /// @notice Names the court, once. After this nobody, the deployer included, can change it.
    function setCourt(address _court) external {
        require(msg.sender == deployer, "Proviso:only-deployer");
        require(court == address(0) && _court != address(0), "Proviso:court-set");
        court = _court;
        emit CourtSet(_court);
    }

    /// @notice The court's decision on a fulfillment of an escrow, recorded on Alkahest's TrustedOracleArbiter.
    function decide(bytes32 fulfillmentUid, bytes32 escrowUid, bool _approved, bytes32 reason) external {
        require(msg.sender == court, "Proviso:only-court");
        Attestation memory e = eas.getAttestation(escrowUid);
        require(e.uid != bytes32(0), "Proviso:no-escrow");
        EscrowData memory ed = abi.decode(e.data, (EscrowData));
        require(ed.arbiter == address(arbiter), "Proviso:other-arbiter");
        OracleDemand memory d = abi.decode(ed.demand, (OracleDemand));
        require(d.oracle == address(this), "Proviso:other-oracle");
        require(eas.getAttestation(fulfillmentUid).refUID == escrowUid, "Proviso:not-for-this-escrow");
        decided[fulfillmentUid] = true;
        approved[fulfillmentUid] = _approved;
        arbiter.arbitrate(fulfillmentUid, d.data, _approved);
        emit Decided(escrowUid, fulfillmentUid, _approved, reason);
    }

    // ------------------------------------------------------------------ reads, flat for any caller

    /// @notice An escrow's terms and state. `revoked` is true once it was collected or reclaimed.
    function escrow(bytes32 uid)
        external
        view
        returns (bytes32 schema, address escrowArbiter, address oracle, address token, uint256 amount, address buyer, uint64 expiration, bool revoked)
    {
        Attestation memory a = eas.getAttestation(uid);
        if (a.uid == bytes32(0)) return (bytes32(0), address(0), address(0), address(0), 0, address(0), 0, false);
        EscrowData memory ed = abi.decode(a.data, (EscrowData));
        OracleDemand memory d = abi.decode(ed.demand, (OracleDemand));
        return (a.schema, ed.arbiter, d.oracle, ed.token, ed.amount, a.recipient, a.expirationTime, a.revocationTime != 0);
    }

    /// @notice The escrow's criteria: the data its demand hands the oracle, as text.
    function criteria(bytes32 uid) external view returns (string memory) {
        Attestation memory a = eas.getAttestation(uid);
        if (a.uid == bytes32(0)) return "";
        EscrowData memory ed = abi.decode(a.data, (EscrowData));
        return string(abi.decode(ed.demand, (OracleDemand)).data);
    }

    /// @notice A fulfillment's link to its escrow and its state.
    function fulfillment(bytes32 uid) external view returns (bytes32 schema, bytes32 refUID, address seller, bool revoked) {
        Attestation memory a = eas.getAttestation(uid);
        return (a.schema, a.refUID, a.recipient, a.revocationTime != 0);
    }

    /// @notice A StringObligation fulfillment's delivered text.
    function delivery(bytes32 uid) external view returns (string memory) {
        Attestation memory a = eas.getAttestation(uid);
        if (a.uid == bytes32(0)) return "";
        return abi.decode(a.data, (StringData)).item;
    }
}
