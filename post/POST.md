# LinkedIn post (not published)

Media to attach: `demo.mp4` (21 s, the real run, 1080x1350) or `carousel/carousel.pdf` (8 slides). LinkedIn takes one media type per post: use the video for this post, the PDF for a follow-up or the comments. Repo link goes in the body as asked; the playbook habit is first comment, so move it there if you want to test reach.

## Post text

An AI agent paid for a web tool call in 262 ms.
No human. No API key.

I wired two new standards together to see if they fit.

WebMCP lets a page hand tools to a browser agent.
x402 turns HTTP 402 into a price the agent can pay.

The flow:
1. The agent calls a tool on the page.
2. The server answers 402 with a price.
3. The agent's wallet signs.
4. The chain settles and the result comes back.

25 runs. 25 paid calls. Balances matched on chain.
Median 262 ms, p95 464 ms, on 200 ms blocks.

One library default cost me 3 seconds.
viem polls for receipts every 4 s. My 1.06 s payment took 4.07 s until I set the interval to 200 ms.

Test chain, test token, a script instead of an LLM.
WebMCP has no wallet hook. I wrote a bridge so the agent host signs, not the page.

Watch the real run in the video. The slides show the numbers.
Code, MIT: https://github.com/Egoushka/x402-webmcp-lab

Who should hold an AI agent's wallet: the browser, the model vendor, or you?
Pick one and tell me why.

#x402 #WebMCP #AIAgents #MCP

## Hook variants (line 1, swap in)

1. An AI agent paid for a web tool call in 262 ms. No human. No API key.
2. One library default turned a 1 s agent payment into 4 s. Here is the setting.
3. WebMCP lets a page sell tools to agents. It does not say who pays. I tested x402 on top.

## Poll variant

Replace the closing question with the poll and keep the body above it.

Question: Who should hold an AI agent's payment wallet?
- The browser
- The model vendor
- The user, with spend caps
- A custody service

Polls rank low in the playbook (0.62% per impression, a vendor figure, unverified). Use the poll only if you want fast replies over reach, and log it in `references/results.md`.

## Numbers used (results.json)

- 200 ms blocks: tool call p50 261.9 ms, p95 464.3 ms
- 2 s blocks: p50 1064.2 ms; with viem's default 4 s polling: p50 4065.7 ms
- 25 of 25 paid calls per scenario
