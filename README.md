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

## Uso desde CLI

    # Validar un archivo (detecta tipo por extensión)
    node ~/toolkit/toolkit.mjs validate src/App.vue
    node ~/toolkit/toolkit.mjs validate script.py
    node ~/toolkit/toolkit.mjs validate styles.css

    # Info del archivo
    node ~/toolkit/toolkit.mjs info src/App.vue

    # Aplicar un plan de parcheo (transaccional por defecto)
    node ~/toolkit/toolkit.mjs apply plan.json

    # Analizar un refactor SIN aplicar
    node ~/toolkit/toolkit.mjs analyze src/App.vue \
      --from "// marcador inicio" \
      --until "// marcador fin" \
      --to "src/mixins/foo.js"

    # Aplicar el refactor
    node ~/toolkit/toolkit.mjs refactor src/App.vue \
      --from "// marcador inicio" \
      --until "// marcador fin" \
      --to "src/mixins/foo.js" --apply

    # Buscar referencias a un símbolo
    node ~/toolkit/toolkit.mjs refs miFuncion --dir src
    node ~/toolkit/toolkit.mjs refs miFuncion --exclude src/mixins/foo.js

    # Buscar varias referencias a la vez
    node ~/toolkit/toolkit.mjs refs-multi simbolos.txt --dir src

## Uso como librería

    import { patch, printReport } from '/ruta/a/toolkit/toolkit.mjs';

    const r = await patch({
      file: 'src/App.vue',
      idempotent: 'MI_MARCA_UNICA',
      ops: [
        { replace: { old: 'viejo', new: 'nuevo' } },
        { insertAfter: { anchor: 'algo', content: '\nlinea nueva' } },
      ],
    });

    printReport(r);

## Operaciones

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
| `.vue` | `@vue/compiler-sfc` |
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
4. **Transaccional**: en planes multi-archivo, si uno falla → rollback de los aplicados
5. **Validación**: compila el resultado antes de escribir
6. **Escritura atómica**: escribe en `.tmp` y luego renombra

## Multi-archivo transaccional

    [
      {
        "file": "src/App.vue",
        "idempotent": "MARCA_1",
        "ops": [ { "replace": { "old": "a", "new": "b" } } ]
      },
      {
        "file": "src/mixins/foo.js",
        "create": true,
        "ops": [
          {
            "custom": {
              "fn": "() => 'contenido completo'",
              "desc": "crear archivo"
            }
          }
        ]
      }
    ]

Si uno falla, ninguno se aplica (o se revierten los que se aplicaron).

**Nota**: la función custom debe definirse en un script JS, no en JSON.

## Análisis de refactor

Antes de extraer código, `analyze` te muestra:

- Métodos que contiene el bloque
- Dependencias internas (se van juntas)
- Dependencias externas (`this.X` que quedan en el original)
- Imports necesarios en el nuevo archivo
- Constantes globales referenciadas
- Sugerencias por tamaño

    node ~/toolkit/toolkit.mjs analyze src/App.vue \
      --from "// ===== TELEGRAM BACKUP =====" \
      --until "// ===== SEGURIDAD =====" \
      --to "src/mixins/telegram.js"

## Búsqueda de referencias

Cuando extraes un método, `refs` te dice dónde más se usa:

    node ~/toolkit/toolkit.mjs refs miFuncion --dir src --context 2

## Scripts de npm

    npm test              # Corre los tests
    npm run validate-all  # Valida todos los .mjs del proyecto
    npm run check         # Alias de validate-all
    npm run test:watch    # Tests en modo watch

## Estructura

    toolkit/
    ├── toolkit.mjs              # CLI + API pública
    ├── package.json
    ├── README.md
    ├── LICENSE
    ├── CHANGELOG.md
    ├── .gitignore
    ├── bin/
    │   └── toolkit              # Ejecutable global
    ├── lib/
    │   ├── detect.mjs           # Detección de tipos
    │   ├── validators.mjs       # Validadores por lenguaje
    │   ├── patch.mjs            # Operaciones + transaccional
    │   ├── analyze.mjs          # Análisis de refactor
    │   ├── refactor.mjs         # Aplicación de refactor
    │   ├── refs.mjs             # Búsqueda de referencias
    │   └── report.mjs           # Formato de reportes
    ├── ejemplos/
    │   ├── plan-simple.json
    │   ├── plan-multi.json
    │   └── simbolos.txt
    └── tests/
        ├── validators.test.mjs
        ├── patch.test.mjs
        └── refs.test.mjs

## Desarrollo

    # Correr tests
    npm test

    # Correr un test específico
    node --test tests/validators.test.mjs

    # Validar el propio toolkit
    npm run validate-all

## Licencia

MIT
