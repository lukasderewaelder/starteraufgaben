// Terme als LaTeX: Vorzeichen, Koeffizienten 1 und -1, Klammern um negative Zahlen. Reine Funktionen.

/** Zweite Variable zu einer ersten (für Aufgaben mit zwei Variablen). */
export const SECOND = { x: 'y', a: 'b', n: 'm', y: 'z' };

/** Negative Zahl in Klammern: bracketed(-3) = „(-3)“, bracketed(3) = „3“. */
export const bracketed = (n) => (n < 0 ? `(${n})` : String(n));

/** Glied c·v ohne überflüssige 1: coef(1, 'x') = „x“, coef(-1, 'x') = „-x“, coef(3, 'x') = „3x“. */
export function coef(c, v) {
  if (c === 1) return v;
  if (c === -1) return `-${v}`;
  return `${c}${v}`;
}

/** Fügt Glieder zu einer Summe: ['3x', '-2', '5y'] -> „3x - 2 + 5y“ (Minus statt „+-“). */
export function termSum(parts) {
  if (!parts.length) return '0';
  return parts.reduce((acc, t, i) => {
    if (i === 0) return t;
    return t.startsWith('-') ? `${acc} - ${t.slice(1)}` : `${acc} + ${t}`;
  }, '');
}

/** Polynom aus Koeffizienten, höchste Potenz zuerst: polyTex([3, -2, 5], 'x') = „3x^2 - 2x + 5“; Nullen entfallen. */
export function polyTex(coefs, v) {
  const deg = coefs.length - 1;
  const parts = [];
  coefs.forEach((c, i) => {
    if (c === 0) return;
    const pow = deg - i;
    if (pow === 0) parts.push(String(c));
    else parts.push(coef(c, pow === 1 ? v : `${v}^{${pow}}`));
  });
  return termSum(parts);
}

/** Wert eines Polynoms (Koeffizienten höchste Potenz zuerst) an der Stelle x. */
export const polyEval = (coefs, x) => coefs.reduce((acc, c) => acc * x + c, 0);
