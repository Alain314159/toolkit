import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectarProblemas } from '../lib/fix.mjs';

function setupTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-f-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

test('detecta .bak viejos', () => {
  const dir = setupTmp();
  fs.writeFileSync(path.join(dir, 'src', 'x.js.bak-123'), 'x');
  const problemas = detectarProblemas(dir);
  assert.ok(problemas.some(p => p.id === 'backups-viejos'));
  fs.rmSync(dir, { recursive: true });
});

test('detecta console.log en src', () => {
  const dir = setupTmp();
  fs.writeFileSync(path.join(dir, 'src', 'x.js'), 'console.log("hola");\n');
  const problemas = detectarProblemas(dir);
  assert.ok(problemas.some(p => p.id === 'console-logs'));
  fs.rmSync(dir, { recursive: true });
});

test('detecta TODO/FIXME', () => {
  const dir = setupTmp();
  fs.writeFileSync(path.join(dir, 'src', 'x.js'), '// TODO: arreglar esto\n');
  const problemas = detectarProblemas(dir);
  assert.ok(problemas.some(p => p.id === 'todos'));
  fs.rmSync(dir, { recursive: true });
});

test('sin problemas si todo limpio', () => {
  const dir = setupTmp();
  fs.writeFileSync(path.join(dir, 'src', 'x.js'), 'const a = 1;\n');
  const problemas = detectarProblemas(dir);
  assert.ok(!problemas.some(p => p.id === 'backups-viejos'));
  assert.ok(!problemas.some(p => p.id === 'console-logs'));
  fs.rmSync(dir, { recursive: true });
});
