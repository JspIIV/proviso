// Compiles Arkhai's Alkahest contracts (vendor/alkahest, unmodified) with the EAS and OpenZeppelin commits Alkahest pins,
// and Proviso's own EVM contracts, with Alkahest's settings: solc 0.8.27, viaIR, optimizer on, 200 runs
// (contracts/foundry.toml). The compiler is the official soljson build, checked against binaries.soliditylang.org
// (sha256 d91c0827...).
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import url from 'url';

const require = createRequire(import.meta.url);
export const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const solc = require('solc/wrapper')(require(path.join(ROOT, 'tools', 'soljson-v0.8.27.cjs')));
const V = path.join(ROOT, 'vendor');
export const SETTINGS = { viaIR: true, optimizer: { enabled: true, runs: 200 } };
// Alkahest's remappings (contracts/remappings.txt), pointed at the pinned commits in vendor/.
const REMAP = [
  ['@src/', path.join(V, 'alkahest', 'contracts', 'src')],
  ['@eas/', path.join(V, 'eas-contracts', 'contracts')],
  ['@openzeppelin/contracts/', path.join(V, 'openzeppelin-contracts', 'contracts')],
];
export const SOURCES = {
  TrustedOracleArbiter: 'alkahest/contracts/src/arbiters/trusted-oracle/TrustedOracleArbiter.sol',
  ERC20EscrowObligation: 'alkahest/contracts/src/obligations/escrow/default/ERC20EscrowObligation.sol',
  StringObligation: 'alkahest/contracts/src/obligations/StringObligation.sol',
  ProvisoOracle: 'evm/ProvisoOracle.sol',
  TestUSD: 'evm/TestUSD.sol',
};

function resolve(p) {
  for (const [from, to] of REMAP) if (p.startsWith(from)) return path.join(to, p.slice(from.length));
  if (p.startsWith('alkahest/')) return path.join(V, p);
  return path.join(ROOT, p);
}
function findImport(p) {
  const f = resolve(p);
  return fs.existsSync(f) ? { contents: fs.readFileSync(f, 'utf8') } : { error: 'not found: ' + p };
}

const cache = {};
export function compile(name) {
  if (cache[name]) return cache[name];
  const file = SOURCES[name];
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources: { [file]: { content: findImport(file).contents } },
    settings: { ...SETTINGS, outputSelection: { [file]: { [name]: ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] } } },
  }), { import: findImport }));
  const errs = (out.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
  const c = out.contracts[file][name];
  cache[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, deployed: c.evm.deployedBytecode.object.toLowerCase(),
    refs: c.evm.deployedBytecode.immutableReferences || {}, version: solc.version() };
  return cache[name];
}

if (process.argv[1] && process.argv[1].endsWith('compile.mjs')) {
  fs.mkdirSync(path.join(ROOT, 'evm', 'abi'), { recursive: true });
  for (const n of (process.argv[2] ? process.argv.slice(2) : Object.keys(SOURCES))) {
    const c = compile(n);
    fs.writeFileSync(path.join(ROOT, 'evm', 'abi', n + '.json'), JSON.stringify(c.abi, null, 2));
    console.log(n.padEnd(24), (c.bytecode.length - 2) / 2, 'bytes', c.version);
  }
}
