import { test } from 'node:test';
import assert from 'node:assert';
import { validar } from '../lib/validators.mjs';

test('valida JSON correcto', async () => {
  const r = await validar('test.json', '{"a": 1}');
  assert.strictEqual(r.ok, true);
});

test('rechaza JSON invalido', async () => {
  const r = await validar('test.json', '{a: 1}');
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test('valida JS correcto', async () => {
  const r = await validar('test.mjs', 'const x = 1;');
  assert.strictEqual(r.ok, true);
});

test('rechaza JS invalido', async () => {
  const r = await validar('test.mjs', 'const x = ;');
  assert.strictEqual(r.ok, false);
});

test('valida CSS balanceado', async () => {
  const r = await validar('test.css', '.a { color: red; }');
  assert.strictEqual(r.ok, true);
});

test('rechaza CSS desbalanceado', async () => {
  const r = await validar('test.css', '.a { color: red;');
  assert.strictEqual(r.ok, false);
});

test('rechaza CSS con parentesis extra', async () => {
  const r = await validar('test.css', '.a { color: rgb(1,2,3)); }');
  assert.strictEqual(r.ok, false);
});

test('valida HTML balanceado', async () => {
  const r = await validar('test.html', '<html><body>Hola</body></html>');
  assert.strictEqual(r.ok, true);
});

test('rechaza HTML desbalanceado', async () => {
  const r = await validar('test.html', '<html><body>Hola</html>');
  assert.strictEqual(r.ok, false);
});
