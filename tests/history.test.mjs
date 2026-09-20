import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registrarCambio, listarHistorial, deshacer, limpiarHistorial } from '../lib/history.mjs';

function setupTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-h-'));
  fs.writeFileSync(path.join(dir, 'test.js'), 'const a = 1;\n');
  return dir;
}

test('registrar cambio y listarlo', () => {
  const dir = setupTmp();
  registrarCambio(dir, { file: 'test.js', backup: null, ops: ['replace'], comando: 'apply' });
  const h = listarHistorial(dir);
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].file, 'test.js');
  fs.rmSync(dir, { recursive: true });
});

test('listarHistorial con limite', () => {
  const dir = setupTmp();
  for (let i = 0; i < 5; i++) registrarCambio(dir, { file: 'f' + i + '.js' });
  const h = listarHistorial(dir, { limite: 3 });
  assert.strictEqual(h.length, 3);
  fs.rmSync(dir, { recursive: true });
});

test('deshacer restaura backup', () => {
  const dir = setupTmp();
  const file = path.join(dir, 'test.js');
  const backup = path.join(dir, 'test.js.bak-123');
  fs.copyFileSync(file, backup);
  fs.writeFileSync(file, 'modificado');
  registrarCambio(dir, { file: 'test.js', backup: 'test.js.bak-123' });
  const r = deshacer(dir, 1);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'const a = 1;\n');
  fs.rmSync(dir, { recursive: true });
});

test('deshacer sin historial falla', () => {
  const dir = setupTmp();
  const r = deshacer(dir, 1);
  assert.strictEqual(r.ok, false);
  fs.rmSync(dir, { recursive: true });
});

test('limpiarHistorial vacia', () => {
  const dir = setupTmp();
  registrarCambio(dir, { file: 'a.js' });
  limpiarHistorial(dir);
  assert.strictEqual(listarHistorial(dir).length, 0);
  fs.rmSync(dir, { recursive: true });
});
