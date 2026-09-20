# API de toolkit

Referencia de la API programatica.

## Importacion

    import {
      patch,
      printReport,
      aplicarPlanTransaccional,
    } from '/ruta/a/toolkit/toolkit.mjs';

Tambien puedes importar modulos individuales:

    import { validar } from '/ruta/a/toolkit/lib/validators.mjs';
    import { aplicarOp } from '/ruta/a/toolkit/lib/patch.mjs';
    import { buscarReferencias } from '/ruta/a/toolkit/lib/refs.mjs';

## Funciones principales

### patch(opciones)

Aplica un plan de parcheo a UN archivo.

Firma:

    async function patch({
      file: string,
      idempotent?: string,
      ops: Operacion[],
      create?: boolean,
      noBackup?: boolean,
      skipValidation?: boolean,
      tipo?: string,
    }): Promise<Reporte>

Ejemplo:

    const r = await patch({
      file: 'src/App.vue',
      idempotent: 'MI_MARCA',
      ops: [
        { replace: { old: 'x', new: 'y' } },
      ],
    });

Retorna:

    {
      ok: boolean,
      skipped: boolean,
      prepared: boolean,
      applied: string[],
      errors: string[],
      file: string,
      pathAbsoluto: string,
      backup: string | null,
      esNuevo: boolean,
    }

### aplicarPlanTransaccional(planes, opciones)

Aplica varios planes. Si uno falla, no se aplica ninguno (rollback).

    async function aplicarPlanTransaccional(
      planes: Plan[],
      opciones?: { backup?: boolean, silent?: boolean }
    ): Promise<ReporteMulti>

## Operaciones

### replace

    { replace: { old: 'texto', new: 'reemplazo' } }

Falla si old no existe o aparece 2+ veces.

### replaceRegex

    { replaceRegex: { pattern: '\\d+', flags: 'g', new: 'X', count: 3 } }

count es opcional. Si se especifica, falla si el numero de matches no coincide.

### insertAfter

    { insertAfter: { anchor: 'texto', content: '\nlinea nueva' } }

### insertBefore

    { insertBefore: { anchor: 'texto', content: 'linea nueva\n' } }

### remove

    { remove: { text: 'texto a eliminar' } }

### removeBetween

    { removeBetween: { start: 'ini', end: 'fin', includeEnd: false } }

### custom

    {
      custom: {
        fn: (content) => content.toUpperCase(),
        desc: 'mayusculas',
      }
    }

La funcion recibe el string actual y devuelve el nuevo string.

## Validacion

### validar(filePath, content, tipo?)

    const r = await validar('src/App.vue', contenido);
    if (r.ok) console.log('OK');
    else console.error(r.errors);

## Analisis de refactor

### analizar(origen, content, marcadorInicio, marcadorFin)

    import { analizar, formatearReporte } from '...toolkit.mjs';
    const a = analizar('src/App.vue', content, '// inicio', '// fin');
    console.log(formatearReporte(a));

## Busqueda

### buscarReferencias(dir, simbolo, opciones)

    import { buscarReferencias } from '.../lib/refs.mjs';
    const refs = buscarReferencias('src', 'miFuncion', {
      excluir: ['src/App.vue'],
      contextoLineas: 2,
    });

### buscarTexto(dir, patron, opciones)

    import { buscarTexto } from '.../lib/search.mjs';
    const r = buscarTexto('src', 'console.log', {
      ext: ['.js', '.vue'],
      ignoreCase: true,
      contexto: 2,
    });

## Arbol y estadisticas

### arbolProyecto(dir, opciones)

    import { arbolProyecto } from '.../lib/tree.mjs';
    const { arbol, stats } = arbolProyecto('src', {
      maxDepth: 4,
      mostrarTamanos: true,
      mostrarLineas: true,
    });
    console.log(arbol);

### statsProyecto(dir)

    import { statsProyecto } from '.../lib/stats.mjs';
    const s = statsProyecto('src');
    console.log(s.totalArchivos, s.totalBytes, s.porExt);

## Config

### buscarConfig(dirInicio)

    import { buscarConfig } from '.../lib/config.mjs';
    const { encontrado, ruta, config } = buscarConfig();

Lee .toolkitrc.json desde dirInicio hacia arriba.

## Colores

    import { c } from '.../lib/colors.mjs';
    console.log(c.rojo('error') + ' ' + c.verde('ok'));

## Diff

### diffLineas(antes, despues, opciones)

    import { diffLineas, resumenDiff } from '.../lib/diff.mjs';
    const d = diffLineas(antes, despues, { contexto: 3 });
    console.log(d);
    const { add, del } = resumenDiff(antes, despues);

## Watch

### vigilar(dir, callback, opciones)

    import { vigilar } from '.../lib/watch.mjs';
    const w = vigilar('src', (archivos) => {
      console.log('Cambiaron:', archivos);
    }, { debounce: 500 });

## Formato del plan completo

    type Operacion =
      | { replace: { old: string, new: string } }
      | { replaceRegex: { pattern: string, flags?: string, new: string, count?: number } }
      | { insertAfter: { anchor: string, content: string } }
      | { insertBefore: { anchor: string, content: string } }
      | { remove: { text: string } }
      | { removeBetween: { start: string, end: string, includeEnd?: boolean } }
      | { custom: { fn: (content: string) => string, desc?: string } };

    type Plan = {
      file: string;
      idempotent?: string;
      ops: Operacion[];
      create?: boolean;
      noBackup?: boolean;
      skipValidation?: boolean;
      tipo?: string;
    };

## Ejemplos completos

Ver carpeta ejemplos/ en el repo.
