// End-to-end: chain -> facilitator -> merchant -> agent browser. Exits 0 only if every assertion holds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startChain } from './chain.mjs';
import { startFacilitator } from './facilitator.mjs';
import { startServer, PRICE_QUOTE, PRICE_REPORT } from './server.mjs';
import { createWallet, launchAgentBrowser, runOnce } from './agent.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = Number(process.env.RUNS || 25);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const summarize = (a) => !a.length ? { n: 0 } : ({ n: a.length, p50: +pct(a, 50).toFixed(1), p95: +pct(a, 95).toFixed(1), min: +Math.min(...a).toFixed(1), max: +Math.max(...a).toFixed(1) });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

async function scenario(name, blockTimeMs, pollingIntervalMs = 200) {
  console.log(`\n== scenario: ${name} ==`);
  const chain = await startChain({ blockTimeMs });
  const fac = await startFacilitator({ chain: chain.chain, rpcUrl: chain.rpcUrl, account: chain.facilitator, pollingIntervalMs });
  const metrics = [];
  const app = await startServer({ chain: chain.chain, token: chain.token, payTo: chain.merchant.address, facilitatorUrl: fac.url, metrics });
  const wallet = createWallet({ account: chain.agent, chain: chain.chain, token: chain.token, perCallMax: 5000, sessionMax: 1000 * (RUNS + 5) });
  const { context, browser, version } = await launchAgentBrowser(wallet);
  try {
    // Baseline: an unpaid request must get 402 with payment requirements.
    const r402 = await fetch(`${app.url}/api/quote?symbol=ETH`);
    check(r402.status === 402 && !!r402.headers.get('payment-required'), 'unpaid request returns 402 with PAYMENT-REQUIRED');
    const before = { agent: await chain.balanceOf(chain.agent.address), merchant: await chain.balanceOf(chain.merchant.address) };

    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      // Timed chains: start at a random phase of the block interval, otherwise runs lock to the block tick.
      if (blockTimeMs) await new Promise((ok) => setTimeout(ok, Math.random() * blockTimeMs));
      const m0 = metrics.length;
      try {
        const r = await runOnce(context, app.url + '/', 'get_quote', { symbol: i % 2 ? 'ETH' : 'BTC' });
        const ok = !r.out.error && typeof r.out.price === 'number';
        const fm = metrics.slice(m0);
        runs.push({ ok, error: r.out.error, ...r, timing: r.out._timing,
          verifyMs: fm.find((x) => x.op === 'verify')?.ms, settleMs: fm.find((x) => x.op === 'settle')?.ms,
          facilitatorCalls: fm.length });
      } catch (e) { runs.push({ ok: false, error: String(e.message || e) }); }
    }
    const good = runs.filter((r) => r.ok);
    check(good.length === RUNS, `${good.length}/${RUNS} paid tool calls succeeded`);
    const after = { agent: await chain.balanceOf(chain.agent.address), merchant: await chain.balanceOf(chain.merchant.address) };
    check(after.merchant - before.merchant === BigInt(PRICE_QUOTE) * BigInt(good.length), `merchant received exactly ${good.length} x ${PRICE_QUOTE} atomic tUSDC on chain`);
    check(before.agent - after.agent === after.merchant - before.merchant, 'agent balance fell by the same amount');

    // Negative 1: price above the per-call cap is refused, nothing leaves the wallet.
    const b1 = await chain.balanceOf(chain.agent.address);
    const big = await runOnce(context, app.url + '/', 'get_premium_report', {});
    check(!!big.out.error && (await chain.balanceOf(chain.agent.address)) === b1, `price ${PRICE_REPORT} > per-call cap 5000 refused, no funds moved (${String(big.out.error).slice(0, 90)})`);

    // Negative 2: session cap. A fresh wallet allowed 3 calls refuses the 4th.
    const tight = createWallet({ account: chain.agent, chain: chain.chain, token: chain.token, perCallMax: 5000, sessionMax: 3000 });
    const t = await launchAgentBrowser(tight);
    const res = [];
    for (let i = 0; i < 4; i++) res.push((await runOnce(t.context, app.url + '/', 'get_quote', { symbol: 'ETH' })).out);
    check(res.slice(0, 3).every((o) => !o.error) && !!res[3].error, `session cap 3000: 3 calls paid, 4th refused (${String(res[3].error).slice(0, 80)})`);
    await t.browser.close();

    // Negative 3: replaying a used payment signature is rejected by the merchant.
    let signed;
    const replayWallet = createWallet({ account: chain.agent, chain: chain.chain, token: chain.token, perCallMax: 5000, sessionMax: 5000 });
    const reqHeader = (await fetch(`${app.url}/api/quote?symbol=ETH`)).headers.get('payment-required');
    signed = await replayWallet.sign(reqHeader);
    const first = await fetch(`${app.url}/api/quote?symbol=ETH`, { headers: { 'PAYMENT-SIGNATURE': signed } });
    const second = await fetch(`${app.url}/api/quote?symbol=ETH`, { headers: { 'PAYMENT-SIGNATURE': signed } });
    check(first.status === 200 && second.status === 402, `replay of a spent signature: first ${first.status}, second ${second.status}`);

    const pick = (f) => good.map(f).filter((x) => typeof x === 'number');
    const result = {
      scenario: name, blockTimeMs, receiptPollingMs: pollingIntervalMs, runs: RUNS, ok: good.length, chromium: version,
      latencyMs: {
        toolCall_total: summarize(good.map((r) => r.callMs)),
        page_load: summarize(good.map((r) => r.loadMs)),
        discovery: summarize(good.map((r) => r.discoverMs)),
        first_request_402: summarize(pick((r) => r.timing?.firstRequestMs)),
        wallet_sign: summarize(pick((r) => r.timing?.signMs)),
        paid_request_verify_settle_and_result: summarize(pick((r) => r.timing?.paidRequestMs)),
        facilitator_verify: summarize(pick((r) => r.verifyMs)),
        facilitator_settle: summarize(pick((r) => r.settleMs)),
        pay_path_402_to_result: summarize(good.map((r) => r.timing?.signMs + r.timing?.paidRequestMs)),
      },
      roundTrips: { toolToMerchantHttp: 2, merchantToFacilitator: good[0]?.facilitatorCalls, chainTxPerCall: 1 },
      failures: runs.filter((r) => !r.ok).map((r) => r.error),
      raw: runs.map((r) => ({ ok: r.ok, callMs: r.callMs, loadMs: r.loadMs, discoverMs: r.discoverMs, timing: r.timing, verifyMs: r.verifyMs, settleMs: r.settleMs })),
    };
    await browser.close(); return result;
  } finally { await app.close(); await fac.close(); await chain.close(); }
}

const results = [];
results.push(await scenario('instant-mining', 0));
results.push(await scenario('200ms-blocks (Base since 2026-11-05)', 200));
results.push(await scenario('2s-blocks (Base before 2026-11-05)', 2000));
results.push(await scenario('2s-blocks-viem-default-4s-polling', 2000, 4000));
fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, results }, null, 2));
for (const r of results) console.log(r.scenario, 'tool call p50/p95 ms:', r.latencyMs.toolCall_total.p50, r.latencyMs.toolCall_total.p95);
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
