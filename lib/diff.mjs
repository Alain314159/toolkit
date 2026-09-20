// Diff visual entre dos strings, linea por linea

import { c } from './colors.mjs';

// Algoritmo LCS simplificado para lineas
function lcsLineas(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return [];
  if (m === 0) return b.map(linea => ({ tipo: 'add', linea }));
  if (n === 0) return a.map(linea => ({ tipo: 'del', linea }));
  // Matriz de (m+1) x (n+1)
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  // Reconstruir
  const resultado = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      resultado.unshift({ tipo: 'igual', linea: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      resultado.unshift({ tipo: 'add', linea: b[j - 1] });
      j--;
    } else if (i > 0) {
      resultado.unshift({ tipo: 'del', linea: a[i - 1] });
      i--;
    }
  }
  return resultado;
}

export function diffLineas(antes, despues, opciones = {}) {
  const { contexto = 3, mostrarTodo = false } = opciones;
  const a = antes === '' ? [] : antes.split('\n');
  const b = despues === '' ? [] : despues.split('\n');
  const diff = lcsLineas(a, b);

  if (mostrarTodo) {
    return formatearDiff(diff);
  }

  // Colapsar bloques de "igual" largos
  const resultado = [];
  let bloqueIgual = [];
  const flushIgual = () => {
    if (bloqueIgual.length <= contexto * 2) {
      bloqueIgual.forEach(l => resultado.push(l));
    } else {
      bloqueIgual.slice(0, contexto).forEach(l => resultado.push(l));
      resultado.push({ tipo: 'omitido', cantidad: bloqueIgual.length - contexto * 2 });
      bloqueIgual.slice(-contexto).forEach(l => resultado.push(l));
    }
    bloqueIgual = [];
  };

  for (const item of diff) {
    if (item.tipo === 'igual') {
      bloqueIgual.push(item);
    } else {
      flushIgual();
      resultado.push(item);
    }
  }
  flushIgual();

  return formatearDiff(resultado);
}

function formatearDiff(items) {
  const lineas = [];
  let numA = 1, numB = 1;
  for (const item of items) {
    if (item.tipo === 'igual') {
      lineas.push(c.gris('  ' + String(numA).padStart(4) + ' ' + String(numB).padStart(4) + ' │ ') + item.linea);
      numA++; numB++;
    } else if (item.tipo === 'del') {
      lineas.push(c.rojo('  ' + String(numA).padStart(4) + '      ' + ' │ - ') + c.rojo(item.linea));
      numA++;
    } else if (item.tipo === 'add') {
      lineas.push(c.verde('       ' + String(numB).padStart(4) + ' │ + ') + c.verde(item.linea));
      numB++;
    } else if (item.tipo === 'omitido') {
      lineas.push(c.gris('  ... (' + item.cantidad + ' lineas sin cambios) ...'));
    }
  }
  return lineas.join('\n');
}

export function resumenDiff(antes, despues) {
  const a = antes === '' ? [] : antes.split('\n');
  const b = despues === '' ? [] : despues.split('\n');
  const diff = lcsLineas(a, b);
  const add = diff.filter(x => x.tipo === 'add').length;
  const del = diff.filter(x => x.tipo === 'del').length;
  return { add, del };
}
