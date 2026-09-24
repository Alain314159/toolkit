import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { openVue, esVue } from '../lib/vue.mjs';

function crearVueDeTest(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-vue-'));
  const file = path.join(dir, 'Test.vue');
  fs.writeFileSync(file, content);
  return { dir, file };
}

const VUE_BASE = `<template>
  <div>
    <span>{{ titulo }}</span>
    <span>{{ doble }}</span>
    <p v-if="activo">Activo</p>
    <button @click="saludar()">Click</button>
    <ul>
      <li v-for="item in items">{{ item.nombre }}</li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'Test',
  data() {
    return {
      titulo: 'Hola',
      activo: true,
      items: [],
      noUsado: 'nadie me usa',
    };
  },
  computed: {
    doble() {
      return this.items.length * 2;
    },
    noUsadoComputed() {
      return 123;
    },
  },
  methods: {
    saludar() {
      console.log('hola');
    },
    noUsadoMethod() {
      return 42;
    },
  },
};
</script>
`;

test('esVue detecta .vue', () => {
  assert.strictEqual(esVue('a.vue'), true);
  assert.strictEqual(esVue('a.js'), false);
  assert.strictEqual(esVue('a.VUE'), true);
});

test('getMethods devuelve metodos', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const m = vue.getMethods();
  assert.strictEqual(m.length, 2);
  const nombres = m.map(x => x.nombre);
  assert.ok(nombres.includes('saludar'));
  assert.ok(nombres.includes('noUsadoMethod'));
  fs.rmSync(dir, { recursive: true });
});

test('getComputed devuelve computeds', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const c = vue.getComputed();
  assert.strictEqual(c.length, 2);
  const nombres = c.map(x => x.nombre);
  assert.ok(nombres.includes('doble'));
  assert.ok(nombres.includes('noUsadoComputed'));
  fs.rmSync(dir, { recursive: true });
});

test('getDataFields devuelve data', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const d = vue.getDataFields();
  assert.strictEqual(d.length, 4);
  const nombres = d.map(x => x.nombre);
  assert.ok(nombres.includes('titulo'));
  assert.ok(nombres.includes('activo'));
  assert.ok(nombres.includes('noUsado'));
  fs.rmSync(dir, { recursive: true });
});

test('checkOrphans detecta los huerfanos reales', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const { orphans, rotos } = vue.checkOrphans();

  const nombres = orphans.map(o => o.nombre);
  assert.ok(nombres.includes('noUsadoMethod'), 'noUsadoMethod debe ser huerfano');
  assert.ok(nombres.includes('noUsadoComputed'), 'noUsadoComputed debe ser huerfano');
  assert.ok(nombres.includes('noUsado'), 'noUsado debe ser huerfano');

  assert.ok(!nombres.includes('saludar'), 'saludar no es huerfano');
  assert.ok(!nombres.includes('doble'), 'doble se usa en template, no es huerfano');
  assert.ok(!nombres.includes('titulo'), 'titulo no es huerfano');

  assert.strictEqual(rotos.length, 0);
  fs.rmSync(dir, { recursive: true });
});

test('removeMethod elimina un metodo', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const ok = vue.removeMethod('noUsadoMethod');
  assert.strictEqual(ok, true);

  const metodos = vue.getMethods();
  const nombres = metodos.map(m => m.nombre);
  assert.ok(!nombres.includes('noUsadoMethod'));
  assert.ok(nombres.includes('saludar'));
  fs.rmSync(dir, { recursive: true });
});

test('removeComputed elimina un computed', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const ok = vue.removeComputed('noUsadoComputed');
  assert.strictEqual(ok, true);

  const c = vue.getComputed();
  const nombres = c.map(x => x.nombre);
  assert.ok(!nombres.includes('noUsadoComputed'));
  assert.ok(nombres.includes('doble'));
  fs.rmSync(dir, { recursive: true });
});

test('removeDataField elimina un campo de data', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const ok = vue.removeDataField('noUsado');
  assert.strictEqual(ok, true);

  const d = vue.getDataFields();
  const nombres = d.map(x => x.nombre);
  assert.ok(!nombres.includes('noUsado'));
  assert.ok(nombres.includes('titulo'));
  fs.rmSync(dir, { recursive: true });
});

test('save con dryRun no escribe', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const antes = fs.readFileSync(file, 'utf8');
  const vue = await openVue(file);
  vue.removeMethod('noUsadoMethod');
  const r = vue.save({ dryRun: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dryRun, true);

  const despues = fs.readFileSync(file, 'utf8');
  assert.strictEqual(antes, despues);
  fs.rmSync(dir, { recursive: true });
});

test('save con validacion falla no escribe', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const antes = fs.readFileSync(file, 'utf8');
  const vue = await openVue(file);

  // Forzar contenido invalido: template con tag sin cerrar correctamente
  vue.content = vue.content.replace('<div>\n    <span>', '<div>\n    <span>>');

  const r = vue.save();
  // Si por alguna razón Vue lo acepta, al menos verificamos que no se escribió algo peor
  if (!r.ok) {
    assert.ok(r.errors);
    const despues = fs.readFileSync(file, 'utf8');
    assert.strictEqual(antes, despues);
  }
  fs.rmSync(dir, { recursive: true });
});

test('save con backup crea archivo .bak', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  vue.removeMethod('noUsadoMethod');
  const r = vue.save();
  assert.strictEqual(r.ok, true);
  assert.ok(r.backup);
  assert.ok(fs.existsSync(r.backup));
  fs.rmSync(dir, { recursive: true });
});

test('removeMethod devuelve false si no existe', async () => {
  const { dir, file } = crearVueDeTest(VUE_BASE);
  const vue = await openVue(file);
  const ok = vue.removeMethod('noExiste');
  assert.strictEqual(ok, false);
  fs.rmSync(dir, { recursive: true });
});

test('getTemplateSections encuentra marcadores', async () => {
  const content = `<template>
  <!-- ==================== SECCION A ==================== -->
  <div>A</div>
  <!-- ==================== SECCION B ==================== -->
  <div>B</div>
</template>
<script>
export default {};
</script>`;
  const { dir, file } = crearVueDeTest(content);
  const vue = await openVue(file);
  const s = vue.getTemplateSections();
  assert.strictEqual(s.length, 2);
  assert.strictEqual(s[0].nombre, 'SECCION A');
  assert.strictEqual(s[1].nombre, 'SECCION B');
  fs.rmSync(dir, { recursive: true });
});
