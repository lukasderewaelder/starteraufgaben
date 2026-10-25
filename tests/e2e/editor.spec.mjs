// Browser-Tests des Editors (Blatt bearbeiten, Layout, Export, Offline).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG_1X1, useApp } from './helpers.mjs';

const app = useApp();
const openApp = (opts) => app.openApp(opts);
const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');
const taskTexts = (page) => page.evaluate(() => window.__starteraufgaben.getSheet().tasks.map((t) => t.text));

test('Start: erstes Blatt mit den vier Beispielaufgaben, ohne Fehler und ohne Fremdanfragen', async () => {
  const { context, page, problems, foreign } = await openApp();
  assert.deepEqual(await taskTexts(page), [
    'Berechne:\n$7 \\cdot 5$',
    'Runde die Zahl 388 auf Hunderter.',
    'Wie viele Sekunden hat eine Minute?',
    'Welche der Figuren sind Dreiecke?',
  ]);
  assert.equal(await page.locator('.cell-task').count(), 4);
  assert.ok((await page.locator('#sheet .katex').count()) > 0);
  assert.ok(await page.evaluate(() => document.fonts.check('32px "Comic Neue"')));
  assert.equal(await page.inputValue('#f-format'), 'tabloid');
  assert.deepEqual(problems, []);
  assert.deepEqual(foreign, []);
  await context.close();
});

test('Antippen einer Aufgabe wählt sie aus; Tippen aktualisiert das Blatt und wird gespeichert', async () => {
  const { context, page } = await openApp();
  await page.click('.cell-task[data-index="1"]');
  assert.equal(await page.getAttribute('#tab-task', 'aria-selected'), 'true');
  assert.equal(await page.textContent('#task-heading'), 'Aufgabe 2');
  assert.equal(await page.isVisible('#sel-box'), true);

  await page.fill('#f-text', 'Wie viel ist $\\frac{1}{2}$ von 10?');
  assert.ok((await page.locator('.cell-task[data-index="1"] .katex').count()) > 0);
  await saved(page);
  await page.reload();
  await page.waitForSelector('#sheet .sheet-title');
  assert.equal((await taskTexts(page))[1], 'Wie viel ist $\\frac{1}{2}$ von 10?');
  await context.close();
});

test('Antippen von Titel und Nummer im Blatt springt in das passende Feld', async () => {
  const { context, page } = await openApp();
  await page.click('.sheet-title');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-title');
  await page.fill('#f-title', 'Wochenstart');
  assert.equal(await page.textContent('.sheet-title'), 'Wochenstart');
  await page.click('.sheet-num');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-number');
  await page.fill('#f-number', '12');
  assert.equal(await page.textContent('.sheet-num'), '12');
  await context.close();
});

test('Kopfzeile: Datum, Klasse und Zeit erscheinen nur, wenn sie gefüllt sind', async () => {
  const { context, page } = await openApp();
  assert.equal(await page.locator('.sheet-zeit').count(), 0);
  assert.equal(await page.locator('[data-field="klasse"]').count(), 0);
  await page.fill('#f-zeit', '5 Min.');
  await page.fill('#f-klasse', '7b');
  assert.equal(await page.textContent('.sheet-zeit'), '5 Min.');
  assert.equal(await page.textContent('[data-field="klasse"]'), 'Klasse 7b');
  await page.click('#btn-date-clear');
  assert.equal(await page.locator('[data-field="date"]').count(), 0);
  await context.close();
});

test('Formatleiste: fett, Teilaufgaben und Liste', async () => {
  const { context, page } = await openApp();
  await page.click('.cell-task[data-index="2"]');
  await page.fill('#f-text', 'Berechne\nx\ny');
  await page.evaluate(() => {
    const ta = document.querySelector('#f-text');
    ta.setSelectionRange(0, 8);
  });
  await page.click('[data-tool="bold"]');
  assert.equal(await page.inputValue('#f-text'), '**Berechne**\nx\ny');
  assert.equal(await page.locator('.cell-task[data-index="2"] strong').count(), 1);

  await page.evaluate(() => {
    const ta = document.querySelector('#f-text');
    ta.setSelectionRange(ta.value.indexOf('x'), ta.value.length);
  });
  await page.click('[data-tool="sub"]');
  assert.equal(await page.inputValue('#f-text'), '**Berechne**\na) x\nb) y');
  assert.equal(await page.locator('.cell-task[data-index="2"] .ln.sub').count(), 2);
  await context.close();
});

test('Auto-Anpassung: viele Aufgaben verkleinern die Schrift, zu viel Text löst eine Warnung aus', async () => {
  const { context, page } = await openApp();
  for (let i = 0; i < 3; i += 1) await page.click('#btn-add-task');
  assert.equal(await page.locator('.cell-task').count(), 7);
  for (let i = 0; i < 7; i += 1) {
    await page.click(`.cell-task[data-index="${i}"]`);
    await page.fill('#f-text', `Aufgabe ${i + 1}: Berechne den Wert\nund schreibe das Ergebnis auf.`);
  }
  const fit = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#sheet')).getPropertyValue('--fit')));
  assert.ok(fit < 1 && fit >= 0.7, `--fit = ${fit}`);
  assert.equal(await page.locator('.cell-task.is-overflow').count(), 0);
  assert.equal(await page.isVisible('#fit-note'), true);

  await page.click('.cell-task[data-index="0"]');
  await page.fill('#f-text', Array.from({ length: 30 }, (_, i) => `Zeile ${i}`).join('\n'));
  assert.ok((await page.locator('.cell-task.is-overflow').count()) >= 1);
  assert.match(await page.textContent('#fit-note'), /nicht mehr aufs Blatt/);
  assert.ok((await page.locator('.chip.warn').count()) >= 1);
  await context.close();
});

test('Zeilen wachsen mit ihrem Inhalt: 7 Aufgaben, eine davon mit Teilaufgaben, passen ohne Warnung', async () => {
  const { context, page } = await openApp();
  for (let i = 0; i < 3; i += 1) await page.click('#btn-add-task');
  const texts = [
    'Berechne: $7 \\cdot 5$',
    'Runde die Zahl 388 auf Hunderter.',
    'Vereinfache: $\\frac{3}{4} + \\frac{1}{8}$',
    'Wie viele Sekunden hat eine Minute?',
    'Berechne:\na) $12 \\cdot 3$\nb) $144 : 12$',
    '**Wie viel** sind 25 % von 80?',
    'Welche der Figuren sind Dreiecke?',
  ];
  for (let i = 0; i < 7; i += 1) {
    await page.click(`.cell-task[data-index="${i}"]`);
    await page.fill('#f-text', texts[i]);
  }
  assert.equal(await page.locator('.cell-task.is-overflow').count(), 0);
  const heights = await page.evaluate(() => [...document.querySelectorAll('.cell-task')].map((c) => c.getBoundingClientRect().height));
  assert.ok(heights[4] > heights[3] * 1.3, `Teilaufgaben-Zeile nicht höher: ${heights.map((h) => Math.round(h))}`);
  // Tabellenkopf: Zellenhöhe (Layout-Pixel, unabhängig von der Vorschau-Skalierung) mindestens so hoch wie der Text.
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.cell-head')].filter((c) => c.offsetHeight < c.scrollHeight - 1).length);
  assert.equal(clipped, 0, 'Tabellenkopf wird beschnitten');
  await context.close();
});

test('Zeilenhöhe: eine Aufgabe mit 2× ist doppelt so hoch wie eine mit 1×', async () => {
  const { context, page } = await openApp();
  await page.click('.cell-task[data-index="0"]');
  await page.selectOption('#f-weight', '2');
  const heights = await page.evaluate(() => [...document.querySelectorAll('.cell-task')].map((c) => c.getBoundingClientRect().height));
  assert.ok(Math.abs(heights[0] / heights[1] - 2) < 0.05, heights.join(', '));
  await context.close();
});

test('Lösungsfeld: Standard des Blatts und Abweichung pro Aufgabe', async () => {
  const { context, page } = await openApp();
  await page.selectOption('#f-solution', 'kariert');
  assert.equal(await page.locator('.cell-sol.sol-kariert').count(), 4);
  await page.click('.cell-task[data-index="1"]');
  await page.selectOption('#f-task-solution', 'punkte');
  assert.equal(await page.locator('.cell-sol.sol-punkte').count(), 1);
  assert.equal(await page.locator('.cell-sol.sol-kariert').count(), 3);
  assert.ok((await page.locator('.cell-sol.sol-punkte circle').count()) > 50);
  await context.close();
});

test('Aufgaben verschieben, duplizieren, löschen und Rückgängig/Wiederholen', async () => {
  const { context, page } = await openApp();
  await page.click('.cell-task[data-index="0"]');
  await page.click('#btn-task-down');
  assert.equal((await taskTexts(page))[1], 'Berechne:\n$7 \\cdot 5$');
  assert.equal(await page.textContent('#task-heading'), 'Aufgabe 2');

  await page.click('#btn-task-dup');
  assert.equal(await page.locator('.cell-task').count(), 5);
  await page.click('#btn-task-del');
  assert.equal(await page.locator('.cell-task').count(), 4);
  assert.equal(await page.isVisible('#toast'), true);

  await page.click('#btn-undo'); // Löschen rückgängig
  assert.equal(await page.locator('.cell-task').count(), 5);
  await page.click('#btn-undo'); // Duplizieren rückgängig
  assert.equal(await page.locator('.cell-task').count(), 4);
  await page.click('#btn-redo');
  assert.equal(await page.locator('.cell-task').count(), 5);
  await context.close();
});

test('Die letzte Aufgabe lässt sich nicht löschen', async () => {
  const { context, page } = await openApp();
  await page.click('.cell-task[data-index="0"]');
  for (let i = 0; i < 3; i += 1) await page.click('#btn-task-del');
  assert.equal(await page.locator('.cell-task').count(), 1);
  await page.click('#btn-task-del');
  assert.match(await page.textContent('#toast-text'), /mindestens eine Aufgabe/);
  assert.equal(await page.locator('.cell-task').count(), 1);
  await context.close();
});

test('Bild: wird verkleinert gespeichert, im Blatt angezeigt und überlebt das Neuladen', async () => {
  const { context, page } = await openApp();
  await page.click('.cell-task[data-index="3"]');
  await page.setInputFiles('#f-image', { name: 'klein.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.waitForSelector('.cell-task[data-index="3"] .task-image');
  assert.equal(await page.isVisible('#img-thumb'), true);
  await saved(page);
  await page.reload();
  await page.waitForSelector('.cell-task[data-index="3"] .task-image');
  const loaded = await page.evaluate(() => document.querySelector('.task-image').complete);
  assert.ok(loaded);

  await page.click('.cell-task[data-index="3"]');
  await page.click('#btn-image-remove');
  assert.equal(await page.locator('.task-image').count(), 0);
  await context.close();
});

test('Neues Blatt aus dem Menü übernimmt die Voreinstellungen und die nächste Nummer', async () => {
  const { context, page } = await openApp();
  await page.click('#btn-menu');
  await page.click('#m-settings');
  await page.selectOption('#s-format', 'a3');
  await page.selectOption('#s-solution', 'liniert');
  await page.click('#dlg-settings [data-close]');

  await page.click('#btn-menu');
  await page.click('#m-new');
  await page.waitForFunction(() => document.querySelector('#f-number').value === '2');
  assert.equal(await page.inputValue('#f-format'), 'a3');
  assert.equal(await page.inputValue('#f-solution'), 'liniert');
  assert.equal(await page.locator('#sheet .cell-sol.sol-liniert').count(), 4);

  await page.click('#btn-menu');
  await page.click('#m-dup');
  await page.waitForFunction(() => document.querySelector('#f-number').value === '3');

  // Die Voreinstellung bleibt nach dem Neuladen erhalten.
  await page.goto(app.base);
  await page.waitForSelector('#lib-grid .card-sheet');
  await page.click('#lib-menu');
  await page.click('#lm-settings');
  assert.equal(await page.inputValue('#s-format'), 'a3');
  assert.equal(await page.inputValue('#s-solution'), 'liniert');
  await context.close();
});

test('Blatt löschen im Editor: zurück zur Bibliothek, mit Rückgängig', async () => {
  const { context, page } = await openApp();
  await page.click('#btn-menu');
  await page.click('#m-new');
  await page.waitForFunction(() => document.querySelector('#f-number').value === '2');
  await page.fill('#f-title', 'Zum Löschen');
  await saved(page);
  await page.click('#btn-menu');
  await page.click('#m-del');
  await page.waitForSelector('#lib-grid .card-sheet');
  assert.equal(await page.locator('#lib-grid .card-sheet').count(), 1);
  assert.match(await page.textContent('#toast-text'), /Nr\. 2 gelöscht/);
  await page.click('#toast-action');
  await page.waitForFunction(() => document.querySelectorAll('#lib-grid .card-sheet').length === 2);
  assert.match(await page.textContent('#lib-grid'), /Zum Löschen/);
  await context.close();
});
test('PDF-Dialog: erstellt ein PDF mit Teilen/Herunterladen und lässt das Blatt unverändert', async () => {
  const { context, page } = await openApp();
  const before = await page.evaluate(() => {
    const s = document.getElementById('sheet');
    return { parent: s.parentElement.id, transform: s.style.transform, html: s.innerHTML.length };
  });
  await page.click('#btn-pdf');
  await page.waitForSelector('#pdf-actions button');
  assert.match(await page.textContent('#pdf-status'), /Starteraufgaben_Nr-1_\d{4}-\d{2}-\d{2}\.pdf/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pdf-actions button:has-text("Herunterladen")')]);
  assert.match(download.suggestedFilename(), /\.pdf$/);
  await page.click('#dlg-pdf [data-close]');
  const after = await page.evaluate(() => {
    const s = document.getElementById('sheet');
    return { parent: s.parentElement.id, transform: s.style.transform, html: s.innerHTML.length };
  });
  assert.deepEqual(after, before);
  await context.close();
});

test('PDF-Export liefert in allen Formaten die exakte Seitengröße', async () => {
  const { context, page } = await openApp();
  const expected = { tabloid: [1224, 792], a3: [1190.55, 841.89], a4: [841.89, 595.28] };
  for (const [format, [w, h]] of Object.entries(expected)) {
    await page.selectOption('#f-format', format);
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
  await context.close();
});

test('Drucken: genau eine Seite in der Blattgröße (Vektor-PDF über die Druckansicht)', async () => {
  const { context, page } = await openApp();
  for (const [format, [w, h]] of Object.entries({ tabloid: [1224, 792], a3: [1190.55, 841.89] })) {
    await page.selectOption('#f-format', format);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const text = pdf.toString('latin1');
    const box = text.match(/\/MediaBox\s*\[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number);
    // Chrome rundet die Seitengröße auf ganze CSS-Pixel (bei A3 knapp 1 pt Abweichung).
    assert.ok(Math.abs(box[2] - w) < 1 && Math.abs(box[3] - h) < 1, `${format}: ${box}`);
    assert.equal((text.match(/\/Type\s*\/Page(?![\w])/g) ?? []).length, 1, `${format}: mehr als eine Seite`);
  }
  await context.close();
});

test('Offline: nach dem ersten Besuch startet die App ohne Netz, Daten und Export funktionieren', async () => {
  const { context, page } = await openApp({ url: `${app.base}?sw=1` });
  await page.fill('#f-title', 'Offline-Blatt');
  await saved(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active;
      if (!sw) return false;
      const status = await new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data);
        sw.postMessage('STATUS', [ch.port2]);
      });
      return status.cached >= status.expected;
    },
    null,
    { timeout: 30_000 },
  );
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#sheet .sheet-title');
  assert.equal(await page.textContent('.sheet-title'), 'Offline-Blatt');
  await page.click('#btn-pdf');
  await page.waitForSelector('#pdf-actions button');
  assert.equal(await page.locator('#pdf-status.result-error').count(), 0);
  await context.close();
});

test('iPad-Hochformat: nichts läuft seitlich über, Bedienelemente sind groß genug', async () => {
  const { context, page } = await openApp({ viewport: { width: 1032, height: 1376 } });
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflowX, 0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button:not([hidden]), select, input:not([type=file]), textarea')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => [e.id || e.textContent.trim().slice(0, 20), e.getBoundingClientRect().height])
      .filter(([, h]) => h < 40),
  );
  assert.deepEqual(small, []);
  await context.close();
});
