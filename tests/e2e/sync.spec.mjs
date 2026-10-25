// Browser-Tests des Abgleichs über eine gemeinsame Datei: ohne Dateizugriff (iPad-Weg: auswählen, Ergebnis speichern)
// und mit verknüpfter Datei (PC-Weg; die File-System-Access-API wird durch eine Datei im Arbeitsspeicher ersetzt,
// weil sich die echten Auswahldialoge nicht automatisch bedienen lassen).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { useApp } from './helpers.mjs';

const app = useApp();
const FILE = 'Starteraufgaben_Sync.json';

const saved = (page) => page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Gespeichert');
const status = (page) => page.textContent('#backup-status');
const titles = (page) => page.locator('.card-meta strong').allTextContents();
const waitCards = (page, n) => page.waitForFunction((count) => document.querySelectorAll('#lib-grid .card-sheet').length === count, n);

async function addSheet(page, title) {
  await page.click('#lib-new');
  await page.waitForSelector('#sheet .sheet-title');
  await page.fill('#f-title', title);
  await saved(page);
  await page.click('#btn-library');
  await page.waitForSelector('#lib-grid .card-sheet');
}

/** Neuer Browser-Kontext. `shared.text` ist der Inhalt der gemeinsamen Datei; ohne `linked` gibt es keinen Dateizugriff. */
async function openDevice({ linked, shared }) {
  const context = await app.newContext();
  await context.exposeFunction('__fileRead', () => shared.text);
  await context.exposeFunction('__fileWrite', (text) => {
    shared.text = text;
  });
  await context.addInitScript((withFiles) => {
    if (!withFiles) {
      for (const name of ['showOpenFilePicker', 'showSaveFilePicker']) Object.defineProperty(window, name, { value: undefined, configurable: true });
      return;
    }
    const handle = {
      name: 'Starteraufgaben_Sync.json',
      kind: 'file',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFile: async () => new File([await window.__fileRead()], 'Starteraufgaben_Sync.json'),
      createWritable: async () => {
        let buffer = '';
        return { write: async (text) => { buffer = text; }, close: async () => window.__fileWrite(buffer) };
      },
    };
    window.showOpenFilePicker = async () => [handle];
    window.showSaveFilePicker = async () => handle;
  }, Boolean(linked));
  return app.openApp({ view: 'library', context });
}

const openDialog = async (page) => {
  await page.click('#lib-backup');
  await page.waitForSelector('#sync-buttons button');
};
const syncButton = (page, label) => page.locator('#sync-buttons button', { hasText: label });
const action = (page, label) => page.locator('#backup-actions button', { hasText: label });

/** iPad-Weg: Datei wählen, Vorschau bestätigen, zusammengeführte Datei herunterladen. Gibt den neuen Dateitext zurück. */
async function syncByFile(page, fileText) {
  await openDialog(page);
  if (fileText === null) {
    await syncButton(page, 'Neue Sync-Datei erstellen').click();
  } else {
    await page.setInputFiles('#sync-file', { name: FILE, mimeType: 'application/json', buffer: Buffer.from(fileText) });
  }
  await page.waitForSelector('#backup-actions button.btn-primary');
  return page;
}
async function confirmAndDownload(page, confirmLabel) {
  await action(page, confirmLabel).click();
  await page.waitForSelector('#backup-actions button:has-text("Herunterladen")');
  const [download] = await Promise.all([page.waitForEvent('download'), action(page, 'Herunterladen').click()]);
  assert.equal(download.suggestedFilename(), FILE);
  const text = await readFile(await download.path(), 'utf8');
  await page.click('#dlg-backup [data-close]');
  return text;
}

test('Abgleich ohne Dateizugriff (iPad): Blatt wandert hin, Löschen wandert mit, nichts kommt zurück', async () => {
  const shared = { text: '' };
  const a = await openDevice({ linked: false, shared });
  const b = await openDevice({ linked: false, shared });
  await addSheet(a.page, 'Von A');

  // A legt die Sync-Datei an
  await syncByFile(a.page, null);
  assert.match(await status(a.page), /stimmen überein/);
  let file = await confirmAndDownload(a.page, 'Abgleichen');
  assert.equal(JSON.parse(file).version, 2);
  assert.equal(JSON.parse(file).sheets.length, 2);

  // B gleicht ab: bekommt beide Blätter von A
  await syncByFile(b.page, file);
  assert.match(await status(b.page), /2 Blätter neu aus der Datei/);
  file = await confirmAndDownload(b.page, 'Abgleichen');
  await waitCards(b.page, 3);
  assert.ok((await titles(b.page)).some((t) => t.includes('Von A')));
  assert.ok((await b.page.evaluate(() => window.__starteraufgaben.app.settings.lastSyncAt)) > 0);

  // B löscht „Von A“ und gleicht ab, A auch
  await b.page.evaluate(async () => {
    const { app } = window.__starteraufgaben;
    const sheet = app.sheets.find((s) => s.title === 'Von A');
    await app.deleteSheet(sheet);
  });
  await waitCards(b.page, 2);
  await syncByFile(b.page, file);
  assert.match(await status(b.page), /1 Blatt hier gelöscht/);
  file = await confirmAndDownload(b.page, 'Abgleichen');
  assert.equal(JSON.parse(file).deleted.length, 1);

  await syncByFile(a.page, file);
  assert.match(await status(a.page), /1 Blatt in der Datei gelöscht/);
  await confirmAndDownload(a.page, 'Abgleichen');
  await waitCards(a.page, 2);
  assert.ok(!(await titles(a.page)).some((t) => t.includes('Von A')));

  // Noch einmal mit der Datei von B: es gibt nichts mehr zu ändern und das Blatt kommt nicht zurück
  await syncByFile(a.page, file);
  assert.doesNotMatch(await status(a.page), /neu aus der Datei/);
  await a.page.click('#dlg-backup [data-close]');
  assert.equal((await titles(a.page)).filter((t) => t.includes('Von A')).length, 0);

  assert.deepEqual(a.problems, []);
  assert.deepEqual(b.problems, []);
  await a.context.close();
  await b.context.close();
});

test('Abgleich mit verknüpfter Datei (PC): anlegen, am anderen Gerät wählen, Änderung wandert hin und zurück', async () => {
  const shared = { text: '' };
  const a = await openDevice({ linked: true, shared });
  const b = await openDevice({ linked: true, shared });
  await addSheet(a.page, 'Gemeinsam');

  // A: neue Datei anlegen -> Vorschau -> aktualisieren, Datei enthält jetzt beide Blätter
  await openDialog(a.page);
  assert.match(await a.page.textContent('#sync-last'), /Noch nicht abgeglichen/);
  await syncButton(a.page, 'Neue Sync-Datei anlegen').click();
  await action(a.page, 'Abgleichen').click();
  await a.page.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('gespeichert'));
  assert.equal(JSON.parse(shared.text).sheets.length, 2);
  await a.page.click('#backup-actions button:has-text("Zurück")');
  assert.match(await a.page.textContent('#sync-info'), /Verknüpft mit „Starteraufgaben_Sync\.json“/);
  await a.page.click('#dlg-backup [data-close]');

  // B: vorhandene Datei wählen, bekommt die Blätter von A
  await openDialog(b.page);
  await syncButton(b.page, 'Vorhandene Sync-Datei wählen').click();
  await b.page.waitForSelector('#backup-actions button.btn-primary');
  assert.match(await status(b.page), /2 Blätter neu aus der Datei/);
  await action(b.page, 'Abgleichen').click();
  await b.page.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('gespeichert'));
  await b.page.click('#dlg-backup [data-close]');
  await waitCards(b.page, 3);

  // B benennt das Blatt um und gleicht ab, danach A
  await b.page.locator('.card-sheet', { hasText: 'Gemeinsam' }).locator('.card-open').click();
  await b.page.fill('#f-title', 'Umbenannt von B');
  await saved(b.page);
  await b.page.click('#btn-library');
  await openDialog(b.page);
  await syncButton(b.page, 'Abgleichen').click();
  await b.page.waitForSelector('#backup-actions button.btn-primary');
  assert.match(await status(b.page), /hier neuer/);
  await action(b.page, 'Abgleichen').click();
  await b.page.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('gespeichert'));
  assert.ok(JSON.parse(shared.text).sheets.some((s) => s.title === 'Umbenannt von B'));

  await openDialog(a.page);
  await syncButton(a.page, 'Abgleichen').click();
  await a.page.waitForSelector('#backup-actions button.btn-primary');
  assert.match(await status(a.page), /1 Blatt aus der Datei neuer/);
  await action(a.page, 'Abgleichen').click();
  await a.page.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('gespeichert'));
  await a.page.click('#dlg-backup [data-close]');
  await a.page.waitForFunction(() => [...document.querySelectorAll('.card-meta strong')].some((e) => e.textContent.includes('Umbenannt von B')));

  // Verknüpfung lösen
  await openDialog(a.page);
  await syncButton(a.page, 'Verknüpfung lösen').click();
  await syncButton(a.page, 'Vorhandene Sync-Datei wählen').waitFor();

  assert.deepEqual(a.problems, []);
  assert.deepEqual(b.problems, []);
  await a.context.close();
  await b.context.close();
});

test('Abgleich: Konflikt – beide Seiten ändern dasselbe Blatt, die ältere Fassung bleibt als Kopie', async () => {
  const shared = { text: '' };
  const a = await openDevice({ linked: true, shared });
  const b = await openDevice({ linked: true, shared });
  await addSheet(a.page, 'Ausgangsblatt');
  const run = async (page, expectText) => {
    await openDialog(page);
    const button = (await syncButton(page, 'Abgleichen').count()) ? syncButton(page, 'Abgleichen') : null;
    if (button) await button.click();
    else {
      await syncButton(page, 'Vorhandene Sync-Datei wählen').click();
    }
    await page.waitForSelector('#backup-actions button.btn-primary');
    if (expectText) assert.match(await status(page), expectText);
    await action(page, /Abgleichen/).click();
    await page.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('gespeichert'));
    await page.click('#dlg-backup [data-close]');
  };
  await openDialog(a.page);
  await syncButton(a.page, 'Neue Sync-Datei anlegen').click();
  await action(a.page, 'Abgleichen').click();
  await a.page.waitForFunction(() => document.querySelector('#backup-status').textContent.includes('gespeichert'));
  await a.page.click('#dlg-backup [data-close]');
  await run(b.page, /2 Blätter neu/);

  const rename = async (page, name) => {
    await page.locator('.card-sheet', { hasText: 'Ausgangsblatt' }).first().locator('.card-open').click();
    await page.fill('#f-title', name);
    await saved(page);
    await page.click('#btn-library');
  };
  await a.page.waitForTimeout(30);
  await rename(a.page, 'Fassung A');
  await b.page.waitForTimeout(30);
  await rename(b.page, 'Fassung B');
  await run(a.page, null); // A schreibt „Fassung A“ in die Datei
  await run(b.page, /auf beiden Seiten geändert/);
  await waitCards(b.page, 4); // Beispielblätter von A und B + zwei Fassungen
  const t = await titles(b.page);
  assert.ok(t.some((x) => x.includes('Konflikt')), t.join(' | '));
  assert.ok(t.some((x) => x.includes('Fassung A')) && t.some((x) => x.includes('Fassung B')));
  await a.context.close();
  await b.context.close();
});

test('Speicher-Upgrade: ein vorhandener Speicher (Version 1) bleibt erhalten und bekommt die Löschmarken', async () => {
  const context = await app.newContext();
  const old = await context.newPage();
  await old.goto(`${app.base}manifest.webmanifest`); // gleiche Herkunft, aber ohne App-Code
  await old.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('starteraufgaben', 1);
        req.onupgradeneeded = () => {
          for (const name of ['sheets', 'images', 'bank', 'settings']) req.result.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
        };
        req.onsuccess = () => {
          const tx = req.result.transaction('sheets', 'readwrite');
          tx.objectStore('sheets').put({ id: 'alt', title: 'Altes Blatt', number: '7', tasks: [{ text: 'x' }], createdAt: 1, updatedAt: 2 });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
        req.onerror = () => reject(req.error);
      }),
  );
  await old.close();

  const { page, problems } = await app.openApp({ view: 'library', context });
  assert.ok((await titles(page)).some((t) => t.includes('Altes Blatt')));
  const stores = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('starteraufgaben');
        req.onsuccess = () => {
          resolve({ version: req.result.version, stores: [...req.result.objectStoreNames].sort() });
          req.result.close();
        };
      }),
  );
  assert.deepEqual(stores, { version: 2, stores: ['bank', 'deleted', 'images', 'settings', 'sheets'] });
  // Löschen merkt sich eine Marke und Rückgängig hebt sie wieder auf
  await page.evaluate(async () => {
    const { app: a } = window.__starteraufgaben;
    await a.deleteSheet(a.sheets.find((s) => s.title === 'Altes Blatt'));
  });
  assert.deepEqual((await page.evaluate(() => window.__starteraufgaben.app.store.listDeleted())).map((m) => [m.kind, m.id]), [['sheet', 'alt']]);
  await page.click('#toast-action');
  await page.waitForFunction(() => window.__starteraufgaben.app.store.listDeleted().then((m) => m.length === 0));
  assert.deepEqual(problems, []);
  await context.close();
});
