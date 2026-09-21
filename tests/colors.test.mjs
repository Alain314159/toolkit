import { test } from 'node:test';
import assert from 'node:assert';
import { c } from '../lib/colors.mjs';

test('colores devuelven string', () => {
  assert.strictEqual(typeof c.rojo('x'), 'string');
  assert.strictEqual(typeof c.verde('x'), 'string');
  assert.strictEqual(typeof c.amarillo('x'), 'string');
});

test('respeta el entorno TTY (Termux) o CI', () => {
  // Valida el comportamiento tanto en Termux (TTY) como en CI (sin TTY)
  const r = c.rojo('test');
  const isTTY = process.stdout.isTTY;
  const hasColor = r !== 'test';

  if (isTTY || process.env.FORCE_COLOR) {
    assert.ok(hasColor, 'En entorno TTY o con FORCE_COLOR debe haber secuencias ANSI');
  } else if (process.env.NO_COLOR) {
    assert.strictEqual(hasColor, false, 'Con NO_COLOR=1, no debe haber secuencias ANSI');
  } else {
    assert.strictEqual(hasColor, false, 'En CI sin TTY, no debe haber secuencias ANSI');
  }
});
