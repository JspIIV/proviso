---
name: proviso-alkahest-oracle
description: Make Internet Court the oracle of an Arkhai Alkahest escrow, so a GenLayer court decides whether a delivery meets the buyer's written criteria and records it on Alkahest's TrustedOracleArbiter, with no oracle key. Use when an agent or app pays for work through Alkahest and needs the release decided by evidence, not by a trusted party.
---

# Proviso: Internet Court as an Alkahest oracle

Internet Court lists Arkhai's Alkahest under contracts and obligations, with custom arbiters. Proviso needs no new
arbiter: it plugs the court into Alkahest's own `TrustedOracleArbiter` as the oracle.

## Deployed on GenLayer Bradbury Phase 2 (chain 4221)

| Contract | Address | Source |
|---|---|---|
| Proviso (Intelligent Contract, the court) | `0x2e94D7DdE56E373114f43744889E8E7c0e3015B3` | `contracts/proviso.py` |
| ProvisoOracle (the oracle escrows name) | `0xdFb512DceDaFe78b69c5712b72581492a5194BB0` | `evm/ProvisoOracle.sol` |
| TrustedOracleArbiter | `0x2B67aC1083c1EC26471C2f92902822DD62Ea6426` | Alkahest, unmodified |
| ERC20EscrowObligation | `0xE3dc3e601b72D362836bF0a21f6D0bC6382a0650` | same |
| StringObligation | `0x6c0746A6b1e574F7C3a2D93A4ef76c06bc64A226` | same |
| EAS | `0x9052b042dcbFda11312d32F27FB4d1b5046d9ACb` | official, see JspIIV/seal |
| Test dollar | `0xe2D23E4EF0B6A74504D05f4a8D7ADb40744Cc0F6` | `evm/TestUSD.sol`, anyone may mint |

RPC for GenLayer writes: `https://rpc-bradbury.genlayer.com`. RPC for EVM calls: `https://rpc.testnet-chain.genlayer.com`.

## Workflow

1. **Buyer locks the payment** with the criteria as the oracle's data:
   ```js
   const demand = AbiCoder.defaultAbiCoder().encode(['tuple(address oracle, bytes data)'], [[PROVISO_ORACLE, toUtf8Bytes(criteria)]]);
   await escrow.doObligation([TRUSTED_ORACLE_ARBITER, demand, token, amount], expirationTime);
   ```
   Write criteria that name checkable properties. Cite https pages there if the judges need facts.
2. **Seller delivers:** `stringObligation.doObligation([deliveryText, ZeroHash], escrowUid)`.
3. **Anybody asks the court** on GenLayer, funding the message that records the decision:
   ```js
   const gasLimit = 400000n, maxGasPrice = 1000000000n, budget = gasLimit * maxGasPrice;
   const feeParams = AbiCoder.defaultAbiCoder().encode(['uint256','uint256'], [gasLimit, maxGasPrice]);
   const messageAllocations = [{ messageType: 0, onAcceptance: false, recipient: PROVISO_ORACLE, budget, feeParams }];
   const e = await client.estimateTransactionFees({ totalMessageFees: budget, messageAllocations });
   await client.writeContract({ address: PROVISO, functionName: 'decide', args: [escrowUid, fulfillmentUid],
     fees: { distribution: e.distribution, feeValue: e.feeValue, messageAllocations } });
   ```
4. **Settle with Alkahest:** the seller calls `escrow.collect(escrowUid, fulfillmentUid)` (it reverts unless APPROVED);
   if no delivery is approved, the buyer calls `escrow.reclaim(escrowUid)` after expiry.

## Decision payload

| Field | Where | Meaning |
|---|---|---|
| `verdict` | `Proviso.case(fulfillmentUid)` | `APPROVED` or `REJECTED`, agreed by the round |
| `why`, `misses` | same | the leading judge's words, not agreed by the round |
| `approved` | `ProvisoOracle.approved(fulfillmentUid)` | what the arbiter holds |
| `reason` | `ProvisoOracle` `Decided` event | sha256 of `proviso|<escrow>|<fulfillment>|<verdict>` |

## Limits

- Escrows must live on GenLayer Chain for the court to reach the arbiter directly.
- Deliveries are read as `StringObligation` text; pages the delivery cites are never read.
