// Agent host: owns the wallet and the spending caps, drives a real Chromium with native WebMCP.
// Discovery and calls use document.modelContext.getTools() / executeTool(), the spec's agent-side calls.
import { chromium } from 'playwright-core';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';

export class CapError extends Error {}

// perCallMax / sessionMax are atomic tUSDC units (6 decimals). Per-call cap is the SDK's own spendControls;
// the session cap is ours (the SDK has no session budget; its spec lists "client-side budget management" as out of scope).
export function createWallet({ account, chain, token, perCallMax, sessionMax }) {
  const network = `eip155:${chain.id}`;
  const client = new x402Client()
    .register('eip155:*', new ExactEvmScheme(toClientEvmSigner(account)))
    .setSpendControls({ allowedAssets: [{ network, asset: token, maxAmountPerPayment: String(perCallMax) }] });
  const stats = { signed: 0, spent: 0n, refused: [] };
  client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
    const amt = BigInt(r.amount);
    if (stats.spent + amt > BigInt(sessionMax)) {
      stats.refused.push({ reason: 'session cap', amount: r.amount });
      return { abort: true, reason: `session cap ${sessionMax} would be exceeded` };
    }
    stats.spent += amt; stats.signed++; // reserved at signing; the authorization could settle any time after
  });
  const http = new x402HTTPClient(client);
  return {
    stats,
    async sign(requiredHeader) {
      const required = http.getPaymentRequiredResponse((h) => (h.toLowerCase() === 'payment-required' ? requiredHeader : null));
      try {
        const payload = await http.createPaymentPayload(required);
        return http.encodePaymentSignatureHeader(payload)['PAYMENT-SIGNATURE'];
      } catch (e) {
        stats.refused.push({ reason: String(e.message || e) });
        throw new CapError(String(e.message || e));
      }
    },
  };
}

export async function launchAgentBrowser(wallet) {
  const browser = await chromium.launch({ args: ['--enable-experimental-web-platform-features', '--enable-features=WebMCPTesting'] });
  const context = await browser.newContext();
  // The wallet is exposed to the page as a bridge, like a wallet extension would be. Keys never enter the page.
  await context.exposeBinding('__sign', (_src, header, url) => wallet.sign(header, url));
  await context.addInitScript(() => { window.agentWallet = { sign: (h, u) => window.__sign(h, u) }; });
  return { browser, context, version: browser.version() };
}

// One agent "run": open the page, discover tools, call one. Returns timings.
export async function runOnce(context, pageUrl, toolName, args) {
  const page = await context.newPage();
  const t0 = performance.now();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__toolsReady === true);
  const t1 = performance.now();
  const names = await page.evaluate(async () => (await document.modelContext.getTools()).map((t) => t.name));
  const t2 = performance.now();
  if (!names.includes(toolName)) throw new Error(`tool ${toolName} not discovered; saw ${names}`);
  const raw = await page.evaluate(async ([n, a]) => {
    const tools = await document.modelContext.getTools();
    return document.modelContext.executeTool(tools.find((t) => t.name === n), a);
  }, [toolName, args]);
  const t3 = performance.now();
  await page.close();
  const res = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const out = JSON.parse(res.content[0].text);
  return { out, loadMs: t1 - t0, discoverMs: t2 - t1, callMs: t3 - t2, totalMs: t3 - t0, tools: names };
}
