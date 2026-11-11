// Builds anim.html, steps the animation clock frame by frame, screenshots each frame, encodes MP4 + GIF + a 3x3 check grid.
// Usage: node make.mjs [outDir=..]   (needs playwright-core, a Chromium and ffmpeg; FFMPEG env overrides the path)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { robot } from './art.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, '..'));
const ffmpeg = process.env.FFMPEG || '/tmp/tools/node_modules/ffmpeg-static/ffmpeg';
const FPS = 30, END = 14.7, N = Math.round(END * FPS);
const html = fs.readFileSync(path.join(here, 'anim.template.html'), 'utf8').replace('__ROBOT__', robot('r')).replace('__ROBOT2__', robot('f'));
const file = path.join(here, 'anim.html');
fs.writeFileSync(file, html);
const frames = fs.mkdtempSync('/tmp/cartoon-frames-');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
page.on('pageerror', (e) => console.error('page error', e.message));
await page.goto('file://' + file);
await page.evaluate(() => document.fonts.ready);
for (let i = 0; i < N; i++) {
  await page.evaluate((t) => window.render(t), i / FPS);
  await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
}
await browser.close();
const run = (...a) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
run('-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', path.join(out, 'demo.mp4'));
run('-i', path.join(out, 'demo.mp4'), '-vf', 'fps=15,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', path.join(out, 'demo.gif'));
const pick = [0.9, 2.7, 4.6, 6.2, 7.0, 8.6, 10.0, 11.8, 14.0].map((s) => Math.round(s * FPS));
run('-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-vf', `select='${pick.map((n) => `eq(n\\,${n})`).join('+')}',scale=540:-1,tile=3x3:padding=8:color=white`, '-frames:v', '1', '-update', '1', path.join(out, 'frames.png'));
fs.rmSync(frames, { recursive: true });
console.log('done', N, 'frames');
