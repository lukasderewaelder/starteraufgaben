// Bausteine, die alle Aufgabentypen (defs*.js) gemeinsam nutzen: Einstellungs-Beschreibungen und kleine Formatierer.
import { fmtScaled } from './numfmt.js';

export const intParam = (key, label, def, min, max, extra = {}) => ({ key, kind: 'int', label, default: def, min, max, ...extra });
export const boolParam = (key, label, def, extra = {}) => ({ key, kind: 'bool', label, default: def, ...extra });
export const selectParam = (key, label, options, def, extra = {}) => ({ key, kind: 'select', label, options, default: def, ...extra });
export const rangeParams = (min, max, label = 'Zahlenraum') => [
  intParam('min', `${label} von`, min, 0, 1_000_000, { row: 'range' }),
  intParam('max', 'bis', max, 1, 1_000_000, { row: 'range' }),
];
export const decimalsParam = (def = 0, label = 'Dezimalstellen', max = 3, extra = {}) =>
  intParam('decimals', label, def, 0, max, { hint: '0 = ganze Zahlen', ...extra });
export const item = (text, solution, data) => ({ text, solution, data });
export const pow10 = (e) => 10 ** e;
export const fmt = (n, d, opts) => fmtScaled(n, d, opts);
