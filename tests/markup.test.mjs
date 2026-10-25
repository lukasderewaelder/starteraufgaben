import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, markupToHtml, splitMath } from '../src/markup.js';

// Formelsatz im Test: erkennbarer Platzhalter statt KaTeX.
const renderMath = (latex, display) => `<m${display ? ' d' : ''}>${escapeHtml(latex)}</m>`;
const html = (text) => markupToHtml(text, { renderMath });

test('HTML im Text wird escaped, nie ausgeführt', () => {
  assert.equal(html('<img src=x onerror=alert(1)>'), '<div class="ln">&lt;img src=x onerror=alert(1)&gt;</div>');
  assert.equal(html('a & b'), '<div class="ln">a &amp; b</div>');
});

test('Inline-Formeln mit $…$', () => {
  assert.equal(html('Berechne $7 \\cdot 5$ jetzt'), '<div class="ln">Berechne <m>7 \\cdot 5</m> jetzt</div>');
});

test('Anzeigeformeln mit $$…$$, \\[…\\] und \\(…\\)', () => {
  assert.match(html('$$x^2$$'), /<m d>x\^2<\/m>/);
  assert.match(html('\\[x^2\\]'), /<m d>x\^2<\/m>/);
  assert.match(html('\\(x^2\\)'), /<m>x\^2<\/m>/);
});

test('\\$ ist ein echtes Dollarzeichen und startet keine Formel', () => {
  assert.equal(html('Das kostet 5\\$ und 6\\$.'), '<div class="ln">Das kostet 5$ und 6$.</div>');
});

test('einzelnes oder unabgeschlossenes $ bleibt Text', () => {
  assert.equal(html('nur ein $ hier'), '<div class="ln">nur ein $ hier</div>');
  assert.equal(html('$a\nb$'), '<div class="ln">$a</div><div class="ln">b$</div>');
});

test('Formeln werden nicht als Markup interpretiert', () => {
  assert.equal(html('$a*b*c$'), '<div class="ln"><m>a*b*c</m></div>');
  assert.equal(html('$a__b__c$'), '<div class="ln"><m>a__b__c</m></div>');
});

test('fett, kursiv, unterstrichen – auch mit Formel darin', () => {
  assert.equal(html('**fett**'), '<div class="ln"><strong>fett</strong></div>');
  assert.equal(html('*kursiv*'), '<div class="ln"><em>kursiv</em></div>');
  assert.equal(html('__unter__'), '<div class="ln"><u>unter</u></div>');
  assert.equal(html('**Löse $x$ !**'), '<div class="ln"><strong>Löse <m>x</m> !</strong></div>');
});

test('Sterne als Malzeichen werden nicht kursiv', () => {
  assert.equal(html('5 * 3 * 2'), '<div class="ln">5 * 3 * 2</div>');
  assert.equal(html('2*3 und 4*5'), '<div class="ln">2*3 und 4*5</div>');
});

test('Teilaufgaben und Aufzählungen', () => {
  assert.equal(
    html('Berechne:\na) $1+1$\nb) 2+2'),
    '<div class="ln">Berechne:</div>' +
      '<div class="ln sub"><span class="lbl">a)</span><span class="txt"><m>1+1</m></span></div>' +
      '<div class="ln sub"><span class="lbl">b)</span><span class="txt">2+2</span></div>',
  );
  assert.equal(html('- eins'), '<div class="ln li"><span class="lbl">•</span><span class="txt">eins</span></div>');
});

test('Leerzeilen bleiben als Abstand erhalten, Zeilenenden werden vereinheitlicht', () => {
  assert.equal(html('a\r\n\r\nb'), '<div class="ln">a</div><div class="ln blank"><br></div><div class="ln">b</div>');
  assert.equal(html(''), '<div class="ln blank"><br></div>');
  assert.equal(html(null), '<div class="ln blank"><br></div>');
});

test('Platzhalter-Zeichen im Eingabetext können keine Formel einschleusen', () => {
  assert.equal(html('x0y'), '<div class="ln">x0y</div>');
});

test('splitMath liefert die Stücke in Reihenfolge', () => {
  assert.deepEqual(splitMath('a $b$ c'), [
    { type: 'text', value: 'a ' },
    { type: 'math', latex: 'b', display: false },
    { type: 'text', value: ' c' },
  ]);
});
