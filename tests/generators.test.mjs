import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitMath } from '../src/markup.js';
import {
  GENERATORS,
  buildTasks,
  checkSpec,
  defaultSpec,
  describeSpec,
  generateTasks,
  generatorGroups,
  getGenerator,
  normalizeParams,
  normalizeSpec,
  paramVisible,
  rollItems,
  rollTask,
  specsEqual,
  taskCount,
} from '../src/generators/index.js';
import { fmtScaled, group, randScaled } from '../src/generators/numfmt.js';
import { gcd, lcm, makeRng } from '../src/generators/rng.js';

const seedsOf = (n, offset = 0) => Array.from({ length: n }, (_, i) => Math.imul(i + 1 + offset, 2654435761) >>> 0);

/** Würfelt n Aufgaben eines Typs mit überschriebenen Einstellungen. */
function roll(type, overrides = {}, n = 120) {
  const def = getGenerator(type);
  const spec = { type, params: normalizeParams(def, overrides), count: n, layout: 'parts' };
  const seeds = seedsOf(n);
  return { spec, params: spec.params, items: seeds.map((seed) => rollItems({ ...spec, count: 1 }, [seed])[0]) };
}

/** Liest eine deutsche Zahl aus Formeltext („12\,345,6“) als JavaScript-Zahl. */
const parseDE = (s) => Number(String(s).replace(/\\,/g, '').replace(',', '.'));
const stripMath = (s) => s.replace(/^\$(\\displaystyle )?/, '').replace(/\$$/, '');

// --- Grundlagen ----------------------------------------------------------------------------
test('Zufall: gleicher Startwert = gleiche Folge, Grenzen werden eingehalten', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seq = Array.from({ length: 20 }, () => a.int(3, 9));
  assert.deepEqual(seq, Array.from({ length: 20 }, () => b.int(3, 9)));
  assert.ok(seq.every((x) => x >= 3 && x <= 9));
  assert.ok(new Set(seq).size > 3);
  assert.equal(makeRng(1).int(5, 5), 5);
  assert.equal(makeRng(1).int(7, 3), 7);
  assert.notDeepEqual(
    Array.from({ length: 10 }, () => makeRng(1).next()),
    Array.from({ length: 10 }, () => makeRng(2).next()),
  );
  assert.equal(gcd(12, 18), 6);
  assert.equal(lcm(4, 6), 12);
});

test('Zufall: auch fortlaufende Startwerte (1, 2, 3 …) ergeben gut gemischte Werte', () => {
  const counts = [0, 0, 0];
  const firstThenSecond = new Set();
  for (let seed = 1; seed <= 600; seed += 1) {
    const rng = makeRng(seed);
    counts[rng.int(0, 2)] += 1;
    firstThenSecond.add(`${rng.int(0, 9)}${rng.int(0, 9)}`);
  }
  for (const c of counts) assert.ok(c > 160 && c < 240, `Verteilung ${counts}`);
  assert.ok(firstThenSecond.size > 60);
});

test('Zahlenformat: deutsche Dezimalkommas, Tausendergruppen ab fünf Stellen, Nullen kürzen', () => {
  assert.equal(fmtScaled(345, 2), '3,45');
  assert.equal(fmtScaled(5, 2), '0,05');
  assert.equal(fmtScaled(350, 2), '3,50');
  assert.equal(fmtScaled(350, 2, { trim: true }), '3,5');
  assert.equal(fmtScaled(300, 2, { trim: true }), '3');
  assert.equal(fmtScaled(300, 2, { trim: true, minDigits: 1 }), '3,0');
  assert.equal(fmtScaled(-12, 0), '-12');
  assert.equal(fmtScaled(1234567, 0), '1\\,234\\,567');
  assert.equal(fmtScaled(1234, 0), '1234');
  assert.equal(group('12345'), '12\\,345');
});

test('randScaled: Dezimalzahlen enden nicht auf 0 und bleiben in den Grenzen', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 500; i += 1) {
    const x = randScaled(rng, 10, 995, 2);
    assert.ok(x >= 10 && x <= 995);
    assert.notEqual(x % 10, 0);
  }
  assert.equal(randScaled(rng, 5, 4, 1), null);
});

// --- Einstellungen -------------------------------------------------------------------------
test('normalizeParams: Grenzen, Auswahl, Mehrfachauswahl, Wahrheitswerte, von ≤ bis', () => {
  const def = getGenerator('arith');
  const p = normalizeParams(def, { min: '50', max: 10, decimals: 9, ops: ['mul', 'quatsch'], carry: 'ja', negative: true });
  assert.deepEqual([p.min, p.max], [10, 50]); // vertauscht
  assert.equal(p.decimals, 3);
  assert.deepEqual(p.ops, ['mul']);
  assert.equal(p.carry, false);
  assert.equal(p.negative, true);
  const empty = normalizeParams(def, { ops: [], min: '', max: null, decimals: 'x' });
  assert.deepEqual(empty.ops, ['add', 'sub']);
  assert.equal(empty.min, 1);
  assert.equal(empty.max, 100);
  assert.equal(empty.decimals, 0);
  assert.equal(normalizeParams(getGenerator('round'), { place: 'unsinn' }).place, 'mixed');
});

test('normalizeSpec: unbekannte Typen fallen weg, Anzahl und Darstellung werden korrigiert', () => {
  assert.equal(normalizeSpec(null), null);
  assert.equal(normalizeSpec({ type: 'gibt-es-nicht' }), null);
  assert.equal(normalizeSpec([]), null);
  const s = normalizeSpec({ type: 'fraction-reduce', count: 99, layout: 'komisch', params: { max: 'abc' } });
  assert.equal(s.count, 8);
  assert.equal(s.layout, 'parts');
  assert.equal(s.params.max, 60);
  assert.equal(normalizeSpec({ type: 'arith', count: 0 }).count, 1);
  assert.equal(normalizeSpec({ type: 'arith' }).count, 4);
});

test('Beschreibungen überstehen die Speicherung (JSON) unverändert', () => {
  for (const g of GENERATORS) {
    const spec = defaultSpec(g.id);
    assert.deepEqual(normalizeSpec(JSON.parse(JSON.stringify(spec))), spec, g.id);
    assert.ok(specsEqual(spec, JSON.parse(JSON.stringify(spec))));
  }
});

test('Einstellungen mit Bedingung (when) werden nur angezeigt, wenn sie passen', () => {
  const def = getGenerator('compare');
  const decimals = def.params.find((p) => p.key === 'decimals');
  const maxDen = def.params.find((p) => p.key === 'maxDenominator');
  assert.equal(paramVisible(decimals, { kind: 'decimal' }), true);
  assert.equal(paramVisible(decimals, { kind: 'fraction' }), false);
  assert.equal(paramVisible(maxDen, { kind: 'fraction' }), true);
  assert.equal(paramVisible(def.params[0], { kind: 'x' }), true);
});

test('Typen sind nach Gruppen sortiert, jeder hat Standardwerte und eindeutige Einstellungsnamen', () => {
  assert.ok(generatorGroups().length >= 4);
  for (const g of GENERATORS) {
    const keys = g.params.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, `${g.id}: doppelte Schlüssel`);
    for (const p of g.params) {
      assert.ok(p.label, `${g.id}.${p.key}: Beschriftung fehlt`);
      if (p.kind === 'int') assert.ok(p.default >= p.min && p.default <= p.max, `${g.id}.${p.key}: Standard außerhalb`);
      if (p.kind === 'select') assert.ok(p.options.some(([v]) => v === p.default), `${g.id}.${p.key}: Standard ist keine Option`);
    }
    assert.ok(g.defaults.count >= 1 && g.defaults.count <= 8);
  }
});

// --- Rechnen -------------------------------------------------------------------------------
const ARITH_GRID = [];
for (const decimals of [0, 1, 2, 3]) {
  for (const [min, max] of [[1, 10], [1, 100], [10, 99], [0, 1000]]) {
    for (const ops of [['add'], ['sub'], ['mul'], ['div'], ['add', 'sub', 'mul', 'div']]) {
      for (const resultInRange of [true, false]) ARITH_GRID.push({ decimals, min, max, ops, resultInRange });
    }
  }
}

test('Rechnen: Ergebnisse stimmen, Zahlenraum und Dezimalstellen werden eingehalten', () => {
  let produced = 0;
  for (const cfg of ARITH_GRID) {
    for (const negative of [false, true]) {
      const { params, items } = roll('arith', { ...cfg, negative }, 40);
      const S = 10 ** params.decimals;
      for (const it of items) {
        if (!it) continue;
        produced += 1;
        const { op, a, b, r, d } = it.data;
        assert.equal(d, params.decimals);
        if (op === 'add') assert.equal(r, a + b);
        if (op === 'sub') assert.equal(r, a - b);
        if (op === 'mul') assert.equal(r, a * b);
        if (op === 'div') assert.equal(a, b * r);
        if (op === 'add' || op === 'sub') {
          for (const x of [a, b]) assert.ok(x >= params.min * S && x <= params.max * S, `${op}: ${x} außerhalb`);
          if (params.decimals > 0) assert.ok(a % 10 !== 0 && b % 10 !== 0);
        }
        if (op === 'mul') {
          assert.ok(Number.isInteger(b) && b >= Math.min(2, params.max) && b <= params.max, `Faktor ${b}`);
          if (params.decimals === 0) assert.ok(a >= Math.min(2, params.max) && a <= params.max);
        }
        if (op === 'div') {
          assert.ok(Number.isInteger(b) && b >= 2 && b <= params.max && b >= params.min);
          assert.ok(r >= 1);
        }
        if (params.resultInRange) assert.ok(Math.abs(r) <= params.max * S, `${op}: Ergebnis ${r} größer als Zahlenraum`);
        if (!negative) assert.ok(r >= 0, `${op}: negatives Ergebnis ${r}`);
        // Text und Lösung passen zusammen (unabhängig von data nachgerechnet)
        const [x, y] = stripMath(it.text).split(/ [+\-:]|\\cdot /).map((s) => s.trim());
        assert.ok(x && y);
        assert.match(it.text, /^\$.+\$$/);
        assert.match(it.solution, /^\$.+\$$/);
        const left = parseDE(x);
        const right = parseDE(stripMath(it.text).split(/ (?:\+|-|:|\\cdot) /)[1]);
        const expected = { add: left + right, sub: left - right, mul: left * right, div: left / right }[op];
        assert.ok(Math.abs(parseDE(stripMath(it.solution)) - expected) < 1e-6, `${it.text} = ${it.solution}`);
      }
    }
  }
  assert.ok(produced > 5000, `zu wenige Aufgaben (${produced})`);
});

test('Rechnen: Zehnerübergang nur wenn gewünscht – beim Addieren Übertrag, beim Subtrahieren Entlehnen', () => {
  const { items } = roll('arith', { min: 10, max: 99, ops: ['add', 'sub'], carry: true }, 200);
  assert.ok(items.every(Boolean));
  for (const { data: { op, a, b } } of items) {
    if (op === 'add') assert.ok((a % 10) + (b % 10) >= 10, `${a}+${b}`);
    else assert.ok(a % 10 < b % 10, `${a}-${b}`);
  }
});

test('Rechnen: keine Aufgaben mit 0 oder 1 als Faktor, wenn der Zahlenraum größer ist', () => {
  const { items } = roll('arith', { min: 0, max: 20, ops: ['mul'] }, 200);
  for (const { data } of items) assert.ok(data.a >= 2 && data.b >= 2);
});

test('Rechnen: Hinweise bei unmöglichen Einstellungen, kein Absturz bei extremen Werten', () => {
  assert.match(checkSpec({ type: 'arith', params: { ops: ['mul'], min: 1, max: 1 } }), /mindestens bis 2/);
  assert.match(checkSpec({ type: 'arith', params: { carry: true, min: 1, max: 9 } }), /Zehnerübergang/);
  assert.equal(checkSpec({ type: 'arith', params: {} }), null);
  for (const params of [{ min: 5, max: 5 }, { min: 0, max: 1 }, { min: 1000000, max: 1000000, ops: ['mul'], resultInRange: false }]) {
    const out = generateTasks({ type: 'arith', params, count: 3, layout: 'parts' });
    assert.ok(out.error || out.tasks.length === 1);
  }
});

// --- Brüche --------------------------------------------------------------------------------
test('Brüche kürzen: Zähler/Nenner im Zahlenraum, Lösung vollständig gekürzt und gleichwertig', () => {
  for (const [min, max, improper] of [[2, 60, false], [2, 20, false], [6, 120, true], [4, 12, false]]) {
    const { items } = roll('fraction-reduce', { min, max, improper }, 150);
    for (const it of items) {
      assert.ok(it, `kein Bruch für ${min}–${max}`);
      const { num, den, p, q, k } = it.data;
      assert.ok(num >= min && num <= max && den >= min && den <= max, `${num}/${den}`);
      assert.equal(gcd(p, q), 1);
      assert.equal(num * q, den * p);
      assert.ok(k >= 2);
      assert.ok(den > 1);
      if (!improper) assert.ok(num < den);
      assert.equal(gcd(num, den), k);
      assert.match(it.text, new RegExp(`\\\\frac\\{${num}\\}\\{${den}\\}`));
      assert.match(it.solution, new RegExp(`\\\\frac\\{${p}\\}\\{${q}\\}`));
    }
  }
  assert.match(checkSpec({ type: 'fraction-reduce', params: { min: 2, max: 3 } }), /bis 4/);
});

test('Brüche erweitern: Nenner = Faktor · Nenner, Zähler passend', () => {
  const { items } = roll('fraction-expand', { maxDenominator: 10, maxFactor: 6 }, 100);
  for (const { data: { p, q, k }, text, solution } of items) {
    assert.ok(q >= 2 && q <= 10 && k >= 2 && k <= 6 && p >= 1 && p < q);
    assert.ok(text.includes(`\\frac{\\square}{${k * q}}`));
    assert.ok(solution.includes(`\\frac{${k * p}}{${k * q}}`));
  }
});

test('Brüche addieren/subtrahieren: Ergebnis stimmt, gleich- bzw. ungleichnamig, Differenz positiv', () => {
  for (const kind of ['same', 'different']) {
    for (const op of ['add', 'sub', 'both']) {
      const { items } = roll('fraction-addsub', { kind, op, maxDenominator: 12 }, 120);
      for (const it of items) {
        assert.ok(it, `${kind}/${op}`);
        const { op: o, p1, q1, p2, q2, resN, resD } = it.data;
        if (kind === 'same') assert.equal(q1, q2);
        else assert.notEqual(q1, q2);
        assert.ok(q1 <= 12 && q2 <= 12 && p1 < q1 && p2 < q2);
        const lhs = o === 'add' ? p1 * q2 + p2 * q1 : p1 * q2 - p2 * q1;
        assert.equal(lhs * resD, resN * q1 * q2, `${p1}/${q1} ${o} ${p2}/${q2}`);
        assert.ok(resN > 0);
        if (op !== 'both') assert.equal(o, op);
      }
    }
  }
});

test('Lösungen von Bruchrechnungen sind gekürzt; unechte Brüche zusätzlich als gemischte Zahl', () => {
  const { items } = roll('fraction-addsub', { kind: 'same', op: 'add', maxDenominator: 8 }, 200);
  let sawMixed = false;
  for (const { data: { resN, resD }, solution } of items) {
    const g = gcd(resN, resD);
    const n = resN / g;
    const d = resD / g;
    if (d === 1) assert.match(solution, new RegExp(`^\\$(\\\\displaystyle )?${n}\\$$`));
    else assert.ok(solution.includes(`\\frac{${n}}{${d}}`));
    if (n > d && d > 1) {
      sawMixed = true;
      assert.ok(solution.includes(`${Math.floor(n / d)}\\frac{${n - Math.floor(n / d) * d}}{${d}}`), solution);
    }
  }
  assert.ok(sawMixed);
});

test('Brüche multiplizieren/dividieren: Ergebnis stimmt', () => {
  const { items } = roll('fraction-muldiv', { op: 'both', maxNumber: 9 }, 150);
  const ops = new Set();
  for (const { data: { op, a, b, c, d, resN, resD } } of items) {
    ops.add(op);
    assert.ok(a < b && c < d && b <= 9 && d <= 9);
    if (op === 'mul') assert.equal(resN * b * d, a * c * resD);
    else assert.equal(resN * b * c, a * d * resD);
  }
  assert.deepEqual([...ops].sort(), ['div', 'mul']);
});

test('Gemischte Zahl ↔ unechter Bruch: Umrechnung stimmt in beide Richtungen', () => {
  const { items } = roll('fraction-mixed', { direction: 'both', maxDenominator: 8, maxWhole: 5 }, 120);
  const dirs = new Set();
  for (const { data: { direction, N, q, w, r }, text, solution } of items) {
    dirs.add(direction);
    assert.equal(N, w * q + r);
    assert.ok(r >= 1 && r < q && w >= 1 && w <= 5 && q <= 8);
    assert.equal(gcd(r, q), 1, 'Rest-Bruch ist gekürzt');
    assert.ok(solution.includes(`${w}\\frac{${r}}{${q}}`) && solution.includes(`\\frac{${N}}{${q}}`));
    assert.ok(text.includes('\\square'));
  }
  assert.equal(dirs.size, 2);
});

test('Bruch ↔ Dezimalzahl: exakte Umrechnung mit höchstens den gewählten Dezimalstellen', () => {
  for (const decimals of [1, 2, 3]) {
    const { items } = roll('fraction-decimal', { direction: 'both', decimals }, 120);
    for (const it of items) {
      const { direction, d } = it.data;
      assert.equal(d, decimals);
      if (direction === 'toDecimal') {
        const { num, den, v } = it.data;
        assert.equal(v * den, num * 10 ** d);
        assert.ok(num < den);
        const shown = parseDE(it.solution.split('=')[1].replace('$', '').trim());
        assert.ok(Math.abs(shown - num / den) < 1e-9, it.solution);
      } else {
        const { x, num, den } = it.data;
        assert.equal(gcd(num, den), 1);
        assert.equal(num * 10 ** d, x * den);
        assert.ok(x % 10 !== 0);
      }
    }
  }
});

// --- Dezimalzahlen und Prozent -------------------------------------------------------------
test('Mal/geteilt durch 10, 100, 1000: Ergebnis stimmt, Komma wandert richtig', () => {
  for (const decimals of [0, 1, 2, 3]) {
    const { items } = roll('decimal-shift', { min: 1, max: 1000, decimals, op: 'both', power: 'all' }, 100);
    for (const it of items) {
      const { op, x, d, k } = it.data;
      assert.ok([10, 100, 1000].includes(k));
      const value = x / 10 ** d;
      const expected = op === 'mul' ? value * k : value / k;
      assert.ok(Math.abs(parseDE(stripMath(it.solution)) - expected) < 1e-9, `${it.text} = ${it.solution}`);
      assert.ok(value >= 1 && value <= 1000);
    }
  }
  const only100 = roll('decimal-shift', { power: '100', op: 'mul' }, 30).items;
  assert.ok(only100.every((it) => it.data.k === 100 && it.data.op === 'mul'));
});

test('Prozentrechnung: Werte passen, Ergebnisse haben nie mehr Dezimalstellen als gewählt', () => {
  for (const decimals of [0, 1, 2]) {
    for (const kind of ['value', 'rate', 'base', 'mixed']) {
      for (const percents of ['easy', 'all']) {
        const { items } = roll('percent', { kind, percents, decimals, min: 10, max: 500 }, 60);
        for (const it of items) {
          assert.ok(it, `${kind}/${percents}/${decimals}`);
          const { pct, G, W } = it.data;
          assert.ok(G >= 10 && G <= 500);
          assert.ok(pct >= 1 && pct <= 99);
          assert.equal(W * 100, G * pct * 10 ** decimals);
          assert.ok(W >= 1);
          if (percents === 'easy') assert.ok([1, 5, 10, 20, 25, 50, 75].includes(pct));
        }
      }
    }
  }
  const only = roll('percent', { kind: 'rate' }, 20).items;
  assert.ok(only.every((it) => it.text.startsWith('Wie viel Prozent') && /\\,\\%/.test(it.solution)));
});

// --- Runden, Vergleichen, Einheiten --------------------------------------------------------
test('Runden: kaufmännisch richtig auf die verlangte Stelle, Ergebnis mit passend vielen Stellen', () => {
  for (const [decimals, place] of [[0, 'tens'], [0, 'hundreds'], [0, 'thousands'], [0, 'mixed'], [2, 'tenths'], [3, 'hundredths'], [3, 'mixed'], [4, 'thousandths'], [2, 'tens']]) {
    const { items } = roll('round', { min: 1, max: 10_000, decimals, place }, 80);
    for (const it of items) {
      assert.ok(it, `${decimals}/${place}`);
      const { x, d, r, R, shown, place: key } = it.data;
      if (place !== 'mixed') assert.equal(key, place);
      const digits = { tens: -1, hundreds: -2, thousands: -3, tenths: 1, hundredths: 2, thousandths: 3 }[key];
      const unit = digits < 0 ? 10 ** -digits * 10 ** d : 10 ** (d - digits);
      assert.equal(r % unit, 0);
      assert.ok(Math.abs(r - x) * 2 <= unit, `${x} -> ${r}`);
      if (Math.abs(r - x) * 2 === unit) assert.ok(r > x, 'ab 5 wird aufgerundet');
      assert.equal(shown, Math.max(digits, 0));
      assert.equal(r, R * 10 ** (d - shown));
      assert.ok(x >= 10 ** (digits < 0 ? -digits + d : 0));
      if (d > 0) assert.ok(x % 10 !== 0);
      assert.match(it.solution, new RegExp(`^\\$${shown > 0 ? '[\\d\\\\,]+,\\d{' + shown + '}' : '[\\d\\\\,]+'}\\$$`), it.solution);
    }
  }
});

test('Runden: Hinweise, wenn die Stelle nicht zur Zahl passt', () => {
  assert.match(checkSpec({ type: 'round', params: { place: 'tenths', decimals: 0 } }), /nicht auf Zehntel/);
  assert.match(checkSpec({ type: 'round', params: { place: 'thousands', max: 500 } }), /nicht auf Tausender/);
  assert.match(checkSpec({ type: 'round', params: { max: 5, decimals: 0 } }), /mindestens zwei Stellen/);
  assert.equal(checkSpec({ type: 'round', params: {} }), null);
});

test('Vergleichen: Zeichen stimmt für Zahlen, Dezimalzahlen und Brüche; auch Gleichheit kommt vor', () => {
  for (const kind of ['natural', 'decimal', 'fraction']) {
    const { items } = roll('compare', { kind, min: 0, max: 10, decimals: 2, maxDenominator: 8 }, 300);
    const signs = new Set();
    for (const it of items) {
      assert.ok(it);
      const c = it.data.c;
      signs.add(c);
      if (kind === 'fraction') {
        const { a, q, b, s } = it.data;
        assert.equal(Math.sign(a * s - b * q), c);
        assert.ok(q <= 8 && s <= 8);
      } else {
        assert.equal(Math.sign(it.data.x - it.data.y), c);
      }
      const rel = c < 0 ? '<' : c > 0 ? '>' : '=';
      assert.ok(it.solution.includes(` ${rel} `), it.solution);
      assert.ok(it.text.includes('\\square'));
    }
    assert.deepEqual([...signs].sort(), [-1, 0, 1], kind);
  }
});

test('Einheiten umwandeln: exakt nachgerechnet (mit BigInt), nur abbrechende Dezimalzahlen', () => {
  for (const category of ['length', 'mass', 'time', 'money', 'volume', 'mixed']) {
    for (const decimals of [0, 1, 2]) {
      const { items } = roll('units', { category, min: 1, max: 100, decimals }, 60);
      for (const it of items) {
        assert.ok(it, `${category}/${decimals}`);
        const { from, to, X, d, R, k } = it.data;
        const F = { mm: 1, cm: 10, dm: 100, m: 1000, km: 1e6, mg: 1, g: 1000, kg: 1e6, t: 1e9, s: 1, min: 60, h: 3600, d: 86400, ct: 1, '€': 100, ml: 1, l: 1000, hl: 1e5 };
        // R / 10^k · T · 10^d = X · F   (alles ganzzahlig)
        assert.equal(BigInt(R) * BigInt(F[to]) * BigInt(10 ** d), BigInt(X) * BigInt(F[from]) * BigInt(10 ** k), `${X} ${from} -> ${R} ${to}`);
        assert.ok(R >= 1 && k <= 4);
        assert.notEqual(from, to);
        assert.ok(it.text.includes('\\underline'));
      }
    }
  }
});

// --- Zusammensetzen ------------------------------------------------------------------------
test('Teilaufgaben: eine Aufgabe mit a), b), c) und gesammelten Lösungen', () => {
  const spec = { ...defaultSpec('arith'), count: 3, layout: 'parts' };
  const { tasks, error } = generateTasks(spec, seedsOf(3));
  assert.equal(error, null);
  assert.equal(tasks.length, 1);
  const lines = tasks[0].text.split('\n');
  assert.equal(lines[0], 'Berechne:');
  assert.match(lines[1], /^a\) \$/);
  assert.match(lines[3], /^c\) \$/);
  assert.equal(tasks[0].solution.split('\n').length, 3);
  assert.deepEqual([tasks[0].generator.count, tasks[0].generator.layout], [3, 'parts']);
});

test('Einzelne Aufgaben: jede mit eigener Beschreibung (neu würfelbar)', () => {
  const spec = { ...defaultSpec('fraction-reduce'), count: 4, layout: 'single' };
  const { tasks } = generateTasks(spec, seedsOf(4));
  assert.equal(tasks.length, 4);
  assert.equal(taskCount(spec), 4);
  for (const t of tasks) {
    assert.match(t.text, /^Kürze so weit wie möglich: \$\\displaystyle \\frac\{\d+\}\{\d+\}\$$/);
    assert.deepEqual([t.generator.count, t.generator.layout], [1, 'single']);
    assert.equal(t.generator.type, 'fraction-reduce');
  }
  assert.equal(taskCount({ ...spec, layout: 'parts' }), 1);
});

test('Teilaufgaben mit nur einer Aufgabe zeigen kein „a)“', () => {
  const { tasks } = generateTasks({ ...defaultSpec('arith'), count: 1, layout: 'parts' }, [5]);
  assert.equal(tasks.length, 1);
  assert.doesNotMatch(tasks[0].text, /a\)/);
  assert.equal(tasks[0].generator.layout, 'single');
});

test('Gleicher Startwert = gleiche Aufgaben; neu würfeln liefert andere', () => {
  const spec = defaultSpec('arith');
  const a = generateTasks(spec, [11, 22, 33, 44]).tasks[0];
  const b = generateTasks(spec, [11, 22, 33, 44]).tasks[0];
  assert.deepEqual(a, b);
  const different = new Set(Array.from({ length: 12 }, () => rollTask(spec).text));
  assert.ok(different.size > 6);
});

test('Innerhalb eines Satzes keine doppelten Aufgaben, wenn genug Möglichkeiten da sind', () => {
  let dups = 0;
  for (let i = 0; i < 100; i += 1) {
    const items = rollItems({ ...defaultSpec('arith'), count: 6 }, seedsOf(6, i * 10));
    dups += items.length - new Set(items.map((x) => x.text)).size;
  }
  assert.equal(dups, 0);
  // Zu kleiner Zahlenraum: Wiederholungen sind erlaubt, aber es gibt keine Endlosschleife
  const tiny = rollItems({ type: 'arith', params: { min: 1, max: 2, ops: ['add'] }, count: 8, layout: 'parts' }, seedsOf(8));
  assert.equal(tiny.length, 8);
  assert.ok(tiny.every(Boolean));
});

test('Fehler statt Absturz: unmögliche Einstellungen und kaputte Beschreibungen', () => {
  assert.match(generateTasks({ type: 'nix' }).error, /Unbekannt/);
  const bad = generateTasks({ type: 'round', params: { place: 'thousandths', decimals: 0 }, count: 2, layout: 'parts' });
  assert.ok(bad.error && bad.tasks.length === 0);
  assert.equal(rollTask({ type: 'round', params: { place: 'thousandths', decimals: 0 } }), null);
});

test('Alle Typen: Standardeinstellungen liefern saubere Aufgaben (Text, Lösung, ausgewogene $)', () => {
  for (const g of GENERATORS) {
    for (let n = 0; n < 60; n += 1) {
      const spec = defaultSpec(g.id);
      const { tasks, error } = generateTasks(spec, seedsOf(spec.count, n * 17));
      assert.equal(error, null, g.id);
      assert.equal(tasks.length, 1);
      for (const field of [tasks[0].text, tasks[0].solution]) {
        assert.doesNotMatch(field, /NaN|undefined|Infinity|null|\[object/);
        assert.equal((field.match(/\$/g) ?? []).length % 2, 0, `${g.id}: ungerade $ in ${field}`);
        const parts = splitMath(field);
        assert.ok(parts.some((p) => p.type === 'math'), g.id);
        assert.ok(parts.every((p) => p.type === 'text' || p.latex.trim().length > 0));
      }
      assert.ok(tasks[0].text.length < 400);
    }
  }
});

test('Alle Typen: auch mit extremen Einstellungen kein Absturz (nur Hinweis oder Aufgabe)', () => {
  const rng = makeRng(99);
  for (const g of GENERATORS) {
    for (let n = 0; n < 40; n += 1) {
      const raw = {};
      for (const p of g.params) {
        if (p.kind === 'int') raw[p.key] = rng.chance(0.5) ? p.min : rng.chance(0.5) ? p.max : rng.int(p.min, p.max);
        else if (p.kind === 'bool') raw[p.key] = rng.chance(0.5);
        else if (p.kind === 'select') raw[p.key] = rng.pick(p.options)[0];
        else raw[p.key] = p.options.map(([v]) => v).filter(() => rng.chance(0.6));
      }
      const out = generateTasks({ type: g.id, params: raw, count: rng.int(1, 8), layout: rng.pick(['single', 'parts']) }, seedsOf(8, n));
      assert.ok(out.error || out.tasks.length >= 1, g.id);
    }
  }
});

test('describeSpec nennt Typ, Zahlenraum, Dezimalstellen und Aufbau', () => {
  const spec = { type: 'arith', params: { min: 5, max: 50, decimals: 2 }, count: 4, layout: 'parts' };
  assert.equal(describeSpec(spec), 'Rechnen (+ − · :) · Zahlenraum 5–50 · 2 Dezimalstellen · 4 Teilaufgaben');
  assert.equal(describeSpec({ type: 'fraction-expand', params: {}, count: 1, layout: 'single' }), 'Brüche erweitern · 1 Aufgabe');
  assert.equal(describeSpec({ type: 'fraction-reduce', params: { max: 30 }, count: 3, layout: 'single' }), 'Brüche kürzen · Zahlenraum 2–30 · 3 einzelne Aufgaben');
  assert.equal(describeSpec({ type: 'kaputt' }), 'Unbekannter Aufgabentyp');
  // Dezimalstellen erscheinen nicht, wenn die Einstellung für die Zahlenart gar nicht gilt
  assert.doesNotMatch(describeSpec({ type: 'compare', params: { kind: 'natural', decimals: 3 }, count: 2, layout: 'parts' }), /Dezimalstelle/);
});

test('buildTasks mit leeren Einträgen: nur gültige Aufgaben werden übernommen', () => {
  const spec = { ...defaultSpec('arith'), count: 3 };
  const items = rollItems(spec, seedsOf(3));
  const tasks = buildTasks(spec, [items[0], null, items[2]]);
  assert.equal(tasks.length, 1);
  assert.deepEqual([tasks[0].generator.count], [2]);
});
