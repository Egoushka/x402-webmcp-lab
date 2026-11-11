// A small x402 facilitator over HTTP (/supported, /verify, /settle), built on the SDK's x402Facilitator.
// Same role as x402.org/facilitator, but pointed at the local chain.
import express from 'express';
import { createWalletClient, http, publicActions } from 'viem';
import { x402Facilitator } from '@x402/core/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { ExactEvmScheme } from '@x402/evm/exact/facilitator';

export async function startFacilitator({ chain, rpcUrl, account, port = 4022, pollingIntervalMs = 200 }) {
  const client = createWalletClient({ account, chain, transport: http(rpcUrl), pollingInterval: pollingIntervalMs }).extend(publicActions);
  const signer = toFacilitatorEvmSigner({
    address: account.address,
    readContract: (a) => client.readContract({ ...a, args: a.args || [] }),
    verifyTypedData: (a) => client.verifyTypedData(a),
    writeContract: (a) => client.writeContract({ ...a, args: a.args || [] }),
    sendTransaction: (a) => client.sendTransaction(a),
    waitForTransactionReceipt: (a) => client.waitForTransactionReceipt(a),
    getCode: (a) => client.getCode(a),
  });
  const facilitator = new x402Facilitator().register(`eip155:${chain.id}`, new ExactEvmScheme(signer));
  const app = express();
  app.use(express.json());
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req.body)); } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  };
  app.post('/verify', wrap((b) => facilitator.verify(b.paymentPayload, b.paymentRequirements)));
  app.post('/settle', wrap((b) => facilitator.settle(b.paymentPayload, b.paymentRequirements)));
  app.get('/supported', (_q, res) => res.json(facilitator.getSupported()));
  const srv = await new Promise((r) => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(r)) };
}
