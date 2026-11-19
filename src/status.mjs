import fs from 'node:fs';
import path from 'node:path';
import { exists, read, parseFrontmatter, designState } from './util.mjs';

const ARTIFACTS = ['intent', 'spec', 'plan', 'incident'];

function fmOf(file) {
  return exists(file) ? parseFrontmatter(read(file)) : null;
}
const stat = (fm) => (fm === null ? '-' : (fm.status || 'unknown').toLowerCase());

/** Design progress `a/b` (accepted of design.md + required artifacts), or '-' when design.md is absent. */
export function designCell(root, dir) {
  const ds = designState(root, dir);
  if (!ds.exists) return '-';
  const total = 1 + ds.items.length;
  return `${(ds.accepted ? 1 : 0) + ds.items.filter((i) => i.accepted).length}/${total}`;
}

export function nextGate(dir, fms, root) {
  const st = Object.fromEntries(ARTIFACTS.map((a) => [a, stat(fms[a])]));
  if (fms.incident && !fms.intent) return st.incident === 'accepted' ? 'done' : 'accept incident.md';
  if (!fms.intent) return 'write intent.md (/intent)';
  if (st.intent !== 'accepted') return 'accept intent.md';
  const risk = (fms.intent.risk || 'medium').toLowerCase();
  if (risk !== 'low') {
    if (!fms.spec) return 'write spec.md (/spec)';
    if (st.spec !== 'accepted') return 'accept spec.md';
    if (root) {
      const ds = designState(root, dir);
      if (!ds.exists) return 'write design/design.md (/design)';
      if (!ds.accepted) return 'accept design/design.md';
      const todo = ds.items.find((i) => !i.accepted);
      if (todo) return `${todo.exists ? 'accept' : 'write'} ${todo.rel} (/${todo.skill})`;
    }
  }
  if (!fms.plan) return 'write plan.md (/plan)';
  if (st.plan !== 'accepted') return 'accept plan.md';
  const has = (f) => exists(path.join(dir, f));
  if (!has('build-log.md')) return 'build (/build)';
  if (!has('review.md')) return 'review PR (/review-pr)';
  if (!has('release.md')) return 'merge, then /ship';
  return 'production approval / done';
}

export function collectChanges(root) {
  const base = path.join(root, 'intent');
  if (!exists(base)) return [];
  let active = null;
  try { active = read(path.join(root, '.sdlc', 'active')).trim().replace(/^intent\//, ''); } catch { /* none */ }
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const dir = path.join(base, name);
      const fms = Object.fromEntries(ARTIFACTS.map((a) => [a, fmOf(path.join(dir, `${a}.md`))]));
      const risk = (fms.intent || fms.incident || {}).risk || '-';
      return { name, active: name === active, fms, risk, design: designCell(root, dir), next: nextGate(dir, fms, root) };
    });
}

export function renderStatus(root) {
  if (!exists(path.join(root, '.sdlc', 'config.json'))) return 'ai-sdlc is not installed here. Run: ai-sdlc init';
  const changes = collectChanges(root);
  if (!changes.length) return 'No changes yet. Run /intent (or /sdlc-new-product, /sdlc-adopt-existing) in Claude Code.';
  const head = ['change', 'intent', 'spec', 'design', 'plan', 'incident', 'risk', 'next gate'];
  const rows = changes.map((c) => [
    (c.active ? '*' : ' ') + c.name, stat(c.fms.intent), stat(c.fms.spec), c.design, stat(c.fms.plan), stat(c.fms.incident), c.risk, c.next,
  ]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd();
  return [line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line), '', '* = active change (.sdlc/active)'].join('\n');
}
