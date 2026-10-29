// Browser-Tests der Klassen-Ordner in der Bibliothek.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useApp } from './helpers.mjs';

const app = useApp();
const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');
const cards = (page) => page.locator('#lib-grid .card-sheet');
const tab = (page, text) => page.locator('#lib-folders .pill-btn', { hasText: text });
const tabTexts = (page) => page.locator('#lib-folders .pill-btn').allTextContents();
const waitCards = (page, n) => page.waitForFunction((count) => document.querySelectorAll('#lib-grid .card-sheet').length === count, n);

async function createFolder(page, name) {
  await page.locator('#lib-folders .pill-btn', { hasText: /^\+ (Klassen-)?Ordner/ }).first().click();
  await page.fill('#folder-name', name);
  await page.click('#folder-ok');
  await page.waitForSelector('#dlg-folder:not([open])', { state: 'attached' });
}

test('Ordner anlegen: neuer Ordner ist gleich geöffnet, Reiter zeigen die Anzahl', async () => {
  const { context, page, problems } = await app.openApp({ view: 'library' });
  assert.deepEqual(await tabTexts(page), ['+ Klassen-Ordner anlegen']);
  await createFolder(page, '7b');
  assert.deepEqual(await tabTexts(page), ['Alle (1)', '7b (0)', 'Ohne Ordner (1)', '+ Ordner', 'Ordner bearbeiten …']);
  assert.equal(await tab(page, '7b').getAttribute('aria-pressed'), 'true');
  assert.equal(await cards(page).count(), 0);
  assert.match(await page.textContent('#lib-empty'), /In diesem Ordner liegen noch keine Blätter/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Neues Blatt landet im geöffneten Ordner; „Alle“ zeigt alles samt Ordnername; Auswahl bleibt nach dem Neuladen', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await createFolder(page, '7b');
  await page.click('#lib-new');
  await page.waitForSelector('#sheet .sheet-title');
  await page.fill('#f-title', 'Bruchrechnen');
  await saved(page);
  assert.equal(await page.inputValue('#f-folder'), await page.evaluate(() => window.__starteraufgaben.app.folders[0].id));
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.deepEqual(await tabTexts(page), ['Alle (2)', '7b (1)', 'Ohne Ordner (1)', '+ Ordner', 'Ordner bearbeiten …']);
  assert.equal(await cards(page).count(), 1);
  assert.match(await page.textContent('.card-sheet'), /Bruchrechnen/);

  await tab(page, 'Alle').click();
  await waitCards(page, 2);
  assert.match(await page.textContent('#lib-grid'), /Ordner 7b/);
  await tab(page, 'Ohne Ordner').click();
  await waitCards(page, 1);
  assert.doesNotMatch(await page.textContent('#lib-grid'), /Bruchrechnen/);

  await page.reload();
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(await tab(page, 'Ohne Ordner').getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('Blatt über „⋯“ in einen Ordner verschieben, auch in einen neuen; Vorschlag passend zur Klasse', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await createFolder(page, '8a');
  await tab(page, 'Alle').click();
  await page.locator('.card-menu').first().click();
  await page.click('#c-move');
  await page.waitForSelector('#folderpick-list button');
  assert.deepEqual(await page.locator('#folderpick-list button').allTextContents(), ['8a', 'Ohne Ordner ✓', '+ Neuer Ordner …']);
  await page.click('#folderpick-list button[data-folder]:has-text("8a")');
  await page.waitForFunction(() => document.querySelector('#lib-folders').textContent.includes('8a (1)'));
  assert.equal(await tab(page, 'Ohne Ordner').count(), 1);
  assert.match(await tab(page, 'Ohne Ordner').textContent(), /\(0\)/);

  // in einen neuen Ordner verschieben
  await page.locator('.card-menu').first().click();
  await page.click('#c-move');
  await page.click('#folderpick-list button:has-text("Neuer Ordner")');
  await page.fill('#folder-name', '9c');
  await page.click('#folder-ok');
  await page.waitForFunction(() => document.querySelector('#lib-folders').textContent.includes('9c (1)'));
  assert.match(await tab(page, '8a').textContent(), /\(0\)/);

  // Vorschlag: Das Blatt hat die Klasse 8a, also wird der Ordner 8a hervorgehoben
  await page.evaluate(async () => {
    const { app: a } = window.__starteraufgaben;
    await a.store.saveSheet({ ...a.sheets[0], klasse: '8a', updatedAt: Date.now() });
    await a.refreshSheets();
  });
  await page.locator('.card-menu').first().click();
  await page.click('#c-move');
  assert.match(await page.locator('#folderpick-list button.btn-primary').textContent(), /8a – passt zur Klasse/);
  await context.close();
});

test('Ordner umbenennen, doppelte Namen abweisen, löschen: Blätter bleiben, Rückgängig stellt alles her', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await createFolder(page, '7b');
  await page.evaluate(async () => {
    const { app: a } = window.__starteraufgaben;
    await a.moveSheet(a.sheets[0], a.folders[0].id);
  });
  await page.reload();
  await page.waitForSelector('#lib-grid .card-sheet, #lib-folders .pill-btn');
  await tab(page, '7b').click();
  await waitCards(page, 1);

  // Umbenennen
  await tab(page, 'Ordner bearbeiten').click();
  await page.fill('#folder-name', '7 c');
  await page.click('#folder-ok');
  await page.waitForFunction(() => document.querySelector('#lib-folders').textContent.includes('7 c (1)'));

  // Doppelter Name
  await createFolder(page, 'AG'); // legt „AG“ an und öffnet ihn
  await tab(page, 'Ordner bearbeiten').click();
  await page.fill('#folder-name', '7C');
  await page.click('#folder-ok');
  assert.match(await page.textContent('#folder-error'), /schon einen Ordner/);
  await page.click('#folder-delete'); // AG löschen
  await page.waitForFunction(() => !document.querySelector('#lib-folders').textContent.includes('AG'));

  // „7 c“ löschen: das Blatt bleibt, liegt aber ohne Ordner
  await tab(page, '7 c').click();
  await tab(page, 'Ordner bearbeiten').click();
  await page.click('#folder-delete');
  await page.waitForSelector('#toast-action');
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('Ordner „7 c“ gelöscht'));
  assert.deepEqual(await tabTexts(page), ['+ Klassen-Ordner anlegen']);
  await waitCards(page, 1);

  await page.click('#toast-action'); // Rückgängig
  await page.waitForFunction(() => document.querySelector('#lib-folders').textContent.includes('7 c (1)'));
  await context.close();
});

test('Editor: Ordner wählen und Vorschlag aus dem Feld „Klasse“', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await createFolder(page, '7b');
  await tab(page, 'Alle').click();
  await page.locator('.card-open').first().click();
  await page.waitForSelector('#sheet .sheet-title');
  assert.equal(await page.inputValue('#f-folder'), '');
  assert.deepEqual(await page.locator('#f-folder option').allTextContents(), ['Ohne Ordner', '7b']);

  await page.fill('#f-klasse', '7 B');
  await page.press('#f-klasse', 'Tab'); // Eingabefeld verlassen
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('In Ordner „7b“ gelegt'));
  assert.equal(await page.locator('#f-folder option:checked').textContent(), '7b');
  await saved(page);

  await page.selectOption('#f-folder', '');
  await saved(page);
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.match(await tab(page, 'Ohne Ordner').textContent(), /\(1\)/);
  await context.close();
});

test('Ordner in der Sicherung: Ordner und Zuordnung kommen in einem anderen Browser an', async () => {
  const a = await app.openApp({ view: 'library' });
  await createFolder(a.page, '10c');
  await a.page.evaluate(async () => {
    const { app: x } = window.__starteraufgaben;
    await x.moveSheet(x.sheets[0], x.folders[0].id);
  });
  await a.page.click('#lib-backup');
  await a.page.click('#backup-make');
  await a.page.waitForSelector('#backup-actions button:has-text("Herunterladen")');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#backup-actions button:has-text("Herunterladen")')]);
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(await download.path(), 'utf8');
  assert.equal(JSON.parse(text).folders.length, 1);

  const b = await app.openApp({ view: 'library' });
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await b.page.waitForSelector('#backup-actions button:has-text("Einspielen")');
  assert.match(await b.page.textContent('#backup-status'), /1 neue\(r\) Ordner/);
  await b.page.click('#backup-actions button:has-text("Einspielen")');
  await b.page.waitForFunction(() => document.querySelector('#backup-status').textContent.startsWith('Fertig'));
  await b.page.click('#dlg-backup [data-close]');
  await b.page.waitForFunction(() => document.querySelector('#lib-folders').textContent.includes('10c (1)'));
  await a.context.close();
  await b.context.close();
});
