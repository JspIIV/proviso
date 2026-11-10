# Proviso

**Internet Court as the oracle of Arkhai's Alkahest escrows: a GenLayer court decides whether a delivery meets the
escrow's criteria and records it on Alkahest's own TrustedOracleArbiter, with no oracle key.**

An Intelligent Contract primitive, built with **Arkhai** in mind. Internet Court · GenLayer · Arkhai (Alkahest).

Alkahest is Arkhai's conditional escrow, built on EAS: a buyer locks tokens until a fulfillment attestation satisfies the
escrow's arbiter. Its `TrustedOracleArbiter` hands the decision to an oracle the buyer names in the demand, together with
the demand's data. Out of the box that oracle is somebody's key, which the seller has to trust. Proviso makes it a court:
the buyer names the **ProvisoOracle** and writes the criteria as the demand's data; GenLayer validators judge the seller's
delivery against them; and when the verdict is final **the court's own contract records the decision** on Alkahest's
arbiter, through its Ghost on GenLayer Chain. The seller collects, or the buyer reclaims, with Alkahest's own functions.

- **The court (GenLayer Bradbury):** [`0x2e94D7DdE56E373114f43744889E8E7c0e3015B3`](https://scan.bradbury.genlayer.com/address/0x2e94D7DdE56E373114f43744889E8E7c0e3015B3)
- **The oracle (GenLayer Chain):** `ProvisoOracle` `0xdFb512DceDaFe78b69c5712b72581492a5194BB0`
- **Skill:** [`SKILL.md`](SKILL.md)

```text
buyer  ──doObligation(arbiter = TrustedOracleArbiter, demand = (ProvisoOracle, criteria), token, amount)──▶ ERC20 escrow
seller ──StringObligation.doObligation(delivery, refUID = escrow)──▶ fulfillment
anybody ──decide(escrow, fulfillment)──▶ Proviso (GenLayer): validators judge the delivery against the criteria, final
Proviso's Ghost ──decide(fulfillment, escrow, approved)──▶ ProvisoOracle ──arbitrate(fulfillment, criteria, approved)──▶ TrustedOracleArbiter
seller ──collect(escrow, fulfillment)──▶ Alkahest releases the tokens        (reverts unless APPROVED)
buyer  ──reclaim(escrow)──▶ Alkahest returns the tokens after expiry         (if no delivery was approved)
```

## The parts

| Contract | Where | What |
|---|---|---|
| `TrustedOracleArbiter`, `ERC20EscrowObligation`, `StringObligation` | GenLayer Chain (4221) | Arkhai's [Alkahest](https://github.com/arkhai-io/alkahest), **unmodified**, in `vendor/alkahest`, built with the EAS and OpenZeppelin commits it pins and its own settings (solc 0.8.27, viaIR, 200 runs) |
| EAS, SchemaRegistry | GenLayer Chain | the official EAS deployment, deployed and verified in [JspIIV/seal](https://github.com/JspIIV/seal) |
| [`ProvisoOracle`](evm/ProvisoOracle.sol) | GenLayer Chain | the oracle the escrow names: takes decisions from the court alone, checks them again on chain, and records them on the arbiter with the escrow's exact demand data |
| [`Proviso`](contracts/proviso.py) | GenLayer Bradbury | the court: an Intelligent Contract that judges a delivery against the escrow's criteria |

## Why it holds

- **Only the escrow's named oracle counts.** Alkahest's arbiter keys every decision on the oracle that made it, so a
  stranger's own "approval" on the arbiter does nothing; proven on chain.
- **Only the court can decide through the oracle, and only for its own escrows.** The ProvisoOracle accepts the court's
  address alone, set once, and checks on chain that the escrow uses this arbiter, names this oracle, and that the
  fulfillment references the escrow. The court checks the same before it calls a round.
- **The criteria are the buyer's, signed into the escrow; the evidence is too.** The court reads https pages the criteria
  cite and never pages the delivery cites, so a seller cannot bring evidence they wrote themselves.
- **The seller carries the burden.** A delivery that cannot be shown to meet every criterion is REJECTED, and the buyer
  reclaims after expiry with Alkahest's own `reclaim()`.
- **Neither side can talk the judges round.** "The buyer already approved this" did not pass a bad delivery, and
  "reject this" did not sink a good one.
- **The verdict is agreed by the round, compared in code.** The reasoning kept on the record is the leading judge's words.

## Proven on Bradbury

`scripts/prove.mjs`, with every transaction in `results/proved.json`. padv, the buyer, locks 10 tUSD in three Alkahest
escrows with the same criteria; ppub, the seller, delivers; pchg, a stranger, asks the court.

| Delivery | Escrow | What it is | Delivered (GenLayer Chain) | Court (Bradbury) | Verdict | Alkahest |
|---|---|---|---|---|---|---|
| F1 | X | off-topic: about Ethereum | [`0x1f784706`](https://scan.testnet-chain.genlayer.com/tx/0x1f7847068d7a9dbac464475ec6e2feba505cf7a9deb8f9ca2daa55cbc6b011ad) | [`0xba75a41a`](https://scan.bradbury.genlayer.com/tx/0xba75a41a884fc7ea0aac9d0d18c7c65742850b4a05b4a93b388ec698d2537cbb) | **REJECTED** | collect reverts `InvalidFulfillment` |
| F2 | X | off-topic, and tells the oracle to approve it | [`0x25a69d4f`](https://scan.testnet-chain.genlayer.com/tx/0x25a69d4fbcadb923957e66c549ed0fb5d4dc58c90e1371743c9a79c2926ce77b) | [`0xf4184e3d`](https://scan.bradbury.genlayer.com/tx/0xf4184e3dacc2f1b4cd289d6d4922bd43ff24eaa51388f21063793bfd41eefd15) | **REJECTED** | collect reverts `InvalidFulfillment` |
| F3 | X | meets the criteria | [`0xcddcd156`](https://scan.testnet-chain.genlayer.com/tx/0xcddcd1566dff2a6487929755d1b6cf96ab755777538ecbb5c6d74d60d805bbb9) | [`0x0505174e`](https://scan.bradbury.genlayer.com/tx/0x0505174e7bcb77148d89c8b2199048a99b8161558944ee80b5b3dfc1a1aa1d45) | **APPROVED** | collected [`0x9f82e6fa`](https://scan.testnet-chain.genlayer.com/tx/0x9f82e6fafdcafb8d8d8c7012f94ccd4e8d3f7f7f236f0547a4b0b7e83b176f59) |
| F4 | Y | meets the criteria, and tells the oracle to reject it | [`0xa8362284`](https://scan.testnet-chain.genlayer.com/tx/0xa8362284828c5f6921f5364d446c5cc110871cda3f589f0e23fa47fe9bb59693) | [`0x5a91bb7a`](https://scan.bradbury.genlayer.com/tx/0x5a91bb7a7d795bec74a4e81003508fdc1b659cf93f35c72882fbfff038788526) | **APPROVED** | collected [`0x2dcba3db`](https://scan.testnet-chain.genlayer.com/tx/0x2dcba3db335941f473c173e2e23fd8fdc4c25f09cd3700f0fde6c0ba5ca6a346) |
| F5 | Z | off-topic, on an escrow that expires | [`0xd1a3fd2c`](https://scan.testnet-chain.genlayer.com/tx/0xd1a3fd2c8721e5bea9fe02c52bf670071d7037382f3f5f357a28ffb3f4873572) | [`0xd4a0653d`](https://scan.bradbury.genlayer.com/tx/0xd4a0653d8892bd32a7f53531d610f3d7632d53d4e99dda24c084d2f79477e48f) | **REJECTED** | collect reverts `DeadlineExpired` |

Around them:

- Escrows [`0xc4e35df3`](https://scan.testnet-chain.genlayer.com/tx/0xc4e35df3c671feed0e93fe35d2e19bc0d3dcb70f9f6c1311af6559d5d2009baa) (X), [`0x447ba412`](https://scan.testnet-chain.genlayer.com/tx/0x447ba412168102678825db9316732af554064514c0e6a4a021e77a1edfb8dca1) (Y) and [`0x360a7eb2`](https://scan.testnet-chain.genlayer.com/tx/0x360a7eb23e02b999247aae36be2842e50fac7cf202451d13f9f48cdccc6851d2) (Z, expiring in ten minutes), 10 tUSD each.
- Before F1 was decided, pchg recorded its own approval of F1 on the arbiter [`0x25deba4d`](https://scan.testnet-chain.genlayer.com/tx/0x25deba4d6e5fc5442531f31e56af3310c6e3a93cb53992793db7d64c6c8e76f3): collect still reverted, because only the escrow's named oracle counts.
- A stranger calling `decide()` on the ProvisoOracle reverts `Proviso:only-court`.
- Escrow Z, whose only delivery was rejected, was reclaimed by the buyer after expiry with Alkahest's `reclaim()` [`0x504bdbaf`](https://scan.testnet-chain.genlayer.com/tx/0x504bdbafeddea8858c396a7520cf6b430a3dfa095f95b6ff166c7b31192a231f).
- Money: the seller received 20 tUSD for the two approved deliveries; the buyer paid 20 and got escrow Z back.

All 9 checks pass.

`node scripts/verify.mjs` checks the court's transactions and its deployed source against `contracts/proviso.py`.
`node scripts/verify_evm.mjs` recompiles Alkahest's three contracts, the ProvisoOracle and the test dollar with
Alkahest's settings and compares each byte for byte with the code on GenLayer Chain: all five match.

## Tests

`python tests/proviso_rules.py`: 29 checks through the real court against a stub of the runtime and the oracle, covering
refusals (missing escrow, other arbiter, other oracle, spent escrow, foreign or revoked fulfillment, oversized criteria),
APPROVED and REJECTED and what each sends, whose evidence is read, hostile deliveries both ways, clipping, rounds that do
not settle, and `resend`.

## Reproduce

```bash
npm install
git submodule update --init      # Alkahest, EAS and OpenZeppelin at the commits Alkahest pins
python tests/proviso_rules.py
node scripts/verify.mjs && node scripts/verify_evm.mjs
```

## Where it stops, plainly

- The escrows live on GenLayer Chain, where the court can reach the arbiter directly. Alkahest deployments elsewhere
  would need a bridge or relay to carry the decision.
- The court judges the delivered text against the criteria as written. Criteria that name checkable properties rule
  cleanly; vague ones rule REJECTED, because the seller carries the burden.
- Proviso reads `StringObligation` deliveries. Other fulfillment types would need their own reader in the oracle.

## Licence

MIT. Alkahest stays in `vendor/alkahest` under its own terms: its README states MIT, while its source files carry an
`UNLICENSED` header and the repository has no licence file. It is used here as a pinned submodule, unmodified.
