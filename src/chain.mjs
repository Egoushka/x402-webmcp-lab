// Local EVM chain (ganache) + test token deploy. No real funds anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import solc from 'solc';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHAIN_ID = 31337;

// Keys live in .keys/ (gitignored, 0600). Generated once; never printed.
export function loadKeys() {
  const dir = path.join(root, '.keys');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'wallets.json');
  if (!fs.existsSync(file)) {
    const keys = { facilitator: generatePrivateKey(), agent: generatePrivateKey(), merchant: generatePrivateKey() };
    fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  }
  fs.chmodSync(file, 0o600);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function compile() {
  const out = path.join(root, 'build', 'TestUSDC.json');
  if (fs.existsSync(out)) return JSON.parse(fs.readFileSync(out, 'utf8'));
  const source = fs.readFileSync(path.join(root, 'contracts', 'TestUSDC.sol'), 'utf8');
  const res = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources: { 'TestUSDC.sol': { content: source } },
    settings: { evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  })));
  const errs = (res.errors || []).filter((e) => e.severity === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.formattedMessage).join('\n'));
  const c = res.contracts['TestUSDC.sol'].TestUSDC;
  const art = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(art));
  return art;
}

// blockTimeMs 0 = mine instantly on every tx; N = one block every N ms (like a real chain).
export async function startChain({ blockTimeMs = 0, port = 8545, agentTokens = 1_000_000n } = {}) {
  const keys = loadKeys();
  const accounts = Object.values(keys).map((secretKey) => ({ secretKey, balance: '0x' + (10n ** 20n).toString(16) }));
  const server = ganache.server({
    logging: { quiet: true },
    chain: { chainId: CHAIN_ID, networkId: CHAIN_ID, hardfork: 'shanghai' },
    wallet: { accounts },
    miner: { blockTime: 0 },
  });
  await server.listen(port);
  const rpcUrl = `http://127.0.0.1:${port}`;
  const chain = defineChain({ id: CHAIN_ID, name: 'local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  const deployer = privateKeyToAccount(keys.facilitator);
  const wallet = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) });
  const pub = createPublicClient({ chain, transport: http(rpcUrl) });
  const art = compile();
  const h = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode });
  const token = (await pub.waitForTransactionReceipt({ hash: h })).contractAddress;
  const agent = privateKeyToAccount(keys.agent);
  const merchant = privateKeyToAccount(keys.merchant);
  const mh = await wallet.writeContract({ address: token, abi: art.abi, functionName: 'mint', args: [agent.address, agentTokens] });
  await pub.waitForTransactionReceipt({ hash: mh });
  // Timed mining starts only after setup, so deploy/mint are instant.
  const balanceOf = (addr) => pub.readContract({ address: token, abi: art.abi, functionName: 'balanceOf', args: [addr] });
  let timer;
  if (blockTimeMs > 0) {
    await server.provider.request({ method: 'miner_stop', params: [] });
    timer = setInterval(() => server.provider.request({ method: 'evm_mine', params: [] }).catch(() => {}), blockTimeMs);
  }
  return {
    rpcUrl, chain, token, abi: art.abi, keys, agent, merchant, facilitator: deployer, balanceOf,
    close: async () => { clearInterval(timer); await server.close(); },
  };
}
