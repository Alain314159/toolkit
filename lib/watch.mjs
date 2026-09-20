// Watch de archivos con debounce

import fs from 'fs';
import path from 'path';

export function vigilar(dir, callback, opciones = {}) {
  const { debounce = 300, filtro = null, recursive = true } = opciones;
  const cambiosPendientes = new Set();
  let timer = null;

  const procesar = () => {
    const archivos = Array.from(cambiosPendientes);
    cambiosPendientes.clear();
    timer = null;
    try {
      callback(archivos);
    } catch (e) {
      console.error('Error en callback de watch:', e.message);
    }
  };

  const watcher = fs.watch(dir, { recursive }, (evento, archivo) => {
    if (!archivo) return;
    const full = path.resolve(dir, archivo);
    if (filtro && !filtro(full)) return;
    cambiosPendientes.add(full);
    if (timer) clearTimeout(timer);
    timer = setTimeout(procesar, debounce);
  });

  return {
    cerrar() {
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
