# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/),
versionado según [Semantic Versioning](https://semver.org/lang/es/).

## [1.0.0] - 2026-09-20

### Añadido

- CLI con comandos: `validate`, `info`, `apply`, `analyze`, `refactor`, `refs`, `refs-multi`, `help`
- Validación de 15 tipos de archivos:
  - `.vue` (con `@vue/compiler-sfc`)
  - `.js .mjs .cjs .jsx` (con `node --check`)
  - `.ts .tsx` (con `tsc` si está disponible)
  - `.css .scss .less` (balance de llaves y paréntesis)
  - `.html` (balance de tags)
  - `.xml .svg` (balance de tags)
  - `.json` (parse)
  - `.yaml .yml` (básico)
  - `.py` (con `py_compile`)
  - `.sh .bash` (con `bash -n`)
  - Otros (balance genérico)
- Operaciones: `replace`, `replaceRegex`, `insertAfter`, `insertBefore`, `remove`, `removeBetween`, `custom`
- Idempotencia por marca única
- Backup automático `.bak-<timestamp>`
- Aplicación atómica (si una op falla, no escribe)
- Modo transaccional multi-archivo con rollback
- Escritura atómica (tmp + rename)
- Análisis de refactor:
  - Extrae métodos de un bloque
  - Detecta dependencias internas y externas
  - Sugiere imports necesarios
  - Muestra preview del mixin generado
- Aplicación de refactor (extrae bloque a mixin)
- Búsqueda de referencias (`refs`, `refs-multi`)
- Tests con `node --test` (sin dependencias externas)
- Workflow de GitHub Actions
- Ejemplos de planes de parcheo
