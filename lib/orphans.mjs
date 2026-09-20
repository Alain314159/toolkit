// Detecta metodos/funciones que ya no se llaman en ningun lado

import fs from 'fs';
import path from 'path';
import { buscarReferencias } from './refs.mjs';
import { extraerMetodos, extraerImports } from './analyze.mjs';

export function detectarHuerfanos(archivo, dirProyecto) {
  if (!fs.existsSync(archivo)) {
    return { ok: false, error: 'Archivo no existe: ' + archivo };
  }

  const content = fs.readFileSync(archivo, 'utf8');
  const ext = path.extname(archivo).toLowerCase();

  // Extraer metodos (solo soportamos .vue y .js Options API por ahora)
  let metodos = [];
  if (ext === '.vue') {
    // Extraer el bloque methods de App.vue
    const m = content.match(/methods:\s*\{/);
    if (!m) return { ok: true, huerfanos: [], total: 0, metodos: [] };
    const idxIni = m.index;
    // Encontrar cierre del bloque methods
    let depth = 0;
    let idxFin = -1;
    for (let i = idxIni; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) { idxFin = i; break; }
      }
    }
    if (idxFin < 0) return { ok: false, error: 'No se pudo encontrar el fin de methods' };
    const bloque = content.slice(idxIni, idxFin + 1);
    const r = extraerMetodos(bloque);
    if (r.ok) metodos = r.metodos;
  } else if (ext === '.js' || ext === '.mjs') {
    // Detectar funciones exportadas y no exportadas
    const regex = /(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
      const nombre = m[1];
      // Encontrar el bloque
      const idxIni = m.index + m[0].length;
      let depth = 0;
      let idxFin = -1;
      for (let i = idxIni; i < content.length; i++) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') {
          depth--;
          if (depth === 0) { idxFin = i; break; }
        }
      }
      if (idxFin > 0) {
        metodos.push({
          nombre,
          esAsync: m[0].includes('async'),
          codigo: content.slice(m.index, idxFin + 1),
        });
      }
    }
  }

  if (metodos.length === 0) {
    return { ok: true, huerfanos: [], total: 0, metodos: [] };
  }

  // Para cada metodo, buscar referencias fuera del propio archivo
  const huerfanos = [];
  for (const metodo of metodos) {
    const refs = buscarReferencias(dirProyecto, metodo.nombre, {
      excluir: [path.resolve(archivo)],
    });
    const usosExternos = refs.reduce((s, r) => s + r.total, 0);
    // Tambien contar usos DENTRO del archivo (que no sean la definicion)
    const usosInternos = contarUsosInternos(content, metodo.nombre, metodo.codigo);
    if (usosExternos === 0 && usosInternos === 0) {
      huerfanos.push({
        nombre: metodo.nombre,
        archivo,
        linea: encontrarLinea(content, metodo.codigo),
      });
    }
  }

  return {
    ok: true,
    huerfanos,
    total: metodos.length,
    metodos: metodos.map(m => m.nombre),
  };
}

function contarUsosInternos(content, nombre, codigo) {
  // Contar apariciones del nombre en el archivo, sin contar la definicion
  const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('\\b' + escaped + '\\b', 'g');
  const matches = content.match(regex) || [];
  // Restar 1 (la definicion) y las apariciones dentro del propio codigo del metodo
  const enCodigo = (codigo.match(regex) || []).length - 1; // -1 por la definicion
  return Math.max(0, matches.length - 1 - enCodigo);
}

function encontrarLinea(content, snippet) {
  const idx = content.indexOf(snippet);
  if (idx < 0) return 0;
  return content.slice(0, idx).split('\n').length;
}
