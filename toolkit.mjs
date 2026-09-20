#!/usr/bin/env node
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
import { aplicarPlanTransaccional } from './lib/patch.mjs';
import { printHeader, printSuccess, printSkipped, printError, printFooter, printBackup, printInfo } from './lib/report.mjs';

const [,, comando, ...args] = process.argv;

// ============================================================
// COMANDOS
// ============================================================

async function cmdValidate(filePath) {
  printHeader('VALIDAR');
  if (!existeArchivo(filePath)) {
    printError(filePath, ['Archivo no existe']);
    printFooter();
    process.exit(1);
  }
  const tipo = detectarTipo(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  printInfo('Archivo', filePath);
  printInfo('Tipo', tipo + ' (' + tipoDeValidador(tipo) + ')');
  printInfo('Tamaño', content.length + ' bytes');
  printInfo('Lineas', content.split('\n').length);
  console.log('');
  const r = await validar(filePath, content);
  if (r.ok) {
    console.log('  ✅ VALIDO');
    if (r.warning) console.log('     ⚠ ' + r.warning);
  } else {
    printError(filePath, r.errors);
    printFooter();
    process.exit(1);
  }
  printFooter();
}

async function cmdInfo(filePath) {
  printHeader('INFO');
  if (!existeArchivo(filePath)) {
    printError(filePath, ['Archivo no existe']);
    printFooter();
    process.exit(1);
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
    process.exit(1);
  }

  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  } catch (e) {
    printError(planPath, ['JSON invalido: ' + e.message]);
    printFooter();
    process.exit(1);
  }

  const planes = Array.isArray(plan) ? plan : [plan];
  const reporte = await aplicarPlanTransaccional(planes);

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
    process.exit(1);
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
    process.exit(1);
  }

  // Parsear args: --from "..." --until "..." --to "..." --style mixin
  const opts = parsearArgs(args);

  if (!opts.from) {
    printError(filePath, ['Falta --from "marcador inicio"']);
    console.log('   Ej: --from "// ===== TELEGRAM BACKUP =====" --until "// ===== SEGURIDAD ====="');
    printFooter();
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const analisis = analizar(filePath, content, opts.from, opts.until);

  if (!analisis.ok) {
    printError(filePath, [analisis.error]);
    printFooter();
    process.exit(1);
  }

  // Si hay --to, validar que no exista
  if (opts.to && fs.existsSync(opts.to)) {
    console.log('  ⚠ El archivo destino ya existe: ' + opts.to);
    console.log('     Se sobreescribira (con backup).');
    console.log('');
  }

  console.log(formatearReporte(analisis));

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
    process.exit(1);
  }

  const opts = parsearArgs(args);

  if (!opts.from) {
    printError(filePath, ['Falta --from "marcador inicio"']);
    printFooter();
    process.exit(1);
  }
  if (!opts.to) {
    printError(filePath, ['Falta --to "archivo destino"']);
    printFooter();
    process.exit(1);
  }
  if (!opts.apply) {
    console.log('  ⚠ Falta --apply. Usa "analyze" primero para revisar.');
    console.log('     O corre de nuevo con --apply al final.');
    printFooter();
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const analisis = analizar(filePath, content, opts.from, opts.until);

  if (!analisis.ok) {
    printError(filePath, [analisis.error]);
    printFooter();
    process.exit(1);
  }

  console.log('  Analisis: ' + analisis.metodos.length + ' metodos · ' + analisis.lineas + ' lineas');
  console.log('');

  const reporte = await aplicarRefactor(analisis, {
    destino: opts.to,
    nombreMixin: opts.nombre,
  });

  console.log('───────────────────────────────────────────');
  reporte.pasos.forEach(p => console.log('  ' + p));
  if (reporte.errores.length) {
    console.log('');
    console.log('  ❌ ERRORES:');
    reporte.errores.forEach(e => console.log('     ' + e));
    if (reporte.backupOrigen) {
      console.log('     Backup: ' + reporte.backupOrigen);
    }
    printFooter();
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════');
  console.log('  ✅ REFACTOR APLICADO');
  if (reporte.backupOrigen) console.log('  Backup origen: ' + reporte.backupOrigen);
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('  ▶  Falta:');
  console.log('     1. Añadir el import del mixin en ' + filePath);
  console.log('     2. Añadirlo a "mixins: [...]"');
  console.log('     3. Probar en dev');
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
  }
  return opts;
}

async function cmdRefs(args) {
  printHeader('BUSCAR REFERENCIAS');
  if (args.length < 1) {
    printError('', ['Falta el simbolo a buscar']);
    console.log('   Uso: node toolkit.mjs refs <simbolo> [--dir src] [--exclude file]');
    printFooter();
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
  }
  const archivo = args[0];
  if (!fs.existsSync(archivo)) {
    printError(archivo, ['Archivo no existe']);
    printFooter();
    process.exit(1);
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
    process.exit(1);
  }
  const destino = args[0];
  if (fs.existsSync(destino)) {
    printError(destino, ['Ya existe ese archivo']);
    printFooter();
    process.exit(1);
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
    process.exit(1);
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

async function cmdHelp() {
  console.log(`
toolkit - Herramienta universal de parcheo y validacion

USO:
  node toolkit.mjs <comando> [args]

COMANDOS:
  validate <archivo>                 Valida un archivo segun su tipo
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
  help                               Muestra esta ayuda

OPCIONES DE ANALYZE/REFACTOR:
  --from "texto"       Marcador donde empieza el bloque
  --until "texto"      Marcador donde termina (opcional)
  --to "ruta.js"       Archivo destino
  --apply              Confirmar aplicacion (solo refactor)

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
// DISPATCHER
// ============================================================

switch (comando) {
  case 'validate': await cmdValidate(args[0]); break;
  case 'info': await cmdInfo(args[0]); break;
  case 'apply': await cmdApply(args[0]); break;
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
    await cmdHelp(); break;
  default:
    console.error('❌ Comando desconocido: ' + comando);
    console.error('   Usa: node toolkit.mjs help');
    process.exit(1);
}

// Exportar funciones para uso programatico
export { aplicarPlan, cmdApply, cmdValidate, cmdInfo };
