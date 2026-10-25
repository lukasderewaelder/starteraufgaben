import assert from 'node:assert/strict';
import { test } from 'node:test';
import { History } from '../src/history.js';

test('Rückgängig und Wiederholen stellen Schnappschüsse her', () => {
  const h = new History();
  h.reset({ n: 0 });
  h.push({ n: 1 });
  h.push({ n: 2 });
  assert.deepEqual(h.undo(), { n: 1 });
  assert.deepEqual(h.undo(), { n: 0 });
  assert.equal(h.undo(), null);
  assert.deepEqual(h.redo(), { n: 1 });
  assert.ok(h.canRedo);
});

test('eine neue Änderung verwirft den Wiederholen-Zweig', () => {
  const h = new History();
  h.reset({ n: 0 });
  h.push({ n: 1 });
  h.undo();
  h.push({ n: 5 });
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.undo(), { n: 0 });
});

test('gleicher Schlüssel in kurzer Zeit wird zu einem Schritt zusammengefasst', () => {
  const h = new History({ window: 1000 });
  h.reset({ t: '' });
  h.push({ t: 'a' }, 'text', 0);
  h.push({ t: 'ab' }, 'text', 300);
  h.push({ t: 'abc' }, 'text', 600);
  assert.deepEqual(h.undo(), { t: '' });
  assert.equal(h.canUndo, false);
});

test('anderer Schlüssel oder längere Pause beginnt einen neuen Schritt', () => {
  const h = new History({ window: 1000 });
  h.reset({ t: '' });
  h.push({ t: 'a' }, 'text', 0);
  h.push({ t: 'ab' }, 'text', 2000);
  h.push({ t: 'ab', x: 1 }, 'andere', 2100);
  assert.deepEqual(h.undo(), { t: 'ab' });
  assert.deepEqual(h.undo(), { t: 'a' });
  assert.deepEqual(h.undo(), { t: '' });
});

test('Schnappschüsse sind unabhängige Kopien und die Länge ist begrenzt', () => {
  const state = { n: 0 };
  const h = new History({ limit: 3 });
  h.reset(state);
  state.n = 99;
  assert.equal(h.canUndo, false);
  for (let i = 1; i <= 5; i += 1) h.push({ n: i });
  assert.equal(h.stack.length, 3);
  assert.deepEqual(h.undo(), { n: 4 });
});
