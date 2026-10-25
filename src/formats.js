// Seitenformate (quer). Alle Blattmaße werden in CSS-Pixeln bei 96 dpi gerechnet;
// `u` skaliert die Typografie relativ zum Tabloid-Blatt (1632 px breit).

export const FORMATS = {
  tabloid: { id: 'tabloid', label: 'Tabloid 17×11 Zoll', mmW: 431.8, mmH: 279.4 },
  a3: { id: 'a3', label: 'A3 quer', mmW: 420, mmH: 297 },
  a4: { id: 'a4', label: 'A4 quer', mmW: 297, mmH: 210 },
};

export const DEFAULT_FORMAT = 'tabloid';
export const BASE_WIDTH = 1632;

const MM_PER_INCH = 25.4;
const CSS_DPI = 96;

export function pageSize(formatId) {
  const f = FORMATS[formatId] ?? FORMATS[DEFAULT_FORMAT];
  const w = Math.round((f.mmW / MM_PER_INCH) * CSS_DPI);
  const h = Math.round((f.mmH / MM_PER_INCH) * CSS_DPI);
  return { ...f, w, h, u: w / BASE_WIDTH };
}
