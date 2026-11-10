// Deploy Proviso end to end on GenLayer Bradbury. On GenLayer Chain (chain 4221), against the official EAS already there
// (deployed for JspIIV/seal): Alkahest.s TrustedOracleArbiter, ERC20EscrowObligation and StringObligation, unmodified, the
// ProvisoOracle and a test dollar. Then the Proviso Intelligent Contract, the court, then the one time wiring.
//   PCHG=<pw> node scripts/deploy.mjs
import { Wallet, JsonRpcProvider, ContractFactory, Contract } from 'ethers';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { client, fees, EXPLORER } from './net.mjs';
import { compile, ROOT } from './compile.mjs';

const PW = process.env.PCHG || '';
if (!PW) { console.error('set PCHG'); process.exit(1); }
const KS = path.join(os.homedir(), '.genlayer', 'keystores');
const w = await Wallet.fromEncryptedJson(fs.readFileSync(path.join(KS, 'pchg.json'), 'utf8'), PW);
const evm = w.connect(new JsonRpcProvider('https://rpc.testnet-chain.genlayer.com', 4221));
const OUT = path.join(ROOT, 'deployment.json');
const dep = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { network: 'genlayer testnet bradbury phase 2', chain_id: 4221 };
const save = () => fs.writeFileSync(OUT, JSON.stringify(dep, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deploy(key, name, args = []) {
  if (dep[key]) return dep[key].address;
  const c = compile(name);
  fs.mkdirSync(path.join(ROOT, 'evm', 'abi'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'evm', 'abi', name + '.json'), JSON.stringify(c.abi, null, 2));
  const contract = await new ContractFactory(c.abi, c.bytecode, evm).deploy(...args);
  await contract.waitForDeployment();
  dep[key] = { address: await contract.getAddress(), tx: contract.deploymentTransaction().hash };
  dep.compiler = c.version;
  save();
  console.log('deployed', key.padEnd(26), dep[key].address);
  return dep[key].address;
}

const EAS = '0x9052b042dcbFda11312d32F27FB4d1b5046d9ACb';
const SCHEMA_REGISTRY = '0xf3516452C013058F6E921c00C567A56a4E800ad8';
dep.eas = { address: EAS, note: 'official EAS, deployed and verified in JspIIV/seal' };
dep.schema_registry = { address: SCHEMA_REGISTRY, note: 'official SchemaRegistry, deployed and verified in JspIIV/seal' };
save();
console.log('deployer', w.address);
const arbiter = await deploy('trusted_oracle_arbiter', 'TrustedOracleArbiter', [EAS]);
await deploy('erc20_escrow', 'ERC20EscrowObligation', [EAS, SCHEMA_REGISTRY]);
await deploy('string_obligation', 'StringObligation', [EAS, SCHEMA_REGISTRY]);
const oracle = await deploy('oracle', 'ProvisoOracle', [EAS, arbiter]);
await deploy('testusd', 'TestUSD');

if (!dep.proviso) {
  const c = client(w.privateKey);
  const code = fs.readFileSync(path.join(ROOT, 'contracts', 'proviso.py'), 'utf8');
  const hash = await c.deployContract({ code, args: [oracle, arbiter], fees: await fees(c) });
  console.log('proviso tx', hash);
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const tx = await c.getTransaction({ hash });
    if (['ACCEPTED', 'FINALIZED'].includes(tx.statusName)) {
      if (tx.txExecutionResultName !== 'FINISHED_WITH_RETURN') { console.error('deploy failed', tx.txExecutionResultName); process.exit(1); }
      dep.proviso = { address: tx.txDataDecoded?.contractAddress || tx.recipient, tx: hash };
      dep.address = dep.proviso.address; dep.tx = hash; dep.deployed_at = new Date().toISOString();
      save();
      break;
    }
  }
}
if (!dep.wired) {
  await (await new Contract(oracle, compile('ProvisoOracle').abi, evm).setCourt(dep.proviso.address)).wait();
  dep.wired = true; save();
}
console.log('PROVISO', dep.proviso?.address, EXPLORER + '/address/' + dep.proviso?.address);
process.exit(0);
