# x402-webmcp-lab

Can an AI agent pay per call for a tool that a web page exposes over WebMCP, using x402, with no human in the loop?

**Yes, end to end, on a local chain with a test token.** `npm test` runs the whole flow and exits 0 only if every check passes. Raw numbers are in `results.json`.

## What it does

```
agent host (Node + Playwright Chromium 158, native WebMCP)
  owns the wallet key and the spending caps
  |  document.modelContext.getTools() / executeTool()      <- agent discovers and calls the page's tool
  v
page (public/tools.js) registers get_quote, get_premium_report with document.modelContext.registerTool()
  |  fetch /api/quote  ->  402 + PAYMENT-REQUIRED header
  |  window.agentWallet.sign(header)  ->  the host checks caps, signs an EIP-3009 authorization
  |  fetch /api/quote + PAYMENT-SIGNATURE header
  v
merchant (src/server.mjs, @x402/express)  -> verify + settle via the facilitator -> 200 + result
facilitator (src/facilitator.mjs, @x402/core + @x402/evm) -> transferWithAuthorization on the chain
chain (src/chain.mjs): ganache + contracts/TestUSDC.sol (EIP-3009 test token, 6 decimals, anyone can mint)
```

The page never holds a key. The wallet is a bridge the agent host injects (`window.agentWallet`), the way a wallet extension would.

Spending caps (`src/agent.mjs`): the per-call cap uses the x402 SDK's own `spendControls.allowedAssets[].maxAmountPerPayment`; the session cap is a `onBeforePaymentCreation` hook (the SDK has none, and the x402 spec lists client-side budget management as out of scope).

## Run

```
npm install
npm test                 # 4 scenarios x 25 runs, about 4 minutes, writes results.json
RUNS=5 npm test          # quick pass
```

Needs Node 22+ (built on 26.13) and a Playwright Chromium (`npx playwright install chromium`; the code uses `playwright-core` and the default browser cache). Wallet keys are generated into `.keys/wallets.json` (mode 0600, git-ignored) and never printed. The chain is local; no real funds exist anywhere.

## Checks (all must pass, per scenario)

1. Unpaid request returns 402 with `PAYMENT-REQUIRED`.
2. 25/25 tool calls succeed; the merchant's on-chain balance rose by exactly 25 x price; the agent's fell by the same.
3. A 1 tUSDC tool call (price above the 5000-unit per-call cap) is refused and no funds move.
4. A wallet with a 3-call session budget pays 3 and refuses the 4th.
5. Replaying a spent payment signature is rejected by the merchant (402).

## Results (25 runs each, milliseconds, `results.json`)

| Scenario | Tool call to result p50 / p95 | Facilitator settle p50 | Verify p50 | Wallet sign p50 |
|---|---|---|---|---|
| instant mining | 76.5 / 89.5 | 49.2 | 19.6 | 2.4 |
| 200 ms blocks (Base since 2026-11-05) | 261.9 / 464.3 | 234.9 | 16.9 | 2.1 |
| 2 s blocks (Base before that date) | 1064.2 / 1865.1 | 1040.3 | 15.6 | 2.0 |
| 2 s blocks, viem default 4 s receipt polling | 4065.7 / 4105.6 | 4037.5 | 19.5 | 2.3 |

- Round trips per paid call: 2 HTTP requests page to merchant (402, then paid), 2 merchant to facilitator (verify, settle), 1 chain transaction. Discovery (`getTools`) and page load are local, about 1.3 ms and 25 ms.
- "402 to pay to settle" (sign plus the paid request) is 98% or more of tool-call time in every scenario. The payment is the latency; the WebMCP part is about 1 ms.
- Failures: 0 of 100 timed calls. During the build: (a) the headless-shell and default launch have no WebMCP; it needs `--enable-experimental-web-platform-features --enable-features=WebMCPTesting`; (b) the API is `document.modelContext` in the current spec draft, while most examples online still use `navigator.modelContext`; (c) viem polls for receipts every 4 s by default, which turned a 1 s settle into 4 s until the facilitator client set `pollingInterval: 200`.
- Timed-block scenarios start each run at a random phase of the block interval. Ganache has no block-time option below 1 s, so timed mining is an `evm_mine` timer.

## Real vs shimmed

| Real | Mocked or shimmed |
|---|---|
| Chromium 158.0.8127.18 with native WebMCP (`document.modelContext`), no polyfill | The chain is ganache on loopback; RPC latency, mempool and reorgs are absent |
| Official SDK `@x402/*` 2.30.0 (x402 v2: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`) | The token is my own EIP-3009 contract, not USDC; no faucet used (public faucets need a login) |
| EIP-712 signing, on-chain `transferWithAuthorization`, balance checks | The facilitator is mine (SDK-based), local; a hosted one adds network round trips, rate limits and its own settle policy |
| Spending caps and replay protection | The agent is a script, not an LLM; it picks the tool by name. Model choice, prompt injection and tool-description trust are untested |
| | The wallet bridge (`window.agentWallet`) is my invention; no WebMCP or x402 spec defines it |

## Open problems

1. **Who holds the wallet.** WebMCP has no payment or wallet hook (the draft only mentions payment data as a privacy risk, `index.bs` line 1684). The page can ask for money; the signer has to live in the agent host. Every demo I found (Google Chrome Labs PR 96, Medium and Reddit posts from 2026-06) puts a key or a wallet SDK in the page or its server. That is the part a product has to settle.
2. **Caps and budgets.** The SDK caps one payment. A session budget, per-merchant allowlists, and a human confirm above a threshold are yours to build (Cloudflare's x402 MCP example asks the user to confirm each payment).
3. **Price discovery.** The agent only learns the price after calling (the 402). Tool descriptions carry it as free text; a polyfill vendor proposes `annotations.pricing`, but it is not in the spec.
4. **Settlement latency and failure.** Settle waits for the chain. On 200 ms blocks that is about 0.25 s; the receipt-polling default can add seconds. If settle fails after the work ran, who pays? No refund path exists in the flow.
5. **Abuse.** Free tools are the discovery surface; paid calls need replay protection (tested), idempotency when the agent retries a timed-out paid call, and rate limits per payer.
6. **Availability.** Chrome ships WebMCP as an origin trial (149) and a flag; Edge 150 trial; Firefox and Safari have only standards positions. Chrome's docs say headless is not the target use.

## Research sources (read 2026-11-11)

- x402 repo, Apache-2.0, 6.8k stars, pushed 2026-11-10: https://github.com/x402-foundation/x402 ; spec v2: `specs/x402-specification-v2.md` in that repo; npm `@x402/*` 2.30.0 (2026-11-04).
- WebMCP spec, W3C Community Group draft, repo pushed 2026-11-10: https://github.com/webmachinelearning/webmcp ; status table: `implementation-status.md` there; Chrome docs (updated 2026-10-07): https://developer.chrome.com/docs/ai/webmcp
- Prior art: Chrome Labs PR with an x402 WebMCP demo (2026-03-23) https://github.com/GoogleChromeLabs/webmcp-tools/pull/96 ; guide proposal https://github.com/GoogleChrome/modern-web-guidance-src/issues/865 ; Medium write-up (2026-06-08) https://medium.com/@AlexAmor/how-i-built-a-webmcp-and-x402-system-to-gate-premium-financial-data-for-ai-agents-8b3ffe542714 ; Cloudflare paid MCP tools https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-mcp-tools/ ; 3 KB polyfill with payment metadata (2026-03-04) https://dev.to/ai-agent-economy/we-built-a-3kb-webmcp-polyfill-97x-smaller-than-mcp-bglobal-3kg4 ; Machine Observer snapshot (2026-10-21): 500 WebMCP sites, 1,310 x402 sites, 11 both, https://machineobserver.com/research/agent-native-web-two-front-doors
- Base block time, 200 ms since 2026-11-05 (mainnet): https://docs.base.org/upgrades/denim/200ms-blocks

Research depth was "standard": SearXNG was rate-limited and the skill's search script printed nothing, so discovery used Exa and `gh search repos`. Not saturated; treat the prior-art list as a sample.

## Licence

MIT
