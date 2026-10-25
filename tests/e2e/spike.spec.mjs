// Browser-Test des Technik-Tests (Meilenstein 0). Nutzt das installierte Edge/Chrome (PW_CHANNEL),
// weil Playwrights eigene Browser hier nicht heruntergeladen werden können.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.mjs';

let server;
let base;
let browser;

before(async () => {
  ({ server, port: base } = await startServer(0));
  base = `http://localhost:${base}/`;
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function newPage(context) {
  const page = await context.newPage();
  const problems = [];
  const foreign = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url());
  });
  return { page, problems, foreign };
}

test('Seite lädt ohne Fehler und ohne Anfragen an fremde Server', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page, problems, foreign } = await newPage(ctx);
  await page.goto(base);
  await page.waitForSelector('.sheet .sheet-title');
  assert.equal(await page.textContent('.sheet-title'), 'Starteraufgaben');
  assert.ok(await page.evaluate(() => document.fonts.check('32px "Comic Neue"')), 'Comic Neue nicht geladen');
  assert.ok(await page.locator('.sheet .katex').count() > 0, 'KaTeX hat nichts gerendert');
  assert.deepEqual(problems, []);
  assert.deepEqual(foreign, []);
  await ctx.close();
});

test('PDF-Export liefert in allen Formaten die exakte Seitengröße und ein nicht leeres Bild', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page } = await newPage(ctx);
  await page.goto(base);
  await page.waitForSelector('.sheet .sheet-title');
  const expected = { tabloid: [1224, 792], a3: [1190.55, 841.89], a4: [841.89, 595.28] };
  for (const [format, [w, h]] of Object.entries(expected)) {
    await page.selectOption('#sel-format', format);
    const result = await page.evaluate(async (fmt) => {
      const { createPdf } = await import('/src/export-pdf.js');
      const res = await createPdf(document.getElementById('sheet'), fmt);
      const text = new TextDecoder('latin1').decode(new Uint8Array(await res.blob.arrayBuffer()));
      const box = text.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1].trim().split(/\s+/).map(Number);
      return { head: text.slice(0, 5), box, size: res.blob.size, scale: res.scale };
    }, format);
    assert.equal(result.head, '%PDF-');
    assert.ok(Math.abs(result.box[2] - w) < 0.1 && Math.abs(result.box[3] - h) < 0.1, `${format}: ${result.box}`);
    assert.ok(result.size > 50_000, `${format}: PDF verdächtig klein (${result.size} B)`);
    assert.equal(result.scale, 2);
  }
  await ctx.close();
});

test('Der Export lässt das sichtbare Blatt unverändert', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page } = await newPage(ctx);
  await page.goto(base);
  await page.waitForSelector('.sheet .sheet-title');
  const before = await page.evaluate(() => {
    const s = document.getElementById('sheet');
    return { parent: s.parentElement.id, transform: s.style.transform, html: s.innerHTML.length };
  });
  await page.click('#btn-pdf');
  await page.waitForSelector('#pdf-result .box');
  const after = await page.evaluate(() => {
    const s = document.getElementById('sheet');
    return { parent: s.parentElement.id, transform: s.style.transform, html: s.innerHTML.length };
  });
  assert.deepEqual(after, before);
  await ctx.close();
});

test('Formel-Editor lädt, Eingabe landet als $…$ im Blatt', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page, problems } = await newPage(ctx);
  await page.goto(base);
  await page.click('#btn-math');
  await page.waitForSelector('#math-host math-field');
  await page.evaluate(() => {
    document.querySelector('math-field').value = '\\frac{3}{4}';
  });
  await page.click('#btn-math-insert');
  assert.match(await page.inputValue('#txt-task1'), /\$\\frac\{3\}\{4\}\$/);
  assert.ok(await page.locator('.cell-task[data-index="0"] .katex').count() >= 2);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Offline: nach dem ersten Besuch startet die App ohne Netz', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page } = await newPage(ctx);
  await page.goto(`${base}?sw=1`);
  await page.waitForSelector('.sheet .sheet-title');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Warten, bis alle Dateien im Cache liegen.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sw = reg?.active;
    if (!sw) return false;
    const status = await new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data);
      sw.postMessage('STATUS', [ch.port2]);
    });
    return status.cached >= status.expected;
  }, null, { timeout: 30_000 });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.sheet .sheet-title');
  assert.equal(await page.textContent('.sheet-title'), 'Starteraufgaben');
  assert.ok(await page.evaluate(() => document.fonts.check('32px "Comic Neue"')));
  // PDF-Export muss auch offline gehen (Bibliotheken werden nachgeladen -> kommen aus dem Cache).
  await page.click('#btn-pdf');
  await page.waitForSelector('#pdf-result .box');
  assert.equal(await page.locator('#pdf-result .box.error').count(), 0);
  await ctx.close();
});
