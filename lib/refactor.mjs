// Aplicar refactor: extraer bloque a mixin (con refs-auto)

import fs from 'fs';
import path from 'path';
import { analizar } from './analyze.mjs';
import { validar } from './validators.mjs';
import { buscarReferencias } from './refs.mjs';
import { registrarBatch } from './history.mjs';

// ============================================================
// GENERAR MIXIN
// ============================================================

export function generarMixin(analisis, opciones) {
  const { importar } = opciones || {};
  const lineas = [];

  lineas.push('// Mixin extraido de ' + path.basename(analisis.origen));
  lineas.push('// Bloque: ' + analisis.marcadorInicio.trim());
  if (analisis.marcadorFin) lineas.push('// Hasta:  ' + analisis.marcadorFin.trim());
  lineas.push('// Generado automaticamente por toolkit');
  lineas.push('');

  const importsPorRuta = {};
  for (const imp of analisis.deps.importsUsados) {
    if (!importsPorRuta[imp.from]) importsPorRuta[imp.from] = { default: null, names: new Set() };
    for (const n of imp.nombres) {
      if (n.tipo === 'default') importsPorRuta[imp.from].default = n.nombre;
      else importsPorRuta[imp.from].names.add(n.nombre);
    }
  }

  if (importar) {
    for (const [from, nombres] of Object.entries(importar)) {
      if (nombres.default && nombres.named && nombres.named.length) {
        lineas.push('import ' + nombres.default + ', { ' + nombres.named.join(', ') + ' } from ' + JSON.stringify(from) + ';');
      } else if (nombres.default) {
        lineas.push('import ' + nombres.default + ' from ' + JSON.stringify(from) + ';');
      } else if (nombres.named && nombres.named.length) {
        lineas.push('import { ' + nombres.named.join(', ') + ' } from ' + JSON.stringify(from) + ';');
      }
    }
  } else {
    const rutas = Object.keys(importsPorRuta).sort();
    for (const from of rutas) {
      const info = importsPorRuta[from];
      const fromAjustado = ajustarRuta(from, analisis.origen, opciones.destino);
      const nombres = Array.from(info.names).sort();
      if (info.default && nombres.length) {
        lineas.push('import ' + info.default + ', { ' + nombres.join(', ') + ' } from ' + JSON.stringify(fromAjustado) + ';');
      } else if (info.default) {
        lineas.push('import ' + info.default + ' from ' + JSON.stringify(fromAjustado) + ';');
      } else if (nombres.length) {
        lineas.push('import { ' + nombres.join(', ') + ' } from ' + JSON.stringify(fromAjustado) + ';');
      }
    }
  }
  lineas.push('');

  lineas.push('export default {');
  lineas.push('  methods: {');
  for (const m of analisis.metodos) {
    lineas.push(m.codigo + (m.tieneComaFinal ? '' : ','));
  }
  lineas.push('  },');
  lineas.push('};');
  lineas.push('');

  return lineas.join('\n');
}

function ajustarRuta(from, origenViejo, destinoNuevo) {
  if (!destinoNuevo) return from;
  if (!from.startsWith('.')) return from;
  const dirOrigen = path.dirname(origenViejo);
  const dirDestino = path.dirname(destinoNuevo);
  if (dirOrigen === dirDestino) return from;
  const rutaAbs = path.resolve(dirOrigen, from);
  let relativa = path.relative(dirDestino, rutaAbs);
  if (!relativa.startsWith('.')) relativa = './' + relativa;
  return relativa;
}

// ============================================================
// BUSCAR REFERENCIAS EXTERNAS A LOS METODOS EXTRAIDOS
// ============================================================

export function buscarRefsExternas(analisis, dirProyecto) {
  const nombres = analisis.metodos.map(m => m.nombre);
  const resultados = {};

  for (const nombre of nombres) {
    const refs = buscarReferencias(dirProyecto, nombre, {
      excluir: [path.resolve(analisis.origen)],
    });
    if (refs.length > 0) {
      resultados[nombre] = refs;
    }
  }

  return resultados;
}

// ============================================================
// APLICAR REFACTOR CON REFS-AUTO
// ============================================================

export async function aplicarRefactor(analisis, opciones) {
  const reporte = { ok: false, pasos: [], errores: [], refsExternas: {} };
  const { destino, refsAuto = true, dirProyecto = process.cwd(), registrarEnHistorial = true } = opciones;

  if (fs.existsSync(destino)) {
    reporte.errores.push('Archivo destino ya existe: ' + destino);
    return reporte;
  }

  // 1. Buscar refs externas ANTES de aplicar (por si hay que avisar)
  if (refsAuto) {
    const refs = buscarRefsExternas(analisis, dirProyecto);
    reporte.refsExternas = refs;
    const totalRefs = Object.values(refs).reduce((s, arr) => s + arr.reduce((ss, r) => ss + r.total, 0), 0);
    if (totalRefs > 0) {
      reporte.pasos.push('Encontradas ' + totalRefs + ' referencias externas a metodos extraidos');
      reporte.pasos.push('  Revisa el reporte al final del proceso');
    } else {
      reporte.pasos.push('Sin referencias externas a los metodos extraidos');
    }
  }

  // 2. Generar mixin
  const contenidoMixin = generarMixin(analisis, opciones);
  const vMixin = await validar(destino, contenidoMixin);
  if (!vMixin.ok) {
    reporte.errores.push('El mixin generado no valida:');
    vMixin.errors.forEach(e => reporte.errores.push('  · ' + e));
    return reporte;
  }
  reporte.pasos.push('Mixin generado y validado (' + contenidoMixin.split('\n').length + ' lineas)');

  // 3. Leer origen
  const origenContent = fs.readFileSync(analisis.origen, 'utf8');

  // 4. Eliminar bloque del origen
  let nuevoOrigen = origenContent;
  if (analisis.marcadorFin) {
    const idxIni = nuevoOrigen.indexOf(analisis.marcadorInicio);
    const idxFin = nuevoOrigen.indexOf(analisis.marcadorFin, idxIni + analisis.marcadorInicio.length);
    if (idxIni < 0 || idxFin < 0) {
      reporte.errores.push('No se pudieron encontrar los marcadores en el origen');
      return reporte;
    }
    nuevoOrigen = nuevoOrigen.slice(0, idxIni) + nuevoOrigen.slice(idxFin);
    reporte.pasos.push('Bloque eliminado del origen');
  }

  // 5. Validar origen modificado
  const vOrigen = await validar(analisis.origen, nuevoOrigen);
  if (!vOrigen.ok) {
    reporte.errores.push('El origen modificado no valida:');
    vOrigen.errors.forEach(e => reporte.errores.push('  · ' + e));
    return reporte;
  }
  reporte.pasos.push('Origen modificado valida');

  // 6. Backup
  const backupOrigen = analisis.origen + '.bak-' + Date.now();
  fs.copyFileSync(analisis.origen, backupOrigen);
  reporte.backupOrigen = backupOrigen;

  // 7. Escribir mixin
  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, contenidoMixin);
    reporte.pasos.push('Mixin escrito: ' + destino);
  } catch (e) {
    reporte.errores.push('No se pudo escribir mixin: ' + e.message);
    return reporte;
  }

  // 8. Escribir origen modificado
  try {
    fs.writeFileSync(analisis.origen, nuevoOrigen);
    reporte.pasos.push('Origen actualizado');
  } catch (e) {
    reporte.errores.push('No se pudo escribir origen: ' + e.message);
    try { fs.copyFileSync(backupOrigen, analisis.origen); } catch (e2) {}
    return reporte;
  }

  // 9. Registrar en historial
  if (registrarEnHistorial) {
    try {
      registrarBatch(process.cwd(), [
        { file: analisis.origen, backup: backupOrigen, ops: ['refactor: bloque eliminado'], esNuevo: false, comando: 'refactor' },
        { file: destino, backup: null, ops: ['refactor: mixin creado'], esNuevo: true, comando: 'refactor' },
      ]);
      reporte.pasos.push('Registrado en historial');
    } catch (e) {
      reporte.pasos.push('No se pudo registrar en historial: ' + e.message);
    }
  }

  reporte.ok = true;
  return reporte;
}
