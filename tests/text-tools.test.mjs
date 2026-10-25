import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insertAt, nextSubLabel, toggleList, toggleSubtasks, toggleWrap } from '../src/text-tools.js';

test('toggleWrap umschließt die Auswahl und nimmt sie wieder weg', () => {
  const a = toggleWrap('Hallo Welt', 6, 10, '**');
  assert.deepEqual(a, { text: 'Hallo **Welt**', start: 8, end: 12 });
  const b = toggleWrap(a.text, a.start, a.end, '**');
  assert.deepEqual(b, { text: 'Hallo Welt', start: 6, end: 10 });
});

test('toggleWrap ohne Auswahl setzt den Cursor zwischen die Markierungen', () => {
  assert.deepEqual(toggleWrap('ab', 1, 1, '*'), { text: 'a**b', start: 2, end: 2 });
});

test('toggleWrap entfernt auch eine mitmarkierte Umschließung', () => {
  assert.deepEqual(toggleWrap('x __y__ z', 2, 7, '__'), { text: 'x y z', start: 2, end: 3 });
});

test('nextSubLabel zählt weiter', () => {
  assert.equal(nextSubLabel('Aufgabe'), 'a');
  assert.equal(nextSubLabel('a) eins\nb) zwei'), 'c');
});

test('toggleSubtasks nummeriert markierte Zeilen und schaltet wieder aus', () => {
  const text = 'Berechne:\nx\ny';
  const on = toggleSubtasks(text, 10, text.length);
  assert.equal(on.text, 'Berechne:\na) x\nb) y');
  const off = toggleSubtasks(on.text, 10, on.text.length);
  assert.equal(off.text, 'Berechne:\nx\ny');
});

test('toggleSubtasks setzt die Reihe nach vorhandenen Teilaufgaben fort', () => {
  const text = 'a) eins\nzwei';
  assert.equal(toggleSubtasks(text, 8, text.length).text, 'a) eins\nb) zwei');
});

test('toggleList setzt und entfernt Aufzählungspunkte', () => {
  const on = toggleList('eins\nzwei', 0, 9);
  assert.equal(on.text, '- eins\n- zwei');
  assert.equal(toggleList(on.text, 0, on.text.length).text, 'eins\nzwei');
});

test('insertAt ersetzt die Auswahl', () => {
  assert.deepEqual(insertAt('ab cd', 3, 5, '$x$'), { text: 'ab $x$', start: 6, end: 6 });
});
