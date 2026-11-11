// Merchant: static page + two x402-protected endpoints. Prices are in atomic tUSDC (6 decimals).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const PRICE_QUOTE = '1000';      // 0.001 tUSDC
export const PRICE_REPORT = '1000000';  // 1 tUSDC, used to prove the agent's cap refuses it

export async function startServer({ chain, token, payTo, facilitatorUrl, port = 4021, metrics }) {
  const network = `eip155:${chain.id}`;
  // Time the two facilitator calls the middleware makes, so the 402 -> pay -> settle cost is split out.
  const fc = new HTTPFacilitatorClient({ url: facilitatorUrl });
  for (const m of ['verify', 'settle']) {
    const orig = fc[m].bind(fc);
    fc[m] = async (...a) => { const t = performance.now(); try { return await orig(...a); } finally { metrics?.push({ op: m, ms: performance.now() - t }); } };
  }
  const resourceServer = new x402ResourceServer(fc).register(network, new ExactEvmScheme());
  const accept = (amount) => ({
    scheme: 'exact', network, payTo, maxTimeoutSeconds: 60,
    price: { asset: token, amount, extra: { name: 'Test USDC', version: '2' } },
  });
  const app = express();
  app.use(paymentMiddleware({
    'GET /api/quote': { accepts: [accept(PRICE_QUOTE)], description: 'Price quote for a symbol (demo data)', mimeType: 'application/json' },
    'GET /api/report': { accepts: [accept(PRICE_REPORT)], description: 'Premium report (demo data)', mimeType: 'application/json' },
  }, resourceServer));
  app.get('/api/quote', (req, res) => {
    const symbol = String(req.query.symbol || 'ETH').toUpperCase().slice(0, 8);
    res.json({ symbol, price: 1000 + [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0), at: new Date().toISOString() });
  });
  app.get('/api/report', (_q, res) => res.json({ report: 'premium' }));
  app.use(express.static(pub));
  const srv = await new Promise((r) => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
  return { url: `http://localhost:${port}`, close: () => new Promise((r) => srv.close(r)) };
}
