// Busca referencias a un símbolo (método, función, variable)
// en todos los archivos de un proyecto.

import fs from 'fs';
import path from 'path';

const DIRS_IGNORADOS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', 'tmp', '.tmp', '.vscode', '.idea',
]);

const EXTS_INCLUIDAS = new Set([
  '.vue', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.html', '.css', '.scss', '.less',
  '.py', '.sh', '.bash',
  '.json', '.yaml', '.yml', '.toml',
  '.md',
]);

function esBinario(name) {
  const binarios = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.zip', '.gz', '.pdf'];
  return binarios.some(b => name.toLowerCase().endsWith(b));
}

export function* walkDir(dir, { maxDepth = 20 } = {}) {
  let depth = 0;
  function* walk(d, currentDepth) {
    if (currentDepth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (e) { return; }
    for (const entry of entries) {
      if (DIRS_IGNORADOS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        yield* walk(full, currentDepth + 1);
      } else if (entry.isFile()) {
        if (esBinario(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!EXTS_INCLUIDAS.has(ext)) continue;
        yield full;
      }
    }
  }
  yield* walk(dir, 0);
}

// Busca `simbolo` en todos los archivos de `dir`.
// Excluye `excluir` (archivos a saltar).
export function buscarReferencias(dir, simbolo, opciones = {}) {
  const { excluir = [], contextoLineas = 0 } = opciones;
  const excluidosAbs = new Set(excluir.map(f => path.resolve(f)));
  const resultados = [];

  // Regex: palabra completa, con word boundary
  const re = new RegExp('\\b' + simbolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');

  for (const file of walkDir(dir)) {
    const abs = path.resolve(file);
    if (excluidosAbs.has(abs)) continue;

    let content;
    try { content = fs.readFileSync(file, 'utf8'); }
    catch (e) { continue; }

    const lineas = content.split('\n');
    const matches = [];

    for (let i = 0; i < lineas.length; i++) {
      if (re.test(lineas[i])) {
        const inicio = Math.max(0, i - contextoLineas);
        const fin = Math.min(lineas.length - 1, i + contextoLineas);
        const bloque = lineas.slice(inicio, fin + 1).join('\n');
        matches.push({
          linea: i + 1,
          texto: lineas[i].trim(),
          contexto: bloque,
        });
      }
      re.lastIndex = 0;
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

  // Ordenar por cantidad de matches
  resultados.sort((a, b) => b.total - a.total);
  return resultados;
}

// Busca múltiples símbolos a la vez
export function buscarMultiplesReferencias(dir, simbolos, opciones = {}) {
  const porSimbolo = {};
  for (const s of simbolos) {
    porSimbolo[s] = buscarReferencias(dir, s, opciones);
  }
  return porSimbolo;
}

// Cuenta archivos donde aparece cada símbolo
export function contarReferencias(refs) {
  const resumen = {};
  for (const r of refs) {
    resumen[r.archivo] = r.total;
  }
  return resumen;
}
