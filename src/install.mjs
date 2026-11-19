import fs from 'node:fs';
import path from 'node:path';
import {
  KIT_DIR, PKG, DEFAULT_ALLOWLIST, STOP_ATTEMPTS, exists, read, write, sha, readJsonSafe,
  kitOwnedFiles, PROJECT_OWNED, CI_FILES, detectMode, detectTestCommand, detectLintCommand,
  detectDefaultBranch, mergeSettings, removeSdlcHooks, sdlcSection, applySection, stripSection, simpleDiff,
} from './util.mjs';

const LOCK = '.sdlc/kit-lock.json';
const kitPath = (rel) => path.join(KIT_DIR, rel);

function loadLock(root) {
  const l = readJsonSafe(path.join(root, LOCK));
  return l && typeof l === 'object' && l.files ? l : { version: PKG.version, files: {} };
}
function saveLock(root, lock) {
  lock.version = PKG.version;
  lock.files = Object.fromEntries(Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)));
  write(path.join(root, LOCK), JSON.stringify(lock, null, 2) + '\n');
}

function createIfMissing(root, rel, log) {
  const dest = path.join(root, rel);
  if (exists(dest)) { log.push(`keep   ${rel} (exists)`); return; }
  write(dest, read(kitPath(rel)));
  log.push(`create ${rel}`);
}

function installSettings(root, log) {
  const p = path.join(root, '.claude', 'settings.json');
  const fragment = JSON.parse(read(kitPath('.claude/settings.sdlc.json')));
  let existing = {};
  if (exists(p)) {
    existing = readJsonSafe(p);
    if (!existing) throw new Error('.claude/settings.json is not valid JSON; fix it and re-run');
  }
  const { settings, added } = mergeSettings(existing, fragment);
  write(p, JSON.stringify(settings, null, 2) + '\n');
  log.push(added ? `merge  .claude/settings.json (+${added} hook group${added > 1 ? 's' : ''})` : 'keep   .claude/settings.json hooks (already present)');
}

function installClaudeMd(root, log) {
  const p = path.join(root, 'CLAUDE.md');
  const section = sdlcSection();
  if (!exists(p)) {
    write(p, `# ${path.basename(root)}\n\n${section}`);
    log.push('create CLAUDE.md');
  } else {
    const before = read(p);
    const after = applySection(before, section);
    if (after !== before) { write(p, after); log.push('update CLAUDE.md (ai-sdlc section)'); }
    else log.push('keep   CLAUDE.md (section current)');
  }
}

function ensureGitignore(root, log) {
  const p = path.join(root, '.gitignore');
  const cur = exists(p) ? read(p) : '';
  if (cur.split(/\r?\n/).includes(STOP_ATTEMPTS)) return;
  write(p, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + STOP_ATTEMPTS + '\n');
  log.push(`update .gitignore (+${STOP_ATTEMPTS})`);
}

export function init(root, opts = {}) {
  fs.mkdirSync(root, { recursive: true });
  const log = [];
  const mode = opts.new ? 'new' : opts.existing ? 'existing' : detectMode(root);
  const lock = loadLock(root);

  for (const rel of kitOwnedFiles()) {
    const dest = path.join(root, rel);
    const body = read(kitPath(rel));
    if (!exists(dest)) { write(dest, body); lock.files[rel] = sha(body); log.push(`create ${rel}`); }
    else if (sha(read(dest)) === sha(body)) { lock.files[rel] = sha(body); }
    else if (opts.force) { write(dest, body); lock.files[rel] = sha(body); log.push(`overwrite ${rel} (--force)`); }
    else log.push(`skip   ${rel} (exists and differs; use --force)`);
  }

  installSettings(root, log);

  const cfgPath = path.join(root, '.sdlc', 'config.json');
  if (exists(cfgPath)) log.push('keep   .sdlc/config.json (exists)');
  else {
    const cfg = {
      mode,
      testCommand: detectTestCommand(root),
      lintCommand: detectLintCommand(root),
      defaultBranch: detectDefaultBranch(root),
      sensitivePaths: [],
      codePathsAllowlist: DEFAULT_ALLOWLIST,
      roles: { productOwner: null, codeOwners: [] },
    };
    write(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    log.push(`create .sdlc/config.json (mode ${mode}, testCommand ${cfg.testCommand ? '`' + cfg.testCommand + '`' : 'none'})`);
  }

  for (const rel of PROJECT_OWNED) createIfMissing(root, rel, log);

  const wantCi = opts.noCi ? false : mode === 'new' || !!opts.ci;
  if (wantCi) for (const rel of CI_FILES) createIfMissing(root, rel, log);
  else log.push(opts.noCi ? 'skip   CI templates (--no-ci)' : 'skip   CI templates (existing repo; add with --ci)');

  installClaudeMd(root, log);
  ensureGitignore(root, log);
  saveLock(root, lock);
  return { mode, log };
}

export function update(root, opts = {}) {
  const log = [];
  if (!exists(path.join(root, '.sdlc', 'config.json'))) throw new Error('ai-sdlc is not installed here; run init first');
  const lock = loadLock(root);
  for (const rel of kitOwnedFiles()) {
    const dest = path.join(root, rel);
    const body = read(kitPath(rel));
    if (!exists(dest)) { write(dest, body); lock.files[rel] = sha(body); log.push(`create ${rel}`); continue; }
    const cur = read(dest);
    if (sha(cur) === sha(body)) { lock.files[rel] = sha(body); continue; }
    if (opts.force || (lock.files[rel] && sha(cur) === lock.files[rel])) {
      write(dest, body); lock.files[rel] = sha(body);
      log.push(`update ${rel}${opts.force ? ' (--force)' : ''}`);
    } else {
      log.push(`skip   ${rel} (modified locally; use --force). Diff (- yours, + kit):`);
      for (const d of simpleDiff(cur, body)) log.push('         ' + d);
    }
  }
  installSettings(root, log);
  installClaudeMd(root, log);
  ensureGitignore(root, log);
  saveLock(root, lock);
  if (log.length === 0) log.push('already up to date');
  return { log };
}

function pruneEmptyDirs(root, rel) {
  let dir = path.join(root, path.dirname(rel));
  while (dir.startsWith(root) && dir !== root) {
    try { if (fs.readdirSync(dir).length) break; fs.rmdirSync(dir); } catch { break; }
    dir = path.dirname(dir);
  }
}

export function uninstall(root) {
  const log = [];
  const lock = loadLock(root);
  const files = new Set([...kitOwnedFiles(), ...Object.keys(lock.files)]);
  for (const rel of files) {
    const dest = path.join(root, rel);
    if (exists(dest)) { fs.rmSync(dest); log.push(`remove ${rel}`); pruneEmptyDirs(root, rel); }
  }
  const sp = path.join(root, '.claude', 'settings.json');
  if (exists(sp)) {
    const s = readJsonSafe(sp);
    if (s) {
      const n = removeSdlcHooks(s);
      if (Object.keys(s).length) write(sp, JSON.stringify(s, null, 2) + '\n');
      else fs.rmSync(sp);
      log.push(`clean  .claude/settings.json (-${n} hook${n === 1 ? '' : 's'})`);
      pruneEmptyDirs(root, '.claude/settings.json');
    }
  }
  const cp = path.join(root, 'CLAUDE.md');
  if (exists(cp)) {
    const before = read(cp);
    const after = stripSection(before);
    if (after !== before) { write(cp, after); log.push('clean  CLAUDE.md (ai-sdlc section removed)'); }
  }
  const lp = path.join(root, LOCK);
  if (exists(lp)) { fs.rmSync(lp); log.push(`remove ${LOCK}`); }
  log.push('kept   intent/, .sdlc/ (config, policies), REVIEW.md, CI templates');
  return { log };
}
