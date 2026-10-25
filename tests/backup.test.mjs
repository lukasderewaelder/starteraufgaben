import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  afterBackup,
  asCopies,
  backupFilename,
  backupReminder,
  base64ToBlob,
  blobToBase64,
  buildBackup,
  parseBackup,
  planImport,
  registerChange,
  snooze,
} from '../src/backup.js';
import { newSheet } from '../src/model.js';

const DAY = 24 * 60 * 60 * 1000;
const png = () => new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 255, 0, 128])], { type: 'image/png' });

test('Base64-Rundreise erhält die Bytes (auch große Blöcke)', async () => {
  const big = new Blob([Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)], { type: 'image/jpeg' });
  const back = base64ToBlob(await blobToBase64(big), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await back.arrayBuffer()), new Uint8Array(await big.arrayBuffer()));
  assert.equal(back.type, 'image/jpeg');
});

test('Sicherung: bauen und wieder lesen ergibt dieselben Blätter und Bilder', async () => {
  const a = newSheet({ number: 1, taskTexts: ['x', 'y'] });
  const b = newSheet({ number: 2 });
  a.tasks[0].imageId = 'img-1';
  const backup = await buildBackup({
    sheets: [a, b],
    images: [{ id: 'img-1', blob: png(), width: 10, height: 5 }, { id: 'unbenutzt', blob: png(), width: 1, height: 1 }],
  });
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.version, BACKUP_VERSION);
  assert.deepEqual(backup.images.map((i) => i.id), ['img-1']); // nur benutzte Bilder

  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.sheets.length, 2);
  assert.deepEqual(parsed.sheets.find((s) => s.id === a.id), a);
  assert.equal(parsed.images[0].type, 'image/png');
  assert.deepEqual(new Uint8Array(await base64ToBlob(parsed.images[0].data, 'image/png').arrayBuffer()), new Uint8Array(await png().arrayBuffer()));
});

test('Fehlerhafte Dateien werden mit verständlicher Meldung abgelehnt', () => {
  assert.match(parseBackup('kein json').error, /kein lesbares JSON/);
  assert.match(parseBackup(JSON.stringify({ format: 'anders', version: 1 })).error, /keine Starteraufgaben-Sicherung/);
  assert.match(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, sheets: [] })).error, /neueren Version/);
  assert.match(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, sheets: [] })).error, /kein lesbares Blatt/);
  assert.equal(parseBackup(null).ok, false);
});

test('Sicherung wird beim Lesen bereinigt: kaputte Bilder und Blätter, fehlende Bildverweise, ungültige Werte', () => {
  const good = newSheet({ number: 3 });
  good.tasks[0].imageId = 'weg';
  good.tasks[1].imageId = 'ok';
  const file = {
    format: BACKUP_FORMAT,
    version: 1,
    sheets: [good, 'kaputt', { ...newSheet({ number: 4 }), format: 'riesig', tasks: [{ text: 'a', weight: 99 }] }],
    images: [
      { id: 'ok', type: 'image/png', data: 'AAAA', width: 1, height: 1 },
      { id: 'schlecht', type: 'text/html', data: 'AAAA' },
      { id: 'b64', type: 'image/png', data: '<script>' },
    ],
  };
  const parsed = parseBackup(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sheets.length, 2);
  assert.equal(parsed.images.length, 1);
  const s3 = parsed.sheets.find((s) => s.number === '3');
  assert.equal(s3.tasks[0].imageId, null);
  assert.equal(s3.tasks[1].imageId, 'ok');
  const s4 = parsed.sheets.find((s) => s.number === '4');
  assert.equal(s4.format, 'tabloid');
  assert.equal(s4.tasks[0].weight, 1);
  assert.equal(parsed.warnings.length, 3);
});

test('Doppelte Blatt-IDs in einer Datei: das neuere gewinnt', () => {
  const s = newSheet({ number: 1 });
  const older = { ...s, title: 'alt', updatedAt: 100 };
  const newer = { ...s, title: 'neu', updatedAt: 200 };
  const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, sheets: [newer, older] }));
  assert.equal(parsed.sheets.length, 1);
  assert.equal(parsed.sheets[0].title, 'neu');
});

test('planImport: neu, aktualisiert, gleich, lokal neuer', () => {
  const mk = (id, updatedAt) => ({ ...newSheet({ number: 1 }), id, updatedAt });
  const local = [mk('a', 100), mk('b', 100), mk('c', 300)];
  const incoming = [mk('a', 200), mk('b', 100), mk('c', 100), mk('d', 50)];
  const plan = planImport(local, incoming);
  assert.deepEqual(plan.add.map((s) => s.id), ['d']);
  assert.deepEqual(plan.update.map((s) => s.id), ['a']);
  assert.equal(plan.same, 1);
  assert.deepEqual(plan.localNewer.map((s) => s.id), ['c']);
});

test('asCopies legt unabhängige Kopien mit neuen IDs an', () => {
  const s = newSheet({ number: 7 });
  const [copy] = asCopies([s]);
  assert.notEqual(copy.id, s.id);
  assert.equal(copy.number, '7');
  assert.notEqual(copy.tasks[0].id, s.tasks[0].id);
});

test('Dateinamen: ohne Sonderzeichen, mit Datum', () => {
  const now = new Date(2026, 9, 5);
  assert.equal(backupFilename({ scope: 'all', now }), 'Starteraufgaben_Sicherung_2026-10-05.json');
  assert.equal(
    backupFilename({ scope: 'sheet', sheet: { number: '12', title: 'Brüche: a/b?' }, now }),
    'Starteraufgaben_Blatt-12_Brüche- a-b-_2026-10-05.json',
  );
});

test('Erinnerung: zählt Bearbeitungssitzungen (mind. 10 Minuten Abstand) und merkt die erste Änderung', () => {
  const t0 = 1_000_000;
  let settings = { changesSinceBackup: 0, firstChangeAt: 0 };
  let last = 0;
  const apply = (now) => {
    const patch = registerChange(settings, last, now);
    settings = { ...settings, ...patch };
    last = now;
    return patch;
  };
  assert.deepEqual(apply(t0), { changesSinceBackup: 1, firstChangeAt: t0 });
  assert.deepEqual(apply(t0 + 60_000), {}); // gleiche Sitzung
  assert.deepEqual(apply(t0 + 11 * 60_000), { changesSinceBackup: 2 });
});

test('Erinnerung: fällig nach 5 Bearbeitungen oder 14 Tagen, nie ohne Änderungen, nie während der Pause', () => {
  const now = Date.now();
  assert.equal(backupReminder({ changesSinceBackup: 0 }, now).due, false);
  assert.equal(backupReminder({ changesSinceBackup: 3, firstChangeAt: now - DAY }, now).due, false);
  assert.equal(backupReminder({ changesSinceBackup: 5, firstChangeAt: now - DAY }, now).due, true);
  const old = backupReminder({ changesSinceBackup: 1, firstChangeAt: now - 15 * DAY }, now);
  assert.equal(old.due, true);
  assert.match(old.text, /noch keine Sicherung/);
  assert.equal(backupReminder({ changesSinceBackup: 9, firstChangeAt: now - DAY, ...snooze(now) }, now).due, false);
  assert.equal(backupReminder({ changesSinceBackup: 9, firstChangeAt: now - DAY, ...snooze(now - 4 * DAY) }, now).due, true);
});

test('Nach einer Sicherung beginnt die Zählung neu', () => {
  const now = Date.now();
  const patch = afterBackup(now);
  assert.equal(patch.lastBackupAt, now);
  assert.equal(backupReminder({ ...patch, changesSinceBackup: patch.changesSinceBackup }, now).due, false);
  assert.deepEqual([patch.changesSinceBackup, patch.firstChangeAt, patch.reminderSnoozedUntil], [0, 0, 0]);
});
