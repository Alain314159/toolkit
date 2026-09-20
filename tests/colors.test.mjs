import { test } from 'node:test';
import assert from 'node:assert';
import { c } from '../lib/colors.mjs';

test('colores devuelven string', () => {
  assert.strictEqual(typeof c.rojo('x'), 'string');
  assert.strictEqual(typeof c.verde('x'), 'string');
  assert.strictEqual(typeof c.amarillo('x'), 'string');
});

test('sin FORCE_COLOR no agrega secuencias', () => {
  // En tests, stdout no es TTY, así que no debe haber colores
  const r = c.rojo('test');
  assert.strictEqual(r, 'test');
});
