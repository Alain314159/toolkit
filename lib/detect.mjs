// Detecta el tipo de archivo por extension y contenido

import path from 'path';
import fs from 'fs';

const TIPOS_POR_EXT = {
  '.vue': 'vue',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'js',
  '.ts': 'ts',
  '.tsx': 'ts',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.py': 'python',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.toml': 'toml',
};

export function detectarTipo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TIPOS_POR_EXT[ext] || 'desconocido';
}

export function existeArchivo(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}
