import { test } from 'node:test';
import assert from 'node:assert';
import { aplicarOp } from '../lib/patch.mjs';

test('replace simple', () => {
  const r = aplicarOp('hola mundo', { replace: { old: 'mundo', new: 'JS' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'hola JS');
});

test('replace falla si el texto no existe', () => {
  const r = aplicarOp('hola', { replace: { old: 'adios', new: 'x' } });
  assert.strictEqual(r.ok, false);
});

test('replace falla si el texto aparece 2+ veces', () => {
  const r = aplicarOp('hola hola', { replace: { old: 'hola', new: 'x' } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('2+'));
});

test('insertAfter', () => {
  const r = aplicarOp('linea1\nlinea2', { insertAfter: { anchor: 'linea1', content: '\nNUEVA' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'linea1\nNUEVA\nlinea2');
});

test('insertBefore', () => {
  const r = aplicarOp('linea1\nlinea2', { insertBefore: { anchor: 'linea2', content: 'NUEVA\n' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'linea1\nNUEVA\nlinea2');
});

test('remove', () => {
  const r = aplicarOp('hola mundo adios', { remove: { text: ' mundo' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'hola adios');
});

test('removeBetween', () => {
  const r = aplicarOp('INICIO contenido FIN', { removeBetween: { start: 'INICIO', end: 'FIN' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'FIN');
});

test('replaceRegex con count', () => {
  const r = aplicarOp('a1 b2 c3', { replaceRegex: { pattern: '\\d', flags: 'g', new: 'X', count: 3 } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'aX bX cX');
});

test('replaceRegex falla si count no coincide', () => {
  const r = aplicarOp('a1 b2', { replaceRegex: { pattern: '\\d', flags: 'g', new: 'X', count: 5 } });
  assert.strictEqual(r.ok, false);
});

test('custom', () => {
  const r = aplicarOp('hola', { custom: { fn: (s) => s.toUpperCase(), desc: 'upper' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.content, 'HOLA');
});

test('operacion desconocida', () => {
  const r = aplicarOp('hola', { operacionRara: {} });
  assert.strictEqual(r.ok, false);
});
