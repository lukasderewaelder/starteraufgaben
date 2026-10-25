// Tausendertrenner in Formeln: groupThousands (reine Funktion) und das Zusammenspiel mit dem Dezimalkomma.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultRenderMath, germanDecimal, groupThousands, markupToHtml, setMarkupOptions } from '../src/markup.js';

const g = (s, opts) => groupThousands(s, opts);

test('Tausendertrenner: ab fünf Stellen in Dreierblöcken von rechts', () => {
  assert.equal(g('1000'), '1000');
  assert.equal(g('9999'), '9999');
  assert.equal(g('12345'), '12\\,345');
  assert.equal(g('123456'), '123\\,456');
  assert.equal(g('1234567'), '1\\,234\\,567');
  assert.equal(g('1234567890'), '1\\,234\\,567\\,890');
  assert.equal(g('3 + 12345 - 678'), '3 + 12\\,345 - 678');
  assert.equal(g('-12345'), '-12\\,345');
  assert.equal(g('12345 \\cdot 67890'), '12\\,345 \\cdot 67\\,890');
});

test('Tausendertrenner: Schwelle einstellbar', () => {
  assert.equal(g('1234', { minDigits: 4 }), '1\\,234');
  assert.equal(g('123', { minDigits: 4 }), '123');
  assert.equal(g('1234567', { minDigits: 8 }), '1234567');
});

test('Tausendertrenner: Nachkommastellen bleiben, nur die Ganzzahl wird getrennt', () => {
  assert.equal(g('0,12345'), '0,12345');
  assert.equal(g('12345,67890'), '12\\,345,67890');
  assert.equal(g('1234567,5'), '1\\,234\\,567,5');
  assert.equal(g('3.14159265'), '3.14159265');
  assert.equal(g('0{,}12345'), '0{,}12345');
});

test('Tausendertrenner: Hochzahlen, Indizes, Text, Maße und Wurzelindex bleiben unberührt', () => {
  assert.equal(g('10^{12345}'), '10^{12345}');
  assert.equal(g('a_{12345}'), 'a_{12345}');
  assert.equal(g('x^2 + 12345'), 'x^2 + 12\\,345');
  assert.equal(g('2^\\circ + 12345'), '2^\\circ + 12\\,345');
  assert.equal(g('\\text{Postleitzahl 21423} = 12345'), '\\text{Postleitzahl 21423} = 12\\,345');
  assert.equal(g('\\textbf{12345}'), '\\textbf{12345}');
  assert.equal(g('1\\ \\underline{\\hspace{12345em}}'), '1\\ \\underline{\\hspace{12345em}}');
  assert.equal(g('\\sqrt[12345]{2}'), '\\sqrt[12345]{2}');
  assert.equal(g('\\char"B7 12345'), '\\char"B7 12\\,345');
});

test('Tausendertrenner: Brüche und Klammern werden gruppiert, Zahlen hinter Buchstaben nicht', () => {
  assert.equal(g('\\frac{12345}{67890}'), '\\frac{12\\,345}{67\\,890}');
  assert.equal(g('(12345 + 6789)'), '(12\\,345 + 6789)');
  assert.equal(g('x12345'), 'x12345');
  assert.equal(g('f(12345, 67890)'), 'f(12\\,345, 67\\,890)');
});

test('Tausendertrenner: schon getrennte Zahlen bleiben unverändert, nichts wird doppelt getrennt', () => {
  assert.equal(g('12\\,345'), '12\\,345');
  assert.equal(g('1\\,234\\,567'), '1\\,234\\,567');
  assert.equal(g(g('1234567')), '1\\,234\\,567');
  assert.equal(g('12\\,345678'), '12\\,345678');
});

test('Tausendertrenner: kaputte oder leere Eingaben stürzen nicht ab', () => {
  assert.equal(g(''), '');
  assert.equal(g('\\'), '\\');
  assert.equal(g('\\text{12345'), '\\text{12345');
  assert.equal(g('^'), '^');
  assert.equal(g('a^{12345'), 'a^{12345');
  assert.equal(g('\\sqrt[12345'), '\\sqrt[12345');
  assert.equal(g('{{12345}}'), '{{12\\,345}}');
});

test('Tausendertrenner und Dezimalkomma zusammen: erst trennen, dann Komma setzen', () => {
  assert.equal(germanDecimal(g('12345,5')), '12\\,345{,}5');
  assert.equal(germanDecimal(g('1234567,12')), '1\\,234\\,567{,}12');
});

// --- im Formelsatz --------------------------------------------------------------------------------------------
test('Formelsatz: Option steuert die Trennung (KaTeX nicht geladen: Quelltext bleibt unverändert)', () => {
  assert.equal(defaultRenderMath('12345', false), '$12345$'); // ohne KaTeX
  const calls = [];
  globalThis.katex = {
    renderToString: (latex, opts) => {
      calls.push({ latex, macros: opts.macros });
      return `<m>${latex}</m>`;
    },
  };
  try {
    setMarkupOptions({ thousands: true, matchFont: true });
    assert.equal(markupToHtml('Zahl $12345,5$ und 12345 im Text'), '<div class="ln">Zahl <m>12\\,345{,}5</m> und 12345 im Text</div>');
    assert.deepEqual(Object.keys(calls.at(-1).macros).sort(), ['\\cdot', '\\ne', '\\neq']);

    setMarkupOptions({ thousands: false, matchFont: false });
    assert.equal(markupToHtml('$12345$'), '<div class="ln"><m>12345</m></div>');
    assert.deepEqual(calls.at(-1).macros, {});
  } finally {
    setMarkupOptions({ thousands: true, matchFont: true });
    delete globalThis.katex;
  }
});
