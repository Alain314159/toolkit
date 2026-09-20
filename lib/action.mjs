// Interaccion con GitHub Actions

import { spawnSync } from 'child_process';

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 15000 });
}

export function detectarRepo(dirBase) {
  const r = run('git', ['remote', 'get-url', 'origin'], dirBase);
  if (r.status !== 0) return null;
  const url = r.stdout.trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], full: m[1] + '/' + m[2] };
}

export function infoUltimoCommit(dirBase) {
  const hash = run('git', ['rev-parse', 'HEAD'], dirBase);
  const corto = run('git', ['rev-parse', '--short', 'HEAD'], dirBase);
  const msg = run('git', ['log', '-1', '--pretty=%s'], dirBase);
  const fecha = run('git', ['log', '-1', '--pretty=%cd', '--date=iso'], dirBase);
  const autor = run('git', ['log', '-1', '--pretty=%an'], dirBase);
  return {
    hash: (hash.stdout || '').trim(),
    hashCorto: (corto.stdout || '').trim(),
    mensaje: (msg.stdout || '').trim(),
    fecha: (fecha.stdout || '').trim(),
    autor: (autor.stdout || '').trim(),
  };
}

export function urlActions(dirBase) {
  const repo = detectarRepo(dirBase);
  if (!repo) return null;
  return 'https://github.com/' + repo.full + '/actions';
}

export function urlCommit(dirBase) {
  const repo = detectarRepo(dirBase);
  const info = infoUltimoCommit(dirBase);
  if (!repo || !info.hash) return null;
  return 'https://github.com/' + repo.full + '/commit/' + info.hash;
}
