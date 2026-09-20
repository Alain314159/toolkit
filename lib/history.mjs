// Historial de cambios aplicados por el toolkit

import fs from 'fs';
import path from 'path';

const DIR_HISTORY = '.toolkit';
const FILE_HISTORY = 'history.json';
const MAX_ENTRADAS = 500;

function pathHistory(dirBase) {
  return path.join(dirBase, DIR_HISTORY, FILE_HISTORY);
}

function leer(dirBase) {
  const p = pathHistory(dirBase);
  if (!fs.existsSync(p)) return { entradas: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { entradas: [] };
  }
}

function guardar(dirBase, data) {
  const dir = path.join(dirBase, DIR_HISTORY);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Limitar a MAX_ENTRADAS
  if (data.entradas.length > MAX_ENTRADAS) {
    data.entradas = data.entradas.slice(-MAX_ENTRADAS);
  }
  fs.writeFileSync(pathHistory(dirBase), JSON.stringify(data, null, 2));
}

export function registrarCambio(dirBase, entrada) {
  const data = leer(dirBase);
  const id = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const item = {
    id,
    fecha: new Date().toISOString(),
    file: entrada.file,
    backup: entrada.backup || null,
    ops: entrada.ops || [],
    idempotent: entrada.idempotent || null,
    comando: entrada.comando || 'apply',
    esNuevo: entrada.esNuevo || false,
  };
  data.entradas.push(item);
  guardar(dirBase, data);
  return item;
}

export function registrarBatch(dirBase, entradas) {
  const data = leer(dirBase);
  const ids = [];
  for (const e of entradas) {
    const id = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    data.entradas.push({
      id,
      fecha: new Date().toISOString(),
      file: e.file,
      backup: e.backup || null,
      ops: e.ops || [],
      idempotent: e.idempotent || null,
      comando: e.comando || 'apply',
      esNuevo: e.esNuevo || false,
    });
    ids.push(id);
  }
  guardar(dirBase, data);
  return ids;
}

export function listarHistorial(dirBase, opciones = {}) {
  const { limite = 20, file = null } = opciones;
  const data = leer(dirBase);
  let entradas = data.entradas.slice().reverse();
  if (file) {
    entradas = entradas.filter(e => e.file === file);
  }
  return entradas.slice(0, limite);
}

export function obtenerEntrada(dirBase, id) {
  const data = leer(dirBase);
  return data.entradas.find(e => e.id === id) || null;
}

// Deshace las ultimas N entradas
export function deshacer(dirBase, cantidad = 1, opciones = {}) {
  const { file = null } = opciones;
  const data = leer(dirBase);
  const entradas = data.entradas.slice().reverse();
  const aDeshacer = [];

  for (const e of entradas) {
    if (aDeshacer.length >= cantidad) break;
    if (file && e.file !== file) continue;
    if (!e.backup) continue;
    aDeshacer.push(e);
  }

  if (aDeshacer.length === 0) {
    return { ok: false, error: 'No hay cambios para deshacer', deshechos: [] };
  }

  const resultados = [];
  for (const e of aDeshacer) {
    const backupAbs = path.resolve(dirBase, e.backup);
    const fileAbs = path.resolve(dirBase, e.file);

    if (!fs.existsSync(backupAbs)) {
      resultados.push({ file: e.file, ok: false, error: 'Backup no existe: ' + e.backup });
      continue;
    }

    try {
      // Si el archivo era nuevo, borrar
      if (e.esNuevo) {
        if (fs.existsSync(fileAbs)) fs.unlinkSync(fileAbs);
        resultados.push({ file: e.file, ok: true, accion: 'eliminado' });
      } else {
        fs.copyFileSync(backupAbs, fileAbs);
        resultados.push({ file: e.file, ok: true, accion: 'restaurado' });
      }
    } catch (err) {
      resultados.push({ file: e.file, ok: false, error: err.message });
    }
  }

  // Eliminar del historial las que se deshicieron
  const idsDeshechos = new Set(aDeshacer.map(e => e.id));
  data.entradas = data.entradas.filter(e => !idsDeshechos.has(e.id));
  guardar(dirBase, data);

  return { ok: true, deshechos: resultados, cantidad: resultados.length };
}

export function limpiarHistorial(dirBase) {
  guardar(dirBase, { entradas: [] });
  return { ok: true };
}
