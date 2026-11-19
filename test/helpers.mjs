import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const GATE = path.join(ROOT, 'kit/.claude/hooks/sdlc-gate.mjs');
export const STOP = path.join(ROOT, 'kit/.claude/hooks/sdlc-stop.mjs');
export const CLI = path.join(ROOT, 'bin/ai-sdlc.mjs');

export function tmp(prefix = 'sdlc-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export function put(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
export const fm = (status = 'draft', risk = 'medium') => `---\nstatus: ${status}\nrisk: ${risk}\naccepted_by:\naccepted_at:\n---\n\n# T\n`;
export function project(config = {}) {
  const root = tmp();
  put(root, '.sdlc/config.json', JSON.stringify({ mode: 'new', testCommand: null, defaultBranch: 'main', ...config }));
  return root;
}
export function runHook(file, root, input, env = {}) {
  const e = { ...process.env, CLAUDE_PROJECT_DIR: root, ...env };
  if (!('SDLC_GATE' in env)) delete e.SDLC_GATE;
  const r = spawnSync('node', [file], { input: JSON.stringify({ cwd: root, ...input }), encoding: 'utf8', env: e });
  return { code: r.status, err: r.stderr, out: r.stdout };
}
export const gate = (root, tool_name, tool_input, env) => runHook(GATE, root, { tool_name, tool_input }, env);
export const bash = (root, command, env) => gate(root, 'Bash', { command }, env);
export function cli(args, opts = {}) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, out: r.stdout + r.stderr };
}
export function gitInit(root) {
  const g = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  return g;
}
