# toolkit

Herramienta universal de parcheo y validacion.

## Instalacion

    cd ~/toolkit
    npm install

## Uso

### Validar un archivo

    node toolkit.mjs validate src/App.vue
    node toolkit.mjs validate script.py
    node toolkit.mjs validate styles.css

### Info de un archivo

    node toolkit.mjs info src/App.vue

### Aplicar un plan de parcheo

    node toolkit.mjs apply plan.json

### Ver ayuda

    node toolkit.mjs help

## Tipos soportados

| Extension | Validador |
|-----------|-----------|
| .vue | @vue/compiler-sfc |
| .js .mjs .cjs | node --check |
| .ts .tsx | tsc (si esta disponible) |
| .css .scss .less | balance de llaves/parentesis |
| .html | balance de tags |
| .xml .svg | balance de tags |
| .json | JSON.parse |
| .yaml .yml | basico |
| .py | python -m py_compile |
| .sh .bash | bash -n |
| Otros | balance generico |

## Formato del plan

    {
      "file": "src/App.vue",
      "idempotent": "MI_MARCA_UNICA",
      "ops": [
        { "replace": { "old": "texto viejo", "new": "texto nuevo" } },
        { "insertAfter": { "anchor": "algo", "content": "\nnueva linea" } },
        { "insertBefore": { "anchor": "algo", "content": "nueva linea\n" } },
        { "remove": { "text": "a borrar" } },
        { "removeBetween": { "start": "ini", "end": "fin" } },
        { "replaceRegex": { "pattern": "\\d+", "flags": "g", "new": "X" } }
      ]
    }

O un array de planes para aplicar varios archivos de una vez.

## Garantias

- **Idempotente**: si ya esta aplicado (por `idempotent`), no toca nada
- **Backup automatico**: siempre `.bak-<timestamp>`
- **Atomico**: si una operacion falla, NO escribe nada
- **Validacion**: compila el resultado antes de escribir
- **Reporte claro**: dice que hizo, que fallo y por que

## Uso programatico

    import { aplicarPlan } from '~/toolkit/toolkit.mjs';

    const r = await aplicarPlan({
      file: 'src/App.vue',
      idempotent: 'MI_MARCA',
      ops: [
        { replace: { old: 'x', new: 'y' } },
      ],
    });

    if (r.ok) console.log('OK:', r.applied);
    else console.error('Fallo:', r.errors);
