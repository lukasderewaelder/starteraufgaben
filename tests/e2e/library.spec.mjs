// Browser-Tests der Bibliothek und der Sicherung als Datei.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PNG_1X1, useApp } from './helpers.mjs';

const app = useApp();

const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');
const cards = (page) => page.locator('#lib-grid .card-sheet');

/** Legt im Editor ein neues Blatt an und setzt den Titel; kehrt in die Bibliothek zurück. */
async function addSheet(page, title, { image = false } = {}) {
  await page.click('#lib-new');
  await page.waitForSelector('#sheet .sheet-title');
  await page.fill('#f-title', title);
  await page.click('.cell-task[data-index="0"]');
  await page.fill('#f-text', `Text von ${title}`);
  if (image) {
    await page.setInputFiles('#f-image', { name: 'k.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await page.waitForSelector('#sheet .task-image');
  }
  await saved(page);
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
}

async function downloadBackup(page, { single = false } = {}) {
  await page.click(single ? '#c-file' : '#backup-make');
  await page.waitForSelector('#backup-actions button:has-text("Herunterladen")');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backup-actions button:has-text("Herunterladen")')]);
  return { download, text: await readFile(await download.path(), 'utf8') };
}

test('Start in der Bibliothek: Beispielblatt mit Vorschau, Öffnen, Zurück', async () => {
  const { context, page, problems, foreign } = await app.openApp({ view: 'library' });
  assert.equal(await cards(page).count(), 1);
  assert.match(await page.textContent('.card-sheet'), /Nr\. 1 · Starteraufgaben/);
  await page.waitForSelector('#lib-grid .thumb .sheet .sheet-title');
  assert.ok((await page.locator('#lib-grid .thumb .katex').count()) > 0);

  await page.click('.card-open');
  await page.waitForSelector('#sheet .sheet-title');
  assert.equal(await page.locator('#lib-grid .thumb').count(), 0, 'Vorschauen werden im Editor freigegeben');
  assert.match(page.url(), /#\/blatt\//);
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(page.url().endsWith('#/'), true);
  assert.deepEqual(problems, []);
  assert.deepEqual(foreign, []);
  await context.close();
});

test('Browser-Zurück-Taste und unbekannte Blatt-Adressen führen sicher in die Bibliothek', async () => {
  const { context, page } = await app.openApp();
  await page.goBack();
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.goForward();
  await page.waitForSelector('#sheet .sheet-title');
  await page.goto(`${app.base}#/blatt/gibt-es-nicht`);
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(await cards(page).count(), 1);
  await context.close();
});

test('Neues Blatt, Suche und Sortierung', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await addSheet(page, 'Brüche kürzen');
  await addSheet(page, 'Prozentrechnung');
  assert.equal(await cards(page).count(), 3);
  assert.match(await cards(page).first().textContent(), /Prozentrechnung/); // zuletzt bearbeitet zuerst

  await page.fill('#lib-search', 'brüche');
  assert.equal(await cards(page).count(), 1);
  await page.fill('#lib-search', 'text von prozent'); // sucht auch im Aufgabentext
  assert.equal(await cards(page).count(), 1);
  await page.fill('#lib-search', 'gibt es nicht');
  assert.equal(await cards(page).count(), 0);
  assert.equal(await page.isVisible('#lib-empty'), true);
  await page.fill('#lib-search', '');

  await page.selectOption('#lib-sort', 'number-asc');
  assert.deepEqual(
    await page.locator('.card-meta strong').allTextContents(),
    ['Nr. 1 · Starteraufgaben', 'Nr. 2 · Brüche kürzen', 'Nr. 3 · Prozentrechnung'],
  );
  await page.selectOption('#lib-sort', 'number-desc');
  assert.match(await cards(page).first().textContent(), /Nr\. 3/);
  await context.close();
});

test('Karten-Menü: duplizieren, löschen mit Rückgängig', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('.card-menu');
  await page.click('#c-dup');
  await page.waitForFunction(() => document.querySelectorAll('#lib-grid .card-sheet').length === 2);
  assert.match(await page.textContent('#toast-text'), /Kopie als Nr\. 2/);

  await page.locator('.card-menu').first().click();
  await page.click('#c-del');
  await page.waitForFunction(() => document.querySelectorAll('#lib-grid .card-sheet').length === 1);
  await page.click('#toast-action');
  await page.waitForFunction(() => document.querySelectorAll('#lib-grid .card-sheet').length === 2);
  await context.close();
});

test('Sicherung: alle Blätter samt Bild als Datei und in einem anderen Browser wieder einspielen', async () => {
  const a = await app.openApp({ view: 'library' });
  await addSheet(a.page, 'Mit Bild', { image: true });
  await a.page.click('#lib-backup');
  const { download, text } = await downloadBackup(a.page);
  assert.match(download.suggestedFilename(), /^Starteraufgaben_Sicherung_\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(text);
  assert.equal(data.format, 'starteraufgaben-sicherung');
  assert.equal(data.sheets.length, 2);
  assert.equal(data.images.length, 1);
  assert.equal(data.images[0].type, 'image/png');
  // Nach der Sicherung ist die Erinnerung zurückgesetzt.
  const settings = await a.page.evaluate(() => ({ ...window.__starteraufgaben.app.settings }));
  assert.ok(settings.lastBackupAt > 0);
  assert.equal(settings.changesSinceBackup, 0);

  // Anderes Gerät: frischer Kontext, Datei einspielen.
  const b = await app.openApp({ view: 'library' });
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-file', { name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await b.page.waitForSelector('#backup-actions button:has-text("Einspielen")');
  // Beispielblatt hat auf beiden Seiten dieselbe ID? Nein – jede Installation legt ein eigenes an: 2 neue.
  assert.match(await b.page.textContent('#backup-status'), /2 neue/);
  await b.page.click('#backup-actions button:has-text("Einspielen")');
  await b.page.waitForFunction(() => document.querySelector('#backup-status').textContent.startsWith('Fertig'));
  await b.page.click('#dlg-backup [data-close]');
  await b.page.waitForFunction(() => document.querySelectorAll('#lib-grid .card-sheet').length === 3);

  const card = b.page.locator('.card-sheet', { hasText: 'Mit Bild' });
  await card.locator('.card-open').click();
  await b.page.waitForSelector('#sheet .task-image');
  assert.ok(await b.page.evaluate(() => document.querySelector('#sheet .task-image').naturalWidth >= 0));
  await a.context.close();
  await b.context.close();
});

test('Einspielen derselben Datei: nichts doppelt, lokal neuere Blätter bleiben (oder werden Kopie)', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await addSheet(page, 'Erste Fassung');
  await page.click('#lib-backup');
  const { text } = await downloadBackup(page);
  await page.click('#dlg-backup [data-close]');

  await page.click('#lib-backup');
  await page.setInputFiles('#backup-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForSelector('#backup-status:has-text("schon vorhanden")');
  await page.click('#dlg-backup [data-close]');

  // Lokal weiterbearbeiten -> Datei ist älter.
  await page.locator('.card-sheet', { hasText: 'Erste Fassung' }).locator('.card-open').click();
  await page.fill('#f-title', 'Zweite Fassung');
  await saved(page);
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.click('#lib-backup');
  await page.setInputFiles('#backup-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForSelector('#backup-actions button:has-text("Kopien")', { timeout: 5000 }).catch(async (err) => {
    throw new Error(`${err.message}\nStatus: ${await page.textContent('#backup-status')}\nAktionen: ${await page.textContent('#backup-actions')}`);
  });
  assert.match(await page.textContent('#backup-status'), /hier neuer/);
  await page.click('#backup-actions button:has-text("Kopien")');
  await page.waitForFunction(() => document.querySelector('#backup-status').textContent.startsWith('Fertig'));
  await page.click('#dlg-backup [data-close]');
  // Beispielblatt + „Zweite Fassung“ + die Kopie der älteren Datei-Fassung („Erste Fassung“)
  await page.waitForFunction(() => document.querySelectorAll('#lib-grid .card-sheet').length === 3);
  const titles = await page.locator('.card-meta strong').allTextContents();
  assert.ok(titles.some((t) => t.includes('Erste Fassung')));
  assert.ok(titles.some((t) => t.includes('Zweite Fassung')));
  await context.close();
});

test('Einzelnes Blatt als Datei sichern (Karten-Menü)', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('.card-menu');
  const { download, text } = await (async () => {
    await page.click('#c-file');
    await page.waitForSelector('#backup-make');
    return downloadBackup(page, { single: false });
  })();
  assert.match(download.suggestedFilename(), /^Starteraufgaben_Blatt-1_/);
  assert.equal(JSON.parse(text).sheets.length, 1);
  // Einzelne Blätter setzen die „Letzte Sicherung“ nicht zurück.
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.settings.lastBackupAt), 0);
  await context.close();
});

test('Ungültige Dateien werden mit einer verständlichen Meldung abgelehnt', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-backup');
  await page.setInputFiles('#backup-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('das ist kein json') });
  await page.waitForSelector('#backup-status.result-error');
  assert.match(await page.textContent('#backup-status'), /kein lesbares JSON/);
  await page.click('#backup-actions button:has-text("Zurück")');
  await page.setInputFiles('#backup-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"anders"}') });
  await page.waitForSelector('#backup-status.result-error');
  assert.match(await page.textContent('#backup-status'), /keine Starteraufgaben-Sicherung/);
  assert.equal(await cards(page).count(), 1);
  await context.close();
});

test('Erinnerung: erscheint nach mehreren Bearbeitungen, lässt sich verschieben und verschwindet nach der Sicherung', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  assert.equal(await page.isVisible('#backup-reminder'), false);
  await page.evaluate(() => window.__starteraufgaben.app.setSettings({ changesSinceBackup: 5, firstChangeAt: Date.now() }));
  await page.click('.card-open');
  await page.waitForSelector('#sheet .sheet-title');
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(await page.isVisible('#backup-reminder'), true);
  assert.match(await page.textContent('#reminder-text'), /noch keine Sicherung/);

  await page.click('#reminder-later');
  await page.waitForSelector('#backup-reminder', { state: 'hidden' });
  await page.reload();
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(await page.isVisible('#backup-reminder'), false, 'Pause gilt auch nach dem Neuladen');

  await page.evaluate(() => window.__starteraufgaben.app.setSettings({ reminderSnoozedUntil: 0 }));
  await page.click('#lib-menu');
  await page.click('#dlg-libmenu [data-close]');
  await page.reload();
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(await page.isVisible('#backup-reminder'), true);
  await page.click('#reminder-now');
  await downloadBackup(page);
  await page.click('#dlg-backup [data-close]');
  await page.waitForSelector('#backup-reminder', { state: 'hidden' });
  await context.close();
});
