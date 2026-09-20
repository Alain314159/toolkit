// Analiza un bloque de codigo para refactor

// ============================================================
// EXTRAER BLOQUE POR MARCADORES
// ============================================================

export function extraerBloque(content, marcadorInicio, marcadorFin) {
  const idxIni = content.indexOf(marcadorInicio);
  if (idxIni < 0) {
    return { ok: false, error: 'No se encontro marcador inicio: "' + marcadorInicio.slice(0, 60) + '"' };
  }
  const idxFin = marcadorFin
    ? content.indexOf(marcadorFin, idxIni + marcadorInicio.length)
    : content.length;
  if (marcadorFin && idxFin < 0) {
    return { ok: false, error: 'No se encontro marcador fin: "' + marcadorFin.slice(0, 60) + '"' };
  }
  const bloque = content.slice(idxIni, idxFin);
  return {
    ok: true,
    bloque,
    idxIni,
    idxFin,
    lineas: bloque.split('\n').length,
    bytes: bloque.length,
  };
}

// ============================================================
// EXTRAER METODOS DE UN BLOQUE (Options API)
// ============================================================
// Detecta:
//     nombreMetodo(args) {
//       ...
//     },
//     async nombreMetodo(args) {
//       ...
//     },

export function extraerMetodos(bloque) {
  const lineas = bloque.split('\n');
  const metodos = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    // Detectar inicio de metodo: 4 espacios + (async )? + nombre + (args) + {
    const m = linea.match(/^    (async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/);
    if (m) {
      const esAsync = !!m[1];
      const nombre = m[2];
      const lineaIni = i;
      let llaves = 0;
      let encontradoCierre = false;

      // Balancear llaves desde esta linea
      for (let j = i; j < lineas.length; j++) {
        const l = lineas[j];
        for (let k = 0; k < l.length; k++) {
          const c = l[k];
          // Ignorar strings y comentarios (simplificado)
          if (c === '{') llaves++;
          if (c === '}') llaves--;
        }
        if (llaves === 0 && j > i) {
          encontradoCierre = true;
          // Incluir la coma final si existe
          const lineaCierre = lineas[j];
          const comillaIdx = lineaCierre.lastIndexOf('},');
          metodos.push({
            nombre,
            esAsync,
            lineaIni,
            lineaFin: j,
            codigo: lineas.slice(lineaIni, j + 1).join('\n'),
            tieneComaFinal: comillaIdx >= 0,
          });
          i = j + 1;
          break;
        }
      }
      if (!encontradoCierre) {
        return { ok: false, error: 'Metodo ' + nombre + ' no cierra llaves (linea ' + lineaIni + ')' };
      }
    } else {
      i++;
    }
  }

  return { ok: true, metodos };
}

// ============================================================
// ANALIZAR DEPENDENCIAS DEL BLOQUE
// ============================================================

export function limpiarComentariosYStrings(texto) {
  let out = '';
  let i = 0;
  const len = texto.length;
  while (i < len) {
    const c = texto[i];
    const next = texto[i + 1];
    // Comentario linea
    if (c === '/' && next === '/') {
      while (i < len && texto[i] !== '\n') i++;
      continue;
    }
    // Comentario bloque
    if (c === '/' && next === '*') {
      i += 2;
      while (i < len && !(texto[i] === '*' && texto[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Strings
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < len && texto[i] !== q) {
        if (texto[i] === '\\') i += 2;
        else i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function analizarDependencias(bloque, contentCompleto, metodosExtraidos) {
  // 1. this.X (propiedades y metodos)
  const thisRefs = new Set();
  const thisCallRe = /\bthis\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let m;
  while ((m = thisCallRe.exec(bloque)) !== null) thisRefs.add(m[1]);

  // 2. Separar metodos llamados vs propiedades
  const thisMethodsLlamados = new Set();
  const thisCallInvokeRe = /\bthis\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  while ((m = thisCallInvokeRe.exec(bloque)) !== null) thisMethodsLlamados.add(m[1]);

  const nombresMetodos = new Set(metodosExtraidos.map(x => x.nombre));

  // 3. Metodos DENTRO del bloque
  const dentroBloque = new Set();
  const fueraBloque = new Set();
  for (const nombre of thisMethodsLlamados) {
    if (nombresMetodos.has(nombre)) dentroBloque.add(nombre);
    else fueraBloque.add(nombre);
  }

  // 4. Propiedades (this.X que NO son llamadas)
  const propiedades = new Set();
  for (const nombre of thisRefs) {
    if (!thisMethodsLlamados.has(nombre)) propiedades.add(nombre);
    // Los metodos ya estan clasificados arriba
  }

  // 5. Imports del archivo original que se usan en el bloque
  const importsUsados = extraerImportsUsados(contentCompleto, bloque);

  // 6. Constantes globales (MAYUSCULAS) - limpiando comentarios y strings
  const bloqueLimpio = limpiarComentariosYStrings(bloque);
  const constantesUsadas = new Set();
  const constRe = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  while ((m = constRe.exec(bloqueLimpio)) !== null) {
    if (!esPalabraReservada(m[1])) constantesUsadas.add(m[1]);
  }

  return {
    thisRefs: Array.from(thisRefs).sort(),
    thisMethodsLlamados: Array.from(thisMethodsLlamados).sort(),
    dentroBloque: Array.from(dentroBloque).sort(),
    fueraBloque: Array.from(fueraBloque).sort(),
    propiedades: Array.from(propiedades).sort(),
    importsUsados,
    constantesUsadas: Array.from(constantesUsadas).sort(),
  };
}

function esPalabraReservada(s) {
  const reservadas = new Set(['JSON', 'URL', 'UTC', 'DOM', 'CSS', 'HTML', 'API', 'ID', 'OK', 'NaN', 'Infinity']);
  return reservadas.has(s);
}

// ============================================================
// EXTRAER IMPORTS DEL ARCHIVO
// ============================================================

export function extraerImports(content) {
  const imports = [];
  const re = /^import\s+(?:([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:from\s+)?['"]([^'"]+)['"];?/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    const def = m[1];
    const names = m[2] ? m[2].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean) : [];
    const from = m[3];
    imports.push({ default: def, names, from, raw: m[0] });
  }
  return imports;
}

function extraerImportsUsados(contentCompleto, bloque) {
  const todos = extraerImports(contentCompleto);
  const usados = [];
  for (const imp of todos) {
    const nombresUsados = [];
    if (imp.default && new RegExp('\\b' + imp.default + '\\b').test(bloque)) {
      nombresUsados.push({ tipo: 'default', nombre: imp.default });
    }
    for (const n of imp.names) {
      if (new RegExp('\\b' + n + '\\b').test(bloque)) {
        nombresUsados.push({ tipo: 'named', nombre: n });
      }
    }
    if (nombresUsados.length) {
      usados.push({ from: imp.from, nombres: nombresUsados });
    }
  }
  return usados;
}

// ============================================================
// ANALISIS COMPLETO
// ============================================================

export function analizar(origen, content, marcadorInicio, marcadorFin) {
  const r = extraerBloque(content, marcadorInicio, marcadorFin);
  if (!r.ok) return r;

  const r2 = extraerMetodos(r.bloque);
  if (!r2.ok) return r2;

  const deps = analizarDependencias(r.bloque, content, r2.metodos);

  return {
    ok: true,
    origen,
    marcadorInicio,
    marcadorFin,
    bloque: r.bloque,
    lineas: r.lineas,
    bytes: r.bytes,
    metodos: r2.metodos,
    deps,
  };
}

// ============================================================
// FORMATO DE REPORTE
// ============================================================

export function formatearReporte(analisis) {
  const out = [];
  const push = (s = '') => out.push(s);
  const line = () => push('───────────────────────────────────────────');

  push('');
  push('═══════════════════════════════════════════');
  push('  ANALISIS DE REFACTOR');
  push('═══════════════════════════════════════════');
  push('  Origen:  ' + analisis.origen);
  push('  Bloque:  ' + analisis.marcadorInicio.slice(0, 50));
  if (analisis.marcadorFin) push('  Hasta:   ' + analisis.marcadorFin.slice(0, 50));
  push('  Tamaño:  ' + analisis.lineas + ' lineas · ' + (analisis.bytes / 1024).toFixed(1) + ' KB');
  push('');

  // Metodos
  line();
  push('  METODOS A EXTRAER (' + analisis.metodos.length + ')');
  line();
  if (analisis.metodos.length === 0) {
    push('  (ninguno)');
  } else {
    for (const m of analisis.metodos) {
      const flags = [];
      if (m.esAsync) flags.push('async');
      push('  · ' + m.nombre + (flags.length ? ' [' + flags.join(', ') + ']' : ''));
    }
  }
  push('');

  // Dependencias internas
  line();
  push('  DEPENDENCIAS INTERNAS (van juntas)');
  line();
  if (analisis.deps.dentroBloque.length === 0) {
    push('  (ninguna)');
  } else {
    for (const m of analisis.deps.dentroBloque) {
      push('  ✅ ' + m);
    }
  }
  push('');

  // Dependencias externas
  line();
  push('  DEPENDENCIAS EXTERNAS (quedan en el original)');
  line();
  if (analisis.deps.fueraBloque.length === 0) {
    push('  (ninguna)');
  } else {
    for (const m of analisis.deps.fueraBloque) {
      push('  ⚠ ' + m + '()');
    }
    push('');
    push('  → Con style: "mixin" funcionan automaticamente.');
  }
  push('');

  // Propiedades this.X
  line();
  push('  PROPIEDADES DE this (' + analisis.deps.propiedades.length + ')');
  line();
  if (analisis.deps.propiedades.length === 0) {
    push('  (ninguna)');
  } else {
    const chunks = [];
    for (let i = 0; i < analisis.deps.propiedades.length; i += 3) {
      chunks.push('  · ' + analisis.deps.propiedades.slice(i, i + 3).join(', '));
    }
    chunks.forEach(c => push(c));
    push('');
    push('  → Con style: "mixin" funcionan automaticamente.');
  }
  push('');

  // Imports
  line();
  push('  IMPORTS NECESARIOS EN EL NUEVO ARCHIVO');
  line();
  if (analisis.deps.importsUsados.length === 0) {
    push('  (ninguno)');
  } else {
    for (const imp of analisis.deps.importsUsados) {
      const nombres = imp.nombres.map(x => x.nombre).join(', ');
      push('  ⚠ from ' + imp.from);
      push('    · ' + nombres);
    }
  }
  push('');

  // Constantes globales
  if (analisis.deps.constantesUsadas.length > 0) {
    line();
    push('  CONSTANTES GLOBALES REFERENCIADAS');
    line();
    for (const c of analisis.deps.constantesUsadas) {
      push('  · ' + c);
    }
    push('');
  }

  // Veredicto
  line();
  push('  VEREDICTO');
  line();
  const problemas = [];
  const sugerencias = [];

  if (analisis.metodos.length === 0) problemas.push('No se encontraron metodos para extraer');

  // Sugerencias por tamaño
  if (analisis.metodos.length > 20) {
    sugerencias.push('Este bloque tiene ' + analisis.metodos.length + ' metodos. Considera dividirlo en varios mixins mas pequenos por responsabilidad.');
  }
  if (analisis.lineas > 500) {
    sugerencias.push('El bloque supera las 500 lineas. Un mixin mas pequeno es mas facil de mantener.');
  }

  if (problemas.length === 0) {
    push('  ✅ LISTO PARA EXTRAER');
    if (sugerencias.length) {
      push('');
      push('  💡 SUGERENCIAS:');
      sugerencias.forEach(s => push('     · ' + s));
    }
  } else {
    push('  ⚠ HAY ' + problemas.length + ' PROBLEMA(S):');
    problemas.forEach(p => push('     · ' + p));
    push('     Corrige antes de continuar.');
  }
  push('═══════════════════════════════════════════');
  push('');

  return out.join('\n');
}
