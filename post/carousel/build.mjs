// Builds slides.html from ../../results.json (every number comes from that file), renders carousel.pdf and slide-N.png.
// Usage: node build.mjs   (from anywhere; needs playwright-core and a Chromium)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const res = JSON.parse(fs.readFileSync(path.join(here, '../../results.json'), 'utf8')).results;
const by = (k) => res.find((r) => r.scenario.startsWith(k));
const inst = by('instant'), b200 = by('200ms'), b2s = by('2s-blocks (') , poll = by('2s-blocks-viem');
const m = (r, k, q = 'p50') => r.latencyMs[k][q];
const f1 = (n) => n.toFixed(1), f0 = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

// chart: p50 and p95 per scenario, one axis (ms), linear from 0
const rows = [
  ['Instant mining', inst], ['200 ms blocks', b200], ['2 s blocks', b2s], ['2 s blocks, 4 s polling', poll],
];
const W = 690, MAX = 4200;
const bars = rows.map(([label, r], i) => {
  const y = 44 + i * 200, p50 = m(r, 'toolCall_total'), p95 = m(r, 'toolCall_total', 'p95');
  const w = (v) => Math.max(4, (v / MAX) * W);
  return `<text x="0" y="${y}" class="lab">${label}</text>
  <rect x="0" y="${y + 16}" width="${w(p50)}" height="54" rx="4" fill="#2a78d6"/>
  <text x="${w(p50) + 12}" y="${y + 56}" class="val">${f1(p50)}</text>
  <rect x="0" y="${y + 76}" width="${w(p95)}" height="54" rx="4" fill="#eb6834"/>
  <text x="${w(p95) + 12}" y="${y + 116}" class="val">${f1(p95)}</text>`;
}).join('\n');

const slides = [
`<section class="s dark" id="s1"><div class="k">x402 + WebMCP, measured</div>
<h1>An AI agent paid for a web tool call.</h1>
<div class="big">${f0(m(b200, 'toolCall_total'))}<small> ms</small></div>
<p class="sub">Median, with 200 ms blocks. No human. No API key.</p>
<p class="foot">Local test chain, test token. Swipe for the method, the numbers and what is fake.</p></section>`,

`<section class="s" id="s2"><div class="k">How it works</div><h2>One tool call, one 402, one signature.</h2>
<div class="flow">
<div class="box"><b>Agent host</b><span>holds the wallet and the spending caps</span></div><div class="arr">calls get_quote over WebMCP</div>
<div class="box"><b>Web page</b><span>registers the tool with document.modelContext</span></div><div class="arr">fetch /api/quote  gets <em>402 + price</em></div>
<div class="box"><b>Wallet bridge</b><span>host signs an EIP-3009 authorization (${f1(m(b200, 'wallet_sign'))} ms)</span></div><div class="arr">retry with PAYMENT-SIGNATURE</div>
<div class="box"><b>Merchant + facilitator</b><span>verify, settle on chain, return 200 + result</span></div>
</div><p class="foot">The page never holds a key.</p></section>`,

`<section class="s" id="s3"><div class="k">Latency, 25 runs per row</div><h2>The payment is the latency.</h2>
<svg viewBox="0 0 912 830" class="chart" role="img" aria-label="Tool call latency p50 and p95 in milliseconds for four chain scenarios">
${bars}
</svg>
<div class="legend"><span><i style="background:#2a78d6"></i>p50 ms</span><span><i style="background:#eb6834"></i>p95 ms</span></div>
<p class="foot">Source: results.json, tool call to result, one axis from 0.</p></section>`,

`<section class="s" id="s4"><div class="k">Where ${f0(m(b200, 'toolCall_total'))} ms goes (200 ms blocks, p50)</div><h2>Settling on chain is almost all of it.</h2>
<div class="rows">
<div class="r"><span>Facilitator settle</span><b>${f1(m(b200, 'facilitator_settle'))} ms</b></div>
<div class="r"><span>Facilitator verify</span><b>${f1(m(b200, 'facilitator_verify'))} ms</b></div>
<div class="r"><span>Wallet sign</span><b>${f1(m(b200, 'wallet_sign'))} ms</b></div>
<div class="r"><span>Tool discovery (getTools)</span><b>1.3 ms</b></div>
</div><p class="sub">The WebMCP part costs about 1 ms. Block time sets the rest.</p>
<p class="foot">Source: results.json. Discovery figure from README.</p></section>`,

`<section class="s warn" id="s5"><div class="k">The gotcha</div><h2>One default turned ${(m(b2s, "toolCall_total") / 1000).toFixed(2)} s into ${(m(poll, 'toolCall_total') / 1000).toFixed(2)} s.</h2>
<div class="cmp"><div><small>2 s blocks, receipt polling 200 ms</small><b>${f0(m(b2s, 'toolCall_total'))} ms</b></div>
<div><small>same chain, viem default 4 s polling</small><b class="hot">${f0(m(poll, 'toolCall_total'))} ms</b></div></div>
<p class="sub">viem checks for a receipt every 4 s. The settle waited for the poll, not the block.</p>
<pre>pollingInterval: 200</pre><p class="foot">Median tool call, 25 runs each. Source: results.json.</p></section>`,

`<section class="s" id="s6"><div class="k">Real vs test</div><h2>What you can trust, and what you cannot.</h2>
<div class="cols"><div><h3>Real</h3><ul><li>Chromium ${b200.chromium} with native WebMCP</li><li>Official x402 SDK 2.30.0</li><li>EIP-712 signing, on-chain transfer</li><li>Spend caps and replay protection</li></ul></div>
<div><h3>Test</h3><ul><li>Local ganache chain</li><li>Own test token, not USDC</li><li>Facilitator runs on loopback</li><li>A script, not an LLM</li><li>The wallet bridge is my invention</li></ul></div></div>
<p class="foot">A hosted facilitator and a real RPC add round trips I did not measure.</p></section>`,

`<section class="s dark" id="s7"><div class="k">The open problem</div><h1>Who holds the agent's wallet?</h1>
<p class="sub">WebMCP has no payment or wallet hook. The page can ask for money. Something else has to sign.</p>
<ul class="opts"><li>The browser</li><li>The model vendor</li><li>You</li></ul>
<p class="foot">Every demo I found keeps the key in the page or its server.</p></section>`,

`<section class="s dark cta" id="s8"><div class="k">Run it yourself</div><h1>Code, method and raw numbers.</h1>
<div class="url">github.com/Egoushka/x402-webmcp-lab</div>
<pre>npm install
npm test</pre><p class="sub">MIT. Four scenarios, 25 runs each.</p>
<p class="foot">Who should hold the wallet? Tell me in the comments.</p></section>`,
];

const css = `*{box-sizing:border-box}html,body{margin:0}body{font-family:'Liberation Sans',Arial,sans-serif;color:#0b0b0b}
.s{width:1080px;height:1350px;padding:96px 84px;background:#fcfcfb;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.s.dark{background:#0e1014;color:#f3f1ec}
.k{font-size:30px;letter-spacing:2px;text-transform:uppercase;color:#52514e;margin-bottom:36px}.dark .k{color:#9fb3ff}
h1{font-size:92px;line-height:1.05;margin:0 0 40px}h2{font-size:68px;line-height:1.1;margin:0 0 48px}h3{font-size:44px;margin:0 0 20px}
.big{font:700 280px/1 'Liberation Mono',monospace;letter-spacing:-10px;color:#3987e5;margin:20px 0}.big small{font-size:90px;letter-spacing:0;color:#b9b6ad}
.sub{font-size:44px;line-height:1.3;color:#52514e;margin:0 0 32px}.dark .sub{color:#c9c6bd}
.foot{position:absolute;left:84px;right:84px;bottom:72px;font-size:28px;color:#6b6a66;margin:0}.dark .foot{color:#9a9a92}
.flow{display:flex;flex-direction:column;gap:0}.box{border:3px solid #0b0b0b;border-radius:14px;padding:22px 30px}.box b{display:block;font-size:44px}.box span{font-size:32px;color:#52514e}
.arr{font-size:30px;color:#2a78d6;padding:12px 0 12px 40px;border-left:4px solid #2a78d6;margin-left:60px}.arr em{color:#eb6834;font-style:normal;font-weight:700}
.chart{width:912px;margin-top:0}.chart .lab{font-size:40px;fill:#0b0b0b}.chart .val{font-size:36px;fill:#52514e;font-family:'Liberation Mono',monospace}
.legend{display:flex;gap:40px;font-size:30px;margin-top:12px}.legend i{display:inline-block;width:26px;height:26px;border-radius:4px;margin-right:12px;vertical-align:-4px}
.rows .r{display:flex;justify-content:space-between;font-size:56px;padding:44px 0;border-top:2px solid #e2e1dc}.rows b{font-family:'Liberation Mono',monospace}
.cmp{display:flex;gap:40px;margin-bottom:48px}.cmp>div{flex:1;border:3px solid #0b0b0b;border-radius:14px;padding:28px}.cmp small{display:block;font-size:30px;color:#52514e;min-height:76px}.cmp b{font:700 62px 'Liberation Mono',monospace;letter-spacing:-3px}.hot{color:#eb6834}
pre{font:700 52px 'Liberation Mono',monospace;background:#0e1014;color:#7fd1a8;padding:28px 36px;border-radius:14px;margin:0;display:inline-block}
.cols{display:flex;gap:48px}.cols>div{flex:1}.cols li{font-size:38px;line-height:1.3;margin-bottom:18px}.cols ul{padding-left:36px;margin:0}
.opts{list-style:none;padding:0;margin:56px 0 0}.opts li{font-size:64px;border:3px solid #3987e5;border-radius:16px;padding:22px 36px;margin-bottom:24px}
.url{font:700 52px 'Liberation Mono',monospace;color:#9fb3ff;margin:20px 0 48px;word-break:break-all}.cta pre{background:#1b1f27}`;

fs.writeFileSync(path.join(here, 'slides.html'), `<!doctype html><meta charset="utf-8"><title>x402 + WebMCP carousel</title><style>${css}@page{size:1080px 1350px;margin:0}</style>\n${slides.join('\n')}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto('file://' + path.join(here, 'slides.html'));
await page.pdf({ path: path.join(here, 'carousel.pdf'), width: '1080px', height: '1350px', printBackground: true });
for (let i = 1; i <= slides.length; i++) await page.locator('#s' + i).screenshot({ path: path.join(here, `slide-${i}.png`) });
await browser.close();
console.log(slides.length, 'slides');
