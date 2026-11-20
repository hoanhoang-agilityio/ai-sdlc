import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../kit/.claude/hooks/lib.mjs';

export const KIT_DIR = fileURLToPath(new URL('../kit/', import.meta.url));
export const PKG = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
export const MARK_START = '<!-- ai-sdlc:start -->';
export const MARK_END = '<!-- ai-sdlc:end -->';
export const STOP_ATTEMPTS = '.sdlc/.stop-attempts';
export { parseFrontmatter };

export const DEFAULT_ALLOWLIST = [
  'intent/**', '.sdlc/**', '.claude/**', 'docs/**', 'evals/**',
  'CLAUDE.md', 'REVIEW.md', 'README.md',
];

export const exists = (p) => fs.existsSync(p);
export const read = (p) => fs.readFileSync(p, 'utf8');
export function write(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
}
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function readJsonSafe(p) {
  try { return JSON.parse(read(p)); } catch { return null; }
}

export function listFiles(dir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else out.push(rel);
    }
  };
  if (exists(dir)) walk(dir, '');
  return out.sort();
}

/** Kit-owned files (copied, hashed in kit-lock): skills/**, hooks/** and .sdlc/bin/**, as project-relative paths. */
export function kitOwnedFiles() {
  return [
    ...listFiles(path.join(KIT_DIR, '.claude', 'skills')).map((f) => `.claude/skills/${f}`),
    ...listFiles(path.join(KIT_DIR, '.claude', 'hooks')).map((f) => `.claude/hooks/${f}`),
    ...listFiles(path.join(KIT_DIR, '.sdlc', 'bin')).map((f) => `.sdlc/bin/${f}`),
  ];
}
export const PROJECT_OWNED = ['REVIEW.md', '.sdlc/policies/README.md', 'intent/README.md', 'evals/review-cases/README.md'];
export const CI_FILES = ['.github/workflows/sdlc-ci.yml', '.github/workflows/sdlc-accept.yml', '.github/pull_request_template.md', '.github/CODEOWNERS'];

export function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
export function hasGitHistory(dir) {
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  if (!top) return false;
  try { if (fs.realpathSync(top) !== fs.realpathSync(dir)) return false; } catch { return false; }
  return git(dir, ['rev-parse', '--verify', 'HEAD']) !== null;
}

const EXISTING_MARKERS = [
  'package.json', 'pyproject.toml', 'setup.py', 'go.mod', 'Cargo.toml', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'src',
];
export function detectMode(dir) {
  if (EXISTING_MARKERS.some((m) => exists(path.join(dir, m)))) return 'existing';
  return hasGitHistory(dir) ? 'existing' : 'new';
}

function pkgManager(has) {
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb') || has('bun.lock')) return 'bun';
  return 'npm';
}
export function detectTestCommand(dir) {
  const has = (f) => exists(path.join(dir, f));
  if (has('package.json')) {
    const t = readJsonSafe(path.join(dir, 'package.json'))?.scripts?.test;
    if (t && !/no test specified/.test(t)) return `${pkgManager(has)} test`;
  }
  if (has('go.mod')) return 'go test ./...';
  if (has('Cargo.toml')) return 'cargo test';
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.cfg') || has('tests')) return 'pytest';
  if (has('Makefile') && /^test:/m.test(read(path.join(dir, 'Makefile')))) return 'make test';
  return null;
}
export function detectLintCommand(dir) {
  const has = (f) => exists(path.join(dir, f));
  if (!has('package.json')) return null;
  if (!readJsonSafe(path.join(dir, 'package.json'))?.scripts?.lint) return null;
  const pm = pkgManager(has);
  return pm === 'npm' || pm === 'bun' ? `${pm} run lint` : `${pm} lint`;
}
export function detectDefaultBranch(dir) {
  const ref = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  return ref ? ref.replace(/^origin\//, '') : 'main';
}

/** Merge hook groups (add only if no hook with the same command exists) and permissions.deny (deduped). */
export function mergeSettings(existing, fragment) {
  const out = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  out.hooks = out.hooks && typeof out.hooks === 'object' ? out.hooks : {};
  let added = 0;
  const deny = fragment.permissions?.deny || [];
  let deniedAdded = 0;
  if (deny.length) {
    out.permissions = out.permissions && typeof out.permissions === 'object' ? out.permissions : {};
    if (!Array.isArray(out.permissions.deny)) out.permissions.deny = [];
    for (const d of deny) if (!out.permissions.deny.includes(d)) { out.permissions.deny.push(d); deniedAdded++; }
  }
  for (const [event, groups] of Object.entries(fragment.hooks || {})) {
    if (!Array.isArray(out.hooks[event])) out.hooks[event] = [];
    const present = new Set();
    for (const g of out.hooks[event]) for (const h of (g && g.hooks) || []) present.add(h.command);
    for (const g of groups) {
      const cmds = (g.hooks || []).map((h) => h.command);
      if (cmds.every((c) => present.has(c))) continue;
      out.hooks[event].push(JSON.parse(JSON.stringify(g)));
      cmds.forEach((c) => present.add(c));
      added++;
    }
  }
  return { settings: out, added, deniedAdded };
}
export const isSdlcCommand = (c) => typeof c === 'string' && /sdlc-(gate|stop)\.mjs/.test(c);

export const kitDenyRules = () => JSON.parse(read(path.join(KIT_DIR, '.claude', 'settings.sdlc.json'))).permissions?.deny || [];

export function removeSdlcHooks(settings, deny = kitDenyRules()) {
  let removed = 0;
  if (settings?.permissions && Array.isArray(settings.permissions.deny)) {
    settings.permissions.deny = settings.permissions.deny.filter((d) => !deny.includes(d));
    if (!settings.permissions.deny.length) delete settings.permissions.deny;
    if (!Object.keys(settings.permissions).length) delete settings.permissions;
  }
  if (!settings || !settings.hooks) return removed;
  for (const event of Object.keys(settings.hooks)) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept = [];
    for (const g of groups) {
      const hooks = (g && g.hooks) || [];
      const rest = hooks.filter((h) => !isSdlcCommand(h.command));
      removed += hooks.length - rest.length;
      if (rest.length) kept.push({ ...g, hooks: rest });
      else if (!hooks.length) kept.push(g);
    }
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  return removed;
}

export const sdlcSection = () => read(path.join(KIT_DIR, 'CLAUDE.sdlc.md')).trim() + '\n';

export function applySection(content, section) {
  const s = content.indexOf(MARK_START);
  const e = content.indexOf(MARK_END);
  if (s >= 0 && e > s) return content.slice(0, s) + section.trim() + content.slice(e + MARK_END.length);
  const base = content.replace(/\s+$/, '');
  return (base ? base + '\n\n' : '') + section;
}
export function stripSection(content) {
  const s = content.indexOf(MARK_START);
  const e = content.indexOf(MARK_END);
  if (s < 0 || e < s) return content;
  const before = content.slice(0, s).replace(/\s+$/, '');
  const after = content.slice(e + MARK_END.length).replace(/^\s+/, '');
  if (before && after) return before + '\n\n' + after;
  return before || after ? (before || after) + '\n' : '';
}

/** Simple line diff: lines removed (-) and added (+), capped. */
export function simpleDiff(oldText, newText, max = 40) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const sa = new Set(a);
  const sb = new Set(b);
  const out = [];
  for (const l of a) if (!sb.has(l)) out.push('-' + l);
  for (const l of b) if (!sa.has(l)) out.push('+' + l);
  return out.length > max ? [...out.slice(0, max), `... (${out.length - max} more lines)`] : out;
}
