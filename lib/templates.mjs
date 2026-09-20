// Plantillas para crear archivos

import fs from 'fs';
import path from 'path';

export const TEMPLATES = {
  vue: {
    desc: 'Componente Vue 3 (Options API)',
    ext: '.vue',
    dir: 'src/components',
    contenido: (nombre) => `<template>
  <div class="${nombre.toLowerCase()}">
    <!-- contenido -->
  </div>
</template>

<script>
export default {
  name: '${nombre}',
  props: {},
  emits: [],
  data() {
    return {};
  },
  computed: {},
  methods: {},
};
</script>

<style scoped>
.${nombre.toLowerCase()} {
  /* estilos */
}
</style>
`,
  },
  mixin: {
    desc: 'Mixin de Options API',
    ext: '.js',
    dir: 'src/mixins',
    contenido: (nombre) => `// Mixin: ${nombre}
export default {
  data() {
    return {};
  },
  computed: {},
  methods: {},
};
`,
  },
  composable: {
    desc: 'Composable de Vue 3',
    ext: '.js',
    dir: 'src/composables',
    contenido: (nombre) => `// Composable: ${nombre}
import { ref, computed } from 'vue';

export function ${nombre}() {
  const estado = ref(null);
  const doble = computed(() => estado.value);

  function actualizar(v) {
    estado.value = v;
  }

  return {
    estado,
    doble,
    actualizar,
  };
}
`,
  },
  test: {
    desc: 'Test con node --test',
    ext: '.test.mjs',
    dir: 'tests',
    contenido: (nombre) => `import { test } from 'node:test';
import assert from 'node:assert';

test('${nombre} funciona', () => {
  assert.strictEqual(1 + 1, 2);
});
`,
  },
  js: {
    desc: 'Modulo JavaScript',
    ext: '.mjs',
    dir: 'src',
    contenido: (nombre) => `// Modulo: ${nombre}
export function ${nombre}() {
  return true;
}
`,
  },
  css: {
    desc: 'Archivo CSS',
    ext: '.css',
    dir: 'src',
    contenido: (nombre) => `/* ${nombre} */

.${nombre} {
  /* estilos */
}
`,
  },
};

export function crearDesdeTemplate(tipo, nombre, dirBase, opciones = {}) {
  const { dir = null, force = false } = opciones;
  const tpl = TEMPLATES[tipo];
  if (!tpl) {
    return { ok: false, error: 'Template desconocido: ' + tipo + '. Validos: ' + Object.keys(TEMPLATES).join(', ') };
  }

  const dirDestino = dir ? path.resolve(dirBase, dir) : path.join(dirBase, tpl.dir);
  if (!fs.existsSync(dirDestino)) {
    fs.mkdirSync(dirDestino, { recursive: true });
  }

  const archivo = path.join(dirDestino, nombre + tpl.ext);
  if (fs.existsSync(archivo) && !force) {
    return { ok: false, error: 'Ya existe: ' + path.relative(dirBase, archivo), archivo };
  }

  try {
    fs.writeFileSync(archivo, tpl.contenido(nombre));
    return { ok: true, archivo, tipo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
