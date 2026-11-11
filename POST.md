# LinkedIn post draft (not published)

My agent paid for a web tool call with no human and no API key. Median 262 ms, on a test chain.

I wanted to know if WebMCP and x402 fit together. WebMCP lets a page hand tools to a browser agent. x402 turns HTTP 402 into a price the agent can pay.

So I built it. A page registers one tool. The tool calls an endpoint that answers 402. The agent's wallet signs a test-token authorization, the server settles it, the result comes back. 25 runs, 25 paid calls, balances matched on chain.

The numbers, with the chain set to Base's new 200 ms blocks:
- p50 262 ms and p95 464 ms from tool call to result
- 235 ms of that is the facilitator settling the transfer
- signing takes 2 ms, tool discovery about 1 ms
- with 2 s blocks the median was 1.06 s

viem polls for receipts every 4 s by default. Every call took 4 s until I changed it.

What is real: Chromium 158 with native WebMCP behind a flag, the official x402 SDK, a spend cap that refused a 1-token call and a fourth call over a 3-call budget.

What is not: a local chain, a test token, a script instead of an LLM. A hosted facilitator and a real RPC add round trips I did not measure.

The gap: WebMCP defines no wallet or payment hook. I wrote a bridge so the page asks and the agent host signs. The three demos I found keep the key in the page or its server.

If you sell tools to agents, plan your time around wallet ownership and spending caps. The signature took 2 ms.

Who should hold an agent's wallet: the browser, the model vendor, or you?

#x402 #WebMCP #AIAgents #MCP

---
Alternative hooks:
1. 25 paid tool calls, 0 humans, 0 API keys. Here is what the 402 cost me in milliseconds.
2. WebMCP lets a page offer tools to agents. It says nothing about who pays. I tested x402 on top.
3. A one-line library default turned a 1 s agent payment into 4 s.

Visual (not rendered): one image with the 4-row latency table from README.md; no carousel needed.
