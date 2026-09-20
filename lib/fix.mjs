// Arregla problemas comunes en el proyecto

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

export function detectarProblemas(dirBase) {
  const problemas = [];

  // 1. Backups viejos
  const backups = [];
  function walkBackups(dir, depth) {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkBackups(full, depth + 1);
      else if (entry.name.includes('.bak-')) backups.push(full);
    }
  }
  walkBackups(dirBase, 0);
  if (backups.length > 0) {
    problemas.push({
      id: 'backups-viejos',
      titulo: backups.length + ' archivo(s) .bak-* encontrados',
      detalle: 'Backups de cambios anteriores',
      archivos: backups,
      automatico: true,
      fix: 'Eliminar todos los .bak-*',
    });
  }

  // 2. console.log en src/
  const consoleLogs = [];
  const srcDir = path.join(dirBase, 'src');
  if (fs.existsSync(srcDir)) {
    function walkLogs(dir, depth) {
      if (depth > 8) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
      catch (e) { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkLogs(full, depth + 1);
        else if (/\.(js|mjs|vue|ts)$/.test(entry.name)) {
          const cont = fs.readFileSync(full, 'utf8');
          const lineas = cont.split('\n');
          lineas.forEach((l, i) => {
            if (l.includes('console.log(') && !l.includes('//') && !l.includes('toolkit')) {
              consoleLogs.push({ archivo: path.relative(dirBase, full), linea: i + 1, texto: l.trim() });
            }
          });
        }
      }
    }
    walkLogs(srcDir, 0);
  }
  if (consoleLogs.length > 0) {
    problemas.push({
      id: 'console-logs',
      titulo: consoleLogs.length + ' console.log() en src/',
      detalle: 'Los console.log se eliminan en producción',
      detalles: consoleLogs.slice(0, 20),
      automatico: false,
      fix: 'Revisar y eliminar manualmente',
    });
  }

  // 3. TODO/FIXME
  const todos = [];
  function walkTodos(dir, depth) {
    if (depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkTodos(full, depth + 1);
      else if (/\.(js|mjs|vue|ts|css)$/.test(entry.name)) {
        const cont = fs.readFileSync(full, 'utf8');
        cont.split('\n').forEach((l, i) => {
          if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) {
            todos.push({ archivo: path.relative(dirBase, full), linea: i + 1, texto: l.trim() });
          }
        });
      }
    }
  }
  walkTodos(dirBase, 0);
  if (todos.length > 0) {
    problemas.push({
      id: 'todos',
      titulo: todos.length + ' TODO/FIXME pendientes',
      detalle: 'Marcadores de cosas por hacer',
      detalles: todos.slice(0, 20),
      automatico: false,
    });
  }

  // 4. Git status
  const gitR = spawnSync('git', ['status', '--porcelain'], { cwd: dirBase, encoding: 'utf8', timeout: 5000 });
  if (gitR.status === 0) {
    const cambios = (gitR.stdout || '').trim().split('\n').filter(Boolean);
    if (cambios.length > 0) {
      problemas.push({
        id: 'git-cambios',
        titulo: cambios.length + ' archivo(s) con cambios sin commitear',
        detalle: 'Ejecuta "toolkit save" para subir',
        automatico: false,
      });
    }
  }

  return problemas;
}

export function aplicarFixesAutomaticos(dirBase, problemas) {
  const resultados = [];
  for (const p of problemas) {
    if (!p.automatico) continue;
    if (p.id === 'backups-viejos') {
      let borrados = 0;
      for (const f of p.archivos) {
        try { fs.unlinkSync(f); borrados++; } catch (e) {}
      }
      resultados.push({ id: p.id, ok: true, mensaje: borrados + ' backups eliminados' });
    }
  }
  return resultados;
}
