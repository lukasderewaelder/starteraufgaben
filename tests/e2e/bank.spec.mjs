// Browser-Tests der Aufgabenbank: speichern, filtern, bearbeiten, ins Blatt übernehmen, sichern.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PNG_1X1, useApp } from './helpers.mjs';

const app = useApp();

const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');
const bankCards = (page) => page.locator('#bank-grid .bank-card');

/** Legt Bank-Aufgaben direkt im Speicher an (schneller als über die Oberfläche). */
async function seedBank(page, items) {
  await page.evaluate(async (list) => {
    const { newBankItem } = await import('/src/bank.js');
    const { app: a } = window.__starteraufgaben;
    for (const data of list) await a.store.saveBankItem(newBankItem(data));
    await a.refreshBank();
  }, items);
}

const SEED = [
  { text: 'Kürze: $\\frac{12}{18}$', klassenstufe: '6', thema: 'Brüche', tags: ['kürzen'] },
  { text: 'Erweitere $\\frac{1}{2}$ auf 6tel.', klassenstufe: '6', thema: 'Brüche', tags: ['erweitern'] },
  { text: 'Berechne 25 % von 80.', klassenstufe: '7', thema: 'Prozentrechnung', tags: ['Kopfrechnen'] },
  { text: 'Runde 388 auf Hunderter.', klassenstufe: '5', thema: 'Runden', tags: ['Kopfrechnen', 'Grundlagen'] },
];

/** Öffnet die Bank-Ansicht frisch (lädt die Aufgaben neu aus dem Speicher). */
async function reopenBank(page, count) {
  await page.click('#bank-back');
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.click('#lib-bank');
  await page.waitForFunction((n) => document.querySelectorAll('#bank-grid .bank-card').length === n, count);
}

async function openBank(page) {
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.click('#lib-bank');
  await page.waitForSelector('#view-bank', { state: 'visible' });
}

test('Aufgabe aus dem Blatt in die Bank speichern: Dialog, Vorbelegung, keine Doppelten', async () => {
  const { context, page, problems } = await app.openApp();
  await page.fill('#f-klasse', '7b');
  await page.click('#sheet .cell-task[data-index="0"]');
  await page.click('#btn-task-bank');
  await page.waitForSelector('#dlg-tobank[open]');
  assert.equal(await page.inputValue('#tb-grade'), '7', 'Klassenstufe aus „7b“ vorbelegt');
  assert.ok((await page.locator('#tobank-preview .katex').count()) > 0);
  await page.selectOption('#tb-grade', '6');
  await page.fill('#tb-topic', 'Kopfrechnen');
  await page.fill('#tb-tags', 'mal, Grundlagen,  ');
  await page.click('#tb-ok');
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('gespeichert'));

  // Noch einmal dieselbe Aufgabe: nichts doppelt.
  await page.click('#btn-task-bank');
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('schon in der Aufgabenbank'));
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.bank.length), 1);

  // Andere Aufgabe: letzte Auswahl ist vorbelegt (Klasse aus dem Blatt hat Vorrang).
  await page.click('#sheet .cell-task[data-index="1"]');
  await page.click('#btn-task-bank');
  await page.waitForSelector('#dlg-tobank[open]');
  assert.equal(await page.inputValue('#tb-topic'), 'Kopfrechnen');
  await page.click('#dlg-tobank [data-close]');
  await page.waitForSelector('#dlg-tobank', { state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.bank.length), 1, 'Abbrechen legt nichts an');

  await openBank(page);
  assert.equal(await bankCards(page).count(), 1);
  const card = await bankCards(page).first().textContent();
  assert.match(card, /Klasse 6/);
  assert.match(card, /Kopfrechnen/);
  assert.match(card, /#mal/);
  assert.match(card, /#Grundlagen/);
  assert.ok((await page.locator('#bank-grid .katex').count()) > 0, 'Formeln werden in der Bank gerendert');
  assert.deepEqual(problems, []);
  await context.close();
});

test('Leere Aufgaben lassen sich nicht in die Bank speichern', async () => {
  const { context, page } = await app.openApp();
  await page.click('#btn-add-task');
  await page.click('#btn-task-bank');
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('noch leer'));
  assert.equal(await page.isVisible('#dlg-tobank'), false);
  await context.close();
});

test('Bank-Ansicht: Filter nach Klasse, Thema, Schlagwort und Suche; Leere Bank zeigt einen Hinweis', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-bank');
  await page.waitForSelector('#bank-empty:not([hidden])');
  assert.match(await page.textContent('#bank-empty'), /noch leer/);

  await seedBank(page, SEED);
  await page.click('#bank-back');
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.click('#lib-bank');
  await page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 4);

  await page.selectOption('#bank-grade', '6');
  assert.equal(await bankCards(page).count(), 2);
  await page.selectOption('#bank-topic', 'Brüche');
  assert.equal(await bankCards(page).count(), 2);
  await page.click('#bank-tags [data-tag="kürzen"]');
  assert.equal(await bankCards(page).count(), 1);
  assert.match(await bankCards(page).first().textContent(), /Kürze/);
  await page.click('#bank-tags [data-tag="kürzen"]'); // abwählen
  assert.equal(await bankCards(page).count(), 2);

  await page.selectOption('#bank-grade', '');
  await page.selectOption('#bank-topic', '');
  await page.click('#bank-tags [data-tag="Kopfrechnen"]');
  assert.equal(await bankCards(page).count(), 2);
  await page.fill('#bank-search', 'prozent');
  assert.equal(await bankCards(page).count(), 1);
  await page.fill('#bank-search', 'gibt es nicht');
  assert.equal(await bankCards(page).count(), 0);
  assert.match(await page.textContent('#bank-empty'), /Keine Aufgaben gefunden/);
  await context.close();
});

test('Neue Aufgabe in der Bank: Bearbeiten mit Vorschau und Formel, Speichern, leere Aufgaben verschwinden', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-bank');
  await page.waitForSelector('#view-bank', { state: 'visible' });

  // Leer angelegt und sofort geschlossen: keine Karteileiche.
  await page.click('#bank-new');
  await page.waitForSelector('#bank-editor:not([hidden])');
  await page.click('#bank-close');
  await page.waitForSelector('#bank-editor', { state: 'hidden' });
  assert.equal(await bankCards(page).count(), 0);

  await page.click('#bank-new');
  await page.waitForSelector('#bank-editor:not([hidden])');
  await page.fill('#bank-text', 'Berechne:\na) $12 \\cdot 3$\nb) **fett**');
  assert.ok((await page.locator('#bank-preview .katex').count()) > 0, 'Vorschau zeigt die Formel');
  assert.equal(await page.locator('#bank-preview .ln.sub').count(), 2);
  await page.selectOption('#bank-f-grade', '5');
  await page.fill('#bank-f-topic', 'Grundrechenarten');
  await page.fill('#bank-f-tags', 'mal, Kopfrechnen');
  await page.waitForFunction(() => document.querySelector('#bank-save-state').textContent === 'Gespeichert');

  // ∑ Formel funktioniert auch hier (Dialog über der Bank-Ansicht)
  await page.click('#bank-text');
  await page.evaluate(() => document.querySelector('#bank-text').setSelectionRange(document.querySelector('#bank-text').value.length, document.querySelector('#bank-text').value.length));
  await page.click('#bank-editor [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  await page.locator('math-field').click();
  await page.waitForFunction(() => document.activeElement === document.querySelector('math-field'));
  await page.keyboard.type('x^2');
  await page.waitForFunction(() => !document.querySelector('#math-ok').disabled);
  await page.click('#math-ok');
  await page.waitForSelector('#dlg-math', { state: 'hidden' });
  assert.match(await page.inputValue('#bank-text'), /\$x\^2\$$/);

  await page.click('#bank-close');
  await page.waitForSelector('#bank-editor', { state: 'hidden' });
  assert.equal(await bankCards(page).count(), 1);
  const card = await bankCards(page).first().textContent();
  assert.match(card, /Klasse 5/);
  assert.match(card, /Grundrechenarten/);
  assert.match(card, /#mal/);

  // Nach dem Neuladen noch da; Thema steht als Vorschlag und im Filter.
  await page.reload();
  await page.waitForSelector('#bank-grid .bank-card');
  assert.equal(await bankCards(page).count(), 1);
  assert.ok((await page.locator('#bank-topic option', { hasText: 'Grundrechenarten' }).count()) === 1);
  await context.close();
});

test('Neue Aufgabe übernimmt die gerade gewählten Filter als Vorgabe', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-bank');
  await seedBank(page, SEED);
  await page.click('#bank-back');
  await page.click('#lib-bank');
  await page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 4);
  await page.selectOption('#bank-grade', '7');
  await page.selectOption('#bank-topic', 'Prozentrechnung');
  await page.click('#bank-new');
  await page.waitForSelector('#bank-editor:not([hidden])');
  assert.equal(await page.inputValue('#bank-f-grade'), '7');
  assert.equal(await page.inputValue('#bank-f-topic'), 'Prozentrechnung');
  await context.close();
});

test('Bank-Aufgabe duplizieren und löschen mit Rückgängig', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-bank');
  await seedBank(page, SEED.slice(0, 2));
  await page.click('#bank-back');
  await page.click('#lib-bank');
  await page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 2);

  await page.locator('#bank-grid .bank-open', { hasText: 'Kürze' }).click();
  await page.waitForSelector('#bank-editor:not([hidden])');
  await page.click('#bank-dup');
  await page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 3);

  await page.click('#bank-del');
  await page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 2);
  assert.match(await page.textContent('#toast-text'), /gelöscht/);
  await page.click('#toast-action');
  await page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 3);
  await context.close();
});

test('Aus der Bank ins Blatt: mehrere wählen, Reihenfolge, Bilder, Begrenzung durch freie Plätze', async () => {
  const { context, page } = await app.openApp();
  await openBank(page);
  await seedBank(page, SEED);
  await reopenBank(page, 4);
  // Bild an einer Bank-Aufgabe
  await page.locator('#bank-grid .bank-open', { hasText: 'Runde 388' }).click();
  await page.setInputFiles('#bank-f-image', { name: 'k.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.waitForSelector('#bank-thumb:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#bank-save-state').textContent === 'Gespeichert');
  await page.click('#bank-close');
  await page.click('.bank-open');
  await page.click('#bank-close');

  await page.click('#bank-back');
  await page.click('.card-open');
  await page.waitForSelector('#sheet .sheet-title');
  assert.equal(await page.locator('#sheet .cell-task').count(), 4);

  await page.click('#btn-bank-pick');
  await page.waitForSelector('#dlg-pick[open] .bank-card');
  assert.equal(await page.locator('#pick-list .bank-card').count(), 4);
  assert.match(await page.textContent('#pick-note'), /0 ausgewählt/);
  await page.locator('#pick-list .bank-open', { hasText: 'Runde 388' }).click();
  await page.locator('#pick-list .bank-open', { hasText: 'Kürze' }).click();
  assert.equal(await page.isEnabled('#pick-ok'), true);
  assert.equal(await page.textContent('#pick-ok'), 'Hinzufügen (2)');
  await page.locator('#pick-list .bank-open', { hasText: 'Kürze' }).click(); // wieder abwählen
  await page.locator('#pick-list .bank-open', { hasText: 'Erweitere' }).click();
  await page.click('#pick-ok');
  await page.waitForSelector('#dlg-pick', { state: 'hidden' });

  const texts = await page.evaluate(() => window.__starteraufgaben.getSheet().tasks.map((t) => t.text));
  assert.equal(texts.length, 6);
  assert.equal(texts[4], 'Runde 388 auf Hunderter.', 'Reihenfolge der Auswahl');
  assert.equal(texts[5], 'Erweitere $\\frac{1}{2}$ auf 6tel.');
  await page.waitForSelector('#sheet .cell-task[data-index="4"] .task-image');
  assert.equal(await page.textContent('#task-heading'), 'Aufgabe 5');

  // Das Blatt ist eine Kopie: Bearbeiten ändert die Bank nicht.
  await page.fill('#f-text', 'Ganz anders');
  assert.ok(await page.evaluate(() => window.__starteraufgaben.app.bank.some((i) => i.text === 'Runde 388 auf Hunderter.')));

  // Begrenzung: nur noch 6 Plätze frei -> höchstens 6 wählbar
  await page.click('#btn-bank-pick');
  await page.waitForSelector('#dlg-pick[open] .bank-card');
  assert.match(await page.textContent('#pick-note'), /noch Platz für 6/);
  await page.click('#dlg-pick [data-close]');
  await context.close();
});

test('Auswahl ist auf die freien Plätze begrenzt; bei vollem Blatt öffnet sich nichts', async () => {
  const { context, page } = await app.openApp();
  await openBank(page);
  await seedBank(page, SEED);
  await page.click('#bank-back');
  await page.click('.card-open');
  await page.waitForSelector('#sheet .sheet-title');
  for (let i = 0; i < 7; i += 1) await page.click('#btn-add-task'); // 11 Aufgaben, ein Platz frei

  await page.click('#btn-bank-pick');
  await page.waitForSelector('#dlg-pick[open] .bank-card');
  await page.locator('#pick-list .bank-open').nth(0).click();
  await page.locator('#pick-list .bank-open').nth(1).click();
  assert.match(await page.textContent('#pick-note'), /nur noch 1 Aufgaben/);
  assert.equal(await page.textContent('#pick-ok'), 'Hinzufügen (1)');
  await page.click('#pick-ok');
  await page.waitForSelector('#dlg-pick', { state: 'hidden' });
  assert.equal(await page.locator('#sheet .cell-task').count(), 12);

  await page.click('#btn-bank-pick');
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('Das Blatt ist voll'));
  assert.equal(await page.isVisible('#dlg-pick'), false);
  await context.close();
});

test('Leere Bank beim Übernehmen: Hinweis statt Dialog', async () => {
  const { context, page } = await app.openApp();
  await page.click('#btn-bank-pick');
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('noch leer'));
  assert.equal(await page.isVisible('#dlg-pick'), false);
  await context.close();
});

test('Sicherung enthält die Bank samt Bildern und lässt sich in einem anderen Browser einspielen', async () => {
  const a = await app.openApp({ view: 'library' });
  await a.page.click('#lib-bank');
  await seedBank(a.page, SEED);
  await a.page.click('#bank-back');
  await a.page.click('#lib-bank');
  await a.page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 4);
  await a.page.locator('#bank-grid .bank-open', { hasText: 'Kürze' }).click();
  await a.page.setInputFiles('#bank-f-image', { name: 'k.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await a.page.waitForSelector('#bank-thumb:not([hidden])');
  await a.page.waitForFunction(() => document.querySelector('#bank-save-state').textContent === 'Gespeichert');
  await a.page.click('#bank-close');
  await a.page.click('#bank-back');
  await a.page.waitForSelector('#lib-grid .card-sheet');

  await a.page.click('#lib-backup');
  await a.page.click('#backup-make');
  await a.page.waitForSelector('#backup-actions button:has-text("Herunterladen")');
  assert.match(await a.page.textContent('#backup-status'), /4 Aufgaben der Bank/);
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#backup-actions button:has-text("Herunterladen")')]);
  const text = await readFile(await download.path(), 'utf8');
  const data = JSON.parse(text);
  assert.equal(data.bank.length, 4);
  assert.equal(data.images.length, 1);

  const b = await app.openApp({ view: 'library' });
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await b.page.waitForSelector('#backup-actions button:has-text("Einspielen")');
  assert.match(await b.page.textContent('#backup-status'), /4 neue Aufgabe\(n\) der Aufgabenbank/);
  await b.page.click('#backup-actions button:has-text("Einspielen")');
  await b.page.waitForFunction(() => document.querySelector('#backup-status').textContent.startsWith('Fertig'));
  assert.match(await b.page.textContent('#backup-status'), /4 Bank-Aufgabe/);
  await b.page.click('#dlg-backup [data-close]');

  await b.page.click('#lib-bank');
  await b.page.waitForFunction(() => document.querySelectorAll('#bank-grid .bank-card').length === 4);
  await b.page.waitForSelector('#bank-grid .bank-img');
  assert.match(await b.page.textContent('#bank-grid'), /Klasse 6/);

  // Gleiche Datei noch einmal: nichts doppelt.
  await b.page.click('#bank-back');
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await b.page.waitForSelector('#backup-status:has-text("schon vorhanden")');
  await a.context.close();
  await b.context.close();
});

test('Bank-Bilder überstehen das Aufräumen beim Start', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-bank');
  await seedBank(page, [{ text: 'Mit Bild' }]);
  await page.click('#bank-back');
  await page.click('#lib-bank');
  await page.waitForSelector('#bank-grid .bank-card');
  await page.click('#bank-grid .bank-open');
  await page.setInputFiles('#bank-f-image', { name: 'k.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.waitForSelector('#bank-thumb:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#bank-save-state').textContent === 'Gespeichert');
  await page.reload();
  await page.waitForSelector('#bank-grid .bank-img');
  await page.reload(); // zweiter Start: Aufräumen darf das Bild nicht löschen
  await page.waitForSelector('#bank-grid .bank-img');
  assert.equal(await page.evaluate(() => document.querySelector('#bank-grid .bank-img').complete), true);
  await context.close();
});

test('Adresse #/bank öffnet die Bank direkt; Zurück-Knopf führt in die Bibliothek', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.goto(`${app.base}#/bank`);
  await page.waitForSelector('#view-bank', { state: 'visible' });
  assert.equal(await page.isVisible('#view-library'), false);
  await page.click('#bank-back');
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.ok(page.url().endsWith('#/'));
  await context.close();
});
