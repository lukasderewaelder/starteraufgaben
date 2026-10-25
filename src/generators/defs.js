// Aufgabentypen für Zufallsaufgaben. Jeder Typ beschreibt seine Einstellungen (params) und erzeugt mit
// item(rng, params) eine Aufgabe { text, solution, data } – text/solution enthalten `$…$` für Formeln.
// Rechnen mit Dezimalzahlen geschieht in skalierten Ganzzahlen (siehe numfmt.js).
import { decimalsParam, fmt, intParam, item, pow10, rangeParams } from './helpers.js';
import { frac, fractionResult, math, mixed, randScaled } from './numfmt.js';
import { gcd, lcm } from './rng.js';
import { GEOMETRY_GENERATORS } from './defs-geometry.js';
import { POWER_GENERATORS } from './defs-powers.js';
import { TERM_GENERATORS } from './defs-terms.js';

// --- Rechnen: + − · : -------------------------------------------------------------------------
const arith = {
  id: 'arith',
  group: 'Rechnen',
  label: 'Rechnen (+ − · :)',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    ...rangeParams(1, 100),
    decimalsParam(0),
    {
      key: 'ops',
      kind: 'multi',
      label: 'Rechenarten',
      options: [['add', '+'], ['sub', '−'], ['mul', '·'], ['div', ':']],
      default: ['add', 'sub'],
    },
    { key: 'resultInRange', kind: 'bool', label: 'Ergebnis bleibt im Zahlenraum', default: true },
    { key: 'negative', kind: 'bool', label: 'Negative Ergebnisse erlauben', default: false },
    { key: 'carry', kind: 'bool', label: 'Plus/Minus nur mit Zehnerübergang (ganze Zahlen)', default: false, when: { decimals: [0] } },
  ],
  instruction: () => 'Berechne:',
  check(p) {
    if ((p.ops.includes('mul') || p.ops.includes('div')) && p.max < 2) return 'Für · und : muss der Zahlenraum mindestens bis 2 gehen.';
    if (p.carry && p.decimals === 0 && p.max < 10) return 'Ein Zehnerübergang braucht Zahlen ab 10: Zahlenraum bis mindestens 10.';
    return null;
  },
  item(rng, p) {
    const d = p.decimals;
    const S = pow10(d);
    const lo = Math.ceil(p.min * S);
    const hi = Math.floor(p.max * S);
    const factorLo = Math.max(p.min, p.max >= 2 ? 2 : 1);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const op = rng.pick(p.ops);
      if (op === 'add' || op === 'sub') {
        let a = randScaled(rng, lo, hi, d);
        let b = randScaled(rng, lo, hi, d);
        if (op === 'sub' && a < b && !p.negative) [a, b] = [b, a];
        const r = op === 'add' ? a + b : a - b;
        if (p.resultInRange && Math.abs(r) > hi) continue;
        if (p.carry && d === 0 && (op === 'add' ? (a % 10) + (b % 10) < 10 : a % 10 >= b % 10)) continue;
        return item(math(`${fmt(a, d)} ${op === 'add' ? '+' : '-'} ${fmt(b, d)}`), math(fmt(r, d, { trim: true })), { op, a, b, r, d });
      }
      if (op === 'mul') {
        if (factorLo > p.max) continue;
        if (d === 0) {
          const a = rng.int(factorLo, p.max);
          const bMax = p.resultInRange ? Math.floor(p.max / a) : p.max;
          if (bMax < factorLo) continue;
          let b = rng.int(factorLo, bMax);
          let x = a;
          if (rng.chance(0.5)) [x, b] = [b, x];
          return item(math(`${x} \\cdot ${b}`), math(String(x * b)), { op, a: x, b, r: x * b, d });
        }
        const b = rng.int(factorLo, p.max);
        const aHi = p.resultInRange ? Math.min(hi, Math.floor(hi / b)) : hi;
        const a = randScaled(rng, lo, aHi, d);
        if (a === null || a < 1) continue;
        const r = a * b; // Faktor a hat d Dezimalstellen, b ist ganz -> Ergebnis hat d Stellen
        return item(math(`${fmt(a, d)} \\cdot ${b}`), math(fmt(r, d, { trim: true })), { op, a, b, r, d });
      }
      // Division: Divisor ganz, Quotient (und damit Dividend) mit d Dezimalstellen
      const bLo = Math.max(p.min, 2);
      if (bLo > p.max) continue;
      const b = rng.int(bLo, p.max);
      if (d === 0) {
        const qMin = Math.max(p.min, 1);
        const qMax = p.resultInRange ? Math.floor(p.max / b) : p.max;
        if (qMax < qMin) continue;
        const q = rng.int(qMin, qMax);
        const a = b * q;
        if (a < p.min) continue;
        return item(math(`${a} : ${b}`), math(String(q)), { op, a, b, r: q, d });
      }
      const qHi = p.resultInRange ? Math.floor(hi / b) : hi;
      const q = randScaled(rng, lo, qHi, d);
      if (q === null || q < 1) continue;
      const a = b * q;
      return item(math(`${fmt(a, d)} : ${b}`), math(fmt(q, d, { trim: true })), { op, a, b, r: q, d });
    }
    return null;
  },
};

// --- Brüche ---------------------------------------------------------------------------------
const fractionReduce = {
  id: 'fraction-reduce',
  group: 'Brüche',
  label: 'Brüche kürzen',
  large: true,
  defaults: { count: 3, layout: 'parts' },
  params: [
    ...rangeParams(2, 60, 'Zahlenraum (Zähler und Nenner)'),
    { key: 'improper', kind: 'bool', label: 'Auch unechte Brüche (Zähler größer als Nenner)', default: false },
  ],
  instruction: () => 'Kürze so weit wie möglich:',
  check: (p) => (p.max < 4 ? 'Der Zahlenraum muss mindestens bis 4 gehen (kleinster Bruch: 2/4).' : null),
  item(rng, p) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const q = rng.int(2, Math.floor(p.max / 2));
      const pp = rng.int(1, p.improper ? 2 * q - 1 : q - 1);
      if (gcd(pp, q) !== 1) continue;
      const kMax = Math.floor(p.max / Math.max(q, pp));
      if (kMax < 2) continue;
      const k = rng.int(2, kMax);
      const num = k * pp;
      const den = k * q;
      if (num < p.min || den < p.min) continue;
      return item(math(frac(num, den), true), math(frac(pp, q), true), { num, den, p: pp, q, k });
    }
    return null;
  },
};

const fractionExpand = {
  id: 'fraction-expand',
  group: 'Brüche',
  label: 'Brüche erweitern',
  large: true,
  defaults: { count: 3, layout: 'parts' },
  params: [
    intParam('maxDenominator', 'Größter Nenner', 10, 2, 30),
    intParam('maxFactor', 'Größter Erweiterungsfaktor', 6, 2, 12),
  ],
  instruction: () => 'Erweitere auf den angegebenen Nenner:',
  item(rng, p) {
    const q = rng.int(2, p.maxDenominator);
    const pp = rng.int(1, q - 1);
    const k = rng.int(2, p.maxFactor);
    return item(math(`${frac(pp, q)} = \\frac{\\square}{${k * q}}`, true), math(`${frac(pp, q)} = ${frac(k * pp, k * q)}`, true), { p: pp, q, k });
  },
};

const fractionAddSub = {
  id: 'fraction-addsub',
  group: 'Brüche',
  label: 'Brüche addieren und subtrahieren',
  large: true,
  defaults: { count: 3, layout: 'parts' },
  params: [
    {
      key: 'kind',
      kind: 'select',
      label: 'Nenner',
      options: [['same', 'gleichnamig'], ['different', 'ungleichnamig']],
      default: 'same',
    },
    {
      key: 'op',
      kind: 'select',
      label: 'Rechenart',
      options: [['add', 'Addition'], ['sub', 'Subtraktion'], ['both', 'beides']],
      default: 'both',
    },
    intParam('maxDenominator', 'Größter Nenner', 10, 3, 20),
  ],
  instruction: () => 'Berechne und kürze:',
  item(rng, p) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const op = p.op === 'both' ? rng.pick(['add', 'sub']) : p.op;
      let q1;
      let q2;
      if (p.kind === 'same') {
        q1 = rng.int(3, p.maxDenominator);
        q2 = q1;
      } else {
        q1 = rng.int(2, p.maxDenominator);
        q2 = rng.int(2, p.maxDenominator);
        if (q1 === q2) continue;
      }
      const L = lcm(q1, q2);
      if (L > 60) continue;
      let p1 = rng.int(1, q1 - 1);
      let p2 = rng.int(1, q2 - 1);
      let n1 = (p1 * L) / q1;
      let n2 = (p2 * L) / q2;
      if (op === 'sub') {
        if (n1 === n2) continue;
        if (n1 < n2) {
          [p1, p2] = [p2, p1];
          [q1, q2] = [q2, q1];
          [n1, n2] = [n2, n1];
        }
      }
      const resN = op === 'add' ? n1 + n2 : n1 - n2;
      return item(
        math(`${frac(p1, q1)} ${op === 'add' ? '+' : '-'} ${frac(p2, q2)}`, true),
        math(fractionResult(resN, L, gcd), true),
        { op, p1, q1, p2, q2, resN, resD: L },
      );
    }
    return null;
  },
};

const fractionMulDiv = {
  id: 'fraction-muldiv',
  group: 'Brüche',
  label: 'Brüche multiplizieren und dividieren',
  large: true,
  defaults: { count: 2, layout: 'parts' },
  params: [
    {
      key: 'op',
      kind: 'select',
      label: 'Rechenart',
      options: [['mul', 'Multiplikation'], ['div', 'Division'], ['both', 'beides']],
      default: 'both',
    },
    intParam('maxNumber', 'Größte Zahl in Zähler und Nenner', 9, 3, 20),
  ],
  instruction: () => 'Berechne und kürze:',
  item(rng, p) {
    const op = p.op === 'both' ? rng.pick(['mul', 'div']) : p.op;
    const b = rng.int(2, p.maxNumber);
    const d = rng.int(2, p.maxNumber);
    const a = rng.int(1, b - 1);
    const c = rng.int(1, d - 1);
    const resN = op === 'mul' ? a * c : a * d;
    const resD = op === 'mul' ? b * d : b * c;
    return item(
      math(`${frac(a, b)} ${op === 'mul' ? '\\cdot' : ':'} ${frac(c, d)}`, true),
      math(fractionResult(resN, resD, gcd), true),
      { op, a, b, c, d, resN, resD },
    );
  },
};

const fractionMixed = {
  id: 'fraction-mixed',
  group: 'Brüche',
  label: 'Gemischte Zahl und unechter Bruch',
  large: true,
  defaults: { count: 3, layout: 'parts' },
  params: [
    {
      key: 'direction',
      kind: 'select',
      label: 'Umwandeln',
      options: [['toMixed', 'in gemischte Zahl'], ['toImproper', 'in unechten Bruch'], ['both', 'beides']],
      default: 'both',
    },
    intParam('maxDenominator', 'Größter Nenner', 8, 2, 12),
    intParam('maxWhole', 'Größte ganze Zahl', 5, 1, 20),
  ],
  instruction: () => 'Wandle um:',
  item(rng, p) {
    const direction = p.direction === 'both' ? rng.pick(['toMixed', 'toImproper']) : p.direction;
    const q = rng.int(2, p.maxDenominator);
    let r = rng.int(1, q - 1);
    while (gcd(r, q) !== 1) r = rng.int(1, q - 1); // Rest-Bruch ist schon gekürzt (r = 1 passt immer)
    const w = rng.int(1, p.maxWhole);
    const N = w * q + r;
    if (direction === 'toMixed') {
      return item(math(`${frac(N, q)} = \\square`, true), math(`${frac(N, q)} = ${mixed(w, r, q)}`, true), { direction, N, q, w, r });
    }
    return item(math(`${mixed(w, r, q)} = \\frac{\\square}{${q}}`, true), math(`${mixed(w, r, q)} = ${frac(N, q)}`, true), { direction, N, q, w, r });
  },
};

// Nenner, die in 10, 100 bzw. 1000 aufgehen (= abbrechende Dezimalbrüche mit höchstens d Stellen)
const DENOMINATORS = {
  1: [2, 5, 10],
  2: [2, 4, 5, 10, 20, 25, 50, 100],
  3: [2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 125, 200, 250, 500, 1000],
};

const fractionDecimal = {
  id: 'fraction-decimal',
  group: 'Brüche',
  label: 'Bruch und Dezimalzahl',
  large: true,
  defaults: { count: 3, layout: 'parts' },
  params: [
    {
      key: 'direction',
      kind: 'select',
      label: 'Umwandeln',
      options: [['toDecimal', 'Bruch → Dezimalzahl'], ['toFraction', 'Dezimalzahl → Bruch'], ['both', 'beides']],
      default: 'both',
    },
    intParam('decimals', 'Dezimalstellen', 2, 1, 3),
  ],
  instruction: (p) => (p.direction === 'toDecimal' ? 'Schreibe als Dezimalzahl:' : p.direction === 'toFraction' ? 'Schreibe als gekürzten Bruch:' : 'Wandle um:'),
  item(rng, p) {
    const direction = p.direction === 'both' ? rng.pick(['toDecimal', 'toFraction']) : p.direction;
    const d = p.decimals;
    const S = pow10(d);
    if (direction === 'toDecimal') {
      const den = rng.pick(DENOMINATORS[d]);
      const num = rng.int(1, den - 1);
      const v = (num * S) / den;
      return item(math(`${frac(num, den)} = \\square`, true), math(`${frac(num, den)} = ${fmt(v, d, { trim: true })}`, true), { direction, num, den, v, d });
    }
    const x = randScaled(rng, 1, S - 1, d);
    const g = gcd(x, S);
    return item(
      math(`${fmt(x, d)} = \\square`, true),
      math(`${fmt(x, d)} = ${frac(x / g, S / g)}`, true),
      { direction, x, d, num: x / g, den: S / g },
    );
  },
};

// --- Dezimalzahlen und Prozent --------------------------------------------------------------
const decimalShift = {
  id: 'decimal-shift',
  group: 'Dezimalzahlen und Prozent',
  label: 'Mal und geteilt durch 10, 100, 1000',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    ...rangeParams(1, 1000),
    decimalsParam(2),
    {
      key: 'op',
      kind: 'select',
      label: 'Rechenart',
      options: [['mul', 'mal'], ['div', 'geteilt durch'], ['both', 'beides']],
      default: 'both',
    },
    {
      key: 'power',
      kind: 'select',
      label: 'Stufenzahl',
      options: [['10', '10'], ['100', '100'], ['1000', '1000'], ['all', '10, 100 oder 1000']],
      default: 'all',
    },
  ],
  instruction: () => 'Berechne:',
  item(rng, p) {
    const d = p.decimals;
    const S = pow10(d);
    const x = randScaled(rng, Math.ceil(p.min * S), Math.floor(p.max * S), d);
    if (x === null) return null;
    const e = p.power === 'all' ? rng.int(1, 3) : String(p.power).length - 1;
    const op = p.op === 'both' ? rng.pick(['mul', 'div']) : p.op;
    const k = pow10(e);
    if (op === 'mul') {
      return item(math(`${fmt(x, d)} \\cdot ${k}`), math(fmt(x * k, d, { trim: true })), { op, x, d, k, r: x * k, rd: d });
    }
    return item(math(`${fmt(x, d)} : ${k}`), math(fmt(x, d + e, { trim: true })), { op, x, d, k, r: x, rd: d + e });
  },
};

const PERCENTS_EASY = [1, 5, 10, 20, 25, 50, 75];

const percent = {
  id: 'percent',
  group: 'Dezimalzahlen und Prozent',
  label: 'Prozentrechnung',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    {
      key: 'kind',
      kind: 'select',
      label: 'Gesucht',
      options: [['value', 'Prozentwert'], ['rate', 'Prozentsatz'], ['base', 'Grundwert'], ['mixed', 'gemischt']],
      default: 'value',
    },
    ...rangeParams(10, 500, 'Grundwert'),
    {
      key: 'percents',
      kind: 'select',
      label: 'Prozentsätze',
      options: [['easy', 'einfache (1, 5, 10, 20, 25, 50, 75 %)'], ['all', 'beliebige ganze Zahlen (1–99 %)']],
      default: 'easy',
    },
    decimalsParam(0, 'Dezimalstellen im Prozentwert', 2),
  ],
  instruction: (p) =>
    ({ value: 'Berechne den Prozentwert:', rate: 'Berechne den Prozentsatz:', base: 'Berechne den Grundwert:', mixed: 'Prozentrechnung:' })[p.kind],
  item(rng, p) {
    const d = p.decimals;
    const S = pow10(d);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const kind = p.kind === 'mixed' ? rng.pick(['value', 'rate', 'base']) : p.kind;
      const pct = p.percents === 'easy' ? rng.pick(PERCENTS_EASY) : rng.int(1, 99);
      const G = rng.int(p.min, p.max);
      if ((G * pct * S) % 100 !== 0) continue; // Prozentwert muss mit höchstens d Dezimalstellen aufgehen
      const W = (G * pct * S) / 100; // skaliert mit d
      if (W < 1) continue;
      const pctTex = `${pct}\\,\\%`;
      if (kind === 'value') {
        return item(`${math(pctTex)} von ${math(String(G))}`, math(fmt(W, d, { trim: true })), { kind, pct, G, W, d });
      }
      if (kind === 'rate') {
        return item(`Wie viel Prozent sind ${math(fmt(W, d, { trim: true }))} von ${math(String(G))}?`, math(pctTex), { kind, pct, G, W, d });
      }
      return item(`${math(fmt(W, d, { trim: true }))} sind ${math(pctTex)}. Wie groß ist der Grundwert?`, math(String(G)), { kind, pct, G, W, d });
    }
    return null;
  },
};

// --- Runden, Vergleichen, Einheiten ---------------------------------------------------------
const PLACES = {
  tens: { digits: -1, label: 'Zehner' },
  hundreds: { digits: -2, label: 'Hunderter' },
  thousands: { digits: -3, label: 'Tausender' },
  tenths: { digits: 1, label: 'Zehntel' },
  hundredths: { digits: 2, label: 'Hundertstel' },
  thousandths: { digits: 3, label: 'Tausendstel' },
};

/** Ist Runden auf diese Stelle für eine Zahl mit d Dezimalstellen und dem skalierten Wert x sinnvoll? */
function placeFits(key, x, d) {
  const { digits } = PLACES[key];
  if (digits < 0) return x >= pow10(-digits + d);
  return d >= digits + 1;
}

const round = {
  id: 'round',
  group: 'Runden, Vergleichen, Einheiten',
  label: 'Runden',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    ...rangeParams(1, 10_000),
    decimalsParam(0, 'Dezimalstellen der Zahl', 4),
    {
      key: 'place',
      kind: 'select',
      label: 'Runden auf',
      options: [['mixed', 'gemischt (passend zur Zahl)'], ...Object.entries(PLACES).map(([k, v]) => [k, v.label])],
      default: 'mixed',
    },
  ],
  instruction: (p) => (p.place === 'mixed' ? 'Runde auf die angegebene Stelle:' : `Runde auf ${PLACES[p.place].label}:`),
  check(p) {
    const S = pow10(p.decimals);
    const keys = p.place === 'mixed' ? Object.keys(PLACES) : [p.place];
    const possible = keys.some((k) => placeFits(k, p.max * S, p.decimals));
    if (possible) return null;
    return p.place === 'mixed'
      ? 'Zum Runden braucht die Zahl mindestens zwei Stellen oder zwei Dezimalstellen.'
      : `Mit diesen Einstellungen lässt sich nicht auf ${PLACES[p.place].label} runden (Zahlenraum bzw. Dezimalstellen anpassen).`;
  },
  item(rng, p) {
    const d = p.decimals;
    const S = pow10(d);
    const lo = Math.ceil(p.min * S);
    const hi = Math.floor(p.max * S);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const x = randScaled(rng, lo, hi, d);
      if (x === null) return null;
      const fitting = Object.keys(PLACES).filter((k) => placeFits(k, x, d));
      const key = p.place === 'mixed' ? rng.pick(fitting) : p.place;
      if (!key || !fitting.includes(key)) continue;
      const { digits, label } = PLACES[key];
      const shown = Math.max(digits, 0);
      const unit = digits < 0 ? pow10(-digits) * S : pow10(d - digits);
      const r = Math.floor((2 * x + unit) / (2 * unit)) * unit; // kaufmännisch runden (ab 5 auf)
      const R = r / pow10(d - shown); // skaliert mit `shown` Stellen
      const text = p.place === 'mixed' ? `${math(fmt(x, d))} auf ${label}` : math(fmt(x, d));
      return item(text, math(fmt(R, shown)), { x, d, place: key, r, R, shown });
    }
    return null;
  },
};

const compare = {
  id: 'compare',
  group: 'Runden, Vergleichen, Einheiten',
  label: 'Vergleichen (<, >, =)',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    {
      key: 'kind',
      kind: 'select',
      label: 'Zahlenart',
      options: [['natural', 'natürliche Zahlen'], ['decimal', 'Dezimalzahlen'], ['fraction', 'Brüche']],
      default: 'decimal',
    },
    ...rangeParams(0, 10, 'Zahlenraum'),
    decimalsParam(2, 'Dezimalstellen', 3, { when: { kind: ['decimal'] }, hint: undefined }),
    intParam('maxDenominator', 'Größter Nenner', 8, 2, 20, { when: { kind: ['fraction'] } }),
  ],
  instruction: () => 'Setze <, > oder = ein:',
  item(rng, p) {
    const rel = (c) => (c < 0 ? '<' : c > 0 ? '>' : '=');
    if (p.kind === 'fraction') {
      const q = rng.int(2, p.maxDenominator);
      const a = rng.int(1, q - 1);
      let s = rng.int(2, p.maxDenominator);
      let b;
      if (rng.chance(0.15)) {
        const k = rng.int(2, Math.max(2, Math.floor(p.maxDenominator / q)));
        s = q * k;
        b = a * k;
        if (s > p.maxDenominator) {
          s = rng.int(2, p.maxDenominator);
          b = rng.int(1, s - 1);
        }
      } else {
        b = rng.int(1, s - 1);
      }
      const c = Math.sign(a * s - b * q);
      return item(math(`${frac(a, q)} \\;\\square\\; ${frac(b, s)}`, true), math(`${frac(a, q)} ${rel(c)} ${frac(b, s)}`, true), { a, q, b, s, c });
    }
    const d = p.kind === 'decimal' ? p.decimals : 0;
    const S = pow10(d);
    const lo = Math.ceil(p.min * S);
    const hi = Math.floor(p.max * S);
    const x = randScaled(rng, lo, hi, d);
    if (x === null) return null;
    let y;
    if (rng.chance(0.08)) y = x;
    else if (rng.chance(0.6) && hi > lo) y = randScaled(rng, Math.max(lo, x - 12), Math.min(hi, x + 12), d);
    else y = randScaled(rng, lo, hi, d);
    const c = Math.sign(x - y);
    return item(math(`${fmt(x, d)} \\;\\square\\; ${fmt(y, d)}`), math(`${fmt(x, d)} ${rel(c)} ${fmt(y, d)}`), { x, y, d, c });
  },
};

const UNIT_TABLE = {
  length: { label: 'Längen', units: [['mm', 1], ['cm', 10], ['dm', 100], ['m', 1000], ['km', 1_000_000]] },
  mass: { label: 'Gewichte', units: [['mg', 1], ['g', 1000], ['kg', 1_000_000], ['t', 1_000_000_000]] },
  time: { label: 'Zeit', units: [['s', 1], ['min', 60], ['h', 3600], ['d', 86_400]] },
  money: { label: 'Geld', units: [['ct', 1], ['€', 100]] },
  volume: { label: 'Hohlmaße', units: [['ml', 1], ['l', 1000], ['hl', 100_000]] },
};

/**
 * Der Bruch n/dn als Dezimalzahl mit k Stellen: { k, value } mit value = n/dn · 10^k (ganzzahlig),
 * oder null, wenn die Dezimaldarstellung nicht abbricht.
 */
function asDecimal(n, dn) {
  const g = gcd(n, dn);
  const num = n / g;
  const den = dn / g;
  let rest = den;
  let twos = 0;
  let fives = 0;
  while (rest % 2 === 0) {
    rest /= 2;
    twos += 1;
  }
  while (rest % 5 === 0) {
    rest /= 5;
    fives += 1;
  }
  if (rest !== 1) return null;
  const k = Math.max(twos, fives);
  return { k, value: num * (pow10(k) / den) }; // den teilt 10^k
}

const units = {
  id: 'units',
  group: 'Runden, Vergleichen, Einheiten',
  label: 'Einheiten umwandeln',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    {
      key: 'category',
      kind: 'select',
      label: 'Größen',
      options: [['mixed', 'gemischt'], ...Object.entries(UNIT_TABLE).map(([k, v]) => [k, v.label])],
      default: 'length',
    },
    ...rangeParams(1, 100),
    decimalsParam(0, 'Dezimalstellen der Zahl', 2),
  ],
  instruction: () => 'Wandle um:',
  item(rng, p) {
    const d = p.decimals;
    const S = pow10(d);
    const lo = Math.ceil(p.min * S);
    const hi = Math.floor(p.max * S);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const category = p.category === 'mixed' ? rng.pick(Object.keys(UNIT_TABLE)) : p.category;
      const list = UNIT_TABLE[category].units;
      const [from, F] = rng.pick(list);
      const [to, T] = rng.pick(list);
      if (from === to || Math.max(F, T) / Math.min(F, T) > 1_000_000) continue;
      const X = randScaled(rng, lo, hi, d);
      if (X === null) return null;
      const converted = asDecimal(X * F, S * T);
      if (!converted || converted.k > 4) continue;
      const { k, value: R } = converted;
      if (R < 1 || R > 100_000_000) continue; // weder 0,0000… noch riesig
      const unit = (u) => `\\text{${u}}`;
      return item(
        math(`${fmt(X, d)}\\ ${unit(from)} = \\underline{\\hspace{3em}}\\ ${unit(to)}`),
        math(`${fmt(X, d)}\\ ${unit(from)} = ${fmt(R, k, { trim: true })}\\ ${unit(to)}`),
        { category, from, to, X, d, R, k },
      );
    }
    return null;
  },
};

export const GENERATOR_LIST = [
  arith,
  fractionReduce,
  fractionExpand,
  fractionAddSub,
  fractionMulDiv,
  fractionMixed,
  fractionDecimal,
  decimalShift,
  percent,
  round,
  compare,
  units,
  ...TERM_GENERATORS,
  ...POWER_GENERATORS,
  ...GEOMETRY_GENERATORS,
];
