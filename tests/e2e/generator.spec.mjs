// Browser-Tests der Zufallsaufgaben: Dialog, Einstellungen (Zahlenraum, Dezimalstellen), Neu würfeln, Vorlagen in der Bank.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { useApp } from './helpers.mjs';

const app = useApp();

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fractions = (s) => [...s.matchAll(/\\frac\{(\d+)\}\{(\d+)\}/g)].map((m) => [Number(m[1]), Number(m[2])]);
const parseDE = (s) => Number(String(s).replace(/\\,/g, '').replace(',', '.'));
const tasks = (page) => page.evaluate(() => window.__starteraufgaben.getSheet().tasks.map((t) => ({ text: t.text, solution: t.solution, generator: t.generator })));
const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');

async function openGenerator(page) {
  await page.click('#btn-gen');
  await page.waitForSelector('#dlg-gen[open] .gen-item');
}

async function setParam(page, key, value) {
  const field = page.locator(`#gen-p-${key}`);
  await field.fill(String(value));
  await field.blur(); // „change“ löst das Bereinigen und sofortiges Würfeln aus
}

const previewTexts = (page) => page.locator('#gen-preview .gen-item .gen-text').allTextContents();

test('Brüche kürzen im eigenen Zahlenraum: Vorschau mit Lösungen, alle Zahlen im Bereich, Lösung gekürzt', async () => {
  const { context, page, problems } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'fraction-reduce');
  await setParam(page, 'min', 10);
  await setParam(page, 'max', 40);
  await page.fill('#gen-count', '4');
  await page.locator('#gen-count').blur();
  assert.equal(await page.locator('#gen-preview .gen-item').count(), 4);
  assert.match(await page.textContent('#gen-note'), /Brüche kürzen · Zahlenraum 10–40 · 4 Teilaufgaben/);
  assert.equal(await page.locator('#gen-preview .gen-solution').count(), 4);
  assert.match(await page.textContent('#gen-ok'), /Hinzufügen \(1 Aufgabe\)/);

  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  const all = await tasks(page);
  assert.equal(all.length, 5);
  const added = all[4];
  assert.match(added.text, /^Kürze so weit wie möglich:\na\) /);
  assert.match(added.text, /\nd\) /);
  const given = fractions(added.text);
  assert.equal(given.length, 4);
  for (const [n, d] of given) {
    assert.ok(n >= 10 && n <= 40 && d >= 10 && d <= 40, `${n}/${d} außerhalb 10–40`);
    assert.ok(gcd(n, d) > 1, `${n}/${d} ist schon gekürzt`);
  }
  for (const [n, d] of fractions(added.solution)) assert.equal(gcd(n, d), 1);
  assert.equal(added.generator.params.min, 10);
  assert.equal(added.generator.params.max, 40);
  assert.equal(await page.textContent('#task-heading'), 'Aufgabe 5');
  assert.match(await page.textContent('#task-gen-desc'), /Brüche kürzen · Zahlenraum 10–40 · 4 Teilaufgaben/);
  assert.ok((await page.locator('#sheet .cell-task[data-index="4"] .katex .mfrac').count()) >= 4);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Dezimalstellen und Zahlenraum beim Rechnen: Zahlen haben genau die gewählten Stellen, nichts über dem Zahlenraum', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'arith');
  await setParam(page, 'min', 1);
  await setParam(page, 'max', 20);
  await setParam(page, 'decimals', 2);
  await page.click('.pill-btn[data-key="ops"][data-value="mul"]');
  await page.click('.pill-btn[data-key="ops"][data-value="div"]');
  await page.fill('#gen-count', '8');
  await page.locator('#gen-count').blur();
  assert.equal(await page.locator('#gen-preview .gen-item').count(), 8);
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  const task = (await tasks(page)).at(-1);
  const operands = [...task.text.matchAll(/\$([^$]+)\$/g)].map((m) => m[1]);
  assert.equal(operands.length, 8);
  for (const expr of operands) {
    const [a, b] = expr.split(/ (?:\+|-|:|\\cdot) /);
    // die Dezimalzahl hat genau 2 Stellen; ein ganzer zweiter Faktor/Divisor ist ebenfalls erlaubt
    for (const part of [a, b]) {
      if (part.includes(',')) assert.match(part, /^\d+,\d{2}$/, expr);
      assert.ok(parseDE(part) <= 20 && parseDE(part) >= 1, `${expr}: ${part} außerhalb 1–20`);
    }
  }
  for (const sol of task.solution.split('\n')) assert.ok(parseDE(sol.replace(/^[a-h]\) \$|\$$/g, '')) <= 20, sol);
  assert.deepEqual([task.generator.params.decimals, task.generator.params.max], [2, 20]);
  await context.close();
});

test('Einzelne Aufgaben: jede für sich neu würfelbar, Rückgängig stellt die alte Aufgabe wieder her', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'arith');
  await setParam(page, 'max', 1000);
  await page.selectOption('#gen-layout', 'single');
  await page.fill('#gen-count', '3');
  await page.locator('#gen-count').blur();
  assert.match(await page.textContent('#gen-ok'), /Hinzufügen \(3 Aufgaben\)/);
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  const all = await tasks(page);
  assert.equal(all.length, 7);
  for (const t of all.slice(4)) {
    assert.match(t.text, /^Berechne: \$/);
    assert.deepEqual([t.generator.count, t.generator.layout], [1, 'single']);
  }

  // Aufgabe 6 neu würfeln: nur diese ändert sich
  await page.click('#sheet .cell-task[data-index="5"]');
  const before = (await tasks(page)).map((t) => t.text);
  let after = before;
  for (let i = 0; i < 6 && after[5] === before[5]; i += 1) {
    await page.click('#btn-reroll');
    after = (await tasks(page)).map((t) => t.text);
  }
  assert.notEqual(after[5], before[5]);
  assert.equal(after[4], before[4]);
  assert.equal(after[6], before[6]);
  assert.equal(await page.inputValue('#f-text'), after[5]);
  assert.notEqual((await tasks(page))[5].solution, '');

  await page.click('#btn-undo');
  assert.equal((await tasks(page))[5].text, before[5]);
  await context.close();
});

test('Einstellungen einer Zufallsaufgabe nachträglich ändern', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'fraction-reduce');
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });

  await page.click('#btn-gen-edit');
  await page.waitForSelector('#dlg-gen[open] .gen-item');
  assert.equal(await page.textContent('#gen-title'), 'Zufallsaufgabe ändern');
  assert.equal(await page.isVisible('#gen-template'), true);
  assert.equal(await page.inputValue('#gen-type'), 'fraction-reduce');
  assert.equal(await page.inputValue('#gen-p-max'), '60');
  assert.equal(await page.inputValue('#gen-count'), '3');
  await setParam(page, 'max', 12);
  await setParam(page, 'min', 4);
  assert.equal(await page.textContent('#gen-ok'), 'Übernehmen');
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  const task = (await tasks(page)).at(-1);
  assert.equal((await tasks(page)).length, 5, 'ersetzt die Aufgabe, legt keine neue an');
  for (const [n, d] of fractions(task.text)) assert.ok(n >= 4 && n <= 12 && d >= 4 && d <= 12, `${n}/${d}`);
  assert.match(await page.textContent('#task-gen-desc'), /Zahlenraum 4–12/);
  assert.equal(await page.inputValue('#f-text'), task.text);

  // Bei einzelnen Aufgaben fehlen Anzahl und Aufbau (die Aufgabe bleibt eine Aufgabe)
  await openGenerator(page);
  await page.selectOption('#gen-layout', 'single');
  await page.fill('#gen-count', '1');
  await page.locator('#gen-count').blur();
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  await page.click('#btn-gen-edit');
  await page.waitForSelector('#dlg-gen[open] .gen-item');
  assert.equal(await page.isHidden('#gen-layout-row'), true);
  await page.click('#dlg-gen [data-close]');
  await context.close();
});

test('Zuletzt benutzte Einstellungen werden je Aufgabentyp gemerkt – auch nach dem Neuladen', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'fraction-reduce');
  await setParam(page, 'min', 8);
  await setParam(page, 'max', 30);
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });

  await openGenerator(page);
  assert.equal(await page.inputValue('#gen-type'), 'fraction-reduce');
  assert.equal(await page.inputValue('#gen-p-min'), '8');
  assert.equal(await page.inputValue('#gen-p-max'), '30');
  await page.selectOption('#gen-type', 'arith');
  assert.equal(await page.inputValue('#gen-p-max'), '100', 'anderer Typ: eigene Standardwerte');
  await page.selectOption('#gen-type', 'fraction-reduce');
  assert.equal(await page.inputValue('#gen-p-max'), '30');
  await page.click('#dlg-gen [data-close]');

  await saved(page);
  await page.reload();
  await page.waitForSelector('#sheet .sheet-title');
  await openGenerator(page);
  assert.equal(await page.inputValue('#gen-type'), 'fraction-reduce');
  assert.equal(await page.inputValue('#gen-p-min'), '8');
  await context.close();
});

test('Unmögliche Einstellungen: verständlicher Hinweis, „Hinzufügen“ gesperrt', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'round');
  await page.selectOption('#gen-p-place', 'tenths');
  assert.match(await page.textContent('#gen-note'), /nicht auf Zehntel/);
  assert.equal(await page.isDisabled('#gen-ok'), true);
  assert.equal(await page.locator('#gen-preview .gen-item').count(), 0);
  await setParam(page, 'decimals', 2);
  assert.equal(await page.isDisabled('#gen-ok'), false);
  const texts = await previewTexts(page);
  assert.ok(texts.length >= 3);
  for (const t of texts) assert.match(t.replace(/\s/g, ''), /^\d+,\d{2}$/);
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  const task = (await tasks(page)).at(-1);
  assert.match(task.text, /^Runde auf Zehntel:/);
  for (const sol of task.solution.split('\n')) assert.match(sol, /^[a-h]\) \$\d+,\d\$$/);
  await context.close();
});

test('Bedingte Einstellungen: Dezimalstellen und größter Nenner erscheinen nur bei passender Zahlenart', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'compare');
  assert.equal(await page.isVisible('#gen-p-decimals'), true); // Standard: Dezimalzahlen
  assert.equal(await page.isVisible('#gen-p-maxDenominator'), false);
  await page.selectOption('#gen-p-kind', 'fraction');
  assert.equal(await page.isVisible('#gen-p-decimals'), false);
  assert.equal(await page.isVisible('#gen-p-maxDenominator'), true);
  assert.ok((await page.locator('#gen-preview .katex .mfrac').count()) > 0);
  await page.selectOption('#gen-p-kind', 'natural');
  assert.equal(await page.isVisible('#gen-p-decimals'), false);
  await context.close();
});

test('Freie Plätze auf dem Blatt: bei einzelnen Aufgaben wird die Anzahl begrenzt; bei vollem Blatt öffnet sich nichts', async () => {
  const { context, page } = await app.openApp();
  for (let i = 0; i < 7; i += 1) await page.click('#btn-add-task'); // 11 Aufgaben
  await openGenerator(page);
  await page.selectOption('#gen-layout', 'single');
  await page.fill('#gen-count', '5');
  await page.locator('#gen-count').blur();
  assert.equal(await page.inputValue('#gen-count'), '1');
  assert.match(await page.textContent('#gen-ok'), /\(1 Aufgabe\)/);
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  assert.equal((await tasks(page)).length, 12);
  await page.click('#btn-gen');
  await page.waitForFunction(() => document.querySelector('#toast-text').textContent.includes('passen nicht auf ein Blatt'));
  assert.equal(await page.isVisible('#dlg-gen'), false);
  await context.close();
});

test('Alle Aufgabentypen lassen sich mit KaTeX setzen (kein Formelfehler, auch mit extremen Einstellungen)', async () => {
  const { context, page } = await app.openApp();
  const errors = await page.evaluate(async () => {
    const { GENERATORS, defaultSpec, generateTasks } = await import('/src/generators/index.js');
    const { splitMath, germanDecimal } = await import('/src/markup.js');
    const problems = [];
    const check = (label, text) => {
      for (const part of splitMath(text)) {
        if (part.type !== 'math') continue;
        try {
          window.katex.renderToString(germanDecimal(part.latex), { throwOnError: true, strict: 'ignore', output: 'html' });
        } catch (err) {
          problems.push(`${label}: ${part.latex} -> ${err.message}`);
        }
      }
    };
    for (const g of GENERATORS) {
      for (let n = 0; n < 25; n += 1) {
        const spec = defaultSpec(g.id);
        const out = generateTasks(spec);
        if (out.error) problems.push(`${g.id}: ${out.error}`);
        for (const t of out.tasks) {
          check(g.id, t.text);
          check(`${g.id} (Lösung)`, t.solution);
        }
      }
      // Dezimalstellen und große Zahlenräume
      for (const params of [{ decimals: 3, max: 1_000_000 }, { decimals: 1, min: 0, max: 9 }]) {
        const out = generateTasks({ ...defaultSpec(g.id), params: { ...defaultSpec(g.id).params, ...params } });
        for (const t of out.tasks) check(`${g.id}/${JSON.stringify(params)}`, t.text + t.solution);
      }
    }
    return problems;
  });
  assert.deepEqual(errors, []);
  await context.close();
});

test('Zufallsvorlage in der Bank: aus dem Dialog speichern, ansehen, Beispiel würfeln, Einstellungen ändern', async () => {
  const { context, page } = await app.openApp();
  await openGenerator(page);
  await page.selectOption('#gen-type', 'fraction-reduce');
  await setParam(page, 'max', 40);
  await page.click('#gen-template');
  await page.waitForSelector('#dlg-tobank[open]');
  await page.selectOption('#tb-grade', '6');
  await page.fill('#tb-topic', 'Brüche');
  await page.fill('#tb-tags', 'kürzen');
  await page.click('#tb-ok');
  await page.waitForFunction(() => document.querySelector('#gen-note').textContent.includes('Vorlage in der Aufgabenbank gespeichert'));
  await page.click('#gen-template'); // dieselben Einstellungen noch einmal
  await page.waitForFunction(() => document.querySelector('#gen-note').textContent.includes('schon in der Aufgabenbank'));
  await page.click('#dlg-gen [data-close]');
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.bank.length), 1);

  await page.click('#btn-library');
  await page.click('#lib-bank');
  await page.waitForSelector('#bank-grid .bank-card');
  assert.match(await page.textContent('#bank-grid'), /Zufallsvorlage/);
  assert.match(await page.textContent('#bank-grid'), /Klasse 6/);
  await page.click('#bank-grid .bank-open');
  await page.waitForSelector('#bank-editor:not([hidden])');
  assert.equal(await page.isVisible('#bank-template'), true);
  assert.equal(await page.isHidden('#bank-text-block'), true);
  assert.equal(await page.isHidden('#bank-image-block'), true);
  assert.match(await page.textContent('#bank-template-desc'), /Brüche kürzen · Zahlenraum 2–40 · 3 Teilaufgaben/);

  const sample = () => page.evaluate(() => window.__starteraufgaben.app.bank[0].text);
  const first = await sample();
  let next = first;
  for (let i = 0; i < 6 && next === first; i += 1) {
    await page.click('#bank-template-roll');
    next = await sample();
  }
  assert.notEqual(next, first);
  assert.ok((await page.locator('#bank-preview .katex').count()) > 0);

  await page.click('#bank-template-edit');
  await page.waitForSelector('#dlg-gen[open] .gen-item');
  assert.equal(await page.textContent('#gen-title'), 'Zufallsvorlage');
  assert.equal(await page.isHidden('#gen-template'), true);
  await setParam(page, 'max', 20);
  assert.equal(await page.textContent('#gen-ok'), 'Speichern');
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  assert.match(await page.textContent('#bank-template-desc'), /Zahlenraum 2–20/);
  await page.waitForFunction(() => document.querySelector('#bank-save-state').textContent === 'Gespeichert');
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.bank[0].generator.params.max), 20);
  await context.close();
});

test('Aus der Bank: Vorlagen würfeln bei jedem Einfügen neue Zahlen und bleiben neu würfelbar', async () => {
  const { context, page } = await app.openApp({ view: 'library' });
  await page.click('#lib-bank');
  await page.click('#bank-new-template');
  await page.waitForSelector('#dlg-gen[open] .gen-item');
  assert.equal(await page.isHidden('#gen-template'), true);
  await page.selectOption('#gen-type', 'arith');
  await setParam(page, 'max', 1000);
  await page.selectOption('#gen-layout', 'single');
  await page.fill('#gen-count', '2');
  await page.locator('#gen-count').blur();
  await page.click('#gen-ok');
  await page.waitForSelector('#dlg-gen', { state: 'hidden' });
  await page.waitForSelector('#bank-grid .bank-card');
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.bank.length), 1);
  await page.click('#bank-back');
  await page.click('.card-open');
  await page.waitForSelector('#sheet .sheet-title');

  const texts = [];
  for (let i = 0; i < 2; i += 1) {
    await page.click('#btn-bank-pick');
    await page.waitForSelector('#dlg-pick[open] .bank-card');
    assert.match(await page.textContent('#pick-list'), /Zufallsvorlage/);
    await page.click('#pick-list .bank-open');
    await page.click('#pick-ok');
    await page.waitForSelector('#dlg-pick', { state: 'hidden' });
    texts.push(...(await tasks(page)).slice(4).map((t) => t.text));
  }
  const all = await tasks(page);
  assert.equal(all.length, 8, 'zweimal zwei einzelne Aufgaben');
  assert.equal(new Set(all.slice(4).map((t) => t.text)).size, 4, 'alle vier mit eigenen Zahlen');
  for (const t of all.slice(4)) assert.equal(t.generator.type, 'arith');
  assert.equal(await page.evaluate(() => window.__starteraufgaben.app.bank[0].text.includes('$')), true);

  await page.click('#sheet .cell-task[data-index="5"]');
  assert.equal(await page.isVisible('#task-gen'), true);
  await context.close();
});

test('Vorlagen und Zufallsaufgaben überstehen Neuladen und Sicherung', async () => {
  const a = await app.openApp();
  await openGenerator(a.page);
  await a.page.selectOption('#gen-type', 'percent');
  await setParam(a.page, 'min', 50);
  await setParam(a.page, 'max', 150);
  await a.page.click('#gen-template');
  await a.page.waitForSelector('#dlg-tobank[open]');
  await a.page.click('#tb-ok');
  await a.page.waitForFunction(() => document.querySelector('#gen-note').textContent.includes('gespeichert'));
  await a.page.click('#gen-ok');
  await a.page.waitForSelector('#dlg-gen', { state: 'hidden' });
  await saved(a.page);
  const original = (await tasks(a.page)).at(-1);
  await a.page.reload();
  await a.page.waitForSelector('#sheet .sheet-title');
  const reloaded = (await tasks(a.page)).at(-1);
  assert.deepEqual(reloaded, original);

  await a.page.click('#btn-library');
  await a.page.click('#lib-backup');
  await a.page.click('#backup-make');
  await a.page.waitForSelector('#backup-actions button:has-text("Herunterladen")');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#backup-actions button:has-text("Herunterladen")')]);
  const text = await readFile(await download.path(), 'utf8');
  const data = JSON.parse(text);
  assert.equal(data.bank[0].generator.type, 'percent');
  assert.equal(data.sheets[0].tasks.at(-1).generator.params.max, 150);

  const b = await app.openApp({ view: 'library' });
  await b.page.click('#lib-backup');
  await b.page.setInputFiles('#backup-file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await b.page.waitForSelector('#backup-actions button:has-text("Einspielen")');
  await b.page.click('#backup-actions button:has-text("Einspielen")');
  await b.page.waitForFunction(() => document.querySelector('#backup-status').textContent.startsWith('Fertig'));
  await b.page.click('#dlg-backup [data-close]');
  const imported = await b.page.evaluate(async () => {
    const { app } = window.__starteraufgaben;
    await app.refreshSheets();
    await app.refreshBank();
    return { bank: app.bank.map((i) => i.generator?.type), tasks: app.sheets.flatMap((s) => s.tasks.map((t) => t.generator?.type)).filter(Boolean) };
  });
  assert.deepEqual(imported.bank, ['percent']);
  assert.deepEqual(imported.tasks, ['percent']);
  await a.context.close();
  await b.context.close();
});

test('iPad-Hochformat: der Zufallsaufgaben-Dialog läuft nicht über und bleibt bedienbar', async () => {
  const { context, page } = await app.openApp({ viewport: { width: 820, height: 1180 } });
  await openGenerator(page);
  await page.selectOption('#gen-type', 'arith');
  const info = await page.evaluate(() => {
    const d = document.querySelector('#dlg-gen');
    const r = d.getBoundingClientRect();
    return { overflowX: d.scrollWidth - d.clientWidth, left: r.left, right: r.right, vw: innerWidth };
  });
  assert.ok(info.overflowX <= 1, `Dialog läuft seitlich über: ${info.overflowX}`);
  assert.ok(info.left >= 0 && info.right <= info.vw);
  const small = await page.evaluate(() =>
    // Kästchen selbst sind klein; getippt wird auf die ganze Zeile (Label, mindestens 44 px hoch)
    [...document.querySelectorAll('#dlg-gen button, #dlg-gen select, #dlg-gen input:not([type=hidden]):not([type=checkbox])')]
      .filter((e) => e.offsetParent !== null && !e.classList.contains('btn-small'))
      .map((e) => [e.id || e.textContent.trim().slice(0, 20), e.getBoundingClientRect().height])
      .filter(([, h]) => h < 36),
  );
  assert.deepEqual(small, []);
  await context.close();
});
