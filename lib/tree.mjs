// Genera un arbol del proyecto

import fs from 'fs';
import path from 'path';

const DIRS_IGNORADOS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '.vscode', '.idea',
]);

export function arbolProyecto(dir, opciones = {}) {
  const {
    maxDepth = 4,
    mostrarTamaños = true,
    mostrarLineas = false,
    soloDirs = false,
  } = opciones;

  const stats = {
    totalArchivos: 0,
    totalDirs: 0,
    totalBytes: 0,
    totalLineas: 0,
    porExt: {},
  };

  function walk(d, prefix, depth) {
    if (depth > maxDepth) return [];
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (e) { return []; }

    // Ordenar: dirs primero, luego archivos alfabetico
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const lineas = [];
    const visibles = entries.filter(e => !DIRS_IGNORADOS.has(e.name) && !e.name.startsWith('.'));

    visibles.forEach((entry, idx) => {
      const esUltimo = idx === visibles.length - 1;
      const conector = esUltimo ? '└── ' : '├── ';
      const full = path.join(d, entry.name);

      if (entry.isDirectory()) {
        stats.totalDirs++;
        lineas.push(prefix + conector + entry.name + '/');
        const subPrefix = prefix + (esUltimo ? '    ' : '│   ');
        lineas.push(...walk(full, subPrefix, depth + 1));
      } else {
        if (soloDirs) return;
        stats.totalArchivos++;
        let tamaño = '';
        try {
          const st = fs.statSync(full);
          stats.totalBytes += st.size;
          if (mostrarTamaños) {
            tamaño = ' (' + formatearBytes(st.size) + ')';
          }
        } catch (e) {}

        let lineasTxt = '';
        if (mostrarLineas) {
          try {
            const cont = fs.readFileSync(full, 'utf8');
            const n = cont.split('\n').length;
            stats.totalLineas += n;
            lineasTxt = ' [' + n + ' lineas]';
          } catch (e) {}
        }

        const ext = path.extname(entry.name).toLowerCase() || '(sin ext)';
        stats.porExt[ext] = (stats.porExt[ext] || 0) + 1;

        lineas.push(prefix + conector + entry.name + tamaño + lineasTxt);
      }
    });

    return lineas;
  }

  const raiz = path.basename(path.resolve(dir));
  const lineas = [raiz + '/'];
  lineas.push(...walk(dir, '', 0));

  return { arbol: lineas.join('\n'), stats };
}

export function formatearBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
