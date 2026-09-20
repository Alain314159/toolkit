# toolkit

Herramienta universal de parcheo, validación y refactor de código.

Funciona para **cualquier proyecto**, cualquier lenguaje. Diseñada para
uso desde terminal (Termux, Linux, macOS, WSL) y también como
librería desde Node.js.

## ¿Qué es?

Un paquete que se puede usar de dos formas:

- **CLI**: desde la terminal (`node toolkit.mjs <comando>`)
- **Librería**: desde otros scripts (`import { patch } from '...'`)

## Instalación

    git clone https://github.com/Alain314159/toolkit.git ~/toolkit
    cd ~/toolkit
    npm install

No requiere instalarse en cada proyecto. Funciona global.

## Comandos

### Validación y análisis

    node ~/toolkit/toolkit.mjs validate <archivo...>   # Valida 1 o mas archivos
    node ~/toolkit/toolkit.mjs info <archivo>          # Info del archivo
    node ~/toolkit/toolkit.mjs stats [dir]             # Estadisticas
    node ~/toolkit/toolkit.mjs tree [dir]              # Arbol del proyecto

### Búsqueda

    node ~/toolkit/toolkit.mjs search "texto" --dir src
    node ~/toolkit/toolkit.mjs refs miFuncion --dir src
    node ~/toolkit/toolkit.mjs refs-multi simbolos.txt

### Parcheo

    node ~/toolkit/toolkit.mjs apply plan.json
    node ~/toolkit/toolkit.mjs apply plan.json --dry-run
    node ~/toolkit/toolkit.mjs plan:new mi-plan.json

### Refactor

    node ~/toolkit/toolkit.mjs analyze src/App.vue \
      --from "// ===== X =====" \
      --until "// ===== Y =====" \
      --to "src/mixins/x.js"

    node ~/toolkit/toolkit.mjs refactor src/App.vue \
      --from "// ===== X =====" \
      --until "// ===== Y =====" \
      --to "src/mixins/x.js" --apply

    node ~/toolkit/toolkit.mjs orphans [archivo]       # Metodos sin uso

### Flujo de trabajo

    node ~/toolkit/toolkit.mjs verify                  # Validar + tests + build + git
    node ~/toolkit/toolkit.mjs save "feat: algo"       # Commit + push
    node ~/toolkit/toolkit.mjs log                     # Ver historial
    node ~/toolkit/toolkit.mjs undo [n]                # Deshacer N cambios
    node ~/toolkit/toolkit.mjs diff <archivo>          # Diff vs backup

### Utilidades

    node ~/toolkit/toolkit.mjs fix                     # Problemas comunes
    node ~/toolkit/toolkit.mjs make:vue MiComponente   # Crear desde plantilla
    node ~/toolkit/toolkit.mjs action                  # URL de GitHub Actions
    node ~/toolkit/toolkit.mjs watch src/              # Vigilar cambios
    node ~/toolkit/toolkit.mjs config                  # Ver configuracion
    node ~/toolkit/toolkit.mjs menu                    # Menu interactivo
    node ~/toolkit/toolkit.mjs help                    # Ayuda

## Uso como librería

    import { patch, printReport } from '/ruta/a/toolkit/toolkit.mjs';

    const r = await patch({
      file: 'src/App.vue',
      idempotent: 'MI_MARCA_UNICA',
      ops: [
        { replace: { old: 'viejo', new: 'nuevo' } },
      ],
    });

    printReport(r);

## Operaciones de parcheo

| Operación | Descripción |
|-----------|-------------|
| `replace: { old, new }` | Reemplaza texto exacto (falla si aparece 2+ veces) |
| `replaceRegex: { pattern, flags, new, count? }` | Regex con conteo opcional |
| `insertAfter: { anchor, content }` | Inserta después de un anchor |
| `insertBefore: { anchor, content }` | Inserta antes de un anchor |
| `remove: { text }` | Elimina texto exacto |
| `removeBetween: { start, end }` | Elimina entre marcadores |
| `custom: { fn, desc }` | Función custom `string → string` |

## Tipos de archivos soportados

| Extensión | Validador |
|-----------|-----------|
| `.vue` | `@vue/compiler-sfc` (parser oficial) |
| `.js .mjs .cjs .jsx` | `node --check` |
| `.ts .tsx` | `tsc` (si está disponible) |
| `.css .scss .less` | Balance de llaves/paréntesis |
| `.html` | Balance de tags comunes |
| `.xml .svg` | Balance de tags |
| `.json` | `JSON.parse` |
| `.yaml .yml` | Básico |
| `.py` | `python -m py_compile` |
| `.sh .bash` | `bash -n` |
| `.md .txt .toml` | Sin validación |
| Otros | Balance genérico |

## Garantías

1. **Idempotente**: si `idempotent` ya existe, no toca nada
2. **Backup automático**: `.bak-<timestamp>` antes de escribir
3. **Atómico**: si UNA operación falla, NO escribe nada
4. **Transaccional**: en planes multi-archivo, si uno falla → rollback
5. **Validación**: compila el resultado antes de escribir
6. **Escritura atómica**: escribe en `.tmp` y luego renombra
7. **Historial**: cada cambio se registra en `.toolkit/history.json`
8. **Undo**: restaura backups con `toolkit undo`

## Flujo típico

    # 1. Aplicar un cambio
    node ~/toolkit/toolkit.mjs apply plan.json

    # 2. Verificar que todo este bien
    node ~/toolkit/toolkit.mjs verify

    # 3. Guardar y subir
    node ~/toolkit/toolkit.mjs save "feat: mi cambio"

    # 4. Si algo falla, deshacer
    node ~/toolkit/toolkit.mjs undo

## Templates

| Tipo | Crea |
|------|------|
| `make:vue <Nombre>` | Componente Vue en `src/components/` |
| `make:mixin <nombre>` | Mixin en `src/mixins/` |
| `make:composable <useNombre>` | Composable en `src/composables/` |
| `make:test <Nombre>` | Test con `node --test` |
| `make:js <nombre>` | Módulo JavaScript |
| `make:css <nombre>` | Archivo CSS |

## Config por proyecto

Crea `.toolkitrc.json` en la raíz del proyecto:

    {
      "dir": "src",
      "exclude": ["src/generated"],
      "backup": true,
      "color": true
    }

El toolkit lo lee automáticamente desde cualquier subdirectorio.

## Scripts de npm

    npm test              # 42 tests
    npm run validate-all  # Valida todos los .mjs del toolkit
    npm run check         # validate + test

## Estructura

    toolkit/
    ├── toolkit.mjs              # CLI + API publica
    ├── bin/toolkit              # Ejecutable global
    ├── lib/
    │   ├── detect.mjs           # Deteccion de tipos
    │   ├── validators.mjs       # Validadores por lenguaje
    │   ├── patch.mjs            # Operaciones + transaccional
    │   ├── analyze.mjs          # Analisis de refactor
    │   ├── refactor.mjs         # Extraccion a mixin
    │   ├── refs.mjs             # Busqueda de referencias
    │   ├── orphans.mjs          # Metodos huerfanos
    │   ├── search.mjs           # Busqueda de texto
    │   ├── tree.mjs             # Arbol del proyecto
    │   ├── stats.mjs            # Estadisticas
    │   ├── diff.mjs             # Diff visual
    │   ├── colors.mjs           # Colores ANSI
    │   ├── history.mjs          # Historial + undo
    │   ├── verify.mjs           # Verificacion completa
    │   ├── save.mjs             # Commit + push
    │   ├── fix.mjs              # Problemas comunes
    │   ├── templates.mjs        # Plantillas
    │   ├── action.mjs           # GitHub Actions
    │   ├── watch.mjs            # Watch mode
    │   ├── menu.mjs             # Menu interactivo
    │   └── report.mjs           # Formato de reportes
    ├── ejemplos/
    ├── tests/                   # 42 tests
    └── docs/API.md

## Documentación

- [API completa](docs/API.md)
- [Changelog](CHANGELOG.md)

## Licencia

MIT
