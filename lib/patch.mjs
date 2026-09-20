// Operaciones de parcheo sobre strings
// Soporta aplicación transaccional de múltiples archivos.

import fs from 'fs';
import path from 'path';
import { validar } from './validators.mjs';

// ============================================================
// OPERACIONES INDIVIDUALES
// ============================================================

export function aplicarOp(content, op) {
  if (op.replace) return opReplace(content, op.replace);
  if (op.replaceRegex) return opReplaceRegex(content, op.replaceRegex);
  if (op.insertAfter) return opInsertAfter(content, op.insertAfter);
  if (op.insertBefore) return opInsertBefore(content, op.insertBefore);
  if (op.remove) return opRemove(content, op.remove);
  if (op.removeBetween) return opRemoveBetween(content, op.removeBetween);
  if (op.custom) return opCustom(content, op.custom);
  return { ok: false, error: 'operacion desconocida: ' + JSON.stringify(Object.keys(op)) };
}

function opReplace(content, op) {
  const { old: oldText, new: newText } = op;
  if (!oldText) return { ok: false, error: 'replace: falta "old"' };
  const idx = content.indexOf(oldText);
  if (idx < 0) {
    const preview = oldText.slice(0, 80).replace(/\n/g, '\\n');
    return { ok: false, error: 'replace: no se encontro "' + preview + '..."' };
  }
  const segunda = content.indexOf(oldText, idx + 1);
  if (segunda >= 0) {
    const preview = oldText.slice(0, 60).replace(/\n/g, '\\n');
    return { ok: false, error: 'replace: el texto aparece 2+ veces ("' + preview + '...")' };
  }
  return {
    ok: true,
    content: content.slice(0, idx) + newText + content.slice(idx + oldText.length),
    desc: 'replace(' + oldText.slice(0, 40).replace(/\n/g, '⏎') + ')'
  };
}

function opReplaceRegex(content, op) {
  const { pattern, flags = 'g', new: newText, count } = op;
  if (!pattern) return { ok: false, error: 'replaceRegex: falta "pattern"' };
  const re = new RegExp(pattern, flags);
  const matches = content.match(re);
  if (!matches || matches.length === 0) {
    return { ok: false, error: 'replaceRegex: no se encontraron coincidencias' };
  }
  if (count !== undefined && matches.length !== count) {
    return { ok: false, error: 'replaceRegex: se encontraron ' + matches.length + ' (esperaba ' + count + ')' };
  }
  return {
    ok: true,
    content: content.replace(re, newText),
    desc: 'replaceRegex(' + pattern + ') [' + matches.length + ' matches]'
  };
}

function opInsertAfter(content, op) {
  const { anchor, content: block } = op;
  if (!anchor) return { ok: false, error: 'insertAfter: falta "anchor"' };
  const idx = content.indexOf(anchor);
  if (idx < 0) return { ok: false, error: 'insertAfter: no se encontro el anchor' };
  const pos = idx + anchor.length;
  return {
    ok: true,
    content: content.slice(0, pos) + block + content.slice(pos),
    desc: 'insertAfter'
  };
}

function opInsertBefore(content, op) {
  const { anchor, content: block } = op;
  if (!anchor) return { ok: false, error: 'insertBefore: falta "anchor"' };
  const idx = content.indexOf(anchor);
  if (idx < 0) return { ok: false, error: 'insertBefore: no se encontro el anchor' };
  return {
    ok: true,
    content: content.slice(0, idx) + block + content.slice(idx),
    desc: 'insertBefore'
  };
}

function opRemove(content, op) {
  const text = op.text;
  if (!text) return { ok: false, error: 'remove: falta "text"' };
  const idx = content.indexOf(text);
  if (idx < 0) return { ok: false, error: 'remove: no se encontro el texto' };
  const segunda = content.indexOf(text, idx + 1);
  if (segunda >= 0) return { ok: false, error: 'remove: el texto aparece 2+ veces' };
  return {
    ok: true,
    content: content.slice(0, idx) + content.slice(idx + text.length),
    desc: 'remove'
  };
}

function opRemoveBetween(content, op) {
  const { start, end, includeEnd = false } = op;
  if (!start || !end) return { ok: false, error: 'removeBetween: falta "start" o "end"' };
  const i1 = content.indexOf(start);
  if (i1 < 0) return { ok: false, error: 'removeBetween: no se encontro "start"' };
  const i2 = content.indexOf(end, i1 + start.length);
  if (i2 < 0) return { ok: false, error: 'removeBetween: no se encontro "end"' };
  const fin = includeEnd ? i2 + end.length : i2;
  return {
    ok: true,
    content: content.slice(0, i1) + content.slice(fin),
    desc: 'removeBetween'
  };
}

function opCustom(content, op) {
  if (typeof op.fn !== 'function') return { ok: false, error: 'custom: falta "fn" (function)' };
  try {
    const nuevo = op.fn(content);
    if (typeof nuevo !== 'string') return { ok: false, error: 'custom: fn debe devolver string' };
    return { ok: true, content: nuevo, desc: op.desc || 'custom' };
  } catch (e) {
    return { ok: false, error: 'custom: ' + e.message };
  }
}

// ============================================================
// PREPARAR UN PLAN (sin escribir)
// ============================================================

export async function prepararPlan(p) {
  const r = {
    ok: false,
    skipped: false,
    prepared: false,
    applied: [],
    errors: [],
    file: p.file,
    pathAbsoluto: null,
    contenidoOriginal: null,
    contenidoNuevo: null,
    backup: null,
    esNuevo: false,
  };

  if (!p.file) {
    r.errors.push('Falta "file" en el plan');
    return r;
  }

  const fileAbs = path.resolve(p.file);
  r.pathAbsoluto = fileAbs;

  // Archivo puede no existir si es "create"
  const existe = fs.existsSync(fileAbs);
  r.esNuevo = !existe;

  if (!existe && !p.ops?.some(op => op.custom && op.create)) {
    // Si no existe y no hay intención de crear, es error
    // (a menos que el plan tenga `create: true`)
    if (!p.create) {
      r.errors.push('Archivo no existe: ' + p.file + ' (agrega "create: true" para crearlo)');
      return r;
    }
  }

  const original = existe ? fs.readFileSync(fileAbs, 'utf8') : '';
  r.contenidoOriginal = original;

  // Idempotencia
  if (p.idempotent && original.includes(p.idempotent)) {
    r.ok = true;
    r.skipped = true;
    r.reason = 'Encontrado: "' + p.idempotent + '"';
    return r;
  }

  // Aplicar ops sobre copia en memoria
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

  // Validar resultado
  if (p.skipValidation !== true) {
    const v = await validar(fileAbs, content, p.tipo);
    if (!v.ok) {
      r.errors.push('Validacion fallo:');
      v.errors.forEach(e => r.errors.push('  · ' + e));
      return r;
    }
    if (v.warning) r.validationWarning = v.warning;
  }

  r.contenidoNuevo = content;
  r.prepared = true;
  r.ok = true;
  return r;
}

// ============================================================
// APLICAR PREPARADO (escribir a disco)
// ============================================================

export function commitPlan(preparado, opciones = {}) {
  if (!preparado.prepared) {
    return { ok: false, error: 'El plan no fue preparado correctamente' };
  }
  if (preparado.skipped) {
    return { ok: true, skipped: true };
  }

  const { backup = true } = opciones;
  const resultado = { ok: false, backup: null };

  try {
    // Backup solo si el archivo existía
    if (backup && !preparado.esNuevo) {
      resultado.backup = preparado.pathAbsoluto + '.bak-' + Date.now();
      fs.copyFileSync(preparado.pathAbsoluto, resultado.backup);
    }

    // Asegurar directorio
    const dir = path.dirname(preparado.pathAbsoluto);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Escritura atómica: tmp + rename
    const tmp = preparado.pathAbsoluto + '.tmp-' + Date.now();
    fs.writeFileSync(tmp, preparado.contenidoNuevo);
    fs.renameSync(tmp, preparado.pathAbsoluto);

    resultado.ok = true;
    return resultado;
  } catch (e) {
    resultado.error = e.message;
    return resultado;
  }
}

// ============================================================
// ROLLBACK (restaurar backups)
// ============================================================

export function rollbackDe(backups) {
  const resultados = [];
  for (const b of backups) {
    if (!b.backup) continue;
    try {
      fs.copyFileSync(b.backup, b.pathAbsoluto);
      resultados.push({ file: b.file, ok: true });
    } catch (e) {
      resultados.push({ file: b.file, ok: false, error: e.message });
    }
  }
  return resultados;
}

// ============================================================
// TRANSACCIONAL: preparar TODOS, luego commit TODOS
// ============================================================

export async function aplicarPlanTransaccional(planes, opciones = {}) {
  const { backup = true, silent = false } = opciones;
  const reporte = {
    ok: false,
    total: planes.length,
    preparados: [],
    commits: [],
    errors: [],
    rollback: null,
    skipCount: 0,
    commitCount: 0,
  };

  // 1. PREPARAR todos
  for (const p of planes) {
    const prep = await prepararPlan(p);
    reporte.preparados.push(prep);
    if (prep.skipped) {
      reporte.skipCount++;
      continue;
    }
    if (!prep.ok) {
      // FALLO: no escribir nada
      reporte.errors.push({
        file: p.file,
        errores: prep.errors,
      });
      return reporte;
    }
  }

  // 2. Si hay algún error de preparación, ya salimos.
  // Ahora COMMIT todos (atómicamente por archivo, pero si uno falla → rollback).
  const commitsExitosos = [];
  for (const prep of reporte.preparados) {
    if (prep.skipped) continue;
    const res = commitPlan(prep, { backup });
    if (!res.ok) {
      reporte.errors.push({
        file: prep.file,
        errores: ['No se pudo escribir: ' + res.error],
      });
      // Rollback de los que sí escribieron
      const rollback = rollbackDe(commitsExitosos);
      reporte.rollback = rollback;
      return reporte;
    }
    reporte.commitCount++;
    commitsExitosos.push({
      file: prep.file,
      pathAbsoluto: prep.pathAbsoluto,
      backup: res.backup,
    });
    reporte.commits.push({
      file: prep.file,
      backup: res.backup,
      ops: prep.applied,
    });
  }

  reporte.ok = true;
  return reporte;
}
