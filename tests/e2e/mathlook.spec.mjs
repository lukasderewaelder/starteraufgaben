// Browser-Tests: automatischer Tausendertrenner und Formelschrift „wie das Blatt“ (Voreinstellungen).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useApp } from './helpers.mjs';

const app = useApp();
const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');

async function setTask(page, index, text) {
  await page.click(`.cell-task[data-index="${index}"]`);
  await page.fill('#f-text', text);
  await saved(page);
}
// `\,` ist in KaTeX ein Abstand von 3/18 em (die Rechenzeichen haben 4/18 und 5/18 em).
const gaps = (page, index) => page.locator(`.cell-task[data-index="${index}"] .katex .mspace[style*="0.1667em"]`).count();
const settingsOpen = (page) => page.evaluate(() => window.__starteraufgaben.app.openSettings());
async function toggle(page, selector, on) {
  await settingsOpen(page);
  await page.setChecked(selector, on);
  await page.waitForTimeout(300);
  await page.click('#dlg-settings [data-close]');
  await page.waitForSelector('#sheet .sheet-title');
}

test('Tausendertrenner: Formeln ab fünf Stellen bekommen einen kleinen Abstand, normaler Text nicht', async () => {
  const { context, page, problems } = await app.openApp();
  await setTask(page, 0, '$1234567 + 12345$');
  await setTask(page, 1, '$1000 + 9999 + 0,12345$');
  await setTask(page, 2, 'Im Text steht 12345 und 21423 Hamburg.');
  assert.equal(await gaps(page, 0), 3); // 1 234 567 (2 Abstände) und 12 345 (1 Abstand)
  assert.equal(await gaps(page, 1), 0);
  assert.match(await page.textContent('.cell-task[data-index="2"]'), /12345 und 21423/);
  // Der gespeicherte Text bleibt, wie getippt
  const stored = await page.evaluate(() => window.__starteraufgaben.getSheet().tasks[0].text);
  assert.equal(stored, '$1234567 + 12345$');
  assert.deepEqual(problems, []);
  await context.close();
});

test('Voreinstellung „Tausendertrenner“: aus = keine Abstände, bleibt nach dem Neuladen', async () => {
  const { context, page } = await app.openApp();
  await setTask(page, 0, '$1234567$');
  assert.equal(await gaps(page, 0), 2);
  await toggle(page, '#s-thousands', false);
  assert.equal(await gaps(page, 0), 0);
  await page.reload();
  await page.waitForSelector('#lib-grid .card-sheet, #sheet .sheet-title');
  if ((await page.locator('#sheet .sheet-title').count()) === 0) await page.click('.card-open');
  await page.waitForSelector('#sheet .sheet-title');
  assert.equal(await gaps(page, 0), 0);
  await toggle(page, '#s-thousands', true);
  assert.equal(await gaps(page, 0), 2);
  await context.close();
});

test('Voreinstellung „Formelschrift“: Comic Neue statt Mathe-Serife, schaltbar und gemerkt', async () => {
  const { context, page, problems } = await app.openApp();
  await setTask(page, 0, '$3x + 5 = 2x - 7$ und $\\alpha \\le \\pi \\cdot r^{2}$');
  const width = () => page.evaluate(() => document.querySelector('.cell-task[data-index="0"] .katex').getBoundingClientRect().width);
  const link = (id) => page.evaluate((i) => document.getElementById(i).disabled, id);
  assert.equal(await link('mathfont-css'), false);
  assert.equal(await link('mathfont-symbols-css'), false);
  await page.evaluate(() => document.fonts.ready);
  const matching = await width();

  await toggle(page, '#s-mathfont', false);
  assert.equal(await link('mathfont-css'), true);
  assert.equal(await link('mathfont-symbols-css'), true);
  await page.evaluate(() => document.fonts.ready);
  const classic = await width();
  assert.ok(Math.abs(matching - classic) > 2, `Breite ${matching} vs. ${classic}: die Schrift hat sich nicht geändert`);

  await page.reload();
  await page.waitForSelector('#lib-grid .card-sheet, #sheet .sheet-title');
  assert.equal(await link('mathfont-css'), true);
  await toggle(page, '#s-mathfont', true).catch(async () => {
    await page.click('.card-open');
    await toggle(page, '#s-mathfont', true);
  });
  assert.equal(await link('mathfont-css'), false);
  assert.deepEqual(problems.filter((p) => !/Failed to load resource/.test(p)), []);
  await context.close();
});

test('Formelschrift: die ergänzenden Schriften (Griechisch, Zeichen) laden und es gibt keine Fremdanfragen', async () => {
  const { context, page, foreign } = await app.openApp();
  await setTask(page, 0, '$\\alpha = 35^\\circ,\\ a \\le b,\\ x \\ne 0,\\ A \\approx \\pi \\cdot r^{2}$');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded' && /^"?KaTeX_(Main|Math)"?$/.test(f.family)).map((f) => f.family.replaceAll('"', '')),
  );
  assert.ok(loaded.length >= 2, `geladen: ${loaded.join(', ')}`);
  // Die Ergänzungsschrift wird wirklich gebraucht: Netzwerk-Einträge für beide Dateien
  const files = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name.split('/').pop()));
  assert.ok(files.some((f) => f.startsWith('comfortaa-greek-400')), files.join(' '));
  assert.ok(files.some((f) => f.startsWith('noto-sans-math-400')), files.join(' '));
  assert.ok(files.some((f) => f.startsWith('comic-neue-latin-400')));
  assert.deepEqual(foreign, []);
  await context.close();
});
