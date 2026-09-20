// Verificacion completa del proyecto

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { validar } from './validators.mjs';

export async function verificarProyecto(dirBase, opciones = {}) {
  const {
    archivos = null,
    correrTests = true,
    correrBuild = true,
    timeout = 60000,
  } = opciones;

  const resultado = {
    ok: true,
    pasos: [],
  };

  // 1. Validar archivos
  const pasoValidar = { nombre: 'Validacion de archivos', ok: true, detalles: [] };

  let listaArchivos = archivos;
  if (!listaArchivos) {
    listaArchivos = [];
    const pkg = path.join(dirBase, 'package.json');
    const patrones = [
      { dir: path.join(dirBase, 'src'), exts: ['.vue', '.js', '.mjs', '.css', '.scss'] },
      { dir: path.join(dirBase, 'lib'), exts: ['.js', '.mjs'] },
    ];
    for (const { dir, exts } of patrones) {
      if (!fs.existsSync(dir)) continue;
      listaArchivos.push(...recogerArchivos(dir, exts));
    }
  }

  for (const archivo of listaArchivos) {
    if (!fs.existsSync(archivo)) continue;
    const contenido = fs.readFileSync(archivo, 'utf8');
    const v = await validar(archivo, contenido);
    if (!v.ok) {
      pasoValidar.ok = false;
      pasoValidar.detalles.push({
        archivo: path.relative(dirBase, archivo),
        errores: v.errors,
      });
    }
  }
  if (!pasoValidar.ok) resultado.ok = false;
  resultado.pasos.push(pasoValidar);

  // 2. Tests
  if (correrTests) {
    const paso = { nombre: 'Tests', ok: true, detalles: [] };
    const pkgPath = path.join(dirBase, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.test) {
          const r = spawnSync('npm', ['test', '--silent'], {
            cwd: dirBase,
            encoding: 'utf8',
            timeout,
          });
          if (r.status !== 0) {
            paso.ok = false;
            paso.detalles.push((r.stdout || '').split('\n').slice(-10).join('\n'));
            if (r.stderr) paso.detalles.push(r.stderr.split('\n').slice(-10).join('\n'));
          }
        } else {
          paso.saltado = 'Sin script de test en package.json';
        }
      } catch (e) {
        paso.ok = false;
        paso.detalles.push('Error leyendo package.json: ' + e.message);
      }
    } else {
      paso.saltado = 'Sin package.json';
    }
    if (!paso.ok) resultado.ok = false;
    resultado.pasos.push(paso);
  }

  // 3. Build
  if (correrBuild) {
    const paso = { nombre: 'Build', ok: true, detalles: [] };
    const pkgPath = path.join(dirBase, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.build) {
          const r = spawnSync('npm', ['run', 'build', '--silent'], {
            cwd: dirBase,
            encoding: 'utf8',
            timeout: timeout * 3,
          });
          if (r.status !== 0) {
            paso.ok = false;
            paso.detalles.push((r.stdout || '').split('\n').slice(-15).join('\n'));
            if (r.stderr) paso.detalles.push(r.stderr.split('\n').slice(-15).join('\n'));
          }
        } else {
          paso.saltado = 'Sin script de build en package.json';
        }
      } catch (e) {
        paso.ok = false;
        paso.detalles.push('Error leyendo package.json: ' + e.message);
      }
    } else {
      paso.saltado = 'Sin package.json';
    }
    if (!paso.ok) resultado.ok = false;
    resultado.pasos.push(paso);
  }

  // 4. Git status
  const pasoGit = { nombre: 'Git status', ok: true, detalles: [] };
  try {
    const r = spawnSync('git', ['status', '--short'], {
      cwd: dirBase,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (r.status === 0) {
      pasoGit.detalles = (r.stdout || '').trim().split('\n').filter(Boolean);
    } else {
      pasoGit.saltado = 'No es un repo git';
    }
  } catch (e) {
    pasoGit.saltado = 'Git no disponible';
  }
  resultado.pasos.push(pasoGit);

  return resultado;
}

function recogerArchivos(dir, exts, maxDepth = 10) {
  const out = [];
  function walk(d, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (e) { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) out.push(full);
    }
  }
  walk(dir, 0);
  return out;
}
