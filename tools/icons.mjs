// Erzeugt die PNG-Icons aus assets/icons/icon.svg (Entwicklungswerkzeug, braucht Playwright + Edge/Chrome).
// Aufruf: node tools/icons.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'));
const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`;

// inset: Anteil, um den das Motiv verkleinert wird (maskable braucht eine sichere Zone von 80 %).
const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.2 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0 },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
try {
  const page = await browser.newPage();
  for (const { file, size, inset } of TARGETS) {
    const inner = Math.round(size * (1 - inset));
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:#2563eb}body{width:${size}px;height:${size}px;display:grid;place-items:center}</style>` +
        `<img src="${dataUrl}" width="${inner}" height="${inner}">`,
    );
    await page.screenshot({ path: join(dir, file), omitBackground: false });
    console.log(`${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
