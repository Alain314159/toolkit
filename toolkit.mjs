#!/usr/bin/env node
import { ToolkitError } from './utils/errors.mjs';
// toolkit.mjs - Herramienta universal de parcheo y validacion

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectarTipo, existeArchivo } from './lib/detect.mjs';
import { validar, tipoDeValidador } from './lib/validators.mjs';
import { aplicarOp } from './lib/patch.mjs';
import { analizar, formatearReporte } from './lib/analyze.mjs';
import { aplicarRefactor, generarMixin } from './lib/refactor.mjs';
import { buscarReferencias, buscarMultiplesReferencias, contarReferencias } from './lib/refs.mjs';
import { buscarTexto } from './lib/search.mjs';
import { arbolProyecto, formatearBytes } from './lib/tree.mjs';
import { statsProyecto } from './lib/stats.mjs';
import { diffLineas, resumenDiff } from './lib/diff.mjs';
import { c } from './lib/colors.mjs';
import { buscarConfig, configDefault } from './lib/config.mjs';
import { listarHistorial, deshacer, registrarCambio, registrarBatch, limpiarHistorial } from './lib/history.mjs';
import { verificarProyecto } from './lib/verify.mjs';
import { guardarCambios } from './lib/save.mjs';
import { detectarProblemas, aplicarFixesAutomaticos } from './lib/fix.mjs';
import { crearDesdeTemplate, TEMPLATES } from './lib/templates.mjs';
import { urlActions, urlCommit, infoUltimoCommit, detectarRepo } from './lib/action.mjs';
import { crearMenu, pedirTexto, pedirConfirmacion } from './lib/menu.mjs';
import { vigilar } from './lib/watch.mjs';
import { detectarHuerfanos } from './lib/orphans.mjs';
import { aplicarPlanTransaccional } from './lib/patch.mjs';
import { printHeader, printSuccess, printSkipped, printError, printFooter, printBackup, printInfo } from './lib/report.mjs';

const [,, comando, ...args] = process.argv;

// ============================================================
// COMANDOS
// ============================================================

async function cmdValidate(filePath, restantes) {
  // Si hay multiples archivos, validarlos todos
  if (restantes && restantes.length > 0) {
    const todos = [filePath, ...restantes];
    return await validarMultiples(todos);
  }
  printHeader('VALIDAR');
  if (!existeArchivo(filePath)) {
    printError(filePath, ['Archivo no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  const tipo = detectarTipo(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  printInfo('Archivo', filePath);
  printInfo('Tipo', tipo + ' (' + tipoDeValidador(tipo) + ')');
  printInfo('Tamaño', (content.length / 1024).toFixed(2) + ' KB');
  printInfo('Lineas', content.split('\n').length);
  console.log('');
  const r = await validar(filePath, content);
  if (r.ok) {
    console.log('  ' + c.verde('✅ VALIDO') + '  ' + c.cian(filePath));
    console.log('     ' + c.gris('Validador: ' + tipoDeValidador(tipo)));
    if (r.warning) console.log('     ' + c.amarillo('⚠ ' + r.warning));
  } else {
    printError(filePath, r.errors);
    printFooter();
    throw { _toolkit_exit: true };
  }
  printFooter();
}

async function cmdInfo(filePath) {
  printHeader('INFO');
  if (!existeArchivo(filePath)) {
    printError(filePath, ['Archivo no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  const tipo = detectarTipo(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lineas = content.split('\n');
  const stat = fs.statSync(filePath);

  printInfo('Archivo', filePath);
  printInfo('Tipo', tipo + ' (' + tipoDeValidador(tipo) + ')');
  printInfo('Tamaño', (stat.size / 1024).toFixed(2) + ' KB');
  printInfo('Lineas', lineas.length);
  printInfo('Modificado', stat.mtime.toISOString());
  console.log('');

  // Para Vue: contar secciones, templates, estilos
  if (tipo === 'vue') {
    const sec = (content.match(/<section /g) || []).length;
    const tpl = (content.match(/<template[\s>]/g) || []).length;
    const css = (content.match(/<style[\s>]/g) || []).length;
    printInfo('<section>', sec);
    printInfo('<template>', tpl);
    printInfo('<style>', css);
  }
  printFooter();
}

async function cmdApply(planPath) {
  printHeader('APLICAR PLAN (transaccional)');
  if (!existeArchivo(planPath)) {
    printError(planPath, ['Plan no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  } catch (e) {
    printError(planPath, ['JSON invalido: ' + e.message]);
    printFooter();
    throw { _toolkit_exit: true };
  }

  const planes = Array.isArray(plan) ? plan : [plan];
  const esDryRun = args.includes('--dry-run') || args.includes('-n');

  if (esDryRun) {
    console.log('  ' + c.amarillo('MODO DRY-RUN') + ' (no se escribira nada)');
    console.log('');
  }

  const reporte = await aplicarPlanTransaccional(planes, { dryRun: esDryRun });

  // Reporte de preparacion
  console.log('  Archivos: ' + planes.length);
  console.log('  Saltados: ' + reporte.skipCount);
  console.log('');

  if (reporte.errors.length > 0) {
    console.log('───────────────────────────────────────────');
    console.log('  ❌ NO SE APLICO NADA (error de preparacion)');
    console.log('───────────────────────────────────────────');
    for (const e of reporte.errors) {
      console.log('  Archivo: ' + e.file);
      e.errores.forEach(x => console.log('     · ' + x));
    }
    if (reporte.rollback) {
      console.log('');
      console.log('  ⚠ Se hizo rollback de:');
      reporte.rollback.forEach(r => console.log('     ' + (r.ok ? '✅' : '❌') + ' ' + r.file));
    }
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('───────────────────────────────────────────');
  console.log('  ✅ APLICADO (transaccional)');
  console.log('───────────────────────────────────────────');
  for (const c of reporte.commits) {
    console.log('  ✅ ' + c.file + ' (' + c.ops.length + ' op)');
    if (c.backup) console.log('     Backup: ' + c.backup);
  }
  for (const p of reporte.preparados) {
    if (p.skipped) {
      console.log('  ⏭  ' + p.file + ' — ' + p.reason);
    }
  }
  console.log('');
  console.log('  Total commits: ' + reporte.commitCount);

  // Registrar en historial
  try {
    const entradas = reporte.commits.map(c => ({
      file: c.file,
      backup: c.backup,
      ops: c.ops || [],
      esNuevo: false,
      comando: 'apply',
    }));
    if (entradas.length > 0) {
      registrarBatch(process.cwd(), entradas);
      console.log('  Historial: ' + entradas.length + ' entrada(s) registrada(s)');
    }
  } catch (e) { console.error('Error registrando historial:', e.message); }
  printFooter();
}

async function aplicarPlan(p) {
  const r = { ok: false, skipped: false, applied: [], errors: [], backup: null, file: p.file };

  if (!p.file) {
    r.errors.push('Falta "file" en el plan');
    return r;
  }
  if (!existeArchivo(p.file)) {
    r.errors.push('Archivo no existe: ' + p.file);
    return r;
  }

  const original = fs.readFileSync(p.file, 'utf8');

  // Idempotencia
  if (p.idempotent && original.includes(p.idempotent)) {
    r.ok = true;
    r.skipped = true;
    r.reason = 'Encontrado: "' + p.idempotent + '"';
    return r;
  }

  // Backup
  if (!p.noBackup) {
    try {
      r.backup = p.file + '.bak-' + Date.now();
      fs.copyFileSync(p.file, r.backup);
    } catch (e) {
      r.errors.push('No se pudo crear backup: ' + e.message);
      return r;
    }
  }

  // Aplicar ops
  let content = original;
  for (let i = 0; i < (p.ops || []).length; i++) {
    const op = p.ops[i];
    const res = aplicarOp(content, op);
    if (!res.ok) {
      r.errors.push('Op ' + (i + 1) + ': ' + res.error);
      return r;
    }
    content = res.content;
    r.applied.push(res.desc || ('op ' + (i + 1)));
  }

  // Validar
  const v = await validar(p.file, content, p.tipo);
  if (!v.ok) {
    r.errors.push('Validacion fallo:');
    v.errors.forEach(e => r.errors.push('  · ' + e));
    return r;
  }

  // Escribir (atomico)
  try {
    const tmp = p.file + '.tmp-' + Date.now();
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, p.file);
  } catch (e) {
    r.errors.push('No se pudo escribir: ' + e.message);
    return r;
  }

  r.ok = true;
  return r;
}

async function cmdAnalyze(filePath, args) {
  printHeader('ANALIZAR REFACTOR');
  if (!existeArchivo(filePath)) {
    printError(filePath, ['Archivo no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }

  // Parsear args: --from "..." --until "..." --to "..." --style mixin
  const opts = parsearArgs(args);

  if (!opts.from) {
    printError(filePath, ['Falta --from "marcador inicio"']);
    console.log('   Ej: --from "// ===== TELEGRAM BACKUP =====" --until "// ===== SEGURIDAD ====="');
    printFooter();
    throw { _toolkit_exit: true };
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Si hay --blocks, analizar cada uno
  if (opts.blocks && opts.blocks.length > 0) {
    console.log('  ' + c.amarillo(opts.blocks.length + ' bloque(s) a analizar'));
    console.log('');
    for (let bi = 0; bi < opts.blocks.length; bi++) {
      const blk = opts.blocks[bi];
      const partes = blk.split(':');
      if (partes.length < 3) {
        console.log('  ' + c.rojo('Bloque ' + (bi + 1) + ' invalido: ' + blk));
        console.log('    Formato: nombre:inicio:fin');
        continue;
      }
      const nombre = partes[0];
      const desde = partes[1];
      const hasta = partes[2];

      console.log('-------------------------------------------');
      console.log('  BLOQUE ' + (bi + 1) + ': ' + c.negrita(nombre));
      console.log('-------------------------------------------');
      const a = analizar(filePath, content, desde, hasta);
      if (!a.ok) {
        console.log('  ' + c.rojo('Error: ' + a.error));
        continue;
      }
      console.log('  Metodos: ' + c.amarillo(a.metodos.length));
      console.log('  Lineas: ' + a.lineas);
      console.log('  Imports necesarios: ' + a.deps.importsUsados.length);
      console.log('');
      for (const m of a.metodos.slice(0, 15)) {
        console.log('    · ' + m.nombre + (m.esAsync ? ' [async]' : ''));
      }
      if (a.metodos.length > 15) console.log('    ... y ' + (a.metodos.length - 15) + ' mas');
      console.log('');
    }
    printFooter();
    return;
  }

  const analisis = analizar(filePath, content, opts.from, opts.until);

  if (!analisis.ok) {
    printError(filePath, [analisis.error]);
    printFooter();
    throw { _toolkit_exit: true };
  }

  // Si hay --to, validar que no exista
  if (opts.to && fs.existsSync(opts.to)) {
    console.log('  ⚠ El archivo destino ya existe: ' + opts.to);
    console.log('     Se sobreescribira (con backup).');
    console.log('');
  }

  console.log(formatearReporte(analisis));

  // Si --json, exportar a archivo
  if (opts.json) {
    try {
      const datos = {
        origen: analisis.origen,
        marcadorInicio: analisis.marcadorInicio,
        marcadorFin: analisis.marcadorFin,
        lineas: analisis.lineas,
        bytes: analisis.bytes,
        metodos: analisis.metodos.map(m => ({ nombre: m.nombre, esAsync: m.esAsync })),
        dependencias: analisis.deps,
      };
      fs.writeFileSync(opts.json, JSON.stringify(datos, null, 2) + '\n');
      console.log('  ' + c.verde('Analisis exportado') + ' a ' + c.cian(opts.json));
      console.log('');
    } catch (e) {
      console.log('  ' + c.rojo('No se pudo escribir JSON: ' + e.message));
    }
  }

  // Si --to, mostrar preview del mixin
  if (opts.to) {
    console.log('───────────────────────────────────────────');
    console.log('  PREVIEW DEL MIXIN (' + opts.to + ')');
    console.log('───────────────────────────────────────────');
    const mixinContent = generarMixin(analisis, { destino: opts.to });
    const lineas = mixinContent.split('\n');
    lineas.slice(0, 30).forEach(l => console.log('  ' + l));
    if (lineas.length > 30) console.log('  ... (' + (lineas.length - 30) + ' lineas mas)');
    console.log('');
  }

  console.log('  ▶  Para aplicar este refactor:');
  console.log('     node toolkit.mjs refactor ' + filePath + ' \\');
  console.log('       --from ' + JSON.stringify(opts.from) + ' \\');
  if (opts.until) console.log('       --until ' + JSON.stringify(opts.until) + ' \\');
  if (opts.to) console.log('       --to ' + JSON.stringify(opts.to) + ' \\');
  console.log('       --apply');
  console.log('');
}

async function cmdRefactor(filePath, args) {
  printHeader('REFACTOR');
  if (!existeArchivo(filePath)) {
    printError(filePath, ['Archivo no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }

  const opts = parsearArgs(args);

  if (!opts.from) {
    printError(filePath, ['Falta --from "marcador inicio"']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  if (!opts.to) {
    printError(filePath, ['Falta --to "archivo destino"']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  if (!opts.apply) {
    console.log('  ⚠ Falta --apply. Usa "analyze" primero para revisar.');
    console.log('     O corre de nuevo con --apply al final.');
    printFooter();
    throw { _toolkit_exit: true };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const analisis = analizar(filePath, content, opts.from, opts.until);

  if (!analisis.ok) {
    printError(filePath, [analisis.error]);
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('  Analisis: ' + analisis.metodos.length + ' metodos · ' + analisis.lineas + ' lineas');
  console.log('');

  const reporte = await aplicarRefactor(analisis, {
    destino: opts.to,
    nombreMixin: opts.nombre,
    refsAuto: opts.noRefs ? false : true,
    dirProyecto: process.cwd(),
  });

  console.log('───────────────────────────────────────────');
  reporte.pasos.forEach(p => console.log('  ' + p));
  if (reporte.errores.length) {
    console.log('');
    console.log('  ERRORES:');
    reporte.errores.forEach(e => console.log('     ' + e));
    if (reporte.backupOrigen) {
      console.log('     Backup: ' + reporte.backupOrigen);
    }
    printFooter();
    throw { _toolkit_exit: true };
  }
  console.log('===========================================');
  console.log('  REFACTOR APLICADO');
  if (reporte.backupOrigen) console.log('  Backup origen: ' + reporte.backupOrigen);
  console.log('===========================================');

  // Avisar de refs externas
  if (reporte.refsExternas && Object.keys(reporte.refsExternas).length > 0) {
    console.log('');
    console.log('-------------------------------------------');
    console.log('  REFERENCIAS EXTERNAS DETECTADAS');
    console.log('-------------------------------------------');
    console.log('  Estos metodos se usan tambien fuera del bloque.');
    console.log('  Verifica que las llamadas sigan funcionando con el mixin:');
    console.log('');
    for (const [nombre, refs] of Object.entries(reporte.refsExternas)) {
      const total = refs.reduce((s, r) => s + r.total, 0);
      console.log('  ' + c.amarillo(nombre) + ' (' + total + ' referencia(s)):');
      for (const r of refs.slice(0, 3)) {
        console.log('    · ' + c.cian(r.archivo) + ' — L' + r.matches[0].linea);
      }
      if (refs.length > 3) console.log('    ... y ' + (refs.length - 3) + ' archivo(s) mas');
    }
  }

  console.log('');
  console.log('  Falta manualmente:');
  console.log('     1. Añadir el import del mixin en ' + filePath);
  console.log('     2. Añadirlo a "mixins: [...]"');
  console.log('     3. node toolkit.mjs verify (validar todo)');
  console.log('');
}

function parsearArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') opts.from = args[++i];
    else if (a === '--until') opts.until = args[++i];
    else if (a === '--to') opts.to = args[++i];
    else if (a === '--style') opts.style = args[++i];
    else if (a === '--nombre') opts.nombre = args[++i];
    else if (a === '--apply') opts.apply = true;
    else if (a === '--no-refs') opts.noRefs = true;
    else if (a === '--json') opts.json = args[++i];
    else if (a === '--block') {
      if (!opts.blocks) opts.blocks = [];
      opts.blocks.push(args[++i]);
    }
  }
  return opts;
}

async function cmdRefs(args) {
  printHeader('BUSCAR REFERENCIAS');
  if (args.length < 1) {
    printError('', ['Falta el simbolo a buscar']);
    console.log('   Uso: node toolkit.mjs refs <simbolo> [--dir src] [--exclude file]');
    printFooter();
    throw { _toolkit_exit: true };
  }

  const simbolo = args[0];
  const opts = { dir: 'src', excluir: [], contexto: 0 };

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--dir') opts.dir = args[++i];
    else if (a === '--exclude') opts.excluir.push(args[++i]);
    else if (a === '--context') opts.contexto = parseInt(args[++i]) || 0;
  }

  if (!fs.existsSync(opts.dir)) {
    printError(opts.dir, ['Directorio no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('  Simbolo: ' + simbolo);
  console.log('  Directorio: ' + opts.dir);
  if (opts.excluir.length) console.log('  Excluidos: ' + opts.excluir.join(', '));
  console.log('');

  const refs = buscarReferencias(opts.dir, simbolo, {
    excluir: opts.excluir,
    contextoLineas: opts.contexto,
  });

  if (refs.length === 0) {
    console.log('  (sin coincidencias)');
    printFooter();
    return;
  }

  console.log('───────────────────────────────────────────');
  console.log('  REFERENCIAS ENCONTRADAS');
  console.log('───────────────────────────────────────────');
  for (const r of refs) {
    console.log('');
    console.log('  📄 ' + r.archivo + ' (' + r.total + ' vez' + (r.total > 1 ? 'es' : '') + ')');
    for (const m of r.matches.slice(0, 10)) {
      console.log('     L' + m.linea + ': ' + m.texto.slice(0, 80));
    }
    if (r.matches.length > 10) {
      console.log('     ... (' + (r.matches.length - 10) + ' mas)');
    }
  }
  console.log('');

  // Resumen
  console.log('───────────────────────────────────────────');
  console.log('  RESUMEN');
  console.log('───────────────────────────────────────────');
  console.log('  Total archivos: ' + refs.length);
  const total = refs.reduce((s, r) => s + r.total, 0);
  console.log('  Total coincidencias: ' + total);
  printFooter();
}

async function cmdRefsMulti(args) {
  printHeader('BUSCAR REFERENCIAS MULTIPLES');
  const simbolosFile = args[0];
  if (!simbolosFile || !existeArchivo(simbolosFile)) {
    printError('', ['Uso: node toolkit.mjs refs-multi <archivo.txt|json> [--dir src]']);
    printFooter();
    throw { _toolkit_exit: true };
  }

  let simbolos;
  const content = fs.readFileSync(simbolosFile, 'utf8');
  if (simbolosFile.endsWith('.json')) {
    try { simbolos = JSON.parse(content); }
    catch (e) { printError(simbolosFile, ['JSON invalido: ' + e.message]); process.exit(1); }
  } else {
    simbolos = content.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  }

  const opts = { dir: 'src' };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--dir') opts.dir = args[++i];
  }

  console.log('  Simbolos: ' + simbolos.length);
  console.log('  Directorio: ' + opts.dir);
  console.log('');

  const res = buscarMultiplesReferencias(opts.dir, simbolos);

  for (const [simbolo, refs] of Object.entries(res)) {
    const total = refs.reduce((s, r) => s + r.total, 0);
    const archivos = refs.map(r => r.archivo).slice(0, 3).join(', ');
    const mas = refs.length > 3 ? ' +' + (refs.length - 3) + ' mas' : '';
    console.log('  ' + simbolo.padEnd(30) + ' ' + String(total).padStart(3) + ' veces  [' + archivos + mas + ']');
  }
  printFooter();
}

async function cmdSearch(args) {
  printHeader('BUSCAR');
  if (args.length < 1) {
    printError('', ['Falta el patron a buscar']);
    console.log('   Uso: node toolkit.mjs search "texto" --dir src --ext .vue,.js');
    printFooter();
    throw { _toolkit_exit: true };
  }
  const patron = args[0];
  const opts = { dir: 'src', ext: null, ignoreCase: false, usarRegex: false, contexto: 0, excluir: [] };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--dir') opts.dir = args[++i];
    else if (a === '--ext') opts.ext = args[++i].split(',').map(e => e.trim().startsWith('.') ? e.trim() : '.' + e.trim());
    else if (a === '--ignore-case' || a === '-i') opts.ignoreCase = true;
    else if (a === '--regex') opts.usarRegex = true;
    else if (a === '--context') opts.contexto = parseInt(args[++i]) || 0;
    else if (a === '--exclude') opts.excluir.push(args[++i]);
  }
  if (!fs.existsSync(opts.dir)) {
    printError(opts.dir, ['Directorio no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  console.log('  Patron: ' + c.amarillo(patron));
  console.log('  Directorio: ' + c.cian(opts.dir));
  console.log('');
  const refs = buscarTexto(opts.dir, patron, opts);
  if (refs.length === 0) {
    console.log('  (sin coincidencias)');
    printFooter();
    return;
  }
  console.log('-------------------------------------------');
  for (const r of refs) {
    console.log('');
    console.log('  ' + c.cian(r.archivo) + ' (' + r.total + ')');
    for (const m of r.matches.slice(0, 10)) {
      console.log('     L' + m.linea + ': ' + m.texto.slice(0, 100));
    }
    if (r.matches.length > 10) {
      console.log('     ... (' + (r.matches.length - 10) + ' mas)');
    }
  }
  console.log('');
  console.log('  Total: ' + refs.length + ' archivo(s), ' + refs.reduce((sum, r) => sum + r.total, 0) + ' coincidencia(s)');
  printFooter();
}

async function cmdTree(args) {
  printHeader('ARBOL DEL PROYECTO');
  const dir = args[0] || '.';
  if (!fs.existsSync(dir)) {
    printError(dir, ['Directorio no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  let opts = { maxDepth: 4, mostrarTamanos: true, mostrarLineas: false, soloDirs: false };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--depth') opts.maxDepth = parseInt(args[++i]) || 4;
    else if (args[i] === '--no-sizes') opts.mostrarTamanos = false;
    else if (args[i] === '--lines') opts.mostrarLineas = true;
    else if (args[i] === '--dirs-only') opts.soloDirs = true;
  }
  const { arbol, stats } = arbolProyecto(dir, opts);
  console.log(arbol);
  console.log('');
  console.log('-------------------------------------------');
  console.log('  ' + stats.totalArchivos + ' archivo(s) · ' + stats.totalDirs + ' carpeta(s)');
  console.log('  Tamano total: ' + formatearBytes(stats.totalBytes));
  if (opts.mostrarLineas) {
    console.log('  Lineas totales: ' + stats.totalLineas);
  }
  printFooter();
}

async function cmdStats(args) {
  printHeader('ESTADISTICAS');
  const dir = args[0] || '.';
  if (!fs.existsSync(dir)) {
    printError(dir, ['Directorio no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  const st = statsProyecto(dir);
  console.log('  Directorio: ' + c.cian(dir));
  console.log('  Archivos:   ' + st.totalArchivos);
  console.log('  Tamano:     ' + formatearBytes(st.totalBytes));
  console.log('  Lineas:     ' + st.totalLineas + ' (' + st.totalLineasVacias + ' vacias)');
  console.log('');
  console.log('-------------------------------------------');
  console.log('  POR EXTENSION');
  console.log('-------------------------------------------');
  const extOrdenadas = Object.entries(st.porExt).sort((a, b) => b[1].bytes - a[1].bytes);
  for (const [ext, info] of extOrdenadas) {
    const nombre = ext.padEnd(12);
    console.log('  ' + nombre + String(info.archivos).padStart(5) + ' arch  ' + formatearBytes(info.bytes).padStart(10) + '  ' + String(info.lineas).padStart(6) + ' lineas');
  }
  console.log('');
  console.log('-------------------------------------------');
  console.log('  ARCHIVOS MAS GRANDES');
  console.log('-------------------------------------------');
  for (const a of st.masGrandes) {
    console.log('  ' + formatearBytes(a.bytes).padStart(10) + '  ' + String(a.lineas).padStart(6) + ' lineas  ' + a.archivo);
  }
  printFooter();
}

async function cmdDiff(args) {
  printHeader('DIFF');
  if (args.length < 1) {
    printError('', ['Uso: node toolkit.mjs diff <archivo> --context 3']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  const archivo = args[0];
  if (!fs.existsSync(archivo)) {
    printError(archivo, ['Archivo no existe']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  let contexto = 3;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--context') contexto = parseInt(args[++i]) || 3;
  }
  const dir = path.dirname(archivo);
  const base = path.basename(archivo);
  const candidatos = fs.readdirSync(dir)
    .filter(f => f.startsWith(base + '.bak-'))
    .map(f => ({ f, ts: parseInt(f.split('.bak-')[1]) || 0 }))
    .sort((a, b) => b.ts - a.ts);
  if (candidatos.length === 0) {
    console.log('  (no hay backups)');
    printFooter();
    return;
  }
  const backupPath = path.join(dir, candidatos[0].f);
  const antes = fs.readFileSync(backupPath, 'utf8');
  const despues = fs.readFileSync(archivo, 'utf8');
  const res = resumenDiff(antes, despues);
  if (res.add === 0 && res.del === 0) {
    console.log('  (sin cambios)');
    printFooter();
    return;
  }
  console.log('  Backup: ' + c.gris(path.basename(backupPath)));
  console.log('  Actual: ' + c.cian(archivo));
  console.log('  ' + c.verde('+' + res.add) + ' / ' + c.rojo('-' + res.del));
  console.log('');
  console.log(diffLineas(antes, despues, { contexto }));
  printFooter();
}

async function cmdPlanNew(args) {
  printHeader('NUEVO PLAN');
  if (args.length < 1) {
    printError('', ['Uso: node toolkit.mjs plan:new <archivo destino>']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  const destino = args[0];
  if (fs.existsSync(destino)) {
    printError(destino, ['Ya existe ese archivo']);
    printFooter();
    throw { _toolkit_exit: true };
  }
  const plantilla = {
    file: 'src/App.vue',
    idempotent: 'MI_MARCA_UNICA',
    ops: [
      { replace: { old: 'texto viejo', new: 'texto nuevo' } }
    ]
  };
  fs.writeFileSync(destino, JSON.stringify(plantilla, null, 2) + '\n');
  console.log('  Creado: ' + c.cian(destino));
  console.log('');
  console.log('  Editalo y despues:');
  console.log('    node toolkit.mjs apply ' + destino);
  printFooter();
}

async function cmdConfig(args) {
  printHeader('CONFIGURACION');
  const { encontrado, ruta, config, error } = buscarConfig();
  if (error) {
    printError('', [error]);
    printFooter();
    throw { _toolkit_exit: true };
  }
  if (!encontrado) {
    console.log('  No hay .toolkitrc.json en este proyecto.');
    console.log('');
    console.log('  Config por defecto:');
    console.log(JSON.stringify(configDefault(), null, 2));
  } else {
    console.log('  Encontrado: ' + c.cian(ruta));
    console.log('');
    console.log(JSON.stringify(config, null, 2));
  }
  printFooter();
}

async function cmdLog(args) {
  printHeader('HISTORIAL');
  const dirBase = process.cwd();
  const opts = { limite: 20, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' || args[i] === '-n') opts.limite = parseInt(args[++i]) || 20;
    else if (args[i] === '--file' || args[i] === '-f') opts.file = args[++i];
  }

  const entradas = listarHistorial(dirBase, opts);

  if (entradas.length === 0) {
    console.log('  (historial vacio)');
    printFooter();
    return;
  }

  console.log('  Ultimos ' + entradas.length + ' cambio(s)');
  if (opts.file) console.log('  Filtrado por: ' + c.cian(opts.file));
  console.log('');
  console.log('-------------------------------------------');

  for (const e of entradas) {
    const fecha = new Date(e.fecha);
    const fstr = fecha.toLocaleDateString('es') + ' ' + String(fecha.getHours()).padStart(2, '0') + ':' + String(fecha.getMinutes()).padStart(2, '0');
    console.log('');
    console.log('  ' + c.amarillo(e.id) + '  ' + c.gris(fstr));
    console.log('  ' + c.cian(e.file) + (e.esNuevo ? c.verde(' [nuevo]') : ''));
    if (e.ops && e.ops.length) {
      for (const op of e.ops.slice(0, 3)) {
        console.log('    · ' + op);
      }
      if (e.ops.length > 3) console.log('    ... (' + (e.ops.length - 3) + ' mas)');
    }
    if (e.backup) console.log('    ' + c.gris('backup: ' + e.backup));
  }
  console.log('');
  console.log('  Para deshacer: ' + c.verde('node toolkit.mjs undo'));
  printFooter();
}

async function cmdUndo(args) {
  printHeader('DESHACER');
  const dirBase = process.cwd();
  let cantidad = 1;
  let file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') file = args[++i];
    else if (/^\d+$/.test(args[i])) cantidad = parseInt(args[i]);
  }

  const r = deshacer(dirBase, cantidad, { file });

  if (!r.ok) {
    console.log('  ' + c.rojo(r.error));
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('  Deshechos: ' + r.cantidad + ' cambio(s)');
  console.log('');
  for (const d of r.deshechos) {
    if (d.ok) {
      console.log('  ' + c.verde('OK') + '  ' + c.cian(d.file) + ' (' + d.accion + ')');
    } else {
      console.log('  ' + c.rojo('FALLO') + '  ' + c.cian(d.file) + ' — ' + d.error);
    }
  }
  printFooter();
}

async function cmdVerify(args) {
  printHeader('VERIFICAR PROYECTO');
  const dirBase = process.cwd();
  let correrTests = true;
  let correrBuild = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-tests') correrTests = false;
    else if (args[i] === '--no-build') correrBuild = false;
    else if (args[i] === '--fast') { correrTests = false; correrBuild = false; }
  }

  console.log('  Directorio: ' + c.cian(dirBase));
  console.log('  Tests:  ' + (correrTests ? c.verde('si') : c.gris('no')));
  console.log('  Build:  ' + (correrBuild ? c.verde('si') : c.gris('no')));
  console.log('');

  const r = await verificarProyecto(dirBase, { correrTests, correrBuild });

  for (const paso of r.pasos) {
    console.log('-------------------------------------------');
    if (paso.saltado) {
      console.log('  ' + c.gris('⏭') + '  ' + c.negrita(paso.nombre) + ' — ' + c.gris(paso.saltado));
    } else if (paso.ok) {
      console.log('  ' + c.verde('OK') + '  ' + c.negrita(paso.nombre));
    } else {
      console.log('  ' + c.rojo('FALLO') + '  ' + c.negrita(paso.nombre));
      for (const d of paso.detalles) {
        const lineas = (typeof d === 'string' ? d : JSON.stringify(d)).split('\n');
        for (const l of lineas.slice(0, 15)) {
          console.log('     ' + c.gris(l));
        }
      }
    }
  }

  console.log('');
  console.log('===========================================');
  if (r.ok) {
    console.log('  ' + c.verde('✅ TODO OK'));
  } else {
    console.log('  ' + c.rojo('❌ HAY ERRORES'));
  }
  console.log('===========================================');
  process.exit(r.ok ? 0 : 1);
}

async function cmdSave(args) {
  printHeader('GUARDAR Y SUBIR');
  const dirBase = process.cwd();
  const mensaje = args[0];

  if (!mensaje) {
    console.error('  Falta el mensaje de commit');
    console.log('  Uso: node toolkit.mjs save "feat: añadir algo"');
    printFooter();
    throw { _toolkit_exit: true };
  }

  let push = true;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--no-push') push = false;
  }

  const r = guardarCambios(dirBase, mensaje, { push });

  console.log('');
  for (const p of r.pasos) {
    if (p.ok) {
      console.log('  ' + c.verde('OK') + '  ' + p.mensaje);
    } else {
      console.log('  ' + c.rojo('FALLO') + '  ' + p.mensaje);
      if (p.detalle) {
        for (const l of p.detalle.split('\n').slice(0, 10)) {
          console.log('     ' + c.gris(l));
        }
      }
    }
  }

  if (r.ok) {
    console.log('');
    if (r.hash) console.log('  Commit: ' + c.amarillo(r.hash));
    if (r.repo) console.log('  Repo:   ' + c.cian(r.repo));
    if (r.actionsUrl) console.log('  Actions: ' + c.cian(r.actionsUrl));
  }

  printFooter();
  process.exit(r.ok ? 0 : 1);
}

async function cmdFix(args) {
  printHeader('FIX - PROBLEMAS DETECTADOS');
  const dirBase = process.cwd();
  const soloAuto = args.includes('--auto');
  const sinFixes = args.includes('--dry-run');

  console.log('  Directorio: ' + c.cian(dirBase));
  console.log('');

  const problemas = detectarProblemas(dirBase);

  if (problemas.length === 0) {
    console.log('  ' + c.verde('✅ Todo limpio'));
    printFooter();
    return;
  }

  console.log('-------------------------------------------');
  console.log('  ' + problemas.length + ' problema(s) encontrado(s)');
  console.log('-------------------------------------------');

  for (const p of problemas) {
    console.log('');
    const tag = p.automatico ? c.verde('[auto]') : c.amarillo('[manual]');
    console.log('  ' + tag + ' ' + c.negrita(p.titulo));
    console.log('    ' + c.gris(p.detalle));
    if (p.detalles) {
      for (const d of p.detalles.slice(0, 5)) {
        console.log('      ' + c.gris(d.archivo + ':' + d.linea + ' — ' + d.texto.slice(0, 60)));
      }
      if (p.detalles.length > 5) console.log('      ' + c.gris('... y ' + (p.detalles.length - 5) + ' mas'));
    }
    if (p.fix) console.log('    Fix: ' + c.cian(p.fix));
  }

  console.log('');
  console.log('-------------------------------------------');

  const automaticos = problemas.filter(p => p.automatico);
  if (automaticos.length === 0) {
    console.log('  No hay fixes automaticos disponibles');
    printFooter();
    return;
  }

  if (sinFixes) {
    console.log('  Se aplicarian ' + automaticos.length + ' fix(es) automaticos');
    printFooter();
    return;
  }

  const fixes = aplicarFixesAutomaticos(dirBase, problemas);
  console.log('  Fixes aplicados:');
  for (const f of fixes) {
    if (f.ok) console.log('  ' + c.verde('OK') + '  ' + f.mensaje);
    else console.log('  ' + c.rojo('FALLO') + '  ' + f.mensaje);
  }
  printFooter();
}

async function cmdMake(args) {
  printHeader('CREAR ARCHIVO');
  const dirBase = process.cwd();

  if (args.length < 1) {
    console.log('  Uso: node toolkit.mjs make:<tipo> <nombre> [--dir <ruta>]');
    console.log('');
    console.log('  Tipos disponibles:');
    for (const [tipo, info] of Object.entries(TEMPLATES)) {
      console.log('    ' + c.amarillo(tipo.padEnd(12)) + ' ' + info.desc);
    }
    printFooter();
    return;
  }

  // El tipo viene como make:vue, make:mixin, etc.
  const tipoRaw = args[0];
  let tipo = tipoRaw;
  if (tipoRaw.includes(':')) tipo = tipoRaw.split(':')[1];

  const nombre = args[1];
  if (!nombre) {
    console.error('  Falta el nombre del archivo');
    printFooter();
    throw { _toolkit_exit: true };
  }

  const opts = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--dir') opts.dir = args[++i];
    else if (args[i] === '--force') opts.force = true;
  }

  const r = crearDesdeTemplate(tipo, nombre, dirBase, opts);

  if (!r.ok) {
    console.log('  ' + c.rojo('FALLO') + '  ' + r.error);
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('  ' + c.verde('Creado') + '  ' + c.cian(r.archivo));
  console.log('');
  console.log('  Siguiente:');
  console.log('    ' + c.gris('node toolkit.mjs validate ' + r.archivo));
  printFooter();
}

async function cmdMakeHelp() {
  printHeader('TEMPLATES DISPONIBLES');
  console.log('');
  for (const [tipo, info] of Object.entries(TEMPLATES)) {
    console.log('  ' + c.amarillo(tipo.padEnd(12)) + ' ' + info.desc);
    console.log('    ' + c.gris('Crea: ' + info.dir + '/<nombre>' + info.ext));
  }
  console.log('');
  console.log('  Uso: node toolkit.mjs make:<tipo> <nombre>');
  printFooter();
}

async function cmdAction(args) {
  printHeader('GITHUB ACTIONS');
  const dirBase = process.cwd();
  const sub = args[0];

  const repo = detectarRepo(dirBase);
  if (!repo) {
    console.log('  ' + c.rojo('No es un repo de GitHub'));
    printFooter();
    throw { _toolkit_exit: true };
  }

  const info = infoUltimoCommit(dirBase);

  console.log('  Repo: ' + c.cian(repo.full));
  console.log('  Commit: ' + c.amarillo(info.hashCorto));
  console.log('  Mensaje: ' + info.mensaje);
  console.log('  Fecha: ' + c.gris(info.fecha));
  console.log('');

  const urlA = urlActions(dirBase);
  const urlC = urlCommit(dirBase);

  if (sub === 'open' || sub === 'abrir') {
    console.log('  Actions: ' + c.cian(urlA));
    console.log('  Commit:  ' + c.cian(urlC));
    console.log('');
    console.log('  Para abrir en el navegador:');
    console.log('    ' + c.verde('termux-open-url "' + urlA + '"'));
  } else {
    console.log('  URLs:');
    console.log('    Actions: ' + c.cian(urlA));
    console.log('    Commit:  ' + c.cian(urlC));
    console.log('');
    console.log('  Para abrir:');
    console.log('    ' + c.gris('node toolkit.mjs action open'));
  }
  printFooter();
}

async function cmdWatch(args) {
  printHeader('WATCH MODE');
  const dirBase = process.cwd();
  let dir = args[0] || 'src';
  let plan = null;
  let autoSave = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--plan') plan = args[++i];
    else if (args[i] === '--save') autoSave = true;
  }

  if (!fs.existsSync(dir)) {
    console.log('  ' + c.rojo('Directorio no existe: ' + dir));
    printFooter();
    throw { _toolkit_exit: true };
  }

  if (plan && !fs.existsSync(plan)) {
    console.log('  ' + c.rojo('Plan no existe: ' + plan));
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('  Directorio: ' + c.cian(dir));
  if (plan) console.log('  Plan: ' + c.cian(plan));
  console.log('  Auto-save: ' + (autoSave ? c.verde('si') : c.gris('no')));
  console.log('');
  console.log('  ' + c.gris('Vigilando cambios... (Ctrl+C para salir)'));
  console.log('');

  const watcher = vigilar(dir, async (archivos) => {
    const hora = new Date().toLocaleTimeString();
    console.log('  ' + c.gris(hora) + ' ' + c.amarillo(archivos.length) + ' archivo(s) cambiaron');
    for (const a of archivos.slice(0, 5)) {
      console.log('    ' + c.cian(path.relative(dirBase, a)));
    }

    if (plan) {
      try {
        console.log('  Aplicando plan...');
        const planContenido = JSON.parse(fs.readFileSync(plan, 'utf8'));
        const planes = Array.isArray(planContenido) ? planContenido : [planContenido];
        const reporte = await aplicarPlanTransaccional(planes);
        if (reporte.ok) {
          console.log('  ' + c.verde('OK') + ' plan aplicado (' + reporte.commitCount + ')');
        } else {
          console.log('  ' + c.rojo('FALLO') + ' plan no aplicado');
        }
      } catch (e) {
        console.log('  ' + c.rojo('Error aplicando plan:') + ' ' + e.message);
      }
    }

    if (autoSave) {
      console.log('  Verificando...');
      const v = await verificarProyecto(dirBase, { correrTests: false, correrBuild: false });
      if (v.ok) {
        console.log('  ' + c.verde('OK') + ' validacion pasada');
      } else {
        console.log('  ' + c.rojo('FALLO') + ' hay errores de validacion');
      }
    }
  });

  process.on('SIGINT', () => {
    console.log('');
    console.log('  Cerrando watch...');
    watcher.cerrar();
    printFooter();
    process.exit(0);
  });

  // Mantener el proceso vivo
  await new Promise(() => {});
}

async function cmdMenu(args) {
  const dirBase = process.cwd();

  const opciones = [
    { etiqueta: 'Analizar el proyecto', accion: async () => {
      const { arbol, stats } = arbolProyecto(dirBase, { maxDepth: 3 });
      console.log('');
      console.log(arbol);
    }},
    { etiqueta: 'Buscar algo', accion: async () => {
      const patron = await pedirTexto('Que buscar?');
      if (!patron) return;
      const refs = buscarTexto('src', patron, { ignoreCase: true });
      console.log('');
      for (const r of refs) {
        console.log('  ' + c.cian(r.archivo) + ' (' + r.total + ')');
      }
      if (refs.length === 0) console.log('  ' + c.gris('Sin coincidencias'));
    }},
    { etiqueta: 'Aplicar un plan', accion: async () => {
      const plan = await pedirTexto('Ruta del plan (JSON)');
      if (!plan || !fs.existsSync(plan)) { console.log('  No existe'); return; }
      const contenido = JSON.parse(fs.readFileSync(plan, 'utf8'));
      const planes = Array.isArray(contenido) ? contenido : [contenido];
      const r = await aplicarPlanTransaccional(planes);
      console.log('  ' + (r.ok ? c.verde('OK') : c.rojo('FALLO')));
    }},
    { etiqueta: 'Refactorizar un bloque', accion: async () => {
      const archivo = await pedirTexto('Archivo origen', 'src/App.vue');
      const desde = await pedirTexto('Marcador inicio');
      const hasta = await pedirTexto('Marcador fin (vacio = hasta el final)');
      const destino = await pedirTexto('Archivo destino');
      if (!archivo || !desde || !destino) return;
      const content = fs.readFileSync(archivo, 'utf8');
      const analisis = analizar(archivo, content, desde, hasta);
      if (!analisis.ok) { console.log('  ' + c.rojo(analisis.error)); return; }
      console.log('  ' + analisis.metodos.length + ' metodos detectados');
      const ok = await pedirConfirmacion('Aplicar refactor?');
      if (!ok) return;
      const r = await aplicarRefactor(analisis, { destino, dirProyecto: dirBase });
      console.log('  ' + (r.ok ? c.verde('OK') : c.rojo('FALLO')));
      if (!r.ok) r.errores.forEach(e => console.log('    ' + e));
    }},
    { etiqueta: 'Ver historial', accion: async () => {
      const entradas = listarHistorial(dirBase, { limite: 10 });
      if (entradas.length === 0) { console.log('  Sin cambios'); return; }
      for (const e of entradas) {
        console.log('  ' + c.amarillo(e.id) + '  ' + c.cian(e.file));
      }
    }},
    { etiqueta: 'Deshacer ultimo cambio', accion: async () => {
      const ok = await pedirConfirmacion('Deshacer el ultimo cambio?');
      if (!ok) return;
      const r = deshacer(dirBase, 1);
      console.log('  ' + (r.ok ? c.verde('OK') : c.rojo('FALLO')));
    }},
    { etiqueta: 'Verify (validar + tests + build)', accion: async () => {
      const r = await verificarProyecto(dirBase, { correrTests: true, correrBuild: true });
      console.log('  ' + (r.ok ? c.verde('TODO OK') : c.rojo('HAY ERRORES')));
    }},
    { etiqueta: 'Ver problemas (fix --dry-run)', accion: async () => {
      const problemas = detectarProblemas(dirBase);
      if (problemas.length === 0) { console.log('  ' + c.verde('Todo limpio')); return; }
      for (const p of problemas) console.log('  · ' + p.titulo);
    }},
    { etiqueta: 'Ver estado de GitHub Actions', accion: async () => {
      const url = urlActions(dirBase);
      if (!url) { console.log('  No es repo GitHub'); return; }
      console.log('  ' + c.cian(url));
      console.log('  Abrir: termux-open-url "' + url + '"');
    }},
    { etiqueta: 'Commit + push rapido', accion: async () => {
      const msg = await pedirTexto('Mensaje del commit');
      if (!msg) return;
      const r = guardarCambios(dirBase, msg, { push: true });
      console.log('  ' + (r.ok ? c.verde('OK ' + (r.hash || '')) : c.rojo('FALLO')));
      if (r.actionsUrl) console.log('  ' + r.actionsUrl);
    }},
  ];

  const seleccion = await crearMenu({ titulo: 'TOOLKIT', items: opciones });
  if (seleccion.cancelado) return;

  console.log('');
  await seleccion.item.accion();
  console.log('');
}

async function validarMultiples(archivos) {
  printHeader('VALIDAR ' + archivos.length + ' ARCHIVO(S)');
  console.log('');

  const resultados = [];
  let todoOk = true;

  for (const archivo of archivos) {
    if (!existeArchivo(archivo)) {
      console.log('  ' + c.rojo('❌') + '  ' + c.cian(archivo) + '  ' + c.rojo('(no existe)'));
      todoOk = false;
      continue;
    }
    const tipo = detectarTipo(archivo);
    const content = fs.readFileSync(archivo, 'utf8');
    const v = await validar(archivo, content);
    const validador = tipoDeValidador(tipo);

    if (v.ok) {
      console.log('  ' + c.verde('✅') + '  ' + c.cian(archivo.padEnd(30)) + '  ' + c.gris(validador));
      if (v.warning) console.log('      ' + c.amarillo('⚠ ' + v.warning));
    } else {
      console.log('  ' + c.rojo('❌') + '  ' + c.cian(archivo.padEnd(30)) + '  ' + c.gris(validador));
      for (const err of v.errors.slice(0, 3)) {
        console.log('      ' + c.rojo(err));
      }
      todoOk = false;
    }
    resultados.push({ archivo, ok: v.ok });
  }

  console.log('');
  console.log('-------------------------------------------');
  const pasan = resultados.filter(r => r.ok).length;
  console.log('  ' + c.verde(pasan + ' OK') + '  ·  ' + (resultados.length - pasan > 0 ? c.rojo((resultados.length - pasan) + ' FALLO') : c.gris('0 FALLO')));
  printFooter();
  process.exit(todoOk ? 0 : 1);
}

async function cmdOrphans(args) {
  printHeader('METODOS HUERFANOS');
  const dirBase = process.cwd();
  let archivo = args[0];

  if (!archivo) {
    // Si no hay archivo, analizar todos los .vue y .js en src/
    const srcDir = path.join(dirBase, 'src');
    if (!fs.existsSync(srcDir)) {
      console.log('  ' + c.rojo('No hay carpeta src/'));
      printFooter();
    throw { _toolkit_exit: true };
    }
    const archivos = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.vue') || e.name.endsWith('.js')) archivos.push(full);
      }
    }
    walk(srcDir);
    console.log('  Analizando ' + archivos.length + ' archivo(s) en src/');
    console.log('');

    let totalHuerfanos = 0;
    for (const a of archivos) {
      const r = detectarHuerfanos(a, dirBase);
      if (r.ok && r.huerfanos.length > 0) {
        console.log('  ' + c.cian(path.relative(dirBase, a)));
        for (const h of r.huerfanos) {
          console.log('    · ' + c.amarillo(h.nombre) + ' (L' + h.linea + ')');
        }
        totalHuerfanos += r.huerfanos.length;
      }
    }

    console.log('');
    if (totalHuerfanos === 0) {
      console.log('  ' + c.verde('Sin metodos huerfanos'));
    } else {
      console.log('  Total: ' + c.amarillo(totalHuerfanos) + ' metodo(s) sin uso');
      console.log('');
      console.log('  Estos metodos ya no se llaman desde ningun lado.');
      console.log('  Revisalos y eliminalos si no los necesitas.');
    }
    printFooter();
    return;
  }

  // Analizar un archivo especifico
  if (!fs.existsSync(archivo)) {
    console.log('  ' + c.rojo('Archivo no existe: ' + archivo));
    printFooter();
    throw { _toolkit_exit: true };
  }

  const r = detectarHuerfanos(archivo, dirBase);

  if (!r.ok) {
    console.log('  ' + c.rojo('Error: ' + r.error));
    printFooter();
    throw { _toolkit_exit: true };
  }

  console.log('  Archivo: ' + c.cian(archivo));
  console.log('  Metodos: ' + r.total);
  console.log('');

  if (r.huerfanos.length === 0) {
    console.log('  ' + c.verde('✅ Sin metodos huerfanos'));
    printFooter();
    return;
  }

  console.log('  ' + c.amarillo('⚠ ' + r.huerfanos.length + ' metodo(s) sin uso:'));
  console.log('');
  for (const h of r.huerfanos) {
    console.log('  · ' + c.negrita(h.nombre) + ' ' + c.gris('(L' + h.linea + ')'));
  }
  printFooter();
}

async function cmdHelp() {
  console.log(`
toolkit - Herramienta universal de parcheo y validacion

USO:
  node toolkit.mjs <comando> [args]

COMANDOS:
  validate <archivo...>              Valida uno o varios archivos
  info <archivo>                     Muestra info del archivo
  apply <plan.json>                  Aplica un plan de parcheo
  analyze <archivo> [opciones]       Analiza un refactor SIN aplicar
  refactor <archivo> [opciones]      Aplica un refactor
  refs <simbolo> [opciones]          Busca referencias a un simbolo
  refs-multi <archivo> [opciones]    Busca referencias a varios simbolos
  search <patron> [opciones]         Busca texto literal en el proyecto
  tree [dir] [opciones]              Muestra el arbol del proyecto
  stats [dir]                        Estadisticas del proyecto
  diff <archivo> [opciones]          Muestra los cambios vs el backup
  plan:new <archivo>                 Crea un plan vacio
  config                             Muestra la configuracion
  log [opciones]                     Ver historial de cambios
  undo [n] [opciones]                Deshacer ultimos cambios
  verify [opciones]                  Validar + tests + build + git status
  save "mensaje" [opciones]          Commit + push rapido
  orphans [archivo]                  Detecta metodos sin uso
  fix [opciones]                     Detecta y arregla problemas comunes
  make:<tipo> <nombre>               Crea un archivo desde plantilla
  action [open]                      Info y URL de GitHub Actions
  watch <dir> [opciones]             Vigila cambios (Ctrl+C para salir)
  menu                               Menu interactivo (default sin args)
  help                               Muestra esta ayuda

TEMPLATES DE MAKE:
  make:vue <Nombre>                  Componente Vue
  make:mixin <nombre>                Mixin
  make:composable <useNombre>        Composable
  make:test <Nombre>                 Test con node --test
  make:js <nombre>                   Modulo JavaScript
  make:css <nombre>                  Archivo CSS

OPCIONES DE FIX:
  --auto                             Aplicar solo fixes automaticos
  --dry-run                          Ver sin aplicar

OPCIONES DE WATCH:
  --plan <archivo>                   Aplicar plan en cada cambio
  --save                             Verificar en cada cambio

OPCIONES DE ANALYZE/REFACTOR:
  --from "texto"       Marcador donde empieza el bloque
  --until "texto"      Marcador donde termina (opcional)
  --to "ruta.js"       Archivo destino
  --apply              Confirmar aplicacion (solo refactor)
  --json <archivo>     Exportar analisis a JSON
  --block n:i:f        Analizar multiples bloques (repetible)
  --no-refs            No buscar referencias externas (refactor)
  --dry-run, -n        Solo mostrar, no escribir (apply)

OPCIONES DE REFS:
  --dir <dir>          Directorio donde buscar (default: src)
  --exclude <file>     Archivo a excluir (repetible)
  --context <n>        Lineas de contexto alrededor (default: 0)

OPCIONES DE SEARCH:
  --dir <dir>          Directorio donde buscar (default: src)
  --ext <exts>         Extensiones separadas por coma (.vue,.js)
  --ignore-case, -i    Ignorar mayusculas/minusculas
  --regex              Tratar el patron como regex
  --context <n>        Lineas de contexto
  --exclude <file>     Archivo a excluir

OPCIONES DE LOG:
  --limit, -n <n>      Cuantos mostrar (default: 20)
  --file, -f <path>    Filtrar por archivo

OPCIONES DE UNDO:
  --file, -f <path>    Deshacer solo cambios de ese archivo
  n                    Numero de cambios a deshacer (default: 1)

OPCIONES DE VERIFY:
  --no-tests           Saltar npm test
  --no-build           Saltar npm run build
  --fast               Saltar tests y build

OPCIONES DE APPLY:
  --dry-run, -n        Simular sin escribir

OPCIONES DE SAVE:
  --no-push            Solo commit, no push

OPCIONES DE TREE:
  --depth <n>          Profundidad maxima (default: 4)
  --lines              Mostrar cantidad de lineas
  --no-sizes           No mostrar tamanos
  --dirs-only          Solo mostrar carpetas

EJEMPLO:
  node toolkit.mjs analyze src/App.vue --from "// ===== TELEGRAM BACKUP =====" --until "// ===== SEGURIDAD =====" --to "src/mixins/telegram.js"

  node toolkit.mjs refactor src/App.vue --from "// =====" --until "// =====" --to "src/mixins/telegram.js" --apply

TIPOS SOPORTADOS:
  .vue .js .mjs .cjs .ts .tsx .jsx
  .css .scss .less
  .html .xml .svg
  .json .yaml .toml
  .py .sh .bash
  .md .txt
  Otros: balance de llaves/parentesis/corchetes

FORMATO DEL PLAN (plan.json):
  {
    "file": "src/App.vue",
    "idempotent": "MI_MARCA",
    "ops": [
      { "replace": { "old": "...", "new": "..." } },
      { "insertAfter": { "anchor": "...", "content": "..." } },
      { "insertBefore": { "anchor": "...", "content": "..." } },
      { "remove": { "text": "..." } },
      { "removeBetween": { "start": "...", "end": "..." } },
      { "replaceRegex": { "pattern": "...", "flags": "g", "new": "..." } }
    ]
  }

  Tambien puede ser un array de planes.

EJEMPLO:
  node toolkit.mjs validate src/App.vue
  node toolkit.mjs info src/App.vue
  node toolkit.mjs apply plan.json
`);
}


// ============================================================
// MANEJADOR GLOBAL DE ERRORES (Evita process.exit en funciones)
// ============================================================
process.on('uncaughtException', (err) => {
  if (err && err._toolkit_exit === true) process.exit(1);
  console.error('💥 Error inesperado:', err.message || err);
  if (typeof printFooter === 'function') printFooter();
    throw { _toolkit_exit: true };
});

process.on('unhandledRejection', (reason) => {
  if (reason && reason._toolkit_exit === true) process.exit(1);
  console.error('💥 Promesa rechazada:', reason.message || reason);
  if (typeof printFooter === 'function') printFooter();
    throw { _toolkit_exit: true };
});
// ============================================================
// DISPATCHER
// ============================================================

switch (comando) {
  case 'validate': await cmdValidate(args[0], args.slice(1)); break;
  case 'info': await cmdInfo(args[0]); break;
  case 'apply': await cmdApply(args[0]); break;
  case 'orphans': await cmdOrphans(args); break;
  case 'fix': await cmdFix(args); break;
  case 'make': await cmdMakeHelp(); break;
  case 'make:vue':
  case 'make:mixin':
  case 'make:composable':
  case 'make:test':
  case 'make:js':
  case 'make:css':
    await cmdMake([comando, ...args]); break;
  case 'action': await cmdAction(args); break;
  case 'watch': await cmdWatch(args); break;
  case 'menu': await cmdMenu(args); break;
  case 'log': await cmdLog(args); break;
  case 'undo': await cmdUndo(args); break;
  case 'verify': await cmdVerify(args); break;
  case 'save': await cmdSave(args); break;
  case 'search': await cmdSearch(args); break;
  case 'tree': await cmdTree(args); break;
  case 'stats': await cmdStats(args); break;
  case 'diff': await cmdDiff(args); break;
  case 'plan:new': await cmdPlanNew(args); break;
  case 'config': await cmdConfig(args); break;
  case 'refs': await cmdRefs(args); break;
  case 'refs-multi': await cmdRefsMulti(args); break;
  case 'analyze': await cmdAnalyze(args[0], args.slice(1)); break;
  case 'refactor': await cmdRefactor(args[0], args.slice(1)); break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    if (process.stdin.isTTY) {
      await cmdMenu([]);
    } else {
      await cmdHelp();
    }
    break;
  default:
    console.error('❌ Comando desconocido: ' + comando);
    console.error('   Usa: node toolkit.mjs help');
    process.exit(1);
}

// Exportar funciones para uso programatico
export { aplicarPlan, cmdApply, cmdValidate, cmdInfo };
