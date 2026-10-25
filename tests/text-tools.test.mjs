import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanLatex, findMathAt, insertAt, nextSubLabel, putFormula, toggleList, toggleSubtasks, toggleWrap, wrapMath } from '../src/text-tools.js';

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

test('findMathAt findet die Formel unter dem Cursor, aber nicht an ihren Rändern', () => {
  const text = 'Rechne $\\frac{1}{2}$ aus $$x^2$$';
  const inline = findMathAt(text, 10, 10);
  assert.equal(inline.latex, '\\frac{1}{2}');
  assert.equal(findMathAt(text, 7, 7), null, 'direkt vor dem $ ist noch keine Formel');
  assert.equal(findMathAt(text, 20, 20), null, 'direkt hinter dem $ auch nicht');
  assert.equal(findMathAt(text, 7, 20).latex, '\\frac{1}{2}', 'ganze Formel markiert');
  assert.equal(findMathAt(text, 5, 12), null, 'Auswahl ragt aus der Formel heraus');
  assert.equal(findMathAt(text, 29, 29).display, true);
  assert.equal(findMathAt('ohne Formel', 3, 3), null);
});

test('putFormula fügt hinter der Auswahl ein und setzt Leerzeichen nur, wo Wörter kleben würden', () => {
  assert.deepEqual(putFormula('Berechne:', 9, 9, 'x'), { text: 'Berechne: $x$', start: 13, end: 13 });
  assert.equal(putFormula('Berechne: ', 10, 10, 'x').text, 'Berechne: $x$');
  assert.equal(putFormula('', 0, 0, 'x').text, '$x$');
  assert.equal(putFormula('ab', 1, 1, 'x').text, 'a $x$ b');
  assert.equal(putFormula('(a)', 1, 1, 'x').text, '($x$ a)');
  assert.equal(putFormula('Text.', 4, 4, 'x').text, 'Text $x$.');
  assert.equal(putFormula('markiert hier', 0, 8, 'x').text, 'markiert $x$ hier');
});

test('putFormula ersetzt eine vorhandene Formel samt ihren Begrenzern', () => {
  const text = 'a $x$ b $$y$$ c';
  const hit = findMathAt(text, 3, 3);
  assert.equal(putFormula(text, 3, 3, '\\frac{1}{2}', { hit }).text, 'a $\\frac{1}{2}$ b $$y$$ c');
  const display = findMathAt(text, 11, 11);
  assert.equal(putFormula(text, 11, 11, 'z', { hit: display }).text, 'a $x$ b $$z$$ c');
});

test('putFormula: große Darstellung setzt \\displaystyle genau einmal', () => {
  assert.equal(putFormula('', 0, 0, '\\frac{1}{2}', { large: true }).text, '$\\displaystyle \\frac{1}{2}$');
  assert.equal(putFormula('', 0, 0, '\\displaystyle x', { large: true }).text, '$\\displaystyle x$');
});

test('cleanLatex entfernt Platzhalter und überflüssige Leerzeichen', () => {
  assert.equal(cleanLatex('\\frac{1}{\\placeholder{}}'), '\\frac{1}{}');
  assert.equal(cleanLatex('  a  +   b '), 'a + b');
  assert.equal(cleanLatex('x\\placeholder[p]{Zahl}y'), 'xy');
});

test('cleanLatex setzt Klammern um Ein-Ziffern-Argumente (\\frac34 -> \\frac{3}{4})', () => {
  assert.equal(cleanLatex('\\frac34'), '\\frac{3}{4}');
  assert.equal(cleanLatex('\\frac3{x+1}'), '\\frac{3}{x+1}');
  assert.equal(cleanLatex('\\frac{x+1}4'), '\\frac{x+1}{4}');
  assert.equal(cleanLatex('\\frac{1}{2}+\\sqrt2'), '\\frac{1}{2}+\\sqrt{2}');
  assert.equal(cleanLatex('\\frac{12}{5}'), '\\frac{12}{5}');
  assert.equal(cleanLatex('\\dfrac12'), '\\dfrac{1}{2}');
});

test('wrapMath: leeres Paar mit Cursor dazwischen oder Auswahl umschließen', () => {
  assert.deepEqual(wrapMath('ab', 1, 1), { text: 'a$$b', start: 2, end: 2 });
  assert.deepEqual(wrapMath('x+y z', 0, 3), { text: '$x+y$ z', start: 1, end: 4 });
});

test('insertAt ersetzt die Auswahl', () => {
  assert.deepEqual(insertAt('ab cd', 3, 5, '$x$'), { text: 'ab $x$', start: 6, end: 6 });
});
