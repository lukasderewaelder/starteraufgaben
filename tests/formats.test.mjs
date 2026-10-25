import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_WIDTH, DEFAULT_FORMAT, FORMATS, pageSize } from '../src/formats.js';

test('Tabloid ist Standard und exakt 1632 × 1056 px (17 × 11 Zoll bei 96 dpi)', () => {
  assert.equal(DEFAULT_FORMAT, 'tabloid');
  const s = pageSize('tabloid');
  assert.deepEqual([s.w, s.h], [1632, 1056]);
  assert.equal(s.u, 1);
  assert.equal(s.w, BASE_WIDTH);
});

test('A3 und A4 quer haben das richtige Seitenverhältnis und skalieren die Typografie', () => {
  const a3 = pageSize('a3');
  const a4 = pageSize('a4');
  assert.ok(Math.abs(a3.w / a3.h - 420 / 297) < 0.005);
  assert.ok(Math.abs(a4.w / a4.h - 297 / 210) < 0.005);
  assert.ok(a3.u < 1 && a4.u < a3.u);
});

test('unbekannte Formate fallen auf Tabloid zurück', () => {
  assert.equal(pageSize('quatsch').id, 'tabloid');
  assert.ok(Object.keys(FORMATS).includes('a3'));
});
