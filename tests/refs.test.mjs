import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buscarReferencias } from '../lib/refs.mjs';

function setupTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'const foo = 1;\nconsole.log(foo);\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'function foo() {}\nfoo();\n');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'nada aqui');
  return dir;
}

test('busca referencias en todos los archivos', () => {
  const dir = setupTmp();
  const refs = buscarReferencias(dir, 'foo');
  assert.ok(refs.length >= 2);
  const archivos = refs.map(r => r.archivo);
  assert.ok(archivos.includes('a.js'));
  assert.ok(archivos.includes('b.js'));
  fs.rmSync(dir, { recursive: true });
});

test('no encuentra falsos positivos', () => {
  const dir = setupTmp();
  const refs = buscarReferencias(dir, 'noExiste');
  assert.strictEqual(refs.length, 0);
  fs.rmSync(dir, { recursive: true });
});

test('excluye archivos especificados', () => {
  const dir = setupTmp();
  const excluir = [path.join(dir, 'a.js')];
  const refs = buscarReferencias(dir, 'foo', { excluir });
  const archivos = refs.map(r => r.archivo);
  assert.ok(!archivos.includes('a.js'));
  fs.rmSync(dir, { recursive: true });
});

test('respeta word boundary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  fs.writeFileSync(path.join(dir, 'x.js'), 'const foobar = 1;\nconst foo = 2;\n');
  const refs = buscarReferencias(dir, 'foo');
  assert.strictEqual(refs.length, 1);
  assert.strictEqual(refs[0].total, 1);
  fs.rmSync(dir, { recursive: true });
});
