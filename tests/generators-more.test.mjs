// Tests für die Aufgabentypen „Terme und Gleichungen“, „Potenzen und Wurzeln“ und „Geometrie“.
// Alle Typen werden zusätzlich von den allgemeinen Prüfungen in generators.test.mjs erfasst.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENERATORS, getGenerator, normalizeParams, rollItems } from '../src/generators/index.js';
import { gcd } from '../src/generators/rng.js';
import { SECOND, bracketed, coef, polyEval, polyTex, termSum } from '../src/generators/termfmt.js';

const seedsOf = (n, offset = 0) => Array.from({ length: n }, (_, i) => Math.imul(i + 1 + offset, 2654435761) >>> 0);

/** Würfelt n Aufgaben eines Typs mit überschriebenen Einstellungen. */
function roll(type, overrides = {}, n = 150) {
  const def = getGenerator(type);
  const spec = { type, params: normalizeParams(def, overrides), count: 1, layout: 'parts' };
  const items = seedsOf(n).map((seed) => rollItems(spec, [seed])[0]);
  assert.ok(items.every(Boolean), `${type}: Aufgabe fehlt bei ${JSON.stringify(overrides)}`);
  return { params: spec.params, items };
}

/** Kein Vorzeichen-Unfug im LaTeX: „+ -“, „1x“, „+ 0“, doppeltes Minus. */
function assertCleanTerms(field) {
  assert.doesNotMatch(field, /\+ -|- -|\+ \+|(^|[^\d.,{^])1[a-z]|\+ 0[^\d,]| 0x|--/, field);
}

const growth = (items) => items.map((it) => it.text + it.solution);

// --- Hilfsfunktionen für Terme ---------------------------------------------------------------------------
test('Termformat: Koeffizienten 1 und -1, Vorzeichen, Nullen, Klammern', () => {
  assert.equal(coef(1, 'x'), 'x');
  assert.equal(coef(-1, 'x'), '-x');
  assert.equal(coef(3, 'x'), '3x');
  assert.equal(termSum(['3x', '-2', '5y']), '3x - 2 + 5y');
  assert.equal(termSum([]), '0');
  assert.equal(polyTex([3, -2, 5], 'x'), '3x^{2} - 2x + 5');
  assert.equal(polyTex([1, 0, -9], 'x'), 'x^{2} - 9');
  assert.equal(polyTex([-1, 4], 'a'), '-a + 4');
  assert.equal(polyTex([0, 0], 'x'), '0');
  assert.equal(bracketed(-3), '(-3)');
  assert.equal(bracketed(3), '3');
  assert.equal(polyEval([2, -3, 1], 4), 21);
  assert.equal(SECOND.x, 'y');
});

test('Alle neuen Typen haben Klassenstufen im Format „5–8“ und gehören zu einer der neuen Gruppen', () => {
  const groups = new Set(['Terme und Gleichungen', 'Potenzen und Wurzeln', 'Geometrie']);
  const added = GENERATORS.filter((g) => groups.has(g.group));
  assert.ok(added.length >= 6);
  for (const g of added) assert.match(g.grades, /^\d{1,2}–\d{1,2}$/, g.id);
});

// --- Terme zusammenfassen ----------------------------------------------------------------------------------
test('Terme zusammenfassen: Ergebnis hat an jeder Stelle denselben Wert, nichts hebt sich auf', () => {
  for (const twoVars of [false, true]) {
    for (const minus of [false, true]) {
      for (const constants of [false, true]) {
        for (const terms of [3, 4, 6]) {
          const { items, params } = roll('term-simplify', { twoVars, minus, constants, terms, coefMax: 9 }, 60);
          for (const it of items) {
            const { terms: list, sums, names } = it.data;
            assert.equal(list.length, terms);
            assert.ok(list.length > Object.keys(sums).length, 'es muss etwas zusammenzufassen geben');
            for (const [x, y] of [[3, -2], [0, 5], [-4, 7]]) {
              const value = (v) => (v === names[0] ? x : v === names[1] ? y : 1);
              const before = list.reduce((acc, t) => acc + t.c * value(t.v), 0);
              const after = Object.entries(sums).reduce((acc, [v, c]) => acc + c * value(v), 0);
              assert.equal(before, after);
            }
            assert.ok(Object.values(sums).every((c) => c !== 0));
            if (!minus) assert.ok(list.every((t) => t.c > 0));
            if (!constants) assert.ok(list.every((t) => t.v));
            assert.ok(it.solution.startsWith(it.text.replace(/\$$/, '')));
          }
          for (const field of growth(items)) assertCleanTerms(field);
          assert.equal(params.terms, terms);
        }
      }
    }
  }
});

// --- Klammern auflösen ------------------------------------------------------------------------------------
test('Klammern auflösen: ausmultipliziertes Ergebnis stimmt an mehreren Stellen', () => {
  const kinds = new Set();
  for (const kind of ['distribute', 'product', 'binomial', 'mixed']) {
    for (const leading of [false, true]) {
      for (const negative of [false, true]) {
        const { items } = roll('term-expand', { kind, leading, negative, coefMax: 9 }, 80);
        for (const it of items) {
          const { factors, result } = it.data;
          kinds.add(it.data.kind);
          for (let x = -4; x <= 4; x += 1) {
            assert.equal(
              factors.reduce((acc, f) => acc * polyEval(f, x), 1) + 0, // + 0 macht aus -0 eine 0
              polyEval(result, x) + 0,
              `${it.text} bei x=${x}`,
            );
          }
          assert.notEqual(result[0], 0);
          if (!negative && kind === 'distribute') assert.ok(result.every((c) => c > 0));
        }
        for (const field of growth(items)) assertCleanTerms(field);
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ['binomial', 'distribute', 'product']);
});

test('Klammern auflösen: Binomische Formeln kommen in allen drei Formen vor', () => {
  const { items } = roll('term-expand', { kind: 'binomial' }, 120);
  const shapes = new Set(items.map((it) => (it.data.result[1] === 0 ? 'diff' : it.data.result[1] > 0 ? 'plus' : 'minus')));
  assert.deepEqual([...shapes].sort(), ['diff', 'minus', 'plus']);
});

// --- Ausklammern ------------------------------------------------------------------------------------------
test('Ausklammern: der Faktor ist der größte gemeinsame Teiler, das Ergebnis multipliziert zurück', () => {
  for (const parts of ['two', 'three']) {
    for (const negative of [false, true]) {
      const { items } = roll('term-factor', { parts, negative, maxFactor: 8 }, 100);
      for (const it of items) {
        const { g, inner, expanded } = it.data;
        assert.ok(g >= 2 && g <= 8);
        assert.equal(inner.length, parts === 'three' ? 3 : 2);
        assert.deepEqual(expanded, inner.map((c) => c * g));
        assert.equal(inner.reduce((acc, c) => gcd(acc, c), 0), 1);
        assert.equal(inner.reduce((acc, c) => gcd(acc, c), 0) * g, expanded.reduce((acc, c) => gcd(acc, c), 0));
        assert.ok(it.solution.includes(`= ${g}(`));
        if (!negative) assert.ok(inner.every((c) => c > 0));
      }
      for (const field of growth(items)) assertCleanTerms(field);
    }
  }
});

// --- Termwerte --------------------------------------------------------------------------------------------
test('Termwerte: eingesetzt und ausgerechnet stimmt; negative Werte stehen in Klammern', () => {
  for (const kind of ['linear', 'two', 'quadratic']) {
    for (const negative of [false, true]) {
      const { items } = roll('term-evaluate', { kind, negative, valMax: 6, coefMax: 9 }, 100);
      let sawNegative = false;
      for (const it of items) {
        const d = it.data;
        const expected = kind === 'linear' ? d.a * d.x + d.b : kind === 'two' ? d.a * d.x + d.b * d.y : d.a * d.x * d.x + d.b * d.x + d.c;
        assert.equal(d.r, expected);
        assert.ok(it.solution.endsWith(`= ${expected}$`), it.solution);
        assert.ok(Math.abs(d.x) >= 1 && Math.abs(d.x) <= 6);
        if (!negative) assert.ok(d.x > 0 && (d.y ?? 1) > 0 && d.b > 0);
        if (d.x < 0) {
          sawNegative = true;
          assert.ok(it.solution.includes(`(${d.x})`), it.solution);
        }
        assert.ok(it.text.includes(` für $`));
      }
      for (const field of growth(items)) assertCleanTerms(field);
      assert.equal(sawNegative, negative, `${kind}/${negative}`);
    }
  }
});

test('Termwerte mit zwei Variablen nennen beide Werte', () => {
  const { items } = roll('term-evaluate', { kind: 'two', variable: 'a' }, 20);
  for (const it of items) assert.match(it.text, /a = -?\d+\$ und \$b = -?\d+\$/);
});

// --- Gleichungen -------------------------------------------------------------------------------------------
test('Gleichungen lösen: die Lösung erfüllt die Gleichung, alle Niveaus, ganzzahlig', () => {
  const levels = new Set();
  for (const level of ['placeholder', 'one', 'two', 'both', 'brackets', 'mixed']) {
    for (const negative of [false, true]) {
      const { items } = roll('equation-linear', { level, negative, solMax: 12, coefMax: 9 }, 150);
      for (const it of items) {
        const { s, eq } = it.data;
        const [la, lb, ra, rb, k] = eq;
        assert.ok(Number.isInteger(s) && s !== 0);
        assert.equal(la * s + lb, (ra * s + rb) * k, `${it.text} mit ${s}`);
        assert.ok(Math.abs(s) <= 12, `Lösung ${s} zu groß`);
        if (!negative || level === 'placeholder') assert.ok(s > 0);
        assert.ok(it.solution.includes(`= ${s}`), it.solution);
        levels.add(it.data.level);
        if (level === 'placeholder') {
          assert.ok(it.text.includes('\\square'));
          assert.ok(it.solution.startsWith('$\\square'));
        } else {
          assert.ok(it.solution.startsWith('$x ='));
        }
        if (!negative && level !== 'placeholder') assert.doesNotMatch(it.text.split('=').slice(1).join('='), /^ -/, it.text);
      }
      for (const field of growth(items)) assertCleanTerms(field);
    }
  }
  assert.deepEqual([...levels].sort(), ['both', 'brackets', 'one', 'placeholder', 'two']);
});

test('Gleichungen lösen: Variable ist wählbar, Gleichung mit Variablen auf beiden Seiten hat zwei Variablenglieder', () => {
  const { items } = roll('equation-linear', { level: 'both', variable: 'n' }, 60);
  for (const it of items) {
    assert.equal((it.text.match(/n/g) ?? []).length, 2, it.text);
    assert.ok(it.data.eq[0] !== it.data.eq[2]);
    assert.ok(it.solution.startsWith('$n ='));
  }
  assert.ok(items.some((it) => it.data.eq[2] === 0) === false);
});

test('Quadratische Gleichungen: beide Lösungen erfüllen sie, die Lösungen sind verschieden', () => {
  const kinds = new Set();
  for (const kind of ['pure', 'factored', 'general', 'mixed']) {
    const { items } = roll('equation-quadratic', { kind, rootMax: 9 }, 100);
    for (const it of items) {
      const { roots, coefs } = it.data;
      kinds.add(it.data.kind);
      assert.notEqual(roots[0], roots[1]);
      for (const r of roots) {
        assert.equal(polyEval(coefs, r), 0, it.text);
        assert.ok(Math.abs(r) <= 9);
      }
      const [r1, r2] = [...roots].sort((a, b) => a - b);
      assert.ok(it.solution.includes(`x_1 = ${r1},\\ x_2 = ${r2}`), it.solution);
    }
    for (const field of growth(items)) assertCleanTerms(field);
  }
  assert.deepEqual([...kinds].sort(), ['factored', 'general', 'pure']);
});
