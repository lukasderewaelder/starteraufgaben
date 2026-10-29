// Abgleich über eine gemeinsame Datei: Löschmarken im Speicher, Dateiformat Version 2, Plan und ganze Abläufe mit zwei Geräten.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_FORMAT, MARK_MAX_AGE, buildBackup, conflictBankItems, conflictSheets, marksOf, parseBackup, planSync } from '../src/backup.js';
import { newBankItem } from '../src/bank.js';
import { newSheet } from '../src/model.js';
import { createMemoryStore } from '../src/store.js';
import { applyPlan, buildSyncFile, countPlan, describePlan, planFromFile } from '../src/sync.js';

const DAY = 24 * 60 * 60 * 1000;
const png = () => new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], { type: 'image/png' });
const sheetAt = (number, updatedAt, extra = {}) => ({ ...newSheet({ number, now: updatedAt }), ...extra });
const item = (id, updatedAt) => ({ id, updatedAt });

// --- Löschmarken im Speicher ---------------------------------------------------------------------
test('Speicher: Löschen merkt sich eine Marke, Speichern hebt sie wieder auf (Rückgängig)', async () => {
  const store = createMemoryStore();
  const sheet = sheetAt(1, 100);
  const task = newBankItem({ text: 'Aufgabe', now: 100 });
  await store.saveSheet(sheet);
  await store.saveBankItem(task);
  assert.deepEqual(await store.listDeleted(), []);

  await store.deleteSheet(sheet.id, { deletedAt: 500 });
  await store.deleteBankItem(task.id, { deletedAt: 600 });
  assert.equal(await store.getSheet(sheet.id), null);
  const marks = (await store.listDeleted()).sort((a, b) => a.deletedAt - b.deletedAt);
  assert.deepEqual(marks, [{ kind: 'sheet', id: sheet.id, deletedAt: 500 }, { kind: 'bank', id: task.id, deletedAt: 600 }]);

  await store.saveSheet(sheet);
  await store.saveBankItem(task);
  assert.deepEqual(await store.listDeleted(), []);
});

test('Speicher: Marken ohne Element ablegen, alte Marken aufräumen, Standardzeit ist jetzt', async () => {
  const store = createMemoryStore();
  await store.saveDeleted('sheet', 'x', 1000);
  await store.saveDeleted('sheet', 'x', 2000); // überschreibt
  await store.saveDeleted('bank', 'y', 5000);
  assert.deepEqual((await store.listDeleted()).filter((m) => m.id === 'x'), [{ kind: 'sheet', id: 'x', deletedAt: 2000 }]);
  assert.equal(await store.pruneDeleted(1000, 3500), 1); // x ist 1500 alt, y 0
  assert.deepEqual((await store.listDeleted()).map((m) => m.id), ['y']);

  const before = Date.now();
  const s = sheetAt(1, 1);
  await store.saveSheet(s);
  await store.deleteSheet(s.id);
  const [mark] = (await store.listDeleted()).filter((m) => m.id === s.id);
  assert.ok(mark.deletedAt >= before);
});

test('Speicher: eine Marke für Blatt und Bank-Aufgabe mit gleicher ID verwechselt sich nicht', async () => {
  const store = createMemoryStore();
  await store.saveDeleted('sheet', 'gleich', 1);
  await store.saveDeleted('bank', 'gleich', 2);
  assert.equal((await store.listDeleted()).length, 2);
  await store.saveSheet({ ...sheetAt(1, 5), id: 'gleich' });
  assert.deepEqual(await store.listDeleted(), [{ kind: 'bank', id: 'gleich', deletedAt: 2 }]);
});

// --- Dateiformat Version 2 -----------------------------------------------------------------------
test('Datei: Löschmarken werden gespeichert und wieder gelesen, Version 1 bleibt lesbar', async () => {
  const sheet = sheetAt(1, 100);
  const backup = await buildBackup({ sheets: [sheet], images: [], deleted: [{ kind: 'sheet', id: 'weg', deletedAt: 7, extra: 'x' }] });
  assert.equal(backup.version, 3);
  assert.deepEqual(backup.deleted, [{ kind: 'sheet', id: 'weg', deletedAt: 7 }]);
  const parsed = parseBackup(JSON.stringify(backup));
  assert.deepEqual(parsed.deleted, [{ kind: 'sheet', id: 'weg', deletedAt: 7 }]);

  const v1 = { format: BACKUP_FORMAT, version: 1, exportedAt: 1, sheets: [sheet], bank: [], images: [] };
  const old = parseBackup(JSON.stringify(v1));
  assert.equal(old.ok, true);
  assert.deepEqual(old.deleted, []);

  const future = parseBackup(JSON.stringify({ ...v1, version: 4 }));
  assert.equal(future.ok, false);
  assert.match(future.error, /neueren Version/);
});

test('Datei: nur Löschmarken genügt, ungültige Marken fallen weg, je Element zählt die jüngste', () => {
  const file = {
    format: BACKUP_FORMAT,
    version: 2,
    deleted: [
      { kind: 'sheet', id: 'a', deletedAt: 5 },
      { kind: 'sheet', id: 'a', deletedAt: 9 },
      { kind: 'sheet', id: 'a', deletedAt: 3 },
      { kind: 'bank', id: 'a', deletedAt: 1 },
      { kind: 'quatsch', id: 'b', deletedAt: 1 },
      { kind: 'sheet', id: '', deletedAt: 1 },
      { kind: 'sheet', id: 'c', deletedAt: 'gestern' },
      null,
    ],
  };
  const parsed = parseBackup(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.deleted, [{ kind: 'sheet', id: 'a', deletedAt: 9 }, { kind: 'bank', id: 'a', deletedAt: 1 }]);
  assert.equal(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 2 })).ok, false); // leer bleibt ein Fehler
  assert.equal(parseBackup(JSON.stringify({ ...file, deleted: new Array(50_001).fill({ kind: 'sheet', id: 'z', deletedAt: 1 }) })).ok, false);
});

test('marksOf: Marken einer Art ohne die Art', () => {
  const marks = [{ kind: 'sheet', id: 'a', deletedAt: 1 }, { kind: 'bank', id: 'b', deletedAt: 2 }];
  assert.deepEqual(marksOf(marks, 'bank'), [{ id: 'b', deletedAt: 2 }]);
});

// --- Plan ----------------------------------------------------------------------------------------
test('Plan ohne Löschmarken verhält sich wie das Einspielen: neu, aktualisieren, gleich, hier neuer', () => {
  const plan = planSync([item('a', 10), item('b', 10), item('c', 10)], [item('a', 20), item('b', 10), item('c', 5), item('d', 1)]);
  assert.deepEqual(plan.add.map((x) => x.id), ['d']);
  assert.deepEqual(plan.update.map((x) => x.id), ['a']);
  assert.equal(plan.same, 1);
  assert.deepEqual(plan.localNewer.map((x) => x.id), ['c']);
  assert.deepEqual([plan.remove, plan.marks, plan.keptByMark, plan.conflicts], [[], [], [], []]);
});

test('Plan: eine neuere Löschmarke in der Datei löscht das lokale Element, eine ältere nicht', () => {
  const local = [item('alt', 100), item('neu', 300)];
  const plan = planSync(local, [], { incomingMarks: [{ id: 'alt', deletedAt: 200 }, { id: 'neu', deletedAt: 200 }, { id: 'gleich', deletedAt: 50 }] });
  assert.deepEqual(plan.remove.map((r) => [r.item.id, r.deletedAt]), [['alt', 200]]);
  assert.deepEqual(plan.marks, [{ id: 'gleich', deletedAt: 50 }]); // unbekannt: Marke merken, damit sie weiterwandert
  // gleicher Zeitstempel: Löschen gewinnt
  assert.equal(planSync([item('x', 200)], [], { incomingMarks: [{ id: 'x', deletedAt: 200 }] }).remove.length, 1);
});

test('Plan: hier Gelöschtes kommt aus der Datei nicht zurück – außer dort wurde es danach bearbeitet', () => {
  const marks = [{ id: 'a', deletedAt: 200 }];
  const stays = planSync([], [item('a', 150), item('a2', 100)], { marks });
  assert.deepEqual(stays.keptByMark.map((x) => x.id), ['a']);
  assert.deepEqual(stays.add.map((x) => x.id), ['a2']);
  const comesBack = planSync([], [item('a', 250)], { marks });
  assert.deepEqual(comesBack.add.map((x) => x.id), ['a']);
  assert.equal(planSync([], [item('a', 200)], { marks }).keptByMark.length, 1); // gleiche Zeit: gelöscht
});

test('Plan: Marken, die hier schon (neuer) stehen, werden nicht doppelt übernommen', () => {
  const marks = [{ id: 'a', deletedAt: 300 }, { id: 'b', deletedAt: 100 }];
  const plan = planSync([], [], { marks, incomingMarks: [{ id: 'a', deletedAt: 200 }, { id: 'b', deletedAt: 200 }] });
  assert.deepEqual(plan.marks, [{ id: 'b', deletedAt: 200 }]);
});

test('Plan: Konflikt, wenn beide Seiten seit dem letzten Abgleich geändert haben – die unterlegene Fassung bleibt als Kopie', () => {
  const lastSyncAt = 100;
  const both = planSync([item('a', 150)], [item('a', 200)], { lastSyncAt });
  assert.deepEqual(both.update.map((x) => x.updatedAt), [200]);
  assert.deepEqual(both.conflicts.map((x) => x.updatedAt), [150]); // die ältere, lokale

  const hereNewer = planSync([item('a', 200)], [item('a', 150)], { lastSyncAt });
  assert.deepEqual(hereNewer.localNewer.length, 1);
  assert.deepEqual(hereNewer.conflicts.map((x) => x.updatedAt), [150]); // die ältere, aus der Datei

  assert.equal(planSync([item('a', 50)], [item('a', 200)], { lastSyncAt }).conflicts.length, 0); // nur dort geändert
  assert.equal(planSync([item('a', 200)], [item('a', 50)], { lastSyncAt }).conflicts.length, 0); // nur hier geändert
  assert.equal(planSync([item('a', 150)], [item('a', 200)], { lastSyncAt: 0 }).conflicts.length, 0); // erster Abgleich: das Neuere gewinnt
  assert.equal(planSync([item('a', 150)], [item('a', 150)], { lastSyncAt }).conflicts.length, 0);
});

test('Konflikt-Kopien: neue IDs und gut auffindbar', () => {
  const sheet = sheetAt(3, 10, { title: 'Brüche' });
  const [copy] = conflictSheets([sheet], 99);
  assert.notEqual(copy.id, sheet.id);
  assert.equal(copy.title, 'Brüche (Konflikt)');
  assert.equal(copy.number, '3');
  assert.equal(copy.updatedAt, 99);
  assert.notEqual(copy.tasks[0].id, sheet.tasks[0].id);
  const bank = newBankItem({ text: 'x', tags: ['a'], now: 1 });
  const [bankCopy] = conflictBankItems([bank], 99);
  assert.notEqual(bankCopy.id, bank.id);
  assert.deepEqual(bankCopy.tags, ['a', 'Konflikt']);
  assert.deepEqual(conflictBankItems([{ ...bank, tags: ['Konflikt'] }])[0].tags, ['Konflikt']);
});

// --- Ganze Abläufe mit zwei Geräten --------------------------------------------------------------
/** Ein Abgleich eines Geräts mit dem Inhalt der gemeinsamen Datei; liefert den neuen Dateiinhalt. */
async function sync(store, fileText, { lastSyncAt = 0, now }) {
  const parsed = fileText ? parseBackup(fileText) : null;
  const incoming = parsed?.ok ? parsed : null;
  const plan = await planFromFile(store, incoming, lastSyncAt);
  const applied = await applyPlan(store, plan, incoming, { now });
  return { plan, applied, text: JSON.stringify(await buildSyncFile(store, now)) };
}
const titles = async (store) => (await store.listSheets()).map((s) => s.title).sort();

test('Zwei Geräte: Blatt wandert hin, Löschen wandert mit und das Blatt kommt nie zurück', async () => {
  const a = createMemoryStore();
  const b = createMemoryStore();
  const sheet = sheetAt(1, 1000, { title: 'Bruchrechnen' });
  const task = newBankItem({ text: 'Kürze 6/8', now: 1000 });
  await a.saveSheet(sheet);
  await a.saveBankItem(task);

  let { text } = await sync(a, null, { now: 2000 }); // A legt die Datei an
  const first = await sync(b, text, { now: 2100 });
  assert.equal(first.plan.sheets.add.length, 1);
  assert.equal(first.plan.bank.add.length, 1);
  assert.deepEqual(await titles(b), ['Bruchrechnen']);
  text = first.text;

  await a.deleteSheet(sheet.id, { deletedAt: 3000 });
  await a.deleteBankItem(task.id, { deletedAt: 3000 });
  const second = await sync(a, text, { lastSyncAt: 2000, now: 3100 });
  assert.equal(second.plan.sheets.keptByMark.length, 1); // die Datei kennt das Blatt noch, aber es ist hier gelöscht
  assert.equal((await a.listSheets()).length, 0);
  text = second.text;

  const third = await sync(b, text, { lastSyncAt: 2100, now: 3200 });
  assert.equal(third.plan.sheets.remove.length, 1);
  assert.equal(third.plan.bank.remove.length, 1);
  assert.deepEqual([(await b.listSheets()).length, (await b.listBank()).length], [0, 0]);
  assert.equal((await b.listDeleted()).length, 2); // die Marken bleiben für ein drittes Gerät
  text = third.text;

  const fourth = await sync(a, text, { lastSyncAt: 3100, now: 3300 });
  assert.equal(countPlan(fourth.plan).changes, 0);
  assert.equal((await a.listSheets()).length, 0);
});

test('Zwei Geräte: wer nach dem Löschen woanders bearbeitet, bekommt das Blatt zurück', async () => {
  const a = createMemoryStore();
  const b = createMemoryStore();
  const sheet = sheetAt(1, 1000, { title: 'Original' });
  await a.saveSheet(sheet);
  let { text } = await sync(a, null, { now: 2000 });
  ({ text } = await sync(b, text, { now: 2100 }));

  await a.deleteSheet(sheet.id, { deletedAt: 3000 });
  await b.saveSheet({ ...(await b.getSheet(sheet.id)), title: 'Überarbeitet', updatedAt: 3500 });
  ({ text } = await sync(a, text, { lastSyncAt: 2000, now: 3600 })); // Datei enthält die Marke
  const back = await sync(b, text, { lastSyncAt: 2100, now: 3700 });
  assert.equal(back.plan.sheets.remove.length, 0); // B hat später bearbeitet: bleibt
  assert.deepEqual(await titles(b), ['Überarbeitet']);
  const restored = await sync(a, back.text, { lastSyncAt: 3600, now: 3800 });
  assert.deepEqual(restored.plan.sheets.add.map((s) => s.title), ['Überarbeitet']);
  assert.deepEqual(await titles(a), ['Überarbeitet']);
  assert.deepEqual(await a.listDeleted(), []);
});

test('Zwei Geräte: gleichzeitige Änderung ergibt eine Konflikt-Kopie, danach sind beide gleich', async () => {
  const a = createMemoryStore();
  const b = createMemoryStore();
  const sheet = sheetAt(1, 1000, { title: 'Vorher' });
  await a.saveSheet(sheet);
  let { text } = await sync(a, null, { now: 2000 });
  ({ text } = await sync(b, text, { now: 2100 }));

  await a.saveSheet({ ...(await a.getSheet(sheet.id)), title: 'Von A', updatedAt: 3000 });
  await b.saveSheet({ ...(await b.getSheet(sheet.id)), title: 'Von B', updatedAt: 3500 });
  ({ text } = await sync(a, text, { lastSyncAt: 2000, now: 3600 })); // A schreibt „Von A“ in die Datei
  const atB = await sync(b, text, { lastSyncAt: 2100, now: 3700 });
  assert.equal(atB.plan.sheets.conflicts.length, 1);
  assert.deepEqual(await titles(b), ['Von A (Konflikt)', 'Von B'].sort());
  const atA = await sync(a, atB.text, { lastSyncAt: 3600, now: 3800 });
  assert.deepEqual(await titles(a), await titles(b));
  assert.equal(atA.plan.sheets.conflicts.length, 0);
  const again = await sync(b, atA.text, { lastSyncAt: 3700, now: 3900 });
  assert.equal(countPlan(again.plan).changes, 0);
  assert.equal((await b.listSheets()).length, 2);
});

test('Zwei Geräte: Bilder wandern mit, auch in Konflikt-Kopien', async () => {
  const a = createMemoryStore();
  const b = createMemoryStore();
  const sheet = sheetAt(1, 1000);
  sheet.tasks[0].imageId = 'bild';
  await a.saveImage({ id: 'bild', blob: png(), width: 3, height: 2 });
  await a.saveSheet(sheet);
  let { text } = await sync(a, null, { now: 2000 });
  const atB = await sync(b, text, { now: 2100 });
  assert.deepEqual(atB.applied.savedImages.map((i) => i.id), ['bild']);
  const stored = await b.getImage('bild');
  assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()), new Uint8Array(await png().arrayBuffer()));
  assert.equal(stored.width, 3);

  // B ändert, A ändert: die Datei-Fassung von B ist bei A der Verlierer und bringt ihr Bild als Kopie mit
  await b.saveSheet({ ...(await b.getSheet(sheet.id)), title: 'B', updatedAt: 3000 });
  ({ text } = await sync(b, atB.text, { lastSyncAt: 2100, now: 3100 }));
  await a.saveSheet({ ...(await a.getSheet(sheet.id)), title: 'A', updatedAt: 3500 });
  const atA = await sync(a, text, { lastSyncAt: 2000, now: 3600 });
  assert.equal(atA.applied.copies, 1);
  assert.deepEqual(await titles(a), ['A', 'B (Konflikt)']);
  for (const s of await a.listSheets()) assert.ok(await a.getImage(s.tasks[0].imageId), 'Bild vorhanden');
});

test('Zwei Geräte: erster Abgleich mit leerer oder fehlender Datei, und Marken verfallen nach 90 Tagen', async () => {
  const a = createMemoryStore();
  await a.saveSheet(sheetAt(1, 1000));
  const empty = await sync(a, '', { now: 2000 }); // Datei ist neu angelegt und noch leer
  assert.equal(countPlan(empty.plan).changes, 0);
  assert.equal(JSON.parse(empty.text).sheets.length, 1);

  const old = createMemoryStore();
  await old.saveDeleted('sheet', 'uralt', 1000);
  await old.saveDeleted('sheet', 'frisch', 1000 + MARK_MAX_AGE);
  await sync(old, null, { now: 1000 + MARK_MAX_AGE + DAY });
  assert.deepEqual((await old.listDeleted()).map((m) => m.id), ['frisch']);
});

// --- Vorschau-Texte ------------------------------------------------------------------------------
test('Vorschau: Zahlen und Zeilen, auch im Singular', async () => {
  const store = createMemoryStore();
  const plan = await planFromFile(store, null);
  assert.deepEqual(describePlan(plan), []);
  assert.equal(countPlan(plan).changes, 0);

  const sheetPlan = { add: [sheetAt(1, 1)], update: [], same: 3, localNewer: [sheetAt(2, 2), sheetAt(3, 3)], keptByMark: [], remove: [], marks: [], conflicts: [sheetAt(4, 4)] };
  const bankPlan = { ...sheetPlan, add: [], update: [{}], localNewer: [], conflicts: [] };
  const lines = describePlan({ sheets: sheetPlan, bank: bankPlan });
  assert.deepEqual(lines, [
    '1 Blatt neu aus der Datei',
    '2 Blätter hier neuer – gehen in die Datei',
    '1 Blatt auf beiden Seiten geändert – die ältere Fassung bleibt als „Konflikt“-Kopie',
    '1 Aufgabe der Bank aus der Datei neuer – werden aktualisiert',
  ]);
  const counts = countPlan({ sheets: sheetPlan, bank: bankPlan });
  assert.equal(counts.changes, 2);
  assert.equal(counts.conflicts, 1);
});
