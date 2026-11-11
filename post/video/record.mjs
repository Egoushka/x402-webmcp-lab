// Records the real flow twice (2 s blocks + viem default 4 s polling, then 200 ms blocks + 200 ms polling).
// Usage: node record.mjs <outDir>. Writes run1.webm, run2.webm and offsets.json (trim points in seconds).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startChain } from '../../src/chain.mjs';
import { startFacilitator } from '../../src/facilitator.mjs';
import { startServer } from '../../src/server.mjs';
import { createWallet } from '../../src/agent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, 'raw'));
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const offsets = {};

async function run(name, { blockTimeMs, polling, chipText, endcard }) {
  const chain = await startChain({ blockTimeMs });
  const fac = await startFacilitator({ chain: chain.chain, rpcUrl: chain.rpcUrl, account: chain.facilitator, pollingIntervalMs: polling });
  const app = await startServer({ chain: chain.chain, token: chain.token, payTo: chain.merchant.address, facilitatorUrl: fac.url });
  const wallet = createWallet({ account: chain.agent, chain: chain.chain, token: chain.token, perCallMax: 5000, sessionMax: 100000 });
  // New browser with a recording context; same wallet bridge as the test harness.
  const { chromium } = await import('playwright-core');
  const b = await chromium.launch({ args: ['--enable-experimental-web-platform-features', '--enable-features=WebMCPTesting'] });
  const tCtx = Date.now();
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1350 }, recordVideo: { dir: path.join(out, name), size: { width: 1080, height: 1350 } } });
  await ctx.exposeBinding('__sign', (_s, header, url) => wallet.sign(header, url));
  await ctx.addInitScript(() => { window.agentWallet = { sign: (h, u) => window.__sign(h, u) }; });
  await ctx.addInitScript({ path: path.join(here, 'overlay.js') });
  const page = await ctx.newPage();
  await page.goto(app.url + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__toolsReady === true && window.__ov);
  offsets[name] = (Date.now() - tCtx) / 1000;
  const names = await page.evaluate(async () => (await document.modelContext.getTools()).map((t) => t.name));
  await page.evaluate((t) => window.__ov.chip(t), `${chipText}\nTools found: ${names.join(', ')}`);
  await page.addStyleTag({ content: '#ov .chip{white-space:pre-line}' });
  await sleep(2500);
  const r = await page.evaluate(async () => {
    window.__ov.start();
    const tools = await document.modelContext.getTools();
    const raw = await document.modelContext.executeTool(tools.find((t) => t.name === 'get_quote'), { symbol: 'ETH' });
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  });
  const res = JSON.parse(r.content[0].text);
  console.log(name, 'result', JSON.stringify(res));
  await sleep(2800);
  if (endcard) { await page.evaluate((h) => window.__ov.endcard(h), endcard); await sleep(3800); }
  await page.close(); await ctx.close(); await b.close();
  await app.close(); await fac.close(); await chain.close();
}

await run('run1', { blockTimeMs: 2000, polling: 4000, chipText: 'LIVE RUN 1 of 2: 2 s blocks (Base before 2026-11-05), viem default 4 s receipt polling' });
await run('run2', { blockTimeMs: 200, polling: 200, chipText: 'LIVE RUN 2 of 2: 200 ms blocks (Base since 2026-11-05), receipt polling set to 200 ms',
  endcard: 'An agent paid for a web tool call.<br>No human. No API key.<div class="u">github.com/Egoushka/x402-webmcp-lab</div><small>Local chain, test token, scripted agent. Code, method and 100 timed runs in the repo.</small>' });
fs.writeFileSync(path.join(out, 'offsets.json'), JSON.stringify(offsets));
console.log('done', offsets);
process.exit(0);
