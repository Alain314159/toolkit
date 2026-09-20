// Formato de reportes

export function printHeader(titulo) {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  ' + titulo);
  console.log('═══════════════════════════════════════════');
}

export function printSuccess(file, applied, warning) {
  console.log('  ✅ APLICADO: ' + file);
  if (applied && applied.length) {
    applied.forEach(a => console.log('     · ' + a));
  }
  if (warning) console.log('     ⚠ ' + warning);
}

export function printSkipped(file, reason) {
  console.log('  ⏭  YA APLICADO: ' + file);
  console.log('     ' + reason);
}

export function printError(file, errors) {
  console.log('  ❌ FALLO: ' + file);
  errors.forEach(e => console.log('     · ' + e));
}

export function printFooter() {
  console.log('═══════════════════════════════════════════');
  console.log('');
}

export function printBackup(path) {
  console.log('     Backup: ' + path);
}

export function printInfo(label, value) {
  console.log('  ' + label + ': ' + value);
}
