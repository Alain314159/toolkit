import { test } from 'node:test';
import assert from 'node:assert';
import { resumenDiff } from '../lib/diff.mjs';

test('resumenDiff cuenta add/del', () => {
  const a = 'linea1\nlinea2\nlinea3';
  const b = 'linea1\nMODIFICADA\nlinea3\nNUEVA';
  const r = resumenDiff(a, b);
  assert.strictEqual(r.add, 2);
  assert.strictEqual(r.del, 1);
});

test('resumenDiff sin cambios', () => {
  const a = 'hola\nmundo';
  const b = 'hola\nmundo';
  const r = resumenDiff(a, b);
  assert.strictEqual(r.add, 0);
  assert.strictEqual(r.del, 0);
});

test('resumenDiff todo nuevo', () => {
  const r = resumenDiff('', 'a\nb\nc');
  assert.strictEqual(r.add, 3);
  assert.strictEqual(r.del, 0);
});
