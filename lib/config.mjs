// Lee .toolkitrc.json del proyecto

import fs from 'fs';
import path from 'path';

const NOMBRES = ['.toolkitrc.json', '.toolkitrc', 'toolkit.config.json'];

const DEFAULT = {
  dir: 'src',
  exclude: [],
  extensiones: null,
  maxDepth: 20,
  backup: true,
  color: true,
  verbose: false,
};

export function buscarConfig(dirInicio = process.cwd()) {
  let dir = path.resolve(dirInicio);
  while (true) {
    for (const nombre of NOMBRES) {
      const full = path.join(dir, nombre);
      if (fs.existsSync(full)) {
        try {
          const contenido = JSON.parse(fs.readFileSync(full, 'utf8'));
          return { encontrado: true, ruta: full, dir, config: { ...DEFAULT, ...contenido } };
        } catch (e) {
          return { encontrado: false, error: 'JSON invalido en ' + full + ': ' + e.message };
        }
      }
    }
    const padre = path.dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  return { encontrado: false, config: DEFAULT };
}

export function configDefault() {
  return { ...DEFAULT };
}
