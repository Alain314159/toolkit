// Menu interactivo

import readline from 'readline';
import { c, icon } from './colors.mjs';

export function crearMenu(opciones) {
  const { titulo, items } = opciones;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log('===========================================');
  console.log('  ' + c.negrita(titulo));
  console.log('===========================================');
  console.log('');

  items.forEach((item, i) => {
    const num = String(i + 1).padStart(2);
    console.log('  ' + c.amarillo(num) + '. ' + item.etiqueta);
  });
  console.log('');
  console.log('  ' + c.gris('0. Salir'));
  console.log('');

  return new Promise((resolve) => {
    rl.question('  ' + c.cian('Opcion') + ': ', (resp) => {
      rl.close();
      const num = parseInt(resp);
      if (isNaN(num) || num < 0 || num > items.length) {
        resolve({ cancelado: true });
        return;
      }
      if (num === 0) {
        resolve({ cancelado: true });
        return;
      }
      resolve({ item: items[num - 1], indice: num - 1 });
    });
  });
}

export function pedirTexto(pregunta, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    const prompt = defaultValue
      ? '  ' + c.cian(pregunta) + ' [' + c.gris(defaultValue) + ']: '
      : '  ' + c.cian(pregunta) + ': ';
    rl.question(prompt, (resp) => {
      rl.close();
      resolve(resp.trim() || defaultValue);
    });
  });
}

export function pedirConfirmacion(pregunta) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question('  ' + c.cian(pregunta) + ' [' + c.verde('s') + '/' + c.rojo('n') + ']: ', (resp) => {
      rl.close();
      resolve(resp.toLowerCase() === 's' || resp.toLowerCase() === 'si' || resp.toLowerCase() === 'y');
    });
  });
}
