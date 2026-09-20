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
  help                               Muestra esta ayuda

OPCIONES DE ANALYZE/REFACTOR:
  --from "texto"       Marcador donde empieza el bloque
  --until "texto"      Marcador donde termina (opcional)
  --to "ruta.js"       Archivo destino
  --apply              Confirmar aplicacion (solo refactor)

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
