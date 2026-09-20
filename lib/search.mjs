// Buscar texto literal en un proyecto

import fs from 'fs';
import path from 'path';

const DIRS_IGNORADOS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', 'tmp', '.tmp', '.vscode', '.idea',
]);

export function* walkArchivos(dir, extsIncluidas = null, maxDepth = 20) {
  let depth = 0;
  function* walk(d, currentDepth) {
    if (currentDepth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (e) { return; }
    for (const entry of entries) {
      if (DIRS_IGNORADOS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        yield* walk(full, currentDepth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extsIncluidas && extsIncluidas.length > 0 && !extsIncluidas.includes(ext)) continue;
        yield full;
      }
    }
  }
  yield* walk(dir, 0);
}

export function buscarTexto(dir, patron, opciones = {}) {
  const {
    ext = null,
    ignoreCase = false,
    usarRegex = false,
    excluir = [],
    contexto = 0,
    limite = 200,
  } = opciones;

  const excluidosAbs = new Set(excluir.map(f => path.resolve(f)));
  const resultados = [];

  let re;
  if (usarRegex) {
    re = new RegExp(patron, ignoreCase ? 'gi' : 'g');
  } else {
    const escaped = patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(escaped, ignoreCase ? 'gi' : 'g');
  }

  for (const file of walkArchivos(dir, ext)) {
    const abs = path.resolve(file);
    if (excluidosAbs.has(abs)) continue;

    let content;
    try { content = fs.readFileSync(file, 'utf8'); }
    catch (e) { continue; }

    // Detectar binarios
    if (content.includes('\u0000')) continue;

    const lineas = content.split('\n');
    const matches = [];

    for (let i = 0; i < lineas.length; i++) {
      re.lastIndex = 0;
      if (re.test(lineas[i])) {
        const inicio = Math.max(0, i - contexto);
        const fin = Math.min(lineas.length - 1, i + contexto);
        matches.push({
          linea: i + 1,
          texto: lineas[i].trim(),
          contexto: contexto > 0 ? lineas.slice(inicio, fin + 1).join('\n') : null,
        });
        if (matches.length >= limite) break;
      }
    }

    if (matches.length > 0) {
      resultados.push({
        archivo: path.relative(dir, file),
        archivoAbs: file,
        matches,
        total: matches.length,
      });
    }
  }

  resultados.sort((a, b) => b.total - a.total);
  return resultados;
}
