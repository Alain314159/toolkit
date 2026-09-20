// Colores ANSI para terminal

const soportaColor = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (!process.stdout || !process.stdout.isTTY) return false;
  return true;
})();

function wrap(codigo) {
  return (texto) => soportaColor ? '\x1b[' + codigo + 'm' + texto + '\x1b[0m' : String(texto);
}

export const c = {
  rojo:      wrap('31'),
  verde:     wrap('32'),
  amarillo:  wrap('33'),
  azul:      wrap('34'),
  magenta:   wrap('35'),
  cian:      wrap('36'),
  gris:      wrap('90'),
  blanco:    wrap('97'),
  negrita:   wrap('1'),
  debil:     wrap('2'),
  subrayado: wrap('4'),
  invertido: wrap('7'),
};

// Iconos con color
export const icon = {
  ok:      c.verde('✅'),
  error:   c.rojo('❌'),
  warn:    c.amarillo('⚠'),
  skip:    c.gris('⏭'),
  info:    c.azul('ℹ'),
  flecha:  c.cian('→'),
  punto:   c.gris('·'),
  check:   c.verde('✓'),
  cruz:    c.rojo('✗'),
};

// Para formatear números o textos importantes
export const fmt = {
  archivo:   (s) => c.cian(s),
  numero:    (s) => c.amarillo(s),
  ruta:      (s) => c.gris(s),
  codigo:    (s) => c.magenta(s),
  exito:     (s) => c.verde(s),
  fallo:     (s) => c.rojo(s),
  aviso:     (s) => c.amarillo(s),
  titulo:    (s) => c.negrita(s),
};
