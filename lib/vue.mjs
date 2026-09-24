// lib/vue.mjs
// API semantica para archivos .vue con AST real.
// Usa @vue/compiler-sfc + @vue/compiler-dom + acorn.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import * as acorn from 'acorn';

const require = createRequire(import.meta.url);

function loadSFC() {
  try { return require('@vue/compiler-sfc'); }
  catch (e) { throw new Error('@vue/compiler-sfc no instalado'); }
}

function loadDOM() {
  try { return require('@vue/compiler-dom'); }
  catch (e) { throw new Error('@vue/compiler-dom no instalado'); }
}

// ============================================================
// RESERVADAS
// ============================================================
const RESERVADAS = new Set([
  'true','false','null','undefined','this','in','of','if','else','return',
  'new','typeof','instanceof','void','delete','await','async','function',
  'class','let','const','var','Object','Array','String','Number','Boolean',
  'Math','JSON','Date','RegExp','Map','Set','Promise','Error','parseInt',
  'parseFloat','isNaN','isFinite','console','window','document','navigator',
  'localStorage','sessionStorage','Infinity','NaN','Symbol','BigInt',
]);

// ============================================================
// WALKER AST JS
// ============================================================
function extraerIdentificadores(exprSrc, locales) {
  const ids = new Set();
  if (!exprSrc || typeof exprSrc !== 'string') return ids;
  let ast;
  try {
    ast = acorn.parseExpressionAt(exprSrc, 0, { ecmaVersion: 'latest' });
  } catch (e) {
    try {
      ast = acorn.parse(exprSrc, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (e2) {
      return ids;
    }
  }

  const visitar = (nodo, padre) => {
    if (!nodo || typeof nodo !== 'object') return;

    // Antes de procesar los hijos de una funcion, agregar sus parametros como locales
    if (nodo.type === 'ArrowFunctionExpression' || nodo.type === 'FunctionExpression') {
      for (const p of nodo.params) {
        if (p.type === 'Identifier') locales.add(p.name);
        else if (p.type === 'ObjectPattern') {
          for (const prop of p.properties) {
            if (prop.value && prop.value.type === 'Identifier') locales.add(prop.value.name);
            if (prop.key && prop.key.type === 'Identifier' && prop.shorthand) locales.add(prop.key.name);
          }
        } else if (p.type === 'ArrayPattern') {
          for (const el of p.elements) {
            if (el && el.type === 'Identifier') locales.add(el.name);
          }
        } else if (p.type === 'AssignmentPattern' && p.left && p.left.type === 'Identifier') {
          locales.add(p.left.name);
        } else if (p.type === 'RestElement' && p.argument && p.argument.type === 'Identifier') {
          locales.add(p.argument.name);
        }
      }
    }

    if (nodo.type === 'Identifier') {
      if (padre) {
        if (padre.type === 'MemberExpression' && padre.property === nodo && !padre.computed) return;
        if (padre.type === 'Property' && padre.key === nodo && !padre.computed && !padre.shorthand) return;
        if (padre.type === 'LabeledStatement' || padre.type === 'BreakStatement' || padre.type === 'ContinueStatement') return;
        if (padre.type === 'FunctionDeclaration' && padre.id === nodo) return;
        if (padre.type === 'FunctionExpression' && padre.id === nodo) return;
        if (padre.type === 'ClassDeclaration' && padre.id === nodo) return;
        // Es parametro de una funcion? (ya se agrego a locales antes de recorrer)
      }
      const n = nodo.name;
      if (RESERVADAS.has(n)) return;
      if (locales && locales.has(n)) return;
      ids.add(n);
      return;
    }

    if (nodo.type === 'Literal') return;

    if (nodo.type === 'TemplateLiteral') {
      for (const e of nodo.expressions) visitar(e, nodo);
      return;
    }

    if (nodo.type === 'Property') {
      if (nodo.computed) visitar(nodo.key, nodo);
      visitar(nodo.value, nodo);
      return;
    }

    if (nodo.type === 'MemberExpression') {
      visitar(nodo.object, nodo);
      if (nodo.computed) visitar(nodo.property, nodo);
      return;
    }

    for (const key in nodo) {
      const v = nodo[key];
      if (Array.isArray(v)) {
        for (const item of v) visitar(item, nodo);
      } else if (v && typeof v === 'object' && v.type) {
        visitar(v, nodo);
      }
    }
  };

  visitar(ast, null);
  return ids;
}

// ============================================================
// WALKER AST TEMPLATE (Vue)
// ============================================================
function extraerDelTemplate(templateSrc) {
  const usadas = new Set();
  const locales = new Set();

  if (!templateSrc) return { usadas, locales };

  const compilerDOM = loadDOM();
  let ast;
  try {
    ast = compilerDOM.parse(templateSrc);
  } catch (e) {
    return { usadas, locales };
  }

  function procesarExpr(exp) {
    if (!exp) return;
    const src = typeof exp === 'string' ? exp : (exp.content || '');
    if (!src) return;
    const ids = extraerIdentificadores(src, locales);
    for (const id of ids) usadas.add(id);
  }

  function procesarDirectiva(prop) {
    if (prop.type !== 7 && prop.type !== 'Directive') return;
    const name = prop.name;

    // v-for="(x, y) in items"  o  v-for="x in items"
    if (name === 'for') {
      const src = prop.exp ? (prop.exp.content || '') : '';
      const m = src.match(/^\s*\(?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:,\s*([a-zA-Z_$][a-zA-Z0-9_$]*))?\s*\)?\s+(?:in|of)\s+([\s\S]+)$/);
      if (m) {
        if (m[1]) locales.add(m[1]);
        if (m[2]) locales.add(m[2]);
        // El resto (el iterable) SÍ es una expresion
        const iterableExpr = m[3];
        const ids = extraerIdentificadores(iterableExpr, locales);
        for (const id of ids) usadas.add(id);
      }
      return;
    }

    // v-slot / #default="{ a, b }"
    if (name === 'slot' || (name === 'bind' && prop.arg && prop.arg.content === 'slot')) {
      if (prop.exp && prop.exp.content) {
        const ids = prop.exp.content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
        for (const id of ids) locales.add(id);
      }
      return;
    }

    // v-scope
    if (name === 'scope') {
      if (prop.exp && prop.exp.content) {
        const ids = prop.exp.content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
        for (const id of ids) locales.add(id);
      }
      return;
    }

    // Cualquier otra directiva con expresion
    if (prop.exp) procesarExpr(prop.exp);
  }

  function walk(nodo) {
    if (!nodo || typeof nodo !== 'object') return;

    const t = nodo.type;

    // Interpolacion {{ expr }}
    if (t === 5 || t === 'Interpolation') {
      procesarExpr(nodo.content);
      return;
    }

    // Element (1) - procesar props y children
    if (t === 1 || t === 'Element') {
      if (Array.isArray(nodo.props)) {
        for (const prop of nodo.props) {
          if (prop.type === 7 || prop.type === 'Directive') procesarDirectiva(prop);
        }
      }
      if (Array.isArray(nodo.children)) {
        for (const child of nodo.children) walk(child);
      }
      return;
    }

    // If (9)
    if (t === 9 || t === 'If') {
      if (Array.isArray(nodo.branches)) {
        for (const b of nodo.branches) {
          if (b.condition) procesarExpr(b.condition);
          if (Array.isArray(b.children)) for (const c of b.children) walk(c);
        }
      }
      return;
    }

    // For (11)
    if (t === 11 || t === 'For') {
      if (nodo.source) procesarExpr(nodo.source);
      if (nodo.valueAlias) locales.add(nodo.valueAlias.content);
      if (nodo.keyAlias) locales.add(nodo.keyAlias.content);
      if (nodo.objectIndexAlias) locales.add(nodo.objectIndexAlias.content);
      if (Array.isArray(nodo.children)) for (const c of nodo.children) walk(c);
      return;
    }

    // Fallback: Root, Fragment, Text, Comment, etc.
    if (Array.isArray(nodo.children)) {
      for (const child of nodo.children) walk(child);
    }
    if (Array.isArray(nodo.branches)) {
      for (const b of nodo.branches) {
        if (b.condition) procesarExpr(b.condition);
        if (Array.isArray(b.children)) for (const c of b.children) walk(c);
      }
    }
    if (Array.isArray(nodo.props)) {
      for (const prop of nodo.props) {
        if (prop.type === 7 || prop.type === 'Directive') procesarDirectiva(prop);
      }
    }
  }

  walk(ast);
  return { usadas, locales };
}

// ============================================================
// WALKER AST JS COMPLETO
// ============================================================
function walkJS(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key in node) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walkJS(item, visit);
    } else if (value && typeof value === 'object' && value.type) {
      walkJS(value, visit);
    }
  }
}

function findFirst(node, pred) {
  let found = null;
  walkJS(node, (n) => { if (!found && pred(n)) found = n; });
  return found;
}

// ============================================================
// CLASE
// ============================================================
export class VueFile {
  constructor(filePath) {
    this.filePath = filePath;
    this.originalContent = fs.readFileSync(filePath, 'utf8');
    this.content = this.originalContent;
    this.dirty = false;
    this.operations = [];
    this._parse();
  }

  _parse() {
    const sfc = loadSFC();
    const { descriptor, errors } = sfc.parse(this.content, { filename: this.filePath });
    if (errors && errors.length > 0) {
      throw new Error('Error parseando SFC: ' + errors.map(e => e.message || e).join(', '));
    }
    this.descriptor = descriptor;
    const scriptNode = descriptor.script || descriptor.scriptSetup;
    if (scriptNode) {
      try {
        this.scriptAST = acorn.parse(scriptNode.content, {
          ecmaVersion: 'latest',
          sourceType: 'module',
          locations: true,
          ranges: true,
        });
        this.scriptContent = scriptNode.content;
        this.scriptOffset = this.content.indexOf(scriptNode.content);
      } catch (e) {
        throw new Error('Error parseando script: ' + e.message);
      }
    } else {
      this.scriptAST = null;
      this.scriptContent = null;
      this.scriptOffset = 0;
    }
  }

  getExportDefault() {
    if (!this.scriptAST) return null;
    return findFirst(this.scriptAST, n => n.type === 'ExportDefaultDeclaration');
  }

  getComponentObject() {
    const exp = this.getExportDefault();
    if (!exp) return null;
    const dec = exp.declaration;
    if (dec.type === 'ObjectExpression') return dec;
    if (dec.type === 'CallExpression' && dec.arguments[0] && dec.arguments[0].type === 'ObjectExpression') {
      return dec.arguments[0];
    }
    return null;
  }

  _getProp(objNode, name) {
    if (!objNode || objNode.type !== 'ObjectExpression') return null;
    for (const prop of objNode.properties) {
      if (prop.type !== 'Property' && prop.type !== 'ObjectMethod') continue;
      const key = prop.key;
      const keyName = key.type === 'Identifier' ? key.name : (key.type === 'Literal' ? key.value : null);
      if (keyName === name) return prop;
    }
    return null;
  }

  getMethods() {
    const comp = this.getComponentObject();
    if (!comp) return [];
    const prop = this._getProp(comp, 'methods');
    if (!prop || prop.value.type !== 'ObjectExpression') return [];
    return prop.value.properties.map(p => ({
      nombre: p.key.name || p.key.value,
      nodo: p,
      async: p.value ? p.value.async : false,
    }));
  }

  getComputed() {
    const comp = this.getComponentObject();
    if (!comp) return [];
    const prop = this._getProp(comp, 'computed');
    if (!prop || prop.value.type !== 'ObjectExpression') return [];
    return prop.value.properties.map(p => ({
      nombre: p.key.name || p.key.value,
      nodo: p,
    }));
  }

  getDataFields() {
    const comp = this.getComponentObject();
    if (!comp) return [];
    const prop = this._getProp(comp, 'data');
    if (!prop) return [];
    let objExpr = null;
    if (prop.value.type === 'FunctionExpression' && prop.value.body.type === 'BlockStatement') {
      const ret = findFirst(prop.value.body, n => n.type === 'ReturnStatement');
      if (ret && ret.argument && ret.argument.type === 'ObjectExpression') {
        objExpr = ret.argument;
      }
    }
    if (!objExpr) return [];
    return objExpr.properties.map(p => ({
      nombre: p.key.name || p.key.value,
      nodo: p,
    }));
  }

  getTemplateSections() {
    const re = /<!-- =+ ([A-Z][A-Z\s()]+?) =+ -->/g;
    const matches = [];
    let m;
    while ((m = re.exec(this.content)) !== null) {
      matches.push({ nombre: m[1].trim(), inicio: m.index, longitud: m[0].length });
    }
    return matches;
  }

  checkOrphans() {
    const template = this.descriptor.template ? this.descriptor.template.content : '';
    const script = this.scriptContent || '';

    const orphans = [];
    const rotos = [];

    const definidos = new Set();
    const todos = [
      ...this.getMethods().map(m => ({ tipo: 'metodo', nombre: m.nombre, nodo: m.nodo })),
      ...this.getComputed().map(c => ({ tipo: 'computed', nombre: c.nombre, nodo: c.nodo })),
      ...this.getDataFields().map(d => ({ tipo: 'data', nombre: d.nombre, nodo: d.nodo })),
    ];
    for (const item of todos) definidos.add(item.nombre);

    // Extraer del template con parser real
    const { usadas: usadasEnTemplate } = extraerDelTemplate(template);

    // Referencias del script a cada definido (sin contar la definicion misma)
    for (const item of todos) {
      const lineaDef = this.content.slice(this.scriptOffset + item.nodo.start, this.scriptOffset + item.nodo.end);
      const scriptSinDef = script.replace(lineaDef, '');
      const re = new RegExp('\\b' + item.nombre.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '\\b', 'g');
      const enScript = (scriptSinDef.match(re) || []).length;
      const enTemplate = usadasEnTemplate.has(item.nombre) ? 1 : 0;
      if (enTemplate === 0 && enScript === 0) {
        orphans.push({ tipo: item.tipo, nombre: item.nombre });
      }
    }

    // Reservadas + imports
    const reservadasExtra = new Set();
    if (this.scriptAST) {
      for (const nodo of this.scriptAST.body) {
        if (nodo.type === 'ImportDeclaration') {
          for (const sp of nodo.specifiers) reservadasExtra.add(sp.local.name);
        }
      }
    }

    // Componentes locales registrados
    const componentesLocales = new Set();
    const compProp = this._getProp(this.getComponentObject(), 'components');
    if (compProp && compProp.value.type === 'ObjectExpression') {
      for (const p of compProp.value.properties) {
        componentesLocales.add(p.key.name || p.key.value);
      }
    }

    const declaradosEnComponente = new Set(['name','components','props','emits','mixins','directives','setup','data','computed','methods','watch','created','mounted','beforeUnmount','unmounted','beforeCreate','beforeMount','updated','activated','deactivated','provide','inject','expose']);

    for (const u of usadasEnTemplate) {
      if (RESERVADAS.has(u)) continue;
      if (reservadasExtra.has(u)) continue;
      if (declaradosEnComponente.has(u)) continue;
      if (componentesLocales.has(u)) continue;
      if (u.startsWith('$')) continue;
      if (definidos.has(u)) continue;
      if (/^\d+$/.test(u)) continue;
      rotos.push(u);
    }

    return { orphans, rotos: [...new Set(rotos)].sort() };
  }

  validate() {
    const sfc = loadSFC();
    const { descriptor, errors } = sfc.parse(this.content, { filename: this.filePath });
    if (errors && errors.length > 0) {
      return { ok: false, errors: errors.map(e => e.message || String(e)) };
    }
    if (descriptor.template) {
      const tpl = sfc.compileTemplate({
        source: descriptor.template.content,
        filename: this.filePath,
        id: 'validate',
      });
      if (tpl.errors && tpl.errors.length > 0) {
        return { ok: false, errors: tpl.errors.map(e => e.message || String(e)) };
      }
    }
    if (descriptor.script || descriptor.scriptSetup) {
      try {
        sfc.compileScript(descriptor, { id: 'validate' });
      } catch (e) {
        return { ok: false, errors: ['Error en script: ' + e.message] };
      }
    }
    return { ok: true };
  }

  save(opciones = {}) {
    const { backup = true, dryRun = false } = opciones;
    if (!this.dirty) return { ok: true, cambiado: false };

    const v = this.validate();
    if (!v.ok) return { ok: false, errors: v.errors };
    if (dryRun) return { ok: true, dryRun: true, operations: this.operations };

    let backupPath = null;
    if (backup) {
      backupPath = this.filePath + '.bak-' + Date.now();
      fs.copyFileSync(this.filePath, backupPath);
    }

    const tmp = this.filePath + '.tmp-' + Date.now();
    fs.writeFileSync(tmp, this.content);
    fs.renameSync(tmp, this.filePath);

    return { ok: true, backup: backupPath, operations: this.operations };
  }
}

export async function openVue(filePath) {
  return new VueFile(filePath);
}

export function esVue(filePath) {
  return path.extname(filePath).toLowerCase() === '.vue';
}
