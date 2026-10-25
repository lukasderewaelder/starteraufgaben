// Zufall mit Startwert (Seed): gleicher Seed = gleiche Aufgabe. Reine Funktionen.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Verwirbelt den Startwert, damit benachbarte Startwerte (1, 2, 3 …) trotzdem ganz verschiedene Folgen ergeben. */
function mixSeed(seed) {
  let h = seed >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** { next, int(lo, hi) (beide inklusive), pick(liste), chance(p) } */
export function makeRng(seed) {
  const next = mulberry32(mixSeed(seed));
  return {
    next,
    int: (lo, hi) => (hi <= lo ? lo : lo + Math.floor(next() * (hi - lo + 1))),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

export function randomSeed() {
  try {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

export function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export const lcm = (a, b) => (a / gcd(a, b)) * b;
