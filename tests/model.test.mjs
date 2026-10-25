import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_TASKS,
  duplicateSheet,
  duplicateTask,
  effectiveSolutionStyle,
  moveTask,
  newSheet,
  newTask,
  nextNumber,
  normalizeSheet,
  todayIso,
} from '../src/model.js';

test('neues Blatt: Tabloid, leeres Lösungsfeld, vier leere Aufgaben, Datum von heute', () => {
  const now = new Date(2026, 9, 25).getTime();
  const s = newSheet({ number: 7, now });
  assert.equal(s.format, 'tabloid');
  assert.equal(s.solutionDefault, 'leer');
  assert.equal(s.tasks.length, 4);
  assert.equal(s.number, '7');
  assert.equal(s.date, '2026-10-25');
  assert.equal(new Set(s.tasks.map((t) => t.id)).size, 4);
});

test('Voreinstellungen fließen in neue Blätter ein, ungültige werden ignoriert', () => {
  const s = newSheet({ settings: { defaultFormat: 'a3', defaultSolutionStyle: 'kariert' } });
  assert.equal(s.format, 'a3');
  assert.equal(s.solutionDefault, 'kariert');
  const bad = newSheet({ settings: { defaultFormat: 'xx', defaultSolutionStyle: 'yy' } });
  assert.equal(bad.format, 'tabloid');
  assert.equal(bad.solutionDefault, 'leer');
});

test('Lösungsfeld pro Aufgabe überschreibt den Standard des Blatts', () => {
  const s = newSheet({ settings: { defaultSolutionStyle: 'kariert' } });
  const [a, b] = s.tasks;
  b.solutionStyle = 'liniert';
  assert.equal(effectiveSolutionStyle(s, a), 'kariert');
  assert.equal(effectiveSolutionStyle(s, b), 'liniert');
  b.solutionStyle = 'kaputt';
  assert.equal(effectiveSolutionStyle(s, b), 'kariert');
});

test('normalizeSheet repariert fehlerhafte Importdaten', () => {
  assert.equal(normalizeSheet(null), null);
  assert.equal(normalizeSheet([]), null);
  const s = normalizeSheet({
    title: 42,
    format: 'riesig',
    date: 'gestern',
    solutionDefault: 'bunt',
    tasks: [{ text: 'x', weight: 99, solutionStyle: 'hmm', imageId: 5 }, null, { text: 'y'.repeat(9000) }],
  });
  assert.equal(s.title, 'Starteraufgaben');
  assert.equal(s.format, 'tabloid');
  assert.equal(s.date, '');
  assert.equal(s.solutionDefault, 'leer');
  assert.equal(s.tasks[0].weight, 1);
  assert.equal(s.tasks[0].solutionStyle, null);
  assert.equal(s.tasks[0].imageId, null);
  assert.equal(s.tasks[1].text, '');
  assert.equal(s.tasks[2].text.length, 5000);
});

test('normalizeSheet begrenzt die Aufgabenzahl und behält gültige Daten', () => {
  const many = { tasks: Array.from({ length: 40 }, (_, i) => ({ text: String(i) })) };
  assert.equal(normalizeSheet(many).tasks.length, MAX_TASKS);
  const ok = normalizeSheet({ id: 'abc', title: 'T', number: '3', date: '2026-01-02', format: 'a4', tasks: [{ text: 'q', weight: 2, solutionStyle: 'punkte' }] });
  assert.equal(ok.id, 'abc');
  assert.equal(ok.format, 'a4');
  assert.equal(ok.tasks[0].weight, 2);
  assert.equal(ok.tasks[0].solutionStyle, 'punkte');
});

test('nextNumber: größte Zahl + 1, Text-Nummern zählen nicht', () => {
  assert.equal(nextNumber([]), '1');
  assert.equal(nextNumber([{ number: '3' }, { number: '12' }, { number: 'Test' }]), '13');
});

test('duplicateSheet vergibt neue IDs, behält den Inhalt und lässt das Original unberührt', () => {
  const s = newSheet();
  s.tasks[0].text = 'Hallo';
  const copy = duplicateSheet(s, { number: '9' });
  assert.notEqual(copy.id, s.id);
  assert.equal(copy.number, '9');
  assert.equal(copy.tasks[0].text, 'Hallo');
  assert.notEqual(copy.tasks[0].id, s.tasks[0].id);
  copy.tasks[0].text = 'anders';
  assert.equal(s.tasks[0].text, 'Hallo');
});

test('duplicateTask und moveTask', () => {
  const t = newTask('a');
  const d = duplicateTask(t);
  assert.equal(d.text, 'a');
  assert.notEqual(d.id, t.id);

  const s = newSheet({ taskTexts: ['1', '2', '3'] });
  assert.equal(moveTask(s, 0, 2), 2);
  assert.deepEqual(s.tasks.map((x) => x.text), ['2', '3', '1']);
  assert.equal(moveTask(s, 0, -1), 0);
  assert.equal(moveTask(s, 0, 3), 0);
  assert.deepEqual(s.tasks.map((x) => x.text), ['2', '3', '1']);
});

test('todayIso formatiert lokal', () => {
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');
});
