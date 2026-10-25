import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newSheet } from '../src/model.js';
import { createMemoryStore } from '../src/store.js';

test('Arbeitsspeicher-Speicher: Blätter speichern, zuletzt bearbeitete zuerst, löschen', async () => {
  const store = createMemoryStore();
  assert.equal(store.persistent, false);
  const a = { ...newSheet({ number: 1 }), updatedAt: 100 };
  const b = { ...newSheet({ number: 2 }), updatedAt: 200 };
  await store.saveSheet(a);
  await store.saveSheet(b);
  assert.deepEqual((await store.listSheets()).map((s) => s.number), ['2', '1']);
  assert.equal((await store.getSheet(a.id)).number, '1');
  await store.deleteSheet(a.id);
  assert.equal(await store.getSheet(a.id), null);
});

test('gespeicherte Blätter sind Kopien (spätere Änderungen am Original wirken nicht rückwirkend)', async () => {
  const store = createMemoryStore();
  const s = newSheet({ number: 1 });
  await store.saveSheet(s);
  s.title = 'geändert';
  assert.equal((await store.getSheet(s.id)).title, 'Starteraufgaben');
});

test('Einstellungen: Vorgaben, überschreiben, Bilder verwalten', async () => {
  const store = createMemoryStore();
  let settings = await store.getSettings();
  assert.equal(settings.defaultFormat, 'tabloid');
  assert.equal(settings.changesSinceBackup, 0);
  await store.setSetting('defaultFormat', 'a3');
  settings = await store.getSettings();
  assert.equal(settings.defaultFormat, 'a3');

  await store.saveImage({ id: 'i1', blob: new Blob(['x']), width: 1, height: 1 });
  assert.deepEqual(await store.listImageIds(), ['i1']);
  await store.deleteImage('i1');
  assert.deepEqual(await store.listImageIds(), []);
});
