// Tests für die Geometrie-Aufgaben (reine Textaufgaben). Die allgemeinen Prüfungen in generators.test.mjs
// erfassen alle Typen zusätzlich (saubere Aufgaben, extreme Einstellungen, KaTeX in den Browsertests).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGenerator, normalizeParams, rollItems } from '../src/generators/index.js';

const seedsOf = (n) => Array.from({ length: n }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0);

function roll(type, overrides = {}, n = 150) {
  const def = getGenerator(type);
  const spec = { type, params: normalizeParams(def, overrides), count: 1, layout: 'parts' };
  const items = seedsOf(n).map((seed) => rollItems(spec, [seed])[0]);
  assert.ok(items.every(Boolean), `${type}: Aufgabe fehlt bei ${JSON.stringify(overrides)}`);
  return items;
}

const parseDE = (s) => Number(String(s).replace(/\\,/g, '').replace(',', '.'));
/** Letzte Zahl der Lösung, vor „π“ oder der Einheit: „… = 113,04\,\text{cm}^{2}“ -> 113.04, „… = 36\pi\,\text{cm}“ -> 36. */
function answerOf(solution) {
  const m = solution.match(/= ([\d\\,]+(?:,\d+)?)(\\pi)?\\,\\text\{[a-z]+\}(?:\^\{\d\})?\$$/);
  assert.ok(m, solution);
  return { value: parseDE(m[1]), pi: Boolean(m[2]) };
}
const close = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

test('Rechteck und Quadrat: Fläche, Umfang und rückwärts gerechnete Seite stimmen', () => {
  const seen = new Set();
  for (const reverse of [false, true]) {
    for (const figure of ['rect', 'square', 'mixed']) {
      for (const ask of ['area', 'perimeter', 'mixed']) {
        for (const it of roll('geo-rect', { figure, ask, reverse, sideMax: 12, unit: 'm' }, 80)) {
          const { fig, ask: a, a: x, b: y, r } = it.data;
          seen.add(`${it.data.reverse}/${fig}/${a}`);
          if (fig === 'square') assert.equal(x, y);
          assert.ok(x >= 2 && x <= 12 && y >= 2 && y <= 12);
          if (!it.data.reverse) {
            assert.equal(r, a === 'area' ? x * y : 2 * (x + y));
            assert.equal(answerOf(it.solution).value, r);
            assert.ok(it.text.endsWith(a === 'area' ? ': Flächeninhalt' : ': Umfang'), it.text);
          } else {
            assert.equal(r, y);
            const total = a === 'area' ? x * y : 2 * (x + y);
            assert.equal(it.data.given, total);
            assert.equal(answerOf(it.solution).value, y);
          }
          assert.ok(it.solution.includes('\\text{m}'), 'Einheit wird übernommen');
          assert.ok(it.text.includes('\\text{m}'));
          assert.equal(it.data.reverse, it.data.reverse && reverse);
        }
      }
    }
  }
  assert.ok(seen.size >= 8, [...seen].join(' '));
});

test('Dreieck, Parallelogramm, Trapez und Kreis: Flächen und Umfang, ganzzahlig, π oder 3,14', () => {
  const shapes = new Set();
  for (const pi of ['pi', '314']) {
    const items = roll('geo-shapes', { shape: 'mixed', pi, sideMax: 12 }, 300);
    for (const it of items) {
      const d = it.data;
      shapes.add(d.shape);
      const { value, pi: hasPi } = answerOf(it.solution);
      if (d.shape === 'parallelogram') assert.equal(d.r, d.g * d.h);
      else if (d.shape === 'triangle') {
        assert.equal((d.g * d.h) % 2, 0);
        assert.equal(d.r, (d.g * d.h) / 2);
      } else if (d.shape === 'trapezoid') {
        assert.notEqual(d.a, d.c);
        assert.equal(((d.a + d.c) * d.h) % 2, 0);
        assert.equal(d.r, ((d.a + d.c) * d.h) / 2);
      } else {
        assert.ok(d.r >= 1 && d.r <= 6);
        assert.equal(d.K, d.ask === 'area' ? d.r * d.r : 2 * d.r);
        assert.equal(hasPi, pi === 'pi');
        assert.ok(close(value, pi === 'pi' ? d.K : d.K * 3.14), `${it.solution}`);
        assert.equal(it.text.includes(`d = ${2 * d.r}`), d.d, it.text);
        continue;
      }
      assert.equal(value, d.r);
      assert.equal(hasPi, false);
    }
  }
  assert.deepEqual([...shapes].sort(), ['circle', 'parallelogram', 'trapezoid', 'triangle']);
});

test('Volumen und Oberfläche: Quader, Würfel, Prisma, Zylinder', () => {
  const solids = new Set();
  for (const pi of ['pi', '314']) {
    for (const ask of ['volume', 'surface', 'mixed']) {
      for (const it of roll('geo-volume', { solid: 'mixed', ask, pi, sideMax: 10 }, 200)) {
        const d = it.data;
        solids.add(`${d.solid}/${d.ask}`);
        const { value, pi: hasPi } = answerOf(it.solution);
        if (d.solid === 'cuboid') {
          assert.equal(d.r, d.ask === 'volume' ? d.a * d.b * d.c : 2 * (d.a * d.b + d.a * d.c + d.b * d.c));
          assert.equal(value, d.r);
        } else if (d.solid === 'cube') {
          assert.equal(d.r, d.ask === 'volume' ? d.a ** 3 : 6 * d.a * d.a);
          assert.equal(value, d.r);
        } else if (d.solid === 'prism') {
          assert.equal(d.ask, 'volume');
          assert.equal(d.r, d.G * d.h);
          assert.equal(value, d.r);
        } else {
          assert.ok(d.r >= 1 && d.r <= 10);
          assert.equal(d.K, d.ask === 'volume' ? d.r * d.r * d.h : 2 * d.r * (d.r + d.h));
          assert.equal(hasPi, pi === 'pi');
          assert.ok(close(value, pi === 'pi' ? d.K : d.K * 3.14), it.solution);
        }
        if (d.solid !== 'cylinder') assert.equal(hasPi, false);
        assert.ok(it.solution.includes(d.ask === 'volume' ? '^{3}' : '^{2}'), it.solution);
      }
    }
  }
  assert.ok(['cuboid/volume', 'cuboid/surface', 'cube/volume', 'cube/surface', 'prism/volume', 'cylinder/volume', 'cylinder/surface'].every((k) => solids.has(k)), [...solids].join(' '));
});

test('Winkel: Summen stimmen, Schrittweite wird eingehalten, Winkel bleiben sinnvoll', () => {
  const kinds = new Set();
  for (const step of ['1', '5', '10']) {
    for (const it of roll('geo-angles', { kind: 'mixed', step }, 200)) {
      const d = it.data;
      kinds.add(d.kind);
      const all = [...d.given, ...d.r];
      if (d.kind === 'vertical') {
        assert.equal(d.r[0], 180 - d.given[0]);
        assert.equal(d.r[1], d.given[0]);
      } else {
        assert.equal(all.reduce((s, x) => s + x, 0), d.total);
      }
      for (const x of all) {
        assert.ok(x > 0 && x < 180, `${x}`);
        assert.equal(x % Number(step), 0, `${x} mit Schritt ${step}`);
      }
      if (d.kind === 'adjacent' || d.kind === 'vertical') assert.notEqual(d.given[0], 90); // 90° wäre keine Rechnung
      assert.ok(it.solution.includes(`${d.r[0]}^\\circ`));
    }
  }
  assert.deepEqual([...kinds].sort(), ['adjacent', 'quad', 'triangle', 'vertical']);
});

test('Satz des Pythagoras: pythagoreische Tripel, Ergebnis ganzzahlig, Zahlenraum eingehalten', () => {
  for (const ask of ['hyp', 'leg', 'mixed']) {
    for (const maxSide of [5, 13, 50, 100]) {
      const items = roll('geo-pythagoras', { ask, maxSide }, 100);
      for (const it of items) {
        const { a, b, c, r } = it.data;
        assert.equal(a * a + b * b, c * c);
        assert.ok(c <= maxSide && a >= 3 && b >= 3);
        assert.equal(r, it.data.ask === 'hyp' ? c : b);
        assert.equal(answerOf(it.solution).value, r);
        assert.ok(it.text.includes(it.data.ask === 'hyp' ? 'Hypotenuse $c$' : 'Kathete $b$'));
      }
    }
  }
});

test('Geometrie: die Einheit ist einstellbar und steht überall gleich', () => {
  for (const unit of ['mm', 'cm', 'dm', 'm']) {
    for (const type of ['geo-rect', 'geo-shapes', 'geo-volume', 'geo-pythagoras']) {
      for (const it of roll(type, { unit }, 20)) {
        const units = new Set([...(it.text + it.solution).matchAll(/\\text\{([a-z]+)\}/g)].map((m) => m[1]));
        assert.deepEqual([...units], [unit], `${type}: ${it.text}`);
      }
    }
  }
});
