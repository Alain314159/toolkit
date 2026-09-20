// Estadisticas del proyecto

import fs from 'fs';
import path from 'path';
import { walkArchivos } from './search.mjs';
import { formatearBytes } from './tree.mjs';

export function statsProyecto(dir) {
  const stats = {
    totalArchivos: 0,
    totalBytes: 0,
    totalLineas: 0,
    totalLineasVacias: 0,
    porExt: {},
    masGrandes: [],
  };

  const archivos = [];

  for (const file of walkArchivos(dir)) {
    try {
      const st = fs.statSync(file);
      let lineas = 0, vacias = 0;
      try {
        const cont = fs.readFileSync(file, 'utf8');
        const lineasArr = cont.split('\n');
        lineas = lineasArr.length;
        vacias = lineasArr.filter(l => l.trim() === '').length;
      } catch (e) {}

      const ext = path.extname(file).toLowerCase() || '(sin ext)';
      if (!stats.porExt[ext]) stats.porExt[ext] = { archivos: 0, bytes: 0, lineas: 0 };
      stats.porExt[ext].archivos++;
      stats.porExt[ext].bytes += st.size;
      stats.porExt[ext].lineas += lineas;

      stats.totalArchivos++;
      stats.totalBytes += st.size;
      stats.totalLineas += lineas;
      stats.totalLineasVacias += vacias;

      archivos.push({ archivo: path.relative(dir, file), bytes: st.size, lineas });
    } catch (e) {}
  }

  archivos.sort((a, b) => b.bytes - a.bytes);
  stats.masGrandes = archivos.slice(0, 10);

  return stats;
}
