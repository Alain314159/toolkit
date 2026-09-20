// Commit + push rapido

import { spawnSync } from 'child_process';

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 30000 });
}

export function guardarCambios(dirBase, mensaje, opciones = {}) {
  const { push = true, add = true, files = null } = opciones;
  const resultado = { ok: false, pasos: [] };

  // Verificar que es un repo git
  const check = run('git', ['rev-parse', '--is-inside-work-tree'], dirBase);
  if (check.status !== 0) {
    resultado.pasos.push({ ok: false, mensaje: 'No es un repo git' });
    return resultado;
  }

  // Add
  if (add) {
    const args = files ? ['add', ...files] : ['add', '-A'];
    const r = run('git', args, dirBase);
    if (r.status !== 0) {
      resultado.pasos.push({ ok: false, mensaje: 'git add fallo', detalle: r.stderr });
      return resultado;
    }
    resultado.pasos.push({ ok: true, mensaje: 'git add' });
  }

  // Ver si hay cambios
  const status = run('git', ['status', '--porcelain'], dirBase);
  if (!status.stdout || status.stdout.trim() === '') {
    resultado.pasos.push({ ok: true, mensaje: 'Sin cambios para commitear' });
    resultado.ok = true;
    resultado.vacio = true;
    return resultado;
  }

  // Commit
  const r = run('git', ['commit', '-m', mensaje], dirBase);
  if (r.status !== 0) {
    resultado.pasos.push({ ok: false, mensaje: 'git commit fallo', detalle: r.stdout + '\n' + r.stderr });
    return resultado;
  }

  // Extraer hash
  const hashR = run('git', ['rev-parse', '--short', 'HEAD'], dirBase);
  const hash = (hashR.stdout || '').trim();
  resultado.hash = hash;
  resultado.pasos.push({ ok: true, mensaje: 'git commit ' + hash });

  // Push
  if (push) {
    const rp = run('git', ['push'], dirBase);
    if (rp.status !== 0) {
      resultado.pasos.push({ ok: false, mensaje: 'git push fallo', detalle: rp.stderr });
      return resultado;
    }
    resultado.pasos.push({ ok: true, mensaje: 'git push' });
  }

  // Detectar repo para link a Actions
  const remoteR = run('git', ['remote', 'get-url', 'origin'], dirBase);
  if (remoteR.status === 0) {
    const url = remoteR.stdout.trim();
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/);
    if (m) {
      resultado.repo = m[1] + '/' + m[2];
      resultado.actionsUrl = 'https://github.com/' + m[1] + '/' + m[2] + '/actions';
    }
  }

  resultado.ok = true;
  return resultado;
}
