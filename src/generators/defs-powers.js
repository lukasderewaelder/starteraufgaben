// Aufgabentypen „Potenzen und Wurzeln“. Wurzeln werden rückwärts gebaut (erst das Ergebnis, dann das Radikand),
// damit alles exakt aufgeht. data enthält, was die Tests zum Nachrechnen brauchen.
import { boolParam, fmt, intParam, item, selectParam } from './helpers.js';
import { fmtScaled, group, math } from './numfmt.js';
import { bracketed, coef, termSum } from './termfmt.js';

const GROUP = 'Potenzen und Wurzeln';
const VARIABLES = [['x', 'x'], ['a', 'a'], ['n', 'n'], ['y', 'y']];
const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];
const gap = (em) => `\\underline{\\hspace{${em}em}}`;

// --- Quadrat- und Kubikzahlen, Wurzeln ---------------------------------------------------------------
const squaresRoots = {
  id: 'squares-roots',
  group: GROUP,
  grades: '6–8',
  label: 'Quadratzahlen und Wurzeln',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    selectParam(
      'kind',
      'Aufgaben',
      [['square', 'Quadrieren: n²'], ['sqrt', 'Wurzel ziehen: √'], ['cube', 'Hoch drei: n³'], ['cbrt', 'Dritte Wurzel: ∛'], ['mixed', 'gemischt']],
      'mixed',
    ),
    intParam('baseMax', 'Größte Basis (bei n³ höchstens 12)', 15, 2, 30),
    boolParam('decimal', 'Basis mit einer Dezimalstelle (0,3² = 0,09)', false),
  ],
  instruction: () => 'Berechne:',
  item(rng, p) {
    const kind = rng.pick(p.kind === 'mixed' ? ['square', 'sqrt', 'cube', 'cbrt'] : [p.kind]);
    const cubic = kind === 'cube' || kind === 'cbrt';
    const d = p.decimal ? 1 : 0;
    const base = p.decimal ? rng.int(1, 9) : rng.int(2, cubic ? Math.min(p.baseMax, 12) : p.baseMax);
    const power = cubic ? base ** 3 : base ** 2;
    const b = fmt(base, d);
    const x = fmt(power, d * (cubic ? 3 : 2), { trim: true });
    const e = cubic ? 3 : 2;
    if (kind === 'square' || kind === 'cube') return item(math(`${b}^{${e}}`), math(`${b}^{${e}} = ${x}`), { kind, base, power, d });
    const root = cubic ? `\\sqrt[3]{${x}}` : `\\sqrt{${x}}`;
    return item(math(root), math(`${root} = ${b}`), { kind, base, power, d });
  },
};

// --- Potenzen berechnen -----------------------------------------------------------------------------
const powerEval = {
  id: 'power-eval',
  group: GROUP,
  grades: '7–9',
  label: 'Potenzen berechnen',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    intParam('baseMax', 'Größte Basis', 6, 2, 12),
    intParam('expMax', 'Größter Exponent', 4, 2, 8),
    boolParam('negative', 'Auch negative Basis, z. B. (-2)^3', false),
    boolParam('zeroOne', 'Auch Exponent 0 und 1', false),
  ],
  instruction: () => 'Berechne die Potenz:',
  item(rng, p) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const base = rng.int(2, p.baseMax);
      const exp = rng.int(p.zeroOne ? 0 : 2, p.expMax);
      const signed = p.negative && rng.chance(0.4) ? -base : base;
      const value = signed ** exp;
      if (Math.abs(value) > 100_000) continue;
      const lhs = `${bracketed(signed)}^{${exp}}`;
      return item(math(lhs), math(`${lhs} = ${fmt(value, 0)}`), { base: signed, exp, value });
    }
    return null;
  },
};

// --- Zehnerpotenzen ---------------------------------------------------------------------------------
const powerTen = {
  id: 'power-ten',
  group: GROUP,
  grades: '8–9',
  label: 'Zehnerpotenzen',
  large: false,
  defaults: { count: 4, layout: 'parts' },
  params: [
    selectParam(
      'kind',
      'Aufgaben',
      [['expand', 'ausschreiben: 10⁴ = 10 000'], ['write', 'als Potenz schreiben: 1 000 = 10³'], ['sci', 'Standardschreibweise: 4 500 = 4,5 · 10³'], ['mixed', 'gemischt']],
      'mixed',
    ),
    intParam('expMax', 'Größter Exponent', 6, 2, 9),
    boolParam('negative', 'Auch negative Exponenten (10^-3 = 0,001)', false),
  ],
  instruction: () => 'Ergänze:',
  item(rng, p) {
    const kind = rng.pick(p.kind === 'mixed' ? ['expand', 'write', 'sci'] : [p.kind]);
    const neg = p.negative && rng.chance(0.4);
    if (kind === 'sci') {
      let mant = rng.int(11, 99); // 1,1 … 9,9
      if (mant % 10 === 0) mant += 1; // keine glatten Zehner: 2,0 · 10^n wäre unschön
      const e = rng.int(1, p.expMax) * (neg ? -1 : 1);
      // Zahl = mant · 10^(e-1); bei e ≤ 0 mit 1 - e Dezimalstellen
      const number = e >= 1 ? group(String(mant * 10 ** (e - 1))) : fmtScaled(mant, 1 - e);
      const shown = fmtScaled(mant, 1, { trim: true });
      const lhs = `${number} = ${gap(3)} \\cdot 10^{${gap(2)}}`;
      return item(math(lhs), math(`${number} = ${shown} \\cdot 10^{${e}}`), { kind, mant, e, number });
    }
    const e = rng.int(2, p.expMax) * (neg ? -1 : 1);
    const number = e > 0 ? group(String(10 ** e)) : fmtScaled(1, -e);
    if (kind === 'expand') return item(math(`10^{${e}} = ${gap(5)}`), math(`10^{${e}} = ${number}`), { kind, e, number });
    return item(math(`${number} = 10^{${gap(2)}}`), math(`${number} = 10^{${e}}`), { kind, e, number });
  },
};

// --- Potenzgesetze ---------------------------------------------------------------------------------------
const powerLaws = {
  id: 'power-laws',
  group: GROUP,
  grades: '9–10',
  label: 'Potenzgesetze',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam('kind', 'Gesetz', [['mul', 'aᵐ · aⁿ'], ['div', 'aᵐ : aⁿ'], ['pow', '(aᵐ)ⁿ'], ['mixed', 'gemischt']], 'mixed'),
    selectParam('base', 'Basis', [['variable', 'Variable'], ['number', 'Zahl']], 'variable'),
    selectParam('variable', 'Variable', VARIABLES, 'x', { when: { base: ['variable'] } }),
    intParam('expMax', 'Größter Exponent', 8, 4, 12),
    boolParam('coef', 'Mit Zahlfaktoren, z. B. 3x² · 4x³', false, { when: { base: ['variable'] } }),
  ],
  instruction: (p) => (p.coef && p.base === 'variable' ? 'Fasse zusammen:' : 'Schreibe als eine Potenz:'),
  item(rng, p) {
    const kind = rng.pick(p.kind === 'mixed' ? ['mul', 'div', 'pow'] : [p.kind]);
    const isVar = p.base === 'variable';
    const base = isVar ? p.variable : String(rng.int(2, 9));
    const withCoef = isVar && p.coef;
    const pw = (c, m) => `${withCoef && c !== 1 ? c : ''}${base}^{${m}}`;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (kind === 'mul') {
        const [m, n] = [rng.int(2, p.expMax), rng.int(2, p.expMax)];
        const [c1, c2] = withCoef ? [rng.int(1, 5), rng.int(2, 5)] : [1, 1];
        const lhs = `${pw(c1, m)} \\cdot ${pw(c2, n)}`;
        const r = withCoef ? `${c1 * c2 === 1 ? '' : c1 * c2}${base}^{${m + n}}` : `${base}^{${m + n}}`;
        return item(math(lhs), math(`${lhs} = ${r}`), { kind, m, n, c1, c2, exp: m + n, c: c1 * c2 });
      }
      if (kind === 'div') {
        const n = rng.int(2, p.expMax - 2);
        const m = rng.int(n + 2, p.expMax);
        if (m > p.expMax) continue;
        const [c2, q] = withCoef ? [rng.int(2, 4), rng.int(1, 5)] : [1, 1];
        const c1 = c2 * q;
        const lhs = `${pw(c1, m)} : ${pw(c2, n)}`;
        const r = `${withCoef && q !== 1 ? q : ''}${base}^{${m - n}}`;
        return item(math(lhs), math(`${lhs} = ${r}`), { kind, m, n, c1, c2, exp: m - n, c: q });
      }
      const [m, n] = [rng.int(2, Math.min(p.expMax, 6)), rng.int(2, 3)];
      const c = withCoef ? rng.int(1, 3) : 1;
      const lhs = `(${pw(c, m)})^{${n}}`;
      const r = `${c ** n === 1 ? '' : c ** n}${base}^{${m * n}}`;
      return item(math(lhs), math(`${lhs} = ${r}`), { kind, m, n, c1: c, c2: 1, exp: m * n, c: c ** n });
    }
    return null;
  },
};

// --- Wurzeln vereinfachen ---------------------------------------------------------------------------------
const rootSimplify = {
  id: 'root-simplify',
  group: GROUP,
  grades: '9–10',
  label: 'Wurzeln umformen',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam(
      'kind',
      'Aufgaben',
      [['partial', 'teilweise radizieren: √72 = 6√2'], ['multiply', 'Wurzeln multiplizieren: √2 · √8 = 4'], ['add', 'Wurzeln zusammenfassen: 3√2 + 5√2'], ['mixed', 'gemischt']],
      'partial',
    ),
    intParam('maxFactor', 'Größter Faktor vor der Wurzel', 6, 2, 12),
  ],
  instruction: (p) => ({ partial: 'Ziehe teilweise die Wurzel:', multiply: 'Berechne:', add: 'Fasse zusammen:', mixed: 'Vereinfache:' })[p.kind],
  item(rng, p) {
    const kind = rng.pick(p.kind === 'mixed' ? ['partial', 'multiply', 'add'] : [p.kind]);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const b = rng.pick(SQUAREFREE);
      if (kind === 'partial') {
        const a = rng.int(2, p.maxFactor);
        const lhs = `\\sqrt{${a * a * b}}`;
        return item(math(lhs), math(`${lhs} = ${a}\\sqrt{${b}}`), { kind, a, b, N: a * a * b });
      }
      if (kind === 'multiply') {
        const k1 = rng.int(1, 4);
        const k2 = rng.int(1, 4);
        if (k1 === 1 && k2 === 1) continue;
        const [x, y] = [b * k1 * k1, b * k2 * k2];
        const lhs = `\\sqrt{${x}} \\cdot \\sqrt{${y}}`;
        return item(math(lhs), math(`${lhs} = ${b * k1 * k2}`), { kind, x, y, r: b * k1 * k2 });
      }
      const root = `\\sqrt{${b}}`;
      const c1 = rng.int(1, p.maxFactor);
      const c2 = rng.int(1, p.maxFactor) * (rng.chance(0.4) ? -1 : 1);
      if (c1 + c2 === 0) continue;
      const lhs = termSum([coef(c1, root), coef(c2, root)]);
      return item(math(lhs), math(`${lhs} = ${coef(c1 + c2, root)}`), { kind, b, c1, c2, r: c1 + c2 });
    }
    return null;
  },
};

export const POWER_GENERATORS = [squaresRoots, powerEval, powerTen, powerLaws, rootSimplify];
