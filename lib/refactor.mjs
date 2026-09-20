// Aplicar refactor: extraer bloque a mixin

import fs from 'fs';
import path from 'path';
import { analizar } from './analyze.mjs';
import { validar } from './validators.mjs';

// ============================================================
// GENERAR MIXIN
// ============================================================

export function generarMixin(analisis, opciones) {
  const { importar } = opciones || {};
  const lineas = [];

  // Header
  lineas.push('// Mixin extraido de ' + path.basename(analisis.origen));
  lineas.push('// Bloque: ' + analisis.marcadorInicio.trim());
  if (analisis.marcadorFin) lineas.push('// Hasta:  ' + analisis.marcadorFin.trim());
  lineas.push('// Generado automaticamente por toolkit');
  lineas.push('');

  // Imports
  const importsPorRuta = {};
  for (const imp of analisis.deps.importsUsados) {
    if (!importsPorRuta[imp.from]) importsPorRuta[imp.from] = { default: null, names: new Set() };
    for (const n of imp.nombres) {
      if (n.tipo === 'default') importsPorRuta[imp.from].default = n.nombre;
      else importsPorRuta[imp.from].names.add(n.nombre);
    }
  }

  if (importar) {
    // Usar imports personalizados
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
    // Usar los detectados
    const rutas = Object.keys(importsPorRuta).sort();
    for (const from of rutas) {
      const info = importsPorRuta[from];
      // Ajustar la ruta relativa si estamos cambiando de carpeta
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

  // Body
  lineas.push('export default {');
  lineas.push('  methods: {');
  for (const m of analisis.metodos) {
    // El codigo ya viene con 4 espacios (correcto para dentro de methods)
    // No reindentar
    lineas.push(m.codigo + (m.tieneComaFinal ? '' : ','));
  }
  lineas.push('  },');
  lineas.push('};');
  lineas.push('');

  return lineas.join('\n');
}

function ajustarRuta(from, origenViejo, destinoNuevo) {
  if (!destinoNuevo) return from;
  // Si from es relativo y el destino esta en otra carpeta, ajustar
  if (!from.startsWith('.')) return from;
  const dirOrigen = path.dirname(origenViejo);
  const dirDestino = path.dirname(destinoNuevo);
  if (dirOrigen === dirDestino) return from;
  const rutaAbs = path.resolve(dirOrigen, from);
  let relativa = path.relative(dirDestino, rutaAbs);
  if (!relativa.startsWith('.')) relativa = './' + relativa;
  // Quitar extension .js si la tiene (imports en JS no la requieren)
  return relativa;
}

// ============================================================
// GENERAR PLAN DE PARCHES
// ============================================================

export function generarPlanRefactor(analisis, opciones) {
  const { destino, nombreMixin } = opciones;

  // 1. Eliminar el bloque del origen
  const planOrigen = {
    file: analisis.origen,
    idempotent: analisis.deps.dentroBloque.length > 0 && analisis.metodos.length > 0
      ? '// EXTRAIDO A ' + destino
      : undefined,
    ops: [],
  };

  // Eliminar bloque (desde marcadorInicio hasta marcadorFin)
  if (analisis.marcadorFin) {
    planOrigen.ops.push({
      removeBetween: {
        start: analisis.marcadorInicio,
        end: analisis.marcadorFin,
      },
    });
  } else {
    // Sin marcador fin: eliminar cada metodo individualmente
    for (const m of analisis.metodos) {
      planOrigen.ops.push({ remove: { text: m.codigo + '\n' } });
    }
  }

  // Añadir import del mixin si no existe
  const rutaImport = './' + path.relative(path.dirname(analisis.origen), destino).replace(/\\/g, '/');
  const rutaImportFinal = rutaImport.startsWith('./') || rutaImport.startsWith('../') ? rutaImport : './' + rutaImport;

  planOrigen.ops.push({
    insertAfter: {
      anchor: analisis.marcadorInicio ? analisis.marcadorInicio : '',
      content: '',
    },
  });

  // El import y el mixin los añadimos al final del script tag. Esto es complejo de hacer generico.
  // Por ahora el plan solo elimina el bloque. El import y registro del mixin se hace a mano o con otro plan.

  // 2. Crear el archivo destino
  const contenidoMixin = generarMixin(analisis, opciones);
  const planDestino = {
    file: destino,
    idempotent: '// Generado automaticamente por toolkit',
    ops: [
      {
        custom: {
          desc: 'crear archivo completo',
          fn: () => contenidoMixin,
        },
      },
    ],
    noBackup: !fs.existsSync(destino),
  };

  return { planOrigen, planDestino, contenidoMixin };
}

// ============================================================
// APLICAR REFACTOR
// ============================================================

export async function aplicarRefactor(analisis, opciones) {
  const reporte = { ok: false, pasos: [], errores: [] };
  const { destino } = opciones;

  // 1. Validar que destino no existe (o si existe, advertir)
  if (fs.existsSync(destino)) {
    reporte.errores.push('Archivo destino ya existe: ' + destino);
    return reporte;
  }

  // 2. Generar mixin
  const contenidoMixin = generarMixin(analisis, opciones);
  const vMixin = await validar(destino, contenidoMixin);
  if (!vMixin.ok) {
    reporte.errores.push('El mixin generado no valida:');
    vMixin.errors.forEach(e => reporte.errores.push('  · ' + e));
    return reporte;
  }
  reporte.pasos.push('✅ Mixin generado y validado (' + contenidoMixin.split('\n').length + ' lineas)');

  // 3. Leer el origen
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
    reporte.pasos.push('✅ Bloque eliminado del origen');
  }

  // 5. Validar el origen modificado
  const vOrigen = await validar(analisis.origen, nuevoOrigen);
  if (!vOrigen.ok) {
    reporte.errores.push('El origen modificado no valida:');
    vOrigen.errors.forEach(e => reporte.errores.push('  · ' + e));
    return reporte;
  }
  reporte.pasos.push('✅ Origen modificado valida');

  // 6. Crear backup del origen
  const backupOrigen = analisis.origen + '.bak-' + Date.now();
  fs.copyFileSync(analisis.origen, backupOrigen);
  reporte.backupOrigen = backupOrigen;

  // 7. Escribir mixin
  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, contenidoMixin);
    reporte.pasos.push('✅ Mixin escrito: ' + destino);
  } catch (e) {
    reporte.errores.push('No se pudo escribir mixin: ' + e.message);
    return reporte;
  }

  // 8. Escribir origen modificado
  try {
    fs.writeFileSync(analisis.origen, nuevoOrigen);
    reporte.pasos.push('✅ Origen actualizado');
  } catch (e) {
    reporte.errores.push('No se pudo escribir origen: ' + e.message);
    // Intentar revertir
    try { fs.copyFileSync(backupOrigen, analisis.origen); } catch (e2) {}
    return reporte;
  }

  reporte.ok = true;
  return reporte;
}
