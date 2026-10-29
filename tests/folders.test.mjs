// Klassen-Ordner: reine Funktionen, Speicher, Dateiformat Version 3 und Abgleich zwischen zwei Geräten.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_FORMAT, buildBackup, parseBackup } from '../src/backup.js';
import {
  FOLDER_ALL,
  FOLDER_NONE,
  cleanFolderName,
  folderCounts,
  folderForClass,
  folderKey,
  folderOf,
  nameTaken,
  newFolder,
  normalizeFolder,
  sheetsIn,
  sortFolders,
  validSelection,
} from '../src/folders.js';
import { newSheet, normalizeSheet } from '../src/model.js';
import { createMemoryStore } from '../src/store.js';
import { applyPlan, buildSyncFile, countPlan, describePlan, planFromFile } from '../src/sync.js';
import { parseBackup as parse } from '../src/backup.js';

const sheetIn = (number, folderId, updatedAt = 1000) => ({ ...newSheet({ number, now: updatedAt }), folderId });
const folderAt = (name, updatedAt = 1000, id = null) => ({ ...newFolder({ name, now: updatedAt }), ...(id ? { id } : {}) });

// --- Reine Funktionen ----------------------------------------------------------------------------
test('Ordnername: Leerraum zusammenziehen, höchstens 40 Zeichen, leer ist ungültig', () => {
  assert.equal(cleanFolderName('  7   b '), '7 b');
  assert.equal(cleanFolderName('x'.repeat(60)).length, 40);
  assert.equal(cleanFolderName(null), '');
  assert.equal(normalizeFolder({ id: 'a', name: '   ' }), null);
  assert.equal(normalizeFolder(null), null);
  assert.equal(normalizeFolder([]), null);
  const f = normalizeFolder({ id: 'a', name: ' 7b ', createdAt: 5, updatedAt: 'x' }, { now: 99 });
  assert.deepEqual(f, { id: 'a', name: '7b', createdAt: 5, updatedAt: 99 });
  assert.match(newFolder({ name: '8a' }).id, /./);
});

test('Ordner: „7b“, „7 B“ und „7B“ sind derselbe Name; doppelte Namen werden erkannt', () => {
  assert.equal(folderKey('7 B'), folderKey('7b'));
  const folders = [folderAt('7b', 1, 'x'), folderAt('8a', 1, 'y')];
  assert.equal(nameTaken(folders, '7 B'), true);
  assert.equal(nameTaken(folders, '7B', 'x'), false); // der Ordner selbst zählt nicht
  assert.equal(nameTaken(folders, '9c'), false);
});

test('Ordner sortieren: Zahlen als Zahlen, Groß-/Kleinschreibung egal', () => {
  const names = sortFolders(['10c', '5a', '7B', '7a', 'Oberstufe', 'AG'].map((n) => folderAt(n))).map((f) => f.name);
  assert.deepEqual(names, ['5a', '7a', '7B', '10c', 'AG', 'Oberstufe']);
});

test('Klasse → Ordner: passt, wenn der Name gleich ist (ohne Leerzeichen, Groß-/Kleinschreibung)', () => {
  const folders = [folderAt('7b', 1, 'x'), folderAt('Q1', 1, 'y')];
  assert.equal(folderForClass(folders, '7 B')?.id, 'x');
  assert.equal(folderForClass(folders, 'q1')?.id, 'y');
  assert.equal(folderForClass(folders, '7'), null);
  assert.equal(folderForClass(folders, ''), null);
  assert.equal(folderForClass([], '7b'), null);
});

test('Blätter im Ordner: Alle, Ohne Ordner, ein Ordner; Verweise auf fehlende Ordner zählen als „ohne“', () => {
  const folders = [folderAt('7b', 1, 'f7'), folderAt('8a', 1, 'f8')];
  const sheets = [sheetIn(1, 'f7'), sheetIn(2, 'f7'), sheetIn(3, 'f8'), sheetIn(4, null), sheetIn(5, 'gibt-es-nicht')];
  const numbers = (list) => list.map((s) => s.number).sort();
  assert.deepEqual(numbers(sheetsIn(sheets, folders, FOLDER_ALL)), ['1', '2', '3', '4', '5']);
  assert.deepEqual(numbers(sheetsIn(sheets, folders, FOLDER_NONE)), ['4', '5']);
  assert.deepEqual(numbers(sheetsIn(sheets, folders, 'f7')), ['1', '2']);
  assert.deepEqual(numbers(sheetsIn(sheets, folders, undefined)), ['1', '2', '3', '4', '5']);
  assert.equal(folderOf(sheets[4], folders), null);
  assert.equal(folderOf(sheets[0], folders)?.name, '7b');

  const counts = folderCounts(sheets, folders);
  assert.deepEqual([counts.all, counts.none, counts.byFolder.get('f7'), counts.byFolder.get('f8')], [5, 2, 2, 1]);
});

test('Gewählter Reiter: ungültige Auswahl fällt auf „Alle“ zurück', () => {
  const folders = [folderAt('7b', 1, 'f7')];
  assert.equal(validSelection('f7', folders), 'f7');
  assert.equal(validSelection(FOLDER_NONE, folders), FOLDER_NONE);
  assert.equal(validSelection('weg', folders), FOLDER_ALL);
  assert.equal(validSelection(undefined, folders), FOLDER_ALL);
});

test('Blatt: folderId bleibt beim Normalisieren, Kopien liegen im selben Ordner, Unsinn wird zu null', () => {
  assert.equal(newSheet({ number: 1 }).folderId, null);
  assert.equal(normalizeSheet({ id: 'a', folderId: 'f1' }).folderId, 'f1');
  assert.equal(normalizeSheet({ id: 'a', folderId: 7 }).folderId, null);
  assert.equal(normalizeSheet({ id: 'a', folderId: '' }).folderId, null);
  assert.equal(normalizeSheet({ id: 'a' }).folderId, null);
});

// --- Speicher ------------------------------------------------------------------------------------
test('Speicher: Ordner speichern, auflisten, löschen (mit Löschmarke), Speichern hebt die Marke auf', async () => {
  const store = createMemoryStore();
  const f = folderAt('7b', 100, 'f7');
  await store.saveFolder(f);
  assert.deepEqual((await store.listFolders()).map((x) => x.name), ['7b']);
  await store.deleteFolder('f7', { deletedAt: 500 });
  assert.deepEqual(await store.listFolders(), []);
  assert.deepEqual(await store.listDeleted(), [{ kind: 'folder', id: 'f7', deletedAt: 500 }]);
  await store.saveFolder(f); // Rückgängig
  assert.deepEqual(await store.listDeleted(), []);
  // Ordner und Blatt mit gleicher ID verwechseln sich nicht
  await store.saveDeleted('sheet', 'f7', 9);
  await store.saveFolder(f);
  assert.deepEqual(await store.listDeleted(), [{ kind: 'sheet', id: 'f7', deletedAt: 9 }]);
});

// --- Dateiformat ---------------------------------------------------------------------------------
test('Datei: Ordner und Zuordnung überstehen Sicherung und Lesen, ältere Dateien ohne Ordner bleiben lesbar', async () => {
  const folder = folderAt('7b', 100, 'f7');
  const sheet = sheetIn(1, 'f7');
  const backup = await buildBackup({ sheets: [sheet], folders: [folder], images: [] });
  assert.equal(backup.version, 3);
  assert.deepEqual(backup.folders, [folder]);
  const parsed = parseBackup(JSON.stringify(backup));
  assert.deepEqual(parsed.folders, [folder]);
  assert.equal(parsed.sheets[0].folderId, 'f7');

  const v2 = { format: BACKUP_FORMAT, version: 2, sheets: [{ ...sheet, folderId: undefined }], bank: [], images: [], deleted: [] };
  const old = parseBackup(JSON.stringify(v2));
  assert.equal(old.ok, true);
  assert.deepEqual(old.folders, []);
  assert.equal(old.sheets[0].folderId, null);
});

test('Datei: kaputte Ordner fallen weg, je ID zählt die jüngste Fassung, Marken für Ordner sind erlaubt', () => {
  const file = {
    format: BACKUP_FORMAT,
    version: 3,
    sheets: [newSheet({ number: 1 })],
    folders: [{ id: 'a', name: 'alt', updatedAt: 1 }, { id: 'a', name: 'neu', updatedAt: 9 }, { id: 'b', name: '  ' }, null, 'x', { name: 'ohne id' }],
    deleted: [{ kind: 'folder', id: 'weg', deletedAt: 5 }],
  };
  const parsed = parse(JSON.stringify(file));
  assert.deepEqual(parsed.folders.map((f) => f.name).sort(), ['neu', 'ohne id']);
  assert.deepEqual(parsed.deleted, [{ kind: 'folder', id: 'weg', deletedAt: 5 }]);
});

// --- Abgleich zwischen zwei Geräten ----------------------------------------------------------------
async function sync(store, fileText, { lastSyncAt = 0, now }) {
  const parsed = fileText ? parseBackup(fileText) : null;
  const incoming = parsed?.ok ? parsed : null;
  const plan = await planFromFile(store, incoming, lastSyncAt);
  const applied = await applyPlan(store, plan, incoming, { now });
  return { plan, applied, text: JSON.stringify(await buildSyncFile(store, now)) };
}

test('Zwei Geräte: Ordner und Zuordnung wandern mit, Umbenennen auch', async () => {
  const a = createMemoryStore();
  const b = createMemoryStore();
  await a.saveFolder(folderAt('7b', 1000, 'f7'));
  await a.saveSheet(sheetIn(1, 'f7', 1000));
  let { text } = await sync(a, null, { now: 2000 });
  const first = await sync(b, text, { now: 2100 });
  assert.equal(first.plan.folders.add.length, 1);
  assert.deepEqual((await b.listFolders()).map((f) => f.name), ['7b']);
  assert.equal((await b.listSheets())[0].folderId, 'f7');
  assert.match(describePlan(first.plan).join('\n'), /1 Ordner neu aus der Datei/);
  assert.equal(countPlan(first.plan).changes, 2);
  text = first.text;

  await b.saveFolder({ ...(await b.listFolders())[0], name: '7c', updatedAt: 3000 });
  ({ text } = await sync(b, text, { lastSyncAt: 2100, now: 3100 }));
  const atA = await sync(a, text, { lastSyncAt: 2000, now: 3200 });
  assert.equal(atA.plan.folders.update.length, 1);
  assert.deepEqual((await a.listFolders()).map((f) => f.name), ['7c']);
});

test('Zwei Geräte: Ordner löschen – die Blätter bleiben, der Ordner kommt nicht zurück', async () => {
  const a = createMemoryStore();
  const b = createMemoryStore();
  await a.saveFolder(folderAt('7b', 1000, 'f7'));
  await a.saveSheet(sheetIn(1, 'f7', 1000));
  let { text } = await sync(a, null, { now: 2000 });
  ({ text } = await sync(b, text, { now: 2100 }));

  // A löscht den Ordner und legt das Blatt „ohne Ordner“ (wie app.deleteFolder)
  await a.saveSheet({ ...(await a.listSheets())[0], folderId: null, updatedAt: 3000 });
  await a.deleteFolder('f7', { deletedAt: 3000 });
  const atA = await sync(a, text, { lastSyncAt: 2000, now: 3100 });
  assert.equal(atA.plan.folders.keptByMark.length, 1); // die Datei kennt den Ordner noch
  text = atA.text;

  const atB = await sync(b, text, { lastSyncAt: 2100, now: 3200 });
  assert.equal(atB.plan.folders.remove.length, 1);
  assert.deepEqual(await b.listFolders(), []);
  assert.equal((await b.listSheets()).length, 1);
  assert.equal((await b.listSheets())[0].folderId, null);
  text = atB.text;

  const again = await sync(a, text, { lastSyncAt: 3100, now: 3300 });
  assert.equal(countPlan(again.plan).changes, 0);
  assert.deepEqual(await a.listFolders(), []);
});

test('Zwei Geräte: ein Blatt mit Verweis auf einen fehlenden Ordner bleibt benutzbar (liegt „ohne Ordner“)', async () => {
  const a = createMemoryStore();
  await a.saveSheet(sheetIn(1, 'gibt-es-nicht', 1000));
  const sheets = await a.listSheets();
  assert.equal(folderOf(sheets[0], await a.listFolders()), null);
  assert.equal(sheetsIn(sheets, await a.listFolders(), FOLDER_NONE).length, 1);
});
