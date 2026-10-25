// Zahlen für Formeln im deutschen Format. Dezimalzahlen werden als skalierte Ganzzahlen gerechnet
// (Wert = n / 10^d), damit es keine Gleitkomma-Fehler gibt.

/** Tausendergruppen wie in der Schule üblich ab fünf Stellen: 12\,345 (dünnes Leerzeichen). */
export function group(intString) {
  return intString.length >= 5 ? intString.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : intString;
}

/**
 * Skalierte Ganzzahl n mit d Dezimalstellen als Text: fmtScaled(345, 2) = „3,45“.
 * trim: Nullen hinten entfernen (3,50 -> 3,5; 3,00 -> 3); minDigits behält mindestens so viele Stellen.
 */
export function fmtScaled(n, d, { trim = false, minDigits = 0 } = {}) {
  const abs = Math.abs(n);
  const scale = 10 ** d;
  const int = Math.floor(abs / scale);
  let frac = d > 0 ? String(abs % scale).padStart(d, '0') : '';
  if (trim) {
    frac = frac.replace(/0+$/, '');
    if (frac.length < minDigits) frac = frac.padEnd(minDigits, '0');
  }
  return `${n < 0 ? '-' : ''}${group(String(int))}${frac ? `,${frac}` : ''}`;
}

/** Zufällige skalierte Ganzzahl in [lo, hi]; bei d > 0 endet sie nicht auf 0 (echte Dezimalzahl). */
export function randScaled(rng, lo, hi, d) {
  if (hi < lo) return null;
  let x = rng.int(lo, hi);
  if (d > 0 && x % 10 === 0) {
    if (x + 1 <= hi) x += 1;
    else if (x - 1 >= lo) x -= 1;
  }
  return x;
}

/** LaTeX-Bruch. */
export const frac = (p, q) => `\\frac{${p}}{${q}}`;
export const mixed = (w, p, q) => `${w}\\frac{${p}}{${q}}`;

/** Math-Text: `$…$`, bei large mit \displaystyle (Brüche in voller Höhe). */
export const math = (latex, large = false) => `$${large ? '\\displaystyle ' : ''}${latex}$`;

/** Gekürzter Bruch als LaTeX; unechte Brüche zusätzlich als gemischte Zahl, ganze Zahlen ohne Bruchstrich. */
export function fractionResult(p, q, gcdFn) {
  const g = gcdFn(p, q);
  const np = p / g;
  const nq = q / g;
  if (nq === 1) return String(np);
  if (np > nq) {
    const w = Math.floor(np / nq);
    return `${frac(np, nq)} = ${mixed(w, np - w * nq, nq)}`;
  }
  return frac(np, nq);
}
