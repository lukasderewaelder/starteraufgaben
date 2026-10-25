// Aufgabentypen „Terme und Gleichungen“. Gleichungen werden rückwärts gebaut: erst die Lösung wählen,
// dann die Gleichung, damit alle Lösungen ganzzahlig sind. data enthält, was die Tests zum Nachrechnen brauchen.
import { boolParam, intParam, item, selectParam } from './helpers.js';
import { math } from './numfmt.js';
import { gcd } from './rng.js';
import { SECOND, bracketed, coef, polyTex, termSum } from './termfmt.js';

const GROUP = 'Terme und Gleichungen';
const VARIABLES = [['x', 'x'], ['a', 'a'], ['n', 'n'], ['y', 'y']];
const variableParam = () => selectParam('variable', 'Variable', VARIABLES, 'x');
const gcdAll = (list) => list.reduce((g, n) => gcd(g, n), 0);

/** Zufälliges Vorzeichen: immer +, wenn negative Zahlen nicht erlaubt sind. */
const sign = (rng, allowNegative) => (allowNegative && rng.chance(0.5) ? -1 : 1);
const nonZero = (rng, max, allowNegative) => sign(rng, allowNegative) * rng.int(1, max);

// --- Terme vereinfachen ------------------------------------------------------------------------
const termSimplify = {
  id: 'term-simplify',
  group: GROUP,
  grades: '5–8',
  label: 'Terme zusammenfassen',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    variableParam(),
    intParam('terms', 'Anzahl der Glieder', 4, 3, 6),
    intParam('coefMax', 'Größte Zahl', 9, 2, 20),
    boolParam('constants', 'Mit Zahlen ohne Variable (z. B. + 4)', true),
    boolParam('twoVars', 'Zwei Variablen (z. B. x und y)', false),
    boolParam('minus', 'Mit Minus (Subtraktion)', false),
  ],
  instruction: () => 'Fasse so weit wie möglich zusammen:',
  item(rng, p) {
    const names = p.twoVars ? [p.variable, SECOND[p.variable]] : [p.variable];
    const keys = p.constants ? [...names, ''] : names;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const terms = [];
      for (let i = 0; i < p.terms; i += 1) {
        const c = rng.int(1, p.coefMax) * (p.minus && rng.chance(0.4) ? -1 : 1);
        terms.push({ v: rng.pick(keys), c });
      }
      const sums = new Map();
      for (const t of terms) sums.set(t.v, (sums.get(t.v) ?? 0) + t.c);
      if (terms.length <= sums.size) continue; // es muss etwas zusammenzufassen geben
      if ([...sums.values()].some((s) => s === 0)) continue;
      const show = (t) => (t.v ? coef(t.c, t.v) : String(t.c));
      const lhs = termSum(terms.map(show));
      const result = [...names, ''].filter((k) => sums.has(k)).map((k) => show({ v: k, c: sums.get(k) }));
      return item(math(lhs), math(`${lhs} = ${termSum(result)}`), { terms, sums: Object.fromEntries(sums), names });
    }
    return null;
  },
};

// --- Klammern auflösen ---------------------------------------------------------------------------
const termExpand = {
  id: 'term-expand',
  group: GROUP,
  grades: '7–10',
  label: 'Klammern auflösen',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam(
      'kind',
      'Art',
      [['distribute', 'ausmultiplizieren: 3(2x + 5)'], ['product', 'Produkt zweier Klammern: (x + 2)(x - 3)'], ['binomial', 'binomische Formeln'], ['mixed', 'gemischt']],
      'distribute',
    ),
    variableParam(),
    intParam('coefMax', 'Größte Zahl', 9, 2, 12),
    boolParam('leading', 'Auch Faktoren vor der Variablen (z. B. 2x + 3)', false),
    boolParam('negative', 'Mit negativen Zahlen', false),
  ],
  instruction: (p) => (p.kind === 'binomial' ? 'Löse die Klammern auf:' : 'Löse die Klammern auf und fasse zusammen:'),
  item(rng, p) {
    const v = p.variable;
    const kind = rng.pick(p.kind === 'mixed' ? ['distribute', 'product', 'binomial'] : [p.kind]);
    const lead = () => (p.leading ? rng.int(1, 3) : 1);
    const lin = (a, b) => polyTex([a, b], v);
    if (kind === 'distribute') {
      const a = rng.int(2, p.coefMax) * sign(rng, p.negative);
      const b = p.leading ? rng.int(1, p.coefMax) : 1;
      const c = nonZero(rng, p.coefMax, p.negative);
      const lhs = `${a}(${lin(b, c)})`;
      const result = [a * b, a * c];
      return item(math(lhs), math(`${lhs} = ${polyTex(result, v)}`), { kind, factors: [[a], [b, c]], result });
    }
    if (kind === 'product') {
      const [p1, q1] = [lead(), lead()];
      const a = nonZero(rng, p.coefMax, p.negative);
      const b = nonZero(rng, p.coefMax, p.negative);
      const lhs = `(${lin(p1, a)})(${lin(q1, b)})`;
      const result = [p1 * q1, p1 * b + q1 * a, a * b];
      return item(math(lhs), math(`${lhs} = ${polyTex(result, v)}`), { kind, factors: [[p1, a], [q1, b]], result });
    }
    const k = lead();
    const a = rng.int(1, p.coefMax);
    const mode = rng.pick(['plus', 'minus', 'diff']);
    if (mode === 'diff') {
      const lhs = `(${lin(k, a)})(${lin(k, -a)})`;
      const result = [k * k, 0, -a * a];
      return item(math(lhs), math(`${lhs} = ${polyTex(result, v)}`), { kind, factors: [[k, a], [k, -a]], result });
    }
    const s = mode === 'plus' ? a : -a;
    const lhs = `(${lin(k, s)})^2`;
    const result = [k * k, 2 * k * s, s * s];
    return item(math(lhs), math(`${lhs} = ${polyTex(result, v)}`), { kind, factors: [[k, s], [k, s]], result });
  },
};

// --- Ausklammern ---------------------------------------------------------------------------------
const termFactor = {
  id: 'term-factor',
  group: GROUP,
  grades: '7–9',
  label: 'Ausklammern',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    variableParam(),
    selectParam('parts', 'Glieder', [['two', 'zwei (6x + 9)'], ['three', 'drei (6x² + 9x + 3)']], 'two'),
    intParam('maxFactor', 'Größter Faktor', 8, 2, 12),
    boolParam('negative', 'Mit negativen Zahlen', false),
  ],
  instruction: () => 'Klammere den größtmöglichen gemeinsamen Faktor aus:',
  item(rng, p) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const g = rng.int(2, p.maxFactor);
      const inner =
        p.parts === 'three'
          ? [rng.int(1, 3), nonZero(rng, 6, p.negative), nonZero(rng, 6, p.negative)]
          : [rng.int(1, 6), nonZero(rng, 6, p.negative)];
      if (gcdAll(inner) !== 1) continue;
      const expanded = inner.map((c) => g * c);
      const lhs = polyTex(expanded, p.variable);
      return item(math(lhs), math(`${lhs} = ${g}(${polyTex(inner, p.variable)})`), { g, inner, expanded });
    }
    return null;
  },
};

// --- Terme berechnen -------------------------------------------------------------------------------
const termEvaluate = {
  id: 'term-evaluate',
  group: GROUP,
  grades: '6–8',
  label: 'Termwerte berechnen',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    selectParam('kind', 'Term', [['linear', 'ax + b'], ['two', 'ax + by (zwei Variablen)'], ['quadratic', 'ax² + bx + c']], 'linear'),
    variableParam(),
    intParam('coefMax', 'Größte Zahl im Term', 9, 2, 12),
    intParam('valMax', 'Größter Wert der Variablen', 5, 1, 12),
    boolParam('negative', 'Negative Werte und Zahlen', false),
  ],
  instruction: () => 'Berechne den Wert des Terms:',
  item(rng, p) {
    const v = p.variable;
    const w = SECOND[v];
    const value = () => nonZero(rng, p.valMax, p.negative);
    const mul = (c, x, power = '') => (c === 1 ? `${bracketed(x)}${power}` : `${c} \\cdot ${bracketed(x)}${power}`);
    if (p.kind === 'linear') {
      const a = rng.int(2, p.coefMax);
      const b = nonZero(rng, p.coefMax, p.negative);
      const x = value();
      const r = a * x + b;
      return item(`${math(polyTex([a, b], v))} für ${math(`${v} = ${x}`)}`, math(`${termSum([mul(a, x), String(b)])} = ${r}`), { kind: p.kind, a, b, x, r });
    }
    if (p.kind === 'two') {
      const a = rng.int(2, p.coefMax);
      const b = nonZero(rng, p.coefMax, p.negative);
      const [x, y] = [value(), value()];
      const r = a * x + b * y;
      const lhs = termSum([coef(a, v), coef(b, w)]);
      return item(`${math(lhs)} für ${math(`${v} = ${x}`)} und ${math(`${w} = ${y}`)}`, math(`${termSum([mul(a, x), mul(b, y)])} = ${r}`), { kind: p.kind, a, b, x, y, r });
    }
    const a = rng.int(1, 4);
    const b = nonZero(rng, p.coefMax, p.negative);
    const c = nonZero(rng, p.coefMax, p.negative);
    const x = value();
    const r = a * x * x + b * x + c;
    const shown = termSum([mul(a, x, '^2'), mul(b, x), String(c)]);
    return item(`${math(polyTex([a, b, c], v))} für ${math(`${v} = ${x}`)}`, math(`${shown} = ${r}`), { kind: p.kind, a, b, c, x, r });
  },
};

// --- Lineare Gleichungen ---------------------------------------------------------------------------
const LEVELS = ['one', 'two', 'both', 'brackets'];

const equationLinear = {
  id: 'equation-linear',
  group: GROUP,
  grades: '5–9',
  label: 'Gleichungen lösen',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    selectParam(
      'level',
      'Niveau',
      [
        ['placeholder', 'Platzhalter (□ + 7 = 15)'],
        ['one', 'ein Schritt (x + 7 = 15)'],
        ['two', 'zwei Schritte (3x + 7 = 25)'],
        ['both', 'Variable auf beiden Seiten (5x + 3 = 2x + 15)'],
        ['brackets', 'mit Klammern (3(x + 2) = 21)'],
        ['mixed', 'gemischt (ohne Platzhalter)'],
      ],
      'two',
    ),
    variableParam(),
    intParam('solMax', 'Größte Lösung', 12, 2, 50),
    intParam('coefMax', 'Größte Zahl in der Gleichung', 9, 2, 12),
    boolParam('negative', 'Negative Lösungen und Zahlen', false),
  ],
  instruction: (p) => (p.level === 'placeholder' ? 'Welche Zahl gehört in das Kästchen?' : 'Löse die Gleichung:'),
  item(rng, p) {
    const v = p.variable;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const level = p.level === 'mixed' ? rng.pick(LEVELS) : p.level;
      const s = nonZero(rng, p.solMax, level !== 'placeholder' && p.negative);
      const a = rng.int(2, p.coefMax);
      const b = nonZero(rng, p.coefMax, true); // Vorzeichen des Zusatzgliedes ist frei, nur die Lösung steuert „negative“
      let text;
      let eq; // la·s + lb = (ra·s + rb)·k – für die Tests
      if (level === 'placeholder') {
        const kind = rng.pick(['add', 'sub', 'subr', 'mul', 'div']);
        const box = '\\square';
        if (kind === 'add') {
          const r = s + a;
          text = rng.chance(0.5) ? `${box} + ${a} = ${r}` : `${a} + ${box} = ${r}`;
          eq = [1, a, 0, r, 1];
        } else if (kind === 'sub') {
          if (s < 2) continue;
          const c = rng.int(1, Math.min(p.coefMax, s - 1));
          text = `${box} - ${c} = ${s - c}`;
          eq = [1, -c, 0, s - c, 1];
        } else if (kind === 'subr') {
          text = `${a + s} - ${box} = ${a}`;
          eq = [-1, a + s, 0, a, 1];
        } else if (kind === 'mul') {
          text = rng.chance(0.5) ? `${a} \\cdot ${box} = ${a * s}` : `${box} \\cdot ${a} = ${a * s}`;
          eq = [a, 0, 0, a * s, 1];
        } else {
          const r = rng.int(1, Math.max(1, Math.floor(p.solMax / a))); // Lösung = a · r
          return item(math(`${box} : ${a} = ${r}`), math(`\\square = ${a * r}`), { level, s: a * r, eq: [1, 0, 0, r, a] });
        }
        return item(math(text), math(`\\square = ${s}`), { level, s, eq });
      }
      if (level === 'one') {
        const kind = rng.pick(['add', 'sub', 'mul', 'div']);
        if (kind === 'add') {
          text = `${v} + ${Math.abs(b)} = ${s + Math.abs(b)}`;
          eq = [1, Math.abs(b), 0, s + Math.abs(b), 1];
        } else if (kind === 'sub') {
          if (!p.negative && s <= Math.abs(b)) continue;
          text = `${v} - ${Math.abs(b)} = ${s - Math.abs(b)}`;
          eq = [1, -Math.abs(b), 0, s - Math.abs(b), 1];
        } else if (kind === 'mul') {
          text = `${a}${v} = ${a * s}`;
          eq = [a, 0, 0, a * s, 1];
        } else {
          const t = rng.int(1, Math.max(1, Math.floor(p.solMax / a))) * sign(rng, p.negative); // Lösung = a · t
          return item(math(`${v} : ${a} = ${t}`), math(`${v} = ${a * t}`), { level, s: a * t, eq: [1, 0, 0, t, a] });
        }
      } else if (level === 'two') {
        const c = a * s + b;
        if (!p.negative && c < 1) continue;
        text = `${polyTex([a, b], v)} = ${c}`;
        eq = [a, b, 0, c, 1];
      } else if (level === 'both') {
        const c = rng.int(1, a - 1);
        const d = b + (a - c) * s;
        if (!p.negative && d < 1) continue;
        const left = polyTex([a, b], v);
        const right = polyTex([c, d], v);
        const mirror = rng.chance(0.3);
        text = mirror ? `${right} = ${left}` : `${left} = ${right}`;
        eq = mirror ? [c, d, a, b, 1] : [a, b, c, d, 1];
      } else if (rng.chance(0.5)) {
        const c = a * (s + b);
        if (c === 0 || (!p.negative && c < 1)) continue;
        text = `${a}(${polyTex([1, b], v)}) = ${c}`;
        eq = [a, a * b, 0, c, 1];
      } else {
        const c = nonZero(rng, p.coefMax, p.negative);
        const e = a * (s + b) + c;
        if (!p.negative && e < 1) continue;
        text = `${termSum([`${a}(${polyTex([1, b], v)})`, String(c)])} = ${e}`;
        eq = [a, a * b + c, 0, e, 1];
      }
      return item(math(text), math(`${v} = ${s}`), { level, s, eq });
    }
    return null;
  },
};

// --- Quadratische Gleichungen ----------------------------------------------------------------------
const equationQuadratic = {
  id: 'equation-quadratic',
  group: GROUP,
  grades: '9–10',
  label: 'Quadratische Gleichungen',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam(
      'kind',
      'Art',
      [['pure', 'x² = 49'], ['factored', '(x - 3)(x + 5) = 0'], ['general', 'x² + 2x - 15 = 0'], ['mixed', 'gemischt']],
      'factored',
    ),
    intParam('rootMax', 'Größte Lösung (Betrag)', 9, 2, 15),
  ],
  instruction: () => 'Löse die Gleichung:',
  item(rng, p) {
    const kind = rng.pick(p.kind === 'mixed' ? ['pure', 'factored', 'general'] : [p.kind]);
    const answer = (roots) => {
      const [r1, r2] = [...roots].sort((a, b) => a - b);
      return math(`x_1 = ${r1},\\ x_2 = ${r2}`);
    };
    if (kind === 'pure') {
      const s = rng.int(2, p.rootMax);
      const a = rng.chance(0.3) ? rng.int(2, 4) : 1;
      return item(math(`${a === 1 ? '' : a}x^2 = ${a * s * s}`), answer([s, -s]), { kind, roots: [s, -s], coefs: [a, 0, -a * s * s] });
    }
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const r1 = nonZero(rng, p.rootMax, true);
      const r2 = nonZero(rng, p.rootMax, true);
      if (r1 === r2 || r1 + r2 === 0) continue;
      const coefs = [1, -(r1 + r2), r1 * r2];
      const text = kind === 'factored' ? `(${polyTex([1, -r1], 'x')})(${polyTex([1, -r2], 'x')}) = 0` : `${polyTex(coefs, 'x')} = 0`;
      return item(math(text), answer([r1, r2]), { kind, roots: [r1, r2], coefs });
    }
    return null;
  },
};

export const TERM_GENERATORS = [termSimplify, termExpand, termFactor, termEvaluate, equationLinear, equationQuadratic];
