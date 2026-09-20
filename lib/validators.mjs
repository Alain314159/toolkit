// Validadores por tipo de archivo

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';

// ============ HELPERS ============

function tmpFile(ext) {
  return path.join(process.env.TMPDIR || '/tmp', 'toolkit-check-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + ext);
}

function limpiarTmp(p) {
  try { fs.unlinkSync(p); } catch (e) {}
}

// ============ VALIDADORES ============

async function validarVue(filePath, content) {
  const cwd = process.cwd();
  let sfc;
  try {
    const require = createRequire(path.join(cwd, 'package.json'));
    sfc = require('@vue/compiler-sfc');
  } catch (e) {
    // Intentar con el toolkit mismo
    try {
      const require2 = createRequire(import.meta.url);
      sfc = require2('@vue/compiler-sfc');
    } catch (e2) {
      return { ok: true, warning: 'compilador Vue no disponible, se omite' };
    }
  }
  try {
    const { descriptor, errors } = sfc.parse(content, { filename: filePath });
    if (errors && errors.length > 0) {
      return { ok: false, errors: errors.map(e => e.message || String(e)) };
    }
    if (descriptor.template) {
      const tpl = sfc.compileTemplate({
        source: descriptor.template.content,
        filename: filePath,
        id: 'validate',
      });
      if (tpl.errors && tpl.errors.length > 0) {
        return { ok: false, errors: tpl.errors.map(e => e.message || String(e)) };
      }
    }
    if (descriptor.script || descriptor.scriptSetup) {
      try {
        sfc.compileScript(descriptor, { id: 'validate' });
      } catch (e) {
        return { ok: false, errors: ['Error en script: ' + e.message] };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: ['Parse error: ' + e.message] };
  }
}

function validarJs(filePath, content) {
  const ext = path.extname(filePath) === '.cjs' ? '.cjs' : '.mjs';
  const tmp = tmpFile(ext);
  try {
    fs.writeFileSync(tmp, content);
    const r = spawnSync('node', ['--check', tmp], { encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0) {
      const err = (r.stderr || '').split('\n').filter(l => l.trim()).slice(0, 3).join(' | ');
      return { ok: false, errors: [err] };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: ['No se pudo validar: ' + e.message] };
  } finally {
    limpiarTmp(tmp);
  }
}

function validarTs(filePath, content) {
  // Intentar con tsc si esta disponible
  const tmp = tmpFile('.ts');
  try {
    fs.writeFileSync(tmp, content);
    const r = spawnSync('npx', ['--no-install', 'tsc', '--noEmit', '--allowJs', tmp], {
      encoding: 'utf8', timeout: 8000
    });
    if (r.status === 0) return { ok: true };
    // Si tsc no esta instalado, no fallar por eso
    if (r.stderr && r.stderr.includes('not found')) {
      return { ok: true, warning: 'tsc no disponible, se omite validacion TS' };
    }
    const err = (r.stderr || '').split('\n').filter(l => l.trim()).slice(0, 3).join(' | ');
    return { ok: false, errors: [err] };
  } catch (e) {
    return { ok: true, warning: 'no se pudo validar TS: ' + e.message };
  } finally {
    limpiarTmp(tmp);
  }
}

function validarBalance(content, nombre = '') {
  const errores = [];
  let llaves = 0, parens = 0, corchetes = 0;
  let enComentarioLinea = false;
  let enComentarioBloque = false;
  let enString = null;
  const len = content.length;
  let i = 0;

  while (i < len) {
    const c = content[i];
    const next = content[i + 1];
    const prev = content[i - 1];

    if (enComentarioLinea) {
      if (c === '\n') enComentarioLinea = false;
      i++; continue;
    }
    if (enComentarioBloque) {
      if (c === '*' && next === '/') { enComentarioBloque = false; i += 2; continue; }
      i++; continue;
    }
    if (enString) {
      if (c === '\\') { i += 2; continue; }
      if (c === enString) { enString = null; }
      i++; continue;
    }

    // Comentarios
    if (c === '/' && next === '/') { enComentarioLinea = true; i += 2; continue; }
    if (c === '/' && next === '*') { enComentarioBloque = true; i += 2; continue; }

    // Strings
    if (c === '"' || c === "'" || c === '`') { enString = c; i++; continue; }

    // Contadores
    if (c === '{') llaves++;
    if (c === '}') llaves--;
    if (c === '(') parens++;
    if (c === ')') parens--;
    if (c === '[') corchetes++;
    if (c === ']') corchetes--;

    if (llaves < 0) { errores.push('Llave de cierre extra en ' + i); return { ok: false, errors: errores }; }
    if (parens < 0) { errores.push('Parentesis de cierre extra en ' + i); return { ok: false, errors: errores }; }
    if (corchetes < 0) { errores.push('Corchete de cierre extra en ' + i); return { ok: false, errors: errores }; }
    i++;
  }

  if (llaves !== 0) errores.push('Llaves desbalanceadas: ' + llaves);
  if (parens !== 0) errores.push('Parentesis desbalanceados: ' + parens);
  if (corchetes !== 0) errores.push('Corchetes desbalanceados: ' + corchetes);
  if (enComentarioBloque) errores.push('Comentario /* sin cerrar */');
  if (enString) errores.push('String sin cerrar (' + enString + ')');

  if (errores.length) return { ok: false, errors: errores };
  return { ok: true };
}

function validarHtml(content) {
  // Balance de tags comunes
  const errores = [];
  const pares = ['html', 'head', 'body', 'script', 'style', 'div', 'section', 'template', 'main', 'header', 'footer', 'nav'];
  for (const tag of pares) {
    const abiertos = (content.match(new RegExp('<' + tag + '(\\s|>)', 'gi')) || []).length;
    const cerrados = (content.match(new RegExp('</' + tag + '>', 'gi')) || []).length;
    if (abiertos !== cerrados) {
      errores.push('<' + tag + '>: ' + abiertos + ' abiertos, ' + cerrados + ' cerrados');
    }
  }
  if (errores.length) return { ok: false, errors: errores };
  return { ok: true };
}

function validarJson(content) {
  try {
    JSON.parse(content);
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: ['JSON invalido: ' + e.message] };
  }
}

function validarYaml(content) {
  // Balance basico: no podemos parsear sin dependencias
  // Verificar indentacion consistente
  const lineas = content.split('\n');
  let indentaciones = new Set();
  for (const l of lineas) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const match = l.match(/^(\s+)/);
    if (match) indentaciones.add(match[1].length);
  }
  // Solo avisar, no fallar
  return { ok: true };
}

function validarPython(filePath, content) {
  const tmp = tmpFile('.py');
  try {
    fs.writeFileSync(tmp, content);
    const r = spawnSync('python3', ['-m', 'py_compile', tmp], { encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0) {
      const err = (r.stderr || '').split('\n').filter(l => l.trim()).slice(-3).join(' | ');
      return { ok: false, errors: [err] };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true, warning: 'python3 no disponible' };
  } finally {
    limpiarTmp(tmp);
    limpiarTmp(tmp + 'c');
  }
}

function validarShell(filePath, content) {
  const tmp = tmpFile('.sh');
  try {
    fs.writeFileSync(tmp, content);
    const r = spawnSync('bash', ['-n', tmp], { encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0) {
      const err = (r.stderr || '').split('\n').filter(l => l.trim()).slice(0, 3).join(' | ');
      return { ok: false, errors: [err] };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true, warning: 'bash no disponible' };
  } finally {
    limpiarTmp(tmp);
  }
}

function validarXml(content) {
  // Balance de tags
  const errores = [];
  const tags = content.match(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g) || [];
  const pila = [];
  for (const t of tags) {
    if (t.startsWith('</')) {
      const nombre = t.slice(2);
      if (pila[pila.length - 1] !== nombre) {
        errores.push('Cierre </' + nombre + '> no coincide con <' + (pila[pila.length - 1] || '?') + '>');
        if (errores.length >= 3) break;
      } else {
        pila.pop();
      }
    } else {
      pila.push(t.slice(1));
    }
  }
  if (errores.length) return { ok: false, errors: errores };
  return { ok: true };
}

// ============ DISPATCHER ============

export async function validar(filePath, content, tipoForzado) {
  const { detectarTipo } = await import('./detect.mjs');
  const tipo = tipoForzado || detectarTipo(filePath);

  switch (tipo) {
    case 'vue': return await validarVue(filePath, content);
    case 'js': return validarJs(filePath, content);
    case 'ts': return validarTs(filePath, content);
    case 'css':
    case 'scss':
    case 'less': return validarBalance(content, tipo);
    case 'html': return validarHtml(content);
    case 'xml': return validarXml(content);
    case 'json': return validarJson(content);
    case 'yaml': return validarYaml(content);
    case 'python': return validarPython(filePath, content);
    case 'shell': return validarShell(filePath, content);
    case 'markdown':
    case 'text':
    case 'toml':
      return { ok: true, warning: 'sin validador para ' + tipo };
    default:
      // Intentar balance generico
      return validarBalance(content);
  }
}

export function tipoDeValidador(tipo) {
  const nombres = {
    vue: 'Vue SFC',
    js: 'JavaScript (node --check)',
    ts: 'TypeScript (tsc)',
    css: 'CSS (balance)',
    scss: 'SCSS (balance)',
    less: 'LESS (balance)',
    html: 'HTML (tags)',
    xml: 'XML (tags)',
    json: 'JSON (parse)',
    yaml: 'YAML',
    python: 'Python (py_compile)',
    shell: 'Bash (bash -n)',
    markdown: 'Markdown',
    text: 'Texto',
    toml: 'TOML',
    desconocido: 'Balance generico',
  };
  return nombres[tipo] || tipo;
}
