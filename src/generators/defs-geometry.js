// Aufgabentypen „Geometrie“ – reine Textaufgaben ohne Skizze. Alle Maße sind ganze Zahlen; Kreise rechnen
// entweder „in π“ (36π) oder mit π ≈ 3,14 in skalierten Ganzzahlen, damit nichts gerundet werden muss.
import { boolParam, fmt, intParam, item, selectParam } from './helpers.js';
import { math } from './numfmt.js';
import { gcd } from './rng.js';

const GROUP = 'Geometrie';
const UNITS = [['mm', 'mm'], ['cm', 'cm'], ['dm', 'dm'], ['m', 'm']];
const unitParam = () => selectParam('unit', 'Einheit', UNITS, 'cm');
const piParam = (extra = {}) => selectParam('pi', 'Kreiszahl', [['pi', 'Ergebnis in π (36π)'], ['314', 'mit π ≈ 3,14']], 'pi', extra);

/** Einheit hinter einer Zahl: U('cm') = „\,\text{cm}“, U('cm', 2) = „\,\text{cm}^{2}“. */
const U = (unit, exp = 1) => `\\,\\text{${unit}}${exp > 1 ? `^{${exp}}` : ''}`;
/** Gegebene Größe im Text: „$a = 8\,\text{cm}$“. */
const given = (name, value, unit, exp = 1) => math(`${name} = ${fmt(value, 0)}${U(unit, exp)}`);
const PI = '\\pi';

/** Kreisergebnis K·π als LaTeX („36\pi“) oder, mit π ≈ 3,14, als Dezimalzahl („113,04“). */
const piResult = (K, mode) => (mode === 'pi' ? `${fmt(K, 0)}${PI}` : fmt(K * 314, 2, { trim: true }));
const piFactor = (mode) => (mode === 'pi' ? PI : '3,14');

// --- Rechteck und Quadrat ----------------------------------------------------------------------------------
const geoRect = {
  id: 'geo-rect',
  group: GROUP,
  grades: '5–6',
  label: 'Rechteck und Quadrat',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam('figure', 'Figur', [['rect', 'Rechteck'], ['square', 'Quadrat'], ['mixed', 'gemischt']], 'mixed'),
    selectParam('ask', 'Gesucht', [['area', 'Flächeninhalt'], ['perimeter', 'Umfang'], ['mixed', 'gemischt']], 'mixed'),
    unitParam(),
    intParam('sideMax', 'Größte Seitenlänge', 12, 2, 50),
    boolParam('reverse', 'Auch rückwärts: Fläche bzw. Umfang gegeben, Seite gesucht', false),
  ],
  instruction: () => 'Berechne:',
  item(rng, p) {
    const fig = rng.pick(p.figure === 'mixed' ? ['rect', 'square'] : [p.figure]);
    const ask = rng.pick(p.ask === 'mixed' ? ['area', 'perimeter'] : [p.ask]);
    const reverse = p.reverse && rng.chance(0.4);
    const a = rng.int(2, p.sideMax);
    const b = fig === 'square' ? a : rng.int(2, p.sideMax);
    const name = fig === 'square' ? 'Quadrat' : 'Rechteck';
    const sides = fig === 'square' ? given('a', a, p.unit) : `${given('a', a, p.unit)}, ${given('b', b, p.unit)}`;
    const base = { fig, ask, reverse, a, b };
    if (!reverse) {
      if (ask === 'area') {
        const r = a * b;
        const calc = fig === 'square' ? `${fmt(a, 0)}^{2}` : `${a} \\cdot ${b}`;
        return item(`${name}, ${sides}: Flächeninhalt`, math(`A = ${calc} = ${fmt(r, 0)}${U(p.unit, 2)}`), { ...base, r });
      }
      const r = 2 * (a + b);
      const calc = fig === 'square' ? `4 \\cdot ${a}` : `2 \\cdot (${a} + ${b})`;
      return item(`${name}, ${sides}: Umfang`, math(`u = ${calc} = ${fmt(r, 0)}${U(p.unit)}`), { ...base, r: fig === 'square' ? 4 * a : r });
    }
    if (fig === 'square') {
      if (ask === 'area') {
        return item(`Quadrat, ${given('A', a * a, p.unit, 2)}: Seitenlänge ${math('a')}`, math(`a = \\sqrt{${fmt(a * a, 0)}} = ${a}${U(p.unit)}`), { ...base, given: a * a, r: a });
      }
      return item(`Quadrat, ${given('u', 4 * a, p.unit)}: Seitenlänge ${math('a')}`, math(`a = ${fmt(4 * a, 0)} : 4 = ${a}${U(p.unit)}`), { ...base, given: 4 * a, r: a });
    }
    if (ask === 'area') {
      return item(`Rechteck, ${given('A', a * b, p.unit, 2)}, ${given('a', a, p.unit)}: Seite ${math('b')}`, math(`b = ${fmt(a * b, 0)} : ${a} = ${b}${U(p.unit)}`), { ...base, given: a * b, r: b });
    }
    return item(
      `Rechteck, ${given('u', 2 * (a + b), p.unit)}, ${given('a', a, p.unit)}: Seite ${math('b')}`,
      math(`b = \\frac{${fmt(2 * (a + b), 0)}}{2} - ${a} = ${b}${U(p.unit)}`, true),
      { ...base, given: 2 * (a + b), r: b },
    );
  },
};

// --- Dreieck, Parallelogramm, Trapez, Kreis ---------------------------------------------------------------------
const geoShapes = {
  id: 'geo-shapes',
  group: GROUP,
  grades: '6–8',
  label: 'Dreieck, Trapez und Kreis',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam(
      'shape',
      'Figur',
      [['triangle', 'Dreieck'], ['parallelogram', 'Parallelogramm'], ['trapezoid', 'Trapez'], ['circle', 'Kreis'], ['mixed', 'gemischt']],
      'mixed',
    ),
    unitParam(),
    intParam('sideMax', 'Größte Länge', 12, 2, 40),
    piParam({ when: { shape: ['circle', 'mixed'] } }),
  ],
  instruction: () => 'Berechne:',
  item(rng, p) {
    const shape = rng.pick(p.shape === 'mixed' ? ['triangle', 'parallelogram', 'trapezoid', 'circle'] : [p.shape]);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const n = () => rng.int(2, p.sideMax);
      if (shape === 'parallelogram') {
        const [g, h] = [n(), n()];
        return item(
          `Parallelogramm, ${given('g', g, p.unit)}, ${given('h', h, p.unit)}: Flächeninhalt`,
          math(`A = ${g} \\cdot ${h} = ${fmt(g * h, 0)}${U(p.unit, 2)}`),
          { shape, g, h, r: g * h },
        );
      }
      if (shape === 'triangle') {
        const [g, h] = [n(), n()];
        if ((g * h) % 2 !== 0) continue;
        return item(
          `Dreieck, ${given('g', g, p.unit)}, ${given('h', h, p.unit)}: Flächeninhalt`,
          math(`A = \\frac{${g} \\cdot ${h}}{2} = ${fmt((g * h) / 2, 0)}${U(p.unit, 2)}`, true),
          { shape, g, h, r: (g * h) / 2 },
        );
      }
      if (shape === 'trapezoid') {
        const [a, c, h] = [n(), n(), n()];
        if (a === c || ((a + c) * h) % 2 !== 0) continue;
        return item(
          `Trapez, ${given('a', a, p.unit)}, ${given('c', c, p.unit)}, ${given('h', h, p.unit)}: Flächeninhalt`,
          math(`A = \\frac{(${a} + ${c}) \\cdot ${h}}{2} = ${fmt(((a + c) * h) / 2, 0)}${U(p.unit, 2)}`, true),
          { shape, a, c, h, r: ((a + c) * h) / 2 },
        );
      }
      const r = rng.int(1, Math.max(2, Math.floor(p.sideMax / 2)));
      const useDiameter = rng.chance(0.3);
      const ask = rng.pick(['area', 'perimeter']);
      const known = useDiameter ? given('d', 2 * r, p.unit) : given('r', r, p.unit);
      const prefix = useDiameter ? `r = ${r}${U(p.unit)}\\quad ` : '';
      if (ask === 'area') {
        const K = r * r;
        return item(`Kreis, ${known}: Flächeninhalt`, math(`${prefix}A = ${r}^{2} \\cdot ${piFactor(p.pi)} = ${piResult(K, p.pi)}${U(p.unit, 2)}`), { shape, ask, r, K, d: useDiameter });
      }
      const K = 2 * r;
      const calc = useDiameter ? `${2 * r} \\cdot ${piFactor(p.pi)}` : `2 \\cdot ${r} \\cdot ${piFactor(p.pi)}`;
      return item(`Kreis, ${known}: Umfang`, math(`u = ${calc} = ${piResult(K, p.pi)}${U(p.unit)}`), { shape, ask, r, K, d: useDiameter });
    }
    return null;
  },
};

// --- Körper: Volumen und Oberfläche -----------------------------------------------------------------------------
const geoVolume = {
  id: 'geo-volume',
  group: GROUP,
  grades: '5–9',
  label: 'Volumen und Oberfläche',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam(
      'solid',
      'Körper',
      [['cuboid', 'Quader'], ['cube', 'Würfel'], ['prism', 'Prisma (Grundfläche gegeben)'], ['cylinder', 'Zylinder'], ['mixed', 'gemischt']],
      'cuboid',
    ),
    selectParam('ask', 'Gesucht', [['volume', 'Volumen'], ['surface', 'Oberfläche'], ['mixed', 'gemischt']], 'volume'),
    unitParam(),
    intParam('sideMax', 'Größte Kantenlänge', 10, 2, 20),
    piParam({ when: { solid: ['cylinder', 'mixed'] } }),
  ],
  instruction: () => 'Berechne:',
  item(rng, p) {
    const solid = rng.pick(p.solid === 'mixed' ? ['cuboid', 'cube', 'prism', 'cylinder'] : [p.solid]);
    const ask = solid === 'prism' ? 'volume' : rng.pick(p.ask === 'mixed' ? ['volume', 'surface'] : [p.ask]);
    const word = ask === 'volume' ? 'Volumen' : 'Oberfläche';
    const unitV = U(p.unit, 3);
    const unitO = U(p.unit, 2);
    const n = (lo = 2) => rng.int(lo, p.sideMax);
    if (solid === 'cuboid') {
      const [a, b, c] = [n(), n(), n()];
      const text = `Quader, ${given('a', a, p.unit)}, ${given('b', b, p.unit)}, ${given('c', c, p.unit)}: ${word}`;
      if (ask === 'volume') return item(text, math(`V = ${a} \\cdot ${b} \\cdot ${c} = ${fmt(a * b * c, 0)}${unitV}`), { solid, ask, a, b, c, r: a * b * c });
      const sum = a * b + a * c + b * c;
      return item(text, math(`O = 2 \\cdot (${a * b} + ${a * c} + ${b * c}) = ${fmt(2 * sum, 0)}${unitO}`), { solid, ask, a, b, c, r: 2 * sum });
    }
    if (solid === 'cube') {
      const a = n();
      const text = `Würfel, ${given('a', a, p.unit)}: ${word}`;
      if (ask === 'volume') return item(text, math(`V = ${a}^{3} = ${fmt(a ** 3, 0)}${unitV}`), { solid, ask, a, r: a ** 3 });
      return item(text, math(`O = 6 \\cdot ${a}^{2} = ${fmt(6 * a * a, 0)}${unitO}`), { solid, ask, a, r: 6 * a * a });
    }
    if (solid === 'prism') {
      const G = rng.int(4, p.sideMax * 3);
      const h = n();
      return item(
        `Prisma, ${given('G', G, p.unit, 2)}, ${given('h', h, p.unit)}: Volumen`,
        math(`V = ${G} \\cdot ${h} = ${fmt(G * h, 0)}${unitV}`),
        { solid, ask, G, h, r: G * h },
      );
    }
    const r = rng.int(1, Math.min(p.sideMax, 10));
    const h = n();
    const text = `Zylinder, ${given('r', r, p.unit)}, ${given('h', h, p.unit)}: ${word}`;
    if (ask === 'volume') {
      const K = r * r * h;
      return item(text, math(`V = ${r}^{2} \\cdot ${h} \\cdot ${piFactor(p.pi)} = ${piResult(K, p.pi)}${unitV}`), { solid, ask, r, h, K });
    }
    const K = 2 * r * (r + h);
    return item(text, math(`O = 2 \\cdot ${r} \\cdot (${r} + ${h}) \\cdot ${piFactor(p.pi)} = ${piResult(K, p.pi)}${unitO}`), { solid, ask, r, h, K });
  },
};

// --- Winkel -----------------------------------------------------------------------------------------------------
const deg = (n) => `${n}^\\circ`;

const geoAngles = {
  id: 'geo-angles',
  group: GROUP,
  grades: '5–7',
  label: 'Winkel berechnen',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam(
      'kind',
      'Aufgaben',
      [['triangle', 'Winkelsumme im Dreieck'], ['quad', 'Winkelsumme im Viereck'], ['adjacent', 'Nebenwinkel'], ['vertical', 'Neben- und Scheitelwinkel'], ['mixed', 'gemischt']],
      'mixed',
    ),
    selectParam('step', 'Winkelgrößen', [['1', 'beliebige ganze Grad'], ['5', 'Vielfache von 5°'], ['10', 'Vielfache von 10°']], '5'),
  ],
  instruction: () => 'Berechne die fehlenden Winkel:',
  item(rng, p) {
    const kind = rng.pick(p.kind === 'mixed' ? ['triangle', 'quad', 'adjacent', 'vertical'] : [p.kind]);
    const step = Number(p.step);
    const angle = (lo, hi) => step * rng.int(Math.ceil(lo / step), Math.floor(hi / step));
    for (let attempt = 0; attempt < 500; attempt += 1) {
      if (kind === 'triangle') {
        const [a, b] = [angle(20, 100), angle(20, 100)];
        const c = 180 - a - b;
        if (c < 20 || c % step !== 0) continue;
        return item(
          `Dreieck: ${math(`\\alpha = ${deg(a)}`)}, ${math(`\\beta = ${deg(b)}`)}. Gesucht: ${math('\\gamma')}`,
          math(`\\gamma = 180^\\circ - ${deg(a)} - ${deg(b)} = ${deg(c)}`),
          { kind, given: [a, b], r: [c], total: 180 },
        );
      }
      if (kind === 'quad') {
        const [a, b, c] = [angle(50, 130), angle(50, 130), angle(50, 130)];
        const d = 360 - a - b - c;
        if (d < 20 || d > 170 || d % step !== 0) continue;
        return item(
          `Viereck: ${math(`\\alpha = ${deg(a)}`)}, ${math(`\\beta = ${deg(b)}`)}, ${math(`\\gamma = ${deg(c)}`)}. Gesucht: ${math('\\delta')}`,
          math(`\\delta = 360^\\circ - ${deg(a)} - ${deg(b)} - ${deg(c)} = ${deg(d)}`),
          { kind, given: [a, b, c], r: [d], total: 360 },
        );
      }
      const a = angle(20, 160);
      if (a === 90 || a % step !== 0) continue;
      if (kind === 'adjacent') {
        return item(
          `Nebenwinkel: ${math(`\\alpha = ${deg(a)}`)}. Gesucht: ${math('\\beta')}`,
          math(`\\beta = 180^\\circ - ${deg(a)} = ${deg(180 - a)}`),
          { kind, given: [a], r: [180 - a], total: 180 },
        );
      }
      return item(
        `Zwei Geraden schneiden sich, ${math(`\\alpha = ${deg(a)}`)}. Gesucht: ${math('\\beta')}, ${math('\\gamma')}`,
        math(`\\beta = 180^\\circ - ${deg(a)} = ${deg(180 - a)}, \\quad \\gamma = ${deg(a)}`),
        { kind, given: [a], r: [180 - a, a], total: 180 },
      );
    }
    return null;
  },
};

// --- Satz des Pythagoras ----------------------------------------------------------------------------------------
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41], [12, 35, 37]];

const geoPythagoras = {
  id: 'geo-pythagoras',
  group: GROUP,
  grades: '8–9',
  label: 'Satz des Pythagoras',
  large: false,
  defaults: { count: 3, layout: 'parts' },
  params: [
    selectParam('ask', 'Gesucht', [['hyp', 'Hypotenuse'], ['leg', 'Kathete'], ['mixed', 'gemischt']], 'mixed'),
    unitParam(),
    intParam('maxSide', 'Größte Seitenlänge (Hypotenuse)', 50, 5, 100),
  ],
  instruction: () => 'Berechne die fehlende Seite im rechtwinkligen Dreieck:',
  item(rng, p) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const [x, y, h] = rng.pick(TRIPLES);
      const k = rng.int(1, Math.floor(p.maxSide / h) || 1);
      if (h * k > p.maxSide) continue;
      const [a, b, c] = rng.chance(0.5) ? [x * k, y * k, h * k] : [y * k, x * k, h * k];
      const ask = rng.pick(p.ask === 'mixed' ? ['hyp', 'leg'] : [p.ask]);
      if (ask === 'hyp') {
        return item(
          `Katheten ${given('a', a, p.unit)}, ${given('b', b, p.unit)}: Hypotenuse ${math('c')}`,
          math(`c = \\sqrt{${a}^{2} + ${b}^{2}} = \\sqrt{${fmt(a * a + b * b, 0)}} = ${c}${U(p.unit)}`),
          { ask, a, b, c, r: c, k },
        );
      }
      return item(
        `Hypotenuse ${given('c', c, p.unit)}, Kathete ${given('a', a, p.unit)}: Kathete ${math('b')}`,
        math(`b = \\sqrt{${c}^{2} - ${a}^{2}} = \\sqrt{${fmt(c * c - a * a, 0)}} = ${b}${U(p.unit)}`),
        { ask, a, b, c, r: b, k, g: gcd(a, b) },
      );
    }
    return null;
  },
};

export const GEOMETRY_GENERATORS = [geoRect, geoShapes, geoVolume, geoAngles, geoPythagoras];
