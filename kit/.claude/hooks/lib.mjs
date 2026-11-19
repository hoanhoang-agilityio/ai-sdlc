// Shared helpers for ai-sdlc hooks. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_ALLOWLIST = [
  'intent/**', '.sdlc/**', '.claude/**', 'docs/**', 'evals/**',
  'CLAUDE.md', 'REVIEW.md', 'README.md',
];

export function readStdinJson() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
}

export function readConfig(root) {
  const p = path.join(root, '.sdlc', 'config.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Parse the first `---` block of a Markdown file. Returns {} when absent. */
export function parseFrontmatter(text) {
  const m = /^﻿?\s*---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].replace(/\s+#.*$/, '').trim();
    v = v.replace(/^["']|["']$/g, '');
    out[kv[1].toLowerCase()] = v;
  }
  return out;
}

export function readFrontmatter(file) {
  try { return parseFrontmatter(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function isAccepted(file) {
  const fm = readFrontmatter(file);
  return !!fm && String(fm.status || '').toLowerCase() === 'accepted';
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

export function matchesAny(rel, globs) {
  return globs.some((g) => globToRegExp(g).test(rel));
}

/** Path relative to root with forward slashes, or null when outside root. */
export function relToRoot(root, target) {
  if (!target) return null;
  const abs = path.isAbsolute(target) ? target : path.resolve(root, target);
  let realRoot = root;
  try { realRoot = fs.realpathSync(root); } catch { /* keep */ }
  for (const base of [root, realRoot]) {
    const rel = path.relative(base, abs);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  }
  return null;
}

export function currentBranch(root) {
  try {
    const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch { return null; }
}

export function appendBypassLog(root, entry) {
  const dir = path.join(root, '.sdlc');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'bypass.log'), JSON.stringify(entry) + '\n');
}

export function activeChange(root) {
  try {
    const name = fs.readFileSync(path.join(root, '.sdlc', 'active'), 'utf8').trim();
    if (!name) return null;
    const dir = name.replace(/^intent\//, '').replace(/\/+$/, '');
    const abs = path.join(root, 'intent', dir);
    return fs.existsSync(abs) ? { name: dir, dir: abs } : null;
  } catch { return null; }
}
