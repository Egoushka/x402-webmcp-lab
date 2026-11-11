// Observer overlay for the recording. It wraps fetch and the wallet bridge only to timestamp
// what really happens; it changes no request, response or result.
(() => {
  const STEPS = [
    ['Agent calls get_quote over WebMCP', 'executeTool()'],
    ['Page asks the merchant, gets 402', 'HTTP 402 Payment Required'],
    ['Agent wallet signs the payment', 'EIP-3009 authorization'],
    ['Merchant verifies and settles on chain', 'waiting for the block'],
    ['200 OK, result back in the tool call', 'paid'],
  ];
  const css = `
  html,body{margin:0;background:#0e1014;color:#f3f1ec;font-family:'Liberation Sans',Arial,sans-serif}
  body>h1,body>p,body>pre{position:relative;z-index:1}
  body{padding:0 48px;box-sizing:border-box;min-height:1350px;overflow:hidden}
  body>h1{margin:940px 0 0;font-size:56px}
  body>p{margin:8px 0 0;font-size:32px;color:#b9b6ad}
  body>pre{margin:18px 0 0;font-size:40px;color:#7fd1a8;white-space:pre-wrap;font-family:'Liberation Mono',monospace}
  #ov{position:fixed;left:0;top:0;width:1080px;height:900px;z-index:5;background:#0e1014;padding:40px 48px 0;box-sizing:border-box;border-bottom:3px solid #2a2f3a}
  #ov .chip{font-size:34px;color:#9fb3ff;line-height:1.25;min-height:130px}
  #ov .timer{font:700 180px/1.0 'Liberation Mono',monospace;margin:6px 0 10px;letter-spacing:-6px}
  #ov .timer small{font-size:60px;letter-spacing:0;color:#b9b6ad;margin-left:14px}
  #ov .row{display:flex;align-items:center;height:92px;font-size:40px;color:#6f7482;border-top:1px solid #20242d}
  #ov .row i{width:26px;height:26px;border-radius:50%;background:#2a2f3a;margin-right:22px;flex:none}
  #ov .row b{margin-left:auto;font:400 36px 'Liberation Mono',monospace}
  #ov .row.active{color:#fff}#ov .row.active i{background:#f2a33a;animation:p .5s infinite alternate}
  #ov .row.done{color:#f3f1ec}#ov .row.done i{background:#3fbf8a}#ov .row.done b{color:#3fbf8a}
  #ov .row.r402.done i{background:#eb6834}#ov .row.r402.done b{color:#eb6834}
  @keyframes p{to{opacity:.3}}
  #tag{position:fixed;left:48px;top:884px;z-index:6;background:#0e1014;padding:0 14px;font-size:24px;color:#8a8f9d;letter-spacing:2px}
  #end{position:fixed;inset:0;z-index:9;background:#0e1014;display:none;flex-direction:column;justify-content:center;padding:0 72px;font-size:54px;line-height:1.3}
  #end .u{font:700 44px 'Liberation Mono',monospace;color:#9fb3ff;margin-top:48px;word-break:break-all}
  #end small{display:block;font-size:34px;color:#b9b6ad;margin-top:40px;line-height:1.4}`;
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); });
  let t0 = 0, raf = 0, rows = [], timer, chip, endEl, started = false;
  const fmt = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
  const mark = (i, state, label) => {
    const r = rows[i]; if (!r) return;
    r.className = 'row ' + (i === 1 ? 'r402 ' : '') + state;
    if (label !== undefined) r.querySelector('b').textContent = label;
  };
  const tick = () => { timer.firstChild.nodeValue = fmt(performance.now() - t0); raf = requestAnimationFrame(tick); };
  const build = () => {
    const ov = document.createElement('div'); ov.id = 'ov';
    ov.innerHTML = '<div class="chip"></div><div class="timer">0<small>ms</small></div>' +
      STEPS.map(([a]) => `<div class="row"><i></i>${a}<b></b></div>`).join('');
    document.body.appendChild(ov);
    const tag = document.createElement('div'); tag.id = 'tag'; tag.textContent = 'THE REAL PAGE (public/index.html)'; document.body.appendChild(tag);
    endEl = document.createElement('div'); endEl.id = 'end'; document.body.appendChild(endEl);
    rows = [...ov.querySelectorAll('.row')]; timer = ov.querySelector('.timer'); chip = ov.querySelector('.chip');
  };
  document.addEventListener('DOMContentLoaded', build);
  window.__ov = {
    chip: (t) => { chip.textContent = t; },
    start: () => { t0 = performance.now(); started = true; mark(0, 'done', '+0 ms'); tick(); },
    end: () => { cancelAnimationFrame(raf); timer.firstChild.nodeValue = fmt(window.__ov.total); },
    endcard: (html) => { endEl.innerHTML = html; endEl.style.display = 'flex'; },
  };
  const of = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    if (!started || !String(u).includes('/api/')) return of(u, o);
    const since = () => performance.now() - t0;
    const paid = !!(o && o.headers && o.headers['PAYMENT-SIGNATURE']);
    if (!paid) mark(1, 'active'); else mark(3, 'active', 'waiting');
    const s = since();
    const r = await of(u, o);
    const n = since();
    if (!paid) mark(1, r.status === 402 ? 'done' : 'done', r.status + ' at +' + fmt(n) + ' ms');
    else { mark(3, 'done', fmt(n - s) + ' ms'); mark(4, 'done', '+' + fmt(n) + ' ms'); window.__ov.total = n; cancelAnimationFrame(raf); timer.firstChild.nodeValue = fmt(n); }
    return r;
  };
  const wrapWallet = () => {
    const w = window.agentWallet; if (!w || w.__w) return;
    const sign = w.sign; w.__w = 1;
    w.sign = async (...a) => { mark(2, 'active'); const s = performance.now() - t0; const r = await sign(...a); mark(2, 'done', fmt(performance.now() - t0 - s) + ' ms'); return r; };
  };
  window.addEventListener('DOMContentLoaded', wrapWallet); wrapWallet();
})();
