// The page's side: register WebMCP tools. The page holds NO keys. When a call returns 402,
// it asks the user agent's wallet (window.agentWallet, injected by the agent host) to sign.
const mc = document.modelContext ?? navigator.modelContext; // spec moved from navigator to document
const log = (m) => { document.getElementById('log').textContent += m + '\n'; };

async function paidFetch(url) {
  const t0 = performance.now();
  let res = await fetch(url);
  const t1 = performance.now();
  const timing = { firstRequestMs: t1 - t0, requests: 1 };
  if (res.status === 402) {
    const required = res.headers.get('PAYMENT-REQUIRED');
    if (!required) throw new Error('402 without PAYMENT-REQUIRED header');
    const s0 = performance.now();
    const signed = await window.agentWallet.sign(required, url); // throws if over the agent's cap
    const s1 = performance.now();
    res = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': signed } });
    const t2 = performance.now();
    Object.assign(timing, { signMs: s1 - s0, paidRequestMs: t2 - s1, requests: 2 });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  timing.totalMs = performance.now() - t0;
  return { body: await res.json(), timing, settlement: res.headers.get('PAYMENT-RESPONSE') };
}

const wrap = (fn) => async (args) => {
  try {
    const r = await fn(args);
    log(JSON.stringify(r.body));
    return { content: [{ type: 'text', text: JSON.stringify({ ...r.body, _timing: r.timing }) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: String(e.message || e) }) }], isError: true };
  }
};

mc.registerTool({
  name: 'get_quote',
  description: 'Get a price quote for a token symbol. Costs 0.001 tUSDC per call, paid automatically via x402 by the agent wallet.',
  inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  annotations: { readOnlyHint: true },
  execute: wrap(({ symbol }) => paidFetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`)),
});
mc.registerTool({
  name: 'get_premium_report',
  description: 'Get the premium report. Costs 1 tUSDC per call.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: wrap(() => paidFetch('/api/report')),
});
window.__toolsReady = true;
