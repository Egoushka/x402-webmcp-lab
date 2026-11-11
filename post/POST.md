# LinkedIn post (not published)

Media: `demo.mp4` (14.7 s, 1080x1350, H.264) or `carousel/carousel.pdf` (8 slides, slide 1 is the same robot). LinkedIn takes one media type per post. `demo.gif` is for the README. Repo link in the body as asked; moving it to the first comment is the usual reach test.

## Post text

I gave an AI agent a wallet and let it shop on a website.
Test money, relax.

It worked on the first try. That never happens, so I got suspicious and ran it 25 times.
25 out of 25. About 262 ms each (median, on 200 ms blocks).

Then I found a library default that turned a 1 second payment into 4 seconds. viem checks for a receipt every 4 s. Classic.

Fine print: local test chain, test token, and the "agent" is a script, not an LLM.

The bit I can't solve: WebMCP has no wallet hook. The page can ask for money, but something else has to sign.

So who should hold an agent's wallet? The browser, the model vendor, or you?

Code, MIT: https://github.com/Egoushka/x402-webmcp-lab

#x402 #WebMCP #AIAgents #MCP

## Alternative first lines

1. One library default made my AI agent wait 4 seconds to pay for a quote.
2. My AI agent paid for something on a website and I did not believe it.

## Numbers (results.json)

- 200 ms blocks: tool call p50 261.9 ms, 25/25 ok
- 2 s blocks: p50 1064.2 ms; with viem's default 4 s receipt polling: p50 4065.7 ms

## Regenerate

`node post/cartoon/make.mjs` (video, GIF, frames.png; needs ffmpeg, set FFMPEG), `node post/carousel/build.mjs` (slides, PDF). Font: Fredoka, SIL OFL, in `post/fonts/`.
