# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

## [1.2.0] - 2026-09-20

### Añadido

- `fix`: detecta problemas comunes (.bak viejos, console.log, TODOs)
- `make:<tipo>`: crea archivos desde plantilla
  - make:vue, make:mixin, make:composable, make:test, make:js, make:css
- `action`: URL de GitHub Actions del ultimo commit
- `watch`: vigila cambios con debounce y auto-fix
- `menu`: menú interactivo (default sin args si es TTY)
- `orphans`: detecta metodos sin uso
- `--dry-run` real en `apply`
- `--json <archivo>` en `analyze` (exportar analisis)
- `--block nombre:inicio:fin` en `analyze` (varios bloques)
- Validacion multiple: `validate archivo1 archivo2 ...`
- Colores ANSI con deteccion de TTY
- Deteccion automatica de repo GitHub

## [1.1.0] - 2026-09-20

### Añadido

- `undo`: deshace ultimos N cambios (restaura backups)
- `log`: historial de cambios en .toolkit/history.json
- `verify`: validacion + tests + build + git status
- `save`: commit + push con link a Actions
- `search`: busqueda de texto literal
- `tree`: arbol del proyecto con tamaños
- `stats`: estadisticas por extension
- `diff`: compara con el backup mas reciente
- `plan:new`: genera plantilla de plan
- `config`: lee .toolkitrc.json
- `refs-auto` en refactor: busca referencias externas
- `lib/colors.mjs`, `lib/diff.mjs`, `lib/search.mjs`, `lib/tree.mjs`
- `lib/stats.mjs`, `lib/history.mjs`, `lib/verify.mjs`, `lib/save.mjs`
- `lib/config.mjs`, `lib/watch.mjs`, `lib/fix.mjs`, `lib/templates.mjs`
- `lib/action.mjs`, `lib/menu.mjs`, `lib/orphans.mjs`
- `docs/API.md` con referencia completa

## [1.0.0] - 2026-09-20

### Añadido

- CLI con comandos: validate, info, apply, analyze, refactor, refs, refs-multi, help
- Validacion de 15 tipos de archivos
- Operaciones: replace, replaceRegex, insertAfter, insertBefore, remove, removeBetween, custom
- Idempotencia, backup automatico, aplicacion atomica
- Modo transaccional multi-archivo con rollback
- Analisis de refactor con dependencias e imports
- Tests con node --test
- Workflow de GitHub Actions
