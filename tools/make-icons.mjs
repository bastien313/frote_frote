#!/usr/bin/env node
// Generates the PWA icons (icons/*.png) by drawing them in a headless Chromium.
//   node tools/make-icons.mjs
// Requires Playwright (preinstalled in the dev container, otherwise `npm i -D playwright`).

/* global draw */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c"></canvas>
<script>
function draw(size, maskable) {
  const c = document.getElementById('c');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size;
  x.clearRect(0, 0, s, s);
  // background
  const r = maskable ? 0 : s * 0.22;
  const g = x.createRadialGradient(s * 0.5, s * 0.35, s * 0.05, s * 0.5, s * 0.5, s * 0.75);
  g.addColorStop(0, '#45d6c4'); g.addColorStop(0.55, '#1fa596'); g.addColorStop(1, '#0f6b61');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(r, 0); x.arcTo(s, 0, s, s, r); x.arcTo(s, s, 0, s, r); x.arcTo(0, s, 0, 0, r); x.arcTo(0, 0, s, 0, r);
  x.fill();
  const k = maskable ? 0.78 : 1; // keep content inside the maskable safe zone
  x.translate(s / 2, s / 2); x.scale(k, k); x.translate(-s / 2, -s / 2);
  // dirty floor streak being cleaned
  x.fillStyle = 'rgba(110,80,46,0.55)';
  x.beginPath(); x.ellipse(s * 0.3, s * 0.78, s * 0.22, s * 0.07, -0.2, 0, Math.PI * 2); x.fill();
  // sponge
  x.save();
  x.translate(s * 0.52, s * 0.56); x.rotate(-0.35);
  const w = s * 0.5, h = s * 0.3;
  x.fillStyle = '#e8b51a';
  x.beginPath(); x.roundRect(-w / 2, -h / 2 + s * 0.03, w, h, s * 0.06); x.fill();
  x.fillStyle = '#ffd84a';
  x.beginPath(); x.roundRect(-w / 2, -h / 2, w, h * 0.85, s * 0.06); x.fill();
  x.fillStyle = '#3cbf62';
  x.beginPath(); x.roundRect(-w / 2, h * 0.18, w, h * 0.3, s * 0.05); x.fill();
  x.fillStyle = 'rgba(200,150,20,0.6)';
  for (const [px, py, pr] of [[-0.15, -0.05, 0.03], [0.05, -0.08, 0.025], [0.15, 0.02, 0.02], [-0.05, 0.03, 0.018]]) {
    x.beginPath(); x.arc(px * s, py * s, pr * s, 0, Math.PI * 2); x.fill();
  }
  x.restore();
  // bubbles
  for (const [bx, by, br] of [[0.24, 0.3, 0.07], [0.36, 0.18, 0.045], [0.78, 0.3, 0.06], [0.7, 0.16, 0.035], [0.84, 0.62, 0.045]]) {
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = s * 0.012;
    x.beginPath(); x.arc(bx * s, by * s, br * s, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.beginPath(); x.arc((bx - br * 0.35) * s, (by - br * 0.35) * s, br * 0.25 * s, 0, Math.PI * 2); x.fill();
  }
  // sparkle
  const sp = (cx, cy, rr) => {
    x.fillStyle = '#fff8c4';
    x.beginPath();
    x.moveTo(cx, cy - rr); x.lineTo(cx + rr * 0.25, cy - rr * 0.25); x.lineTo(cx + rr, cy); x.lineTo(cx + rr * 0.25, cy + rr * 0.25);
    x.lineTo(cx, cy + rr); x.lineTo(cx - rr * 0.25, cy + rr * 0.25); x.lineTo(cx - rr, cy); x.lineTo(cx - rr * 0.25, cy - rr * 0.25);
    x.closePath(); x.fill();
  };
  sp(s * 0.2, s * 0.58, s * 0.07);
  sp(s * 0.8, s * 0.82, s * 0.05);
  return c.toDataURL('image/png');
}
</script></body></html>`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
await page.setContent(html);
mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
  const data = await page.evaluate(([s, m]) => draw(s, m), [size, maskable]);
  writeFileSync(new URL('../icons/' + name, import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote icons/' + name);
}
await browser.close();
