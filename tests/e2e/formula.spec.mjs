// Browser-Tests des Formel-Knopfs (MathLive im Dialog).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useApp } from './helpers.mjs';

const app = useApp();

async function selectTask(page, index, text) {
  await page.click(`#sheet .cell-task[data-index="${index}"]`);
  await page.fill('#f-text', text);
}

/** Klickt ins Formelfeld, wartet auf den Fokus und tippt dann (MathLive braucht einen Moment nach dem Öffnen). */
async function typeFormula(page, text) {
  await page.locator('math-field').click();
  await page.waitForFunction(() => document.activeElement === document.querySelector('math-field'));
  await page.keyboard.type(text);
}

const setCaret = (page, start, end = start) =>
  page.evaluate(([s, e]) => document.querySelector('#f-text').setSelectionRange(s, e), [start, end]);

test('∑ Formel: Dialog öffnet, getippter Bruch landet als $…$ im Text und im Blatt', async () => {
  const { context, page, problems, foreign } = await app.openApp();
  await selectTask(page, 1, 'Wie viel ist');
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  assert.equal(await page.textContent('#math-title'), 'Formel einfügen');
  assert.equal(await page.isDisabled('#math-ok'), true, 'ohne Eingabe nichts einzufügen');

  await typeFormula(page, '3/4');
  await page.waitForFunction(() => !document.querySelector('#math-ok').disabled);
  await page.click('#math-ok');
  await page.waitForSelector('#dlg-math', { state: 'hidden' });

  assert.equal(await page.inputValue('#f-text'), 'Wie viel ist $\\frac{3}{4}$');
  assert.ok((await page.locator('#sheet .cell-task[data-index="1"] .katex .mfrac').count()) > 0);
  assert.deepEqual(problems, []);
  assert.deepEqual(foreign, [], 'MathLive darf nichts aus dem Netz nachladen');
  await context.close();
});

test('Cursor in einer Formel: Dialog zeigt sie zum Ändern, „Große Darstellung“ setzt \\displaystyle', async () => {
  const { context, page } = await app.openApp();
  await selectTask(page, 0, 'a $\\frac{1}{2}$ b');
  await setCaret(page, 6);
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  assert.equal(await page.textContent('#math-title'), 'Formel ändern');
  await page.waitForFunction(() => document.querySelector('math-field')?.getValue('latex') === '\\frac{1}{2}');
  assert.equal(await page.textContent('#math-ok'), 'Übernehmen');
  await page.check('#math-large');
  await page.click('#math-ok');
  await page.waitForSelector('#dlg-math', { state: 'hidden' });
  assert.equal(await page.inputValue('#f-text'), 'a $\\displaystyle \\frac{1}{2}$ b');

  // Noch einmal öffnen: \displaystyle steckt in der Option, nicht im Formelfeld.
  await setCaret(page, 8);
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  await page.waitForFunction(() => document.querySelector('math-field')?.getValue('latex') === '\\frac{1}{2}');
  assert.equal(await page.isChecked('#math-large'), true);
  await page.click('#dlg-math [data-close]');
  assert.equal(await page.inputValue('#f-text'), 'a $\\displaystyle \\frac{1}{2}$ b', 'Abbrechen ändert nichts');
  await context.close();
});

test('Zweite Formel an anderer Stelle: bestehende Formeln bleiben, Leerzeichen sinnvoll', async () => {
  const { context, page } = await app.openApp();
  await selectTask(page, 2, 'Berechne $x$ und ');
  await setCaret(page, 17);
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  await typeFormula(page, 'y^2');
  await page.waitForFunction(() => !document.querySelector('#math-ok').disabled);
  await page.click('#math-ok');
  await page.waitForSelector('#dlg-math', { state: 'hidden' });
  assert.equal(await page.inputValue('#f-text'), 'Berechne $x$ und $y^2$');
  await context.close();
});

test('Bildschirmtastatur erscheint unten am Bildschirm und verdeckt den Dialog nicht', async () => {
  const { context, page } = await app.openApp();
  await selectTask(page, 0, '');
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  await page.evaluate(() => window.mathVirtualKeyboard.show({ animate: false }));
  await page.waitForSelector('.MLK__plate', { state: 'visible' });
  const info = await page.evaluate(() => {
    const r = document.querySelector('.MLK__plate').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: innerHeight, dialogBottom: document.querySelector('#dlg-math').getBoundingClientRect().bottom };
  });
  assert.ok(Math.abs(info.bottom - info.vh) <= 2, `Tastatur nicht am unteren Rand: ${JSON.stringify(info)}`);
  assert.ok(info.top >= info.dialogBottom, `Tastatur verdeckt den Dialog: ${JSON.stringify(info)}`);
  await context.close();
});

test('Eigene Zahlen-Tastatur: Bruch, Komma, Malpunkt und Geteilt-Zeichen', async () => {
  const { context, page, problems } = await app.openApp();
  await selectTask(page, 0, '');
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  await page.evaluate(() => window.mathVirtualKeyboard.show({ animate: false }));
  await page.waitForSelector('.MLK__plate', { state: 'visible' });
  const key = (label) => page.locator('.MLK__keycap', { hasText: label }).first();
  const value = () => page.evaluate(() => document.querySelector('math-field').getValue('latex-expanded'));

  await key(/^7/).click();
  await key('a⁄b').click();
  await key(/^8/).click();
  assert.equal(await value(), '\\frac78'); // roh; cleanLatex setzt die Klammern erst beim Einfügen

  await page.evaluate(() => {
    document.querySelector('math-field').value = '';
  });
  for (const label of [/^7/, ',', /^5/, '·', /^3/, ':', /^2/]) await key(label).click();
  const latex = await value();
  assert.match(latex, /^7,5\\cdot ?3:2$/, latex);
  assert.deepEqual(problems, [], 'Die eigene Tastatur darf keine Fehler erzeugen');
  await context.close();
});

test('Abbrechen und Klick auf den Hintergrund verändern nichts; die Seite dahinter ist währenddessen gesperrt', async () => {
  const { context, page } = await app.openApp();
  await selectTask(page, 0, 'Text');
  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  assert.equal(await page.evaluate(() => document.querySelector('.workspace').inert), true);
  await typeFormula(page, 'x');
  await page.click('#dlg-math [data-close]');
  await page.waitForSelector('#dlg-math', { state: 'hidden' });
  assert.equal(await page.inputValue('#f-text'), 'Text');
  assert.equal(await page.evaluate(() => document.querySelector('.workspace').inert), false);

  await page.click('#pane-task [data-tool="math"]');
  await page.waitForSelector('#dlg-math[open] math-field');
  await page.mouse.click(30, 700); // auf den abgedunkelten Hintergrund
  await page.waitForSelector('#dlg-math', { state: 'hidden' });
  assert.equal(await page.inputValue('#f-text'), 'Text');
  await page.waitForSelector('#math-overlay', { state: 'hidden' });
  assert.equal(await page.evaluate(() => document.querySelector('.workspace').inert), false);
  await context.close();
});

test('Voreinstellung „Visueller Formel-Editor“ aus: Knopf setzt nur $…$ zum Selbertippen', async () => {
  const { context, page } = await app.openApp();
  await page.click('#btn-menu');
  await page.click('#m-settings');
  assert.equal(await page.isChecked('#s-formula'), true);
  await page.uncheck('#s-formula');
  await page.click('#dlg-settings [data-close]');

  await selectTask(page, 0, 'Rechne ');
  await setCaret(page, 7);
  await page.click('#pane-task [data-tool="math"]');
  assert.equal(await page.isVisible('#dlg-math'), false);
  assert.equal(await page.inputValue('#f-text'), 'Rechne $$');
  assert.equal(await page.evaluate(() => document.querySelector('#f-text').selectionStart), 8);

  // markierten Text in $…$ einschließen
  await page.fill('#f-text', 'x+y z');
  await setCaret(page, 0, 3);
  await page.click('#pane-task [data-tool="math"]');
  assert.equal(await page.inputValue('#f-text'), '$x+y$ z');

  // Einstellung bleibt nach dem Neuladen
  await page.goto(app.base);
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.click('#lib-menu');
  await page.click('#lm-settings');
  assert.equal(await page.isChecked('#s-formula'), false);
  await context.close();
});

test('Dezimalkomma wird ohne Leerraum gesetzt (3,5 so schmal wie 3{,}5, aber Argumentlisten behalten den Abstand)', async () => {
  const { context, page } = await app.openApp();
  await selectTask(page, 0, '$3,5$');
  await selectTask(page, 1, '$3{,}5$');
  await selectTask(page, 2, '$3.5$');
  await selectTask(page, 3, '$f(3, 5)$');
  const widths = await page.evaluate(() =>
    [0, 1, 2, 3].map((i) => document.querySelector(`#sheet .cell-task[data-index="${i}"] .katex`).getBoundingClientRect().width),
  );
  assert.ok(Math.abs(widths[0] - widths[1]) < 0.5, `3,5 (${widths[0]}) und 3{,}5 (${widths[1]}) sollten gleich breit sein`);
  assert.ok(Math.abs(widths[0] - widths[2]) < 6, 'ungefähr so breit wie ein Punkt, nicht wie ein Komma mit Abstand');
  assert.ok(widths[3] > widths[0], 'Komma in f(3, 5) bleibt ein Satzzeichen');
  await context.close();
});
