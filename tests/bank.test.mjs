import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SUGGESTED_TOPICS,
  facets,
  filterBank,
  findDuplicate,
  gradeFromClass,
  matchesQuery,
  newBankItem,
  normalizeBankItem,
  parseTags,
  sortBank,
  topicSuggestions,
} from '../src/bank.js';

const mk = (over) => ({ ...newBankItem({ text: 'x' }), ...over });

test('neue Aufgabe: gültige Klassenstufe, bereinigte Schlagwörter, Zeitstempel', () => {
  const item = newBankItem({ text: 'Berechne', klassenstufe: '7', thema: '  Brüche ', tags: [' kürzen ', 'Kürzen', '', 'erweitern'], now: 5 });
  assert.equal(item.klassenstufe, '7');
  assert.equal(item.thema, 'Brüche');
  assert.deepEqual(item.tags, ['kürzen', 'erweitern']);
  assert.deepEqual([item.createdAt, item.updatedAt], [5, 5]);
  assert.equal(newBankItem({ klassenstufe: '99' }).klassenstufe, '');
});

test('parseTags trennt an Komma, Semikolon und Zeilenumbruch und begrenzt', () => {
  assert.deepEqual(parseTags('a, b;c\nd,  ,A'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(parseTags(''), []);
  assert.equal(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length, 12);
  assert.equal(parseTags('x'.repeat(80))[0].length, 30);
});

test('normalizeBankItem repariert Importdaten', () => {
  assert.equal(normalizeBankItem(null), null);
  assert.equal(normalizeBankItem([]), null);
  const item = normalizeBankItem({ id: 'a', text: 5, klassenstufe: 'x', thema: 3, tags: 'nein', imageId: 7, updatedAt: 'gestern' }, { now: 9 });
  assert.equal(item.id, 'a');
  assert.equal(item.text, '');
  assert.equal(item.klassenstufe, '');
  assert.equal(item.thema, '');
  assert.deepEqual(item.tags, []);
  assert.equal(item.imageId, null);
  assert.equal(item.updatedAt, 9);
  const ok = normalizeBankItem({ id: 'b', text: 'q', klassenstufe: '10', thema: 'Brüche', tags: ['a'], imageId: 'img', updatedAt: 3 });
  assert.deepEqual([ok.klassenstufe, ok.thema, ok.tags, ok.imageId, ok.updatedAt], ['10', 'Brüche', ['a'], 'img', 3]);
});

test('gradeFromClass liest die Klassenstufe aus Kursnamen', () => {
  assert.equal(gradeFromClass('7b'), '7');
  assert.equal(gradeFromClass(' 10 a'), '10');
  assert.equal(gradeFromClass('Kurs 5'), '');
  assert.equal(gradeFromClass('99'), '');
  assert.equal(gradeFromClass(''), '');
});

test('Suche: alle Wörter, egal ob in Text, Thema oder Schlagwort; Groß-/Kleinschreibung egal', () => {
  const item = mk({ text: 'Kürze $\\frac{12}{18}$', thema: 'Brüche', tags: ['Kürzen', 'Grundlagen'] });
  assert.equal(matchesQuery(item, ''), true);
  assert.equal(matchesQuery(item, 'kürze frac'), true);
  assert.equal(matchesQuery(item, 'BRÜCHE grundlagen'), true);
  assert.equal(matchesQuery(item, 'brüche prozent'), false);
});

test('Filter kombinieren Klassenstufe, Thema, Schlagwort und Suche', () => {
  const items = [
    mk({ id: 1, klassenstufe: '5', thema: 'Brüche', tags: ['Kürzen'], text: 'a' }),
    mk({ id: 2, klassenstufe: '6', thema: 'Brüche', tags: ['Erweitern'], text: 'b' }),
    mk({ id: 3, klassenstufe: '6', thema: 'Prozent', tags: ['kürzen'], text: 'c' }),
  ];
  const ids = (f) => filterBank(items, f).map((i) => i.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ klassenstufe: '6' }), [2, 3]);
  assert.deepEqual(ids({ klassenstufe: '6', thema: 'Brüche' }), [2]);
  assert.deepEqual(ids({ tag: 'KÜRZEN' }), [1, 3]);
  assert.deepEqual(ids({ query: 'c', tag: 'kürzen', klassenstufe: '6' }), [3]);
  assert.deepEqual(ids({ thema: 'Gibt es nicht' }), []);
});

test('facets zählen Themen/Schlagwörter und sortieren Klassenstufen numerisch', () => {
  const items = [
    mk({ klassenstufe: '10', thema: 'Brüche', tags: ['a', 'B'] }),
    mk({ klassenstufe: '5', thema: 'Brüche', tags: ['b'] }),
    mk({ klassenstufe: '', thema: 'Äpfel', tags: [] }),
  ];
  const f = facets(items);
  assert.deepEqual(f.klassenstufen, ['5', '10']);
  assert.deepEqual(f.themen, ['Äpfel', 'Brüche']);
  assert.deepEqual(f.tags, [{ tag: 'a', count: 1 }, { tag: 'B', count: 2 }]);
});

test('Themenvorschläge: benutzte zuerst, ohne Doppelte', () => {
  const s = topicSuggestions([mk({ thema: 'Brüche' }), mk({ thema: 'Eigenes' })]);
  assert.deepEqual(s.slice(0, 2), ['Brüche', 'Eigenes']);
  assert.equal(s.filter((t) => t === 'Brüche').length, 1);
  assert.equal(s.length, SUGGESTED_TOPICS.length + 1);
});

test('Doppelte erkennen: gleicher Text (Leerraum egal) und gleiches Bild', () => {
  const items = [mk({ id: 1, text: 'Berechne:\n$7 \\cdot 5$' }), mk({ id: 2, text: 'Mit Bild', imageId: 'i' })];
  assert.equal(findDuplicate(items, 'Berechne:  $7 \\cdot 5$')?.id, 1);
  assert.equal(findDuplicate(items, 'Mit Bild'), null);
  assert.equal(findDuplicate(items, 'Mit Bild', 'i')?.id, 2);
  assert.equal(findDuplicate(items, 'ganz anders'), null);
});

test('sortBank: zuletzt geändert zuerst, Original bleibt unverändert', () => {
  const items = [mk({ id: 1, updatedAt: 1 }), mk({ id: 2, updatedAt: 3 }), mk({ id: 3, updatedAt: 2 })];
  assert.deepEqual(sortBank(items).map((i) => i.id), [2, 3, 1]);
  assert.deepEqual(items.map((i) => i.id), [1, 2, 3]);
});
