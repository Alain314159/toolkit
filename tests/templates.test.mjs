import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { crearDesdeTemplate, TEMPLATES } from '../lib/templates.mjs';

function setupTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-t-'));
}

test('TEMPLATES tiene los tipos esperados', () => {
  assert.ok(TEMPLATES.vue);
  assert.ok(TEMPLATES.mixin);
  assert.ok(TEMPLATES.composable);
  assert.ok(TEMPLATES.test);
  assert.ok(TEMPLATES.js);
  assert.ok(TEMPLATES.css);
});

test('crearDesdeTemplate crea archivo', () => {
  const dir = setupTmp();
  const r = crearDesdeTemplate('vue', 'MiComponente', dir);
  assert.strictEqual(r.ok, true);
  assert.ok(fs.existsSync(r.archivo));
  const contenido = fs.readFileSync(r.archivo, 'utf8');
  assert.ok(contenido.includes('MiComponente'));
  fs.rmSync(dir, { recursive: true });
});

test('crearDesdeTemplate falla si existe', () => {
  const dir = setupTmp();
  crearDesdeTemplate('vue', 'Test', dir);
  const r = crearDesdeTemplate('vue', 'Test', dir);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('Ya existe'));
  fs.rmSync(dir, { recursive: true });
});

test('crearDesdeTemplate con tipo desconocido', () => {
  const dir = setupTmp();
  const r = crearDesdeTemplate('xyz', 'Test', dir);
  assert.strictEqual(r.ok, false);
  fs.rmSync(dir, { recursive: true });
});
