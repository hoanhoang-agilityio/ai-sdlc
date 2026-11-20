import fs from 'node:fs';
import path from 'node:path';
import { exists, read, parseFrontmatter } from './util.mjs';

const fmOf = (file) => (exists(file) ? parseFrontmatter(read(file)) : null);
const stat = (fm) => (fm === null ? '-' : (fm.status || 'unknown').toLowerCase());

/** Risk lane: spec.md risk, else legacy intent.md, else plan.md, else incident.md. */
export const riskOf = (fms) => ['spec', 'intent', 'plan', 'incident'].map((a) => fms[a] && fms[a].risk).find(Boolean) || '-';

export function nextGate(dir, fms, risk) {
  const has = (f) => exists(path.join(dir, f));
  const low = risk === 'trivial' || risk === 'low';
  if (fms.incident && !fms.spec) return stat(fms.incident) === 'accepted' ? 'done' : 'accept incident.md';
  if (!low) {
    if (!fms.spec) return 'write spec.md (/spec)';
    if (stat(fms.spec) !== 'accepted') return 'accept spec';
    if (!fms.design) return 'write design/design.md (/design)';
    if (stat(fms.design) !== 'accepted') return 'accept design';
  }
  if (!fms.plan) return 'write plan.md (/plan)';
  if (stat(fms.plan) !== 'accepted' && risk !== 'trivial') return 'accept plan';
  if (!has('progress.md')) return 'build (/build)';
  if (!has('release.md')) return 'review (/review-pr), merge, then /ship';
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
      const fms = Object.fromEntries(['intent', 'spec', 'plan', 'incident'].map((a) => [a, fmOf(path.join(dir, `${a}.md`))]));
      fms.design = fmOf(path.join(dir, 'design', 'design.md'));
      const risk = riskOf(fms);
      return { name, active: name === active, fms, risk, next: nextGate(dir, fms, risk) };
    });
}

export function renderStatus(root) {
  if (!exists(path.join(root, '.sdlc', 'config.json'))) return 'ai-sdlc is not installed here. Run: ai-sdlc init';
  const changes = collectChanges(root);
  if (!changes.length) return 'No changes yet. Run /spec (or /sdlc-init first) in Claude Code.';
  const head = ['change', 'risk', 'spec', 'design', 'plan', 'next gate'];
  const rows = changes.map((c) => [(c.active ? '*' : ' ') + c.name, c.risk, stat(c.fms.spec), stat(c.fms.design), stat(c.fms.plan), c.next]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd();
  return [line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line), '', '* = active change (.sdlc/active)'].join('\n');
}
