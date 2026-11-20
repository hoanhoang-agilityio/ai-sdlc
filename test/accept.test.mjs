import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmp, put, fm, cli, gitInit } from './helpers.mjs';

const env = (extra = {}) => { const e = { ...process.env, ...extra }; if (!('CLAUDECODE' in extra)) delete e.CLAUDECODE; return e; };
const accept = (root, args, extra) => cli(['accept', ...args], { cwd: root, env: env(extra) });
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const repo = () => { const root = tmp(); const g = gitInit(root); return { root, g }; };
const commitAll = (g) => { g('add', '.'); g('commit', '-qm', 'init'); };

test('accept spec sets status, accepted_by, accepted_at and preserves the rest', () => {
  const { root, g } = repo();
  put(root, 'intent/001-x/spec.md', '---\nstatus: draft\nrisk: medium\ntitle: Keep me\naccepted_by:\naccepted_at:\n---\n\n# Body\n');
  commitAll(g);
  const r = accept(root, ['spec', '001-x', '--by', 'Ann', '--no-commit']);
  assert.equal(r.code, 0, r.out);
  const t = rd(root, 'intent/001-x/spec.md');
  assert.match(t, /^status: accepted$/m);
  assert.match(t, /^accepted_by: Ann$/m);
  assert.match(t, /^accepted_at: \d{4}-\d{2}-\d{2}$/m);
  assert.match(t, /^risk: medium$/m);
  assert.match(t, /^title: Keep me$/m);
  assert.match(t, /# Body/);
  assert.equal(g('status', '--porcelain').stdout.includes('M intent'), true); // not committed
});

test('accept resolves the change from .sdlc/active, then the only draft', () => {
  const { root, g } = repo();
  put(root, 'intent/001-x/plan.md', fm('draft', 'low'));
  put(root, 'intent/002-y/plan.md', fm('draft', 'low'));
  commitAll(g);
  let r = accept(root, ['plan', '--by', 'A', '--no-commit']);
  assert.equal(r.code, 1);
  assert.match(r.out, /001-x, 002-y/);
  put(root, '.sdlc/active', '002-y\n');
  r = accept(root, ['plan', '--by', 'A', '--no-commit']);
  assert.equal(r.code, 0, r.out);
  assert.match(rd(root, 'intent/002-y/plan.md'), /status: accepted/);
  assert.match(rd(root, 'intent/001-x/plan.md'), /status: draft/);
  fs.rmSync(path.join(root, '.sdlc/active'));
  r = accept(root, ['plan', '--by', 'A', '--no-commit']); // now only 001-x is draft
  assert.equal(r.code, 0, r.out);
  assert.match(rd(root, 'intent/001-x/plan.md'), /status: accepted/);
});

test('accept spec also accepts a draft legacy intent.md', () => {
  const { root } = repo();
  put(root, 'intent/001-x/spec.md', fm('draft'));
  put(root, 'intent/001-x/intent.md', fm('draft'));
  assert.equal(accept(root, ['spec', '001-x', '--by', 'A', '--no-commit']).code, 0);
  assert.match(rd(root, 'intent/001-x/intent.md'), /status: accepted/);
});

test('accept design covers design.md and every draft design/**/*.md', () => {
  const { root } = repo();
  put(root, 'intent/001-x/design/design.md', fm('draft'));
  put(root, 'intent/001-x/design/prototype/notes.md', fm('draft'));
  put(root, 'intent/001-x/design/done.md', fm('accepted'));
  put(root, 'intent/001-x/design/plain.md', '# no frontmatter\n');
  put(root, 'intent/001-x/design/prototype/index.html', '<html></html>');
  const r = accept(root, ['design', '001-x', '--by', 'A', '--no-commit']);
  assert.equal(r.code, 0, r.out);
  assert.match(rd(root, 'intent/001-x/design/design.md'), /status: accepted/);
  assert.match(rd(root, 'intent/001-x/design/prototype/notes.md'), /status: accepted/);
  assert.equal(rd(root, 'intent/001-x/design/plain.md'), '# no frontmatter\n');
  assert.match(r.out, /prototype\/notes\.md/);
});

test('accept refuses when CLAUDECODE is set', () => {
  const { root } = repo();
  put(root, 'intent/001-x/spec.md', fm('draft'));
  const r = accept(root, ['spec', '001-x', '--by', 'A', '--no-commit'], { CLAUDECODE: '1' });
  assert.equal(r.code, 1);
  assert.match(r.out, /only a human/i);
  assert.match(rd(root, 'intent/001-x/spec.md'), /status: draft/);
});

test('accept on an accepted stage is a no-op', () => {
  const { root, g } = repo();
  put(root, 'intent/001-x/incident.md', fm('accepted'));
  commitAll(g);
  const r = accept(root, ['incident', '001-x', '--by', 'A']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /already accepted/);
  assert.equal(g('status', '--porcelain').stdout.trim(), '');
  assert.equal(g('rev-list', '--count', 'HEAD').stdout.trim(), '1');
});

test('accept commits with conventional message and Accepted-by trailer', () => {
  const { root, g } = repo();
  put(root, 'intent/001-x/plan.md', fm('draft', 'low'));
  put(root, 'src/unrelated.js', 'x');
  commitAll(g);
  fs.appendFileSync(path.join(root, 'src/unrelated.js'), 'y');
  g('add', 'src/unrelated.js');
  const r = accept(root, ['plan', '001-x', '--by', 'Ann Lee']);
  assert.equal(r.code, 0, r.out);
  const msg = g('log', '-1', '--format=%B').stdout;
  assert.match(msg, /^docs\(001-x\): accept plan\n/);
  assert.match(msg, /\nAccepted-by: Ann Lee\n/);
  assert.equal(g('show', '--name-only', '--format=', 'HEAD').stdout.trim(), 'intent/001-x/plan.md');
});

test('accept defaults --by to git config user.name; bad stage prints usage', () => {
  const { root, g } = repo();
  put(root, 'intent/001-x/spec.md', fm('draft'));
  commitAll(g);
  assert.equal(accept(root, ['spec', '001-x']).code, 0);
  assert.match(rd(root, 'intent/001-x/spec.md'), /accepted_by: t$/m);
  const r = accept(root, ['bogus']);
  assert.equal(r.code, 1);
  assert.match(r.out, /Usage/);
});

test('shipped accept.mjs runs standalone', () => {
  const { root } = repo();
  put(root, 'intent/001-x/spec.md', fm('draft'));
  const script = path.join(path.dirname(new URL(import.meta.url).pathname), '../kit/.sdlc/bin/accept.mjs');
  const r = spawnSync('node', [script, 'spec', '001-x', '--by', 'Bot', '--no-commit'], { cwd: root, encoding: 'utf8', env: env() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(rd(root, 'intent/001-x/spec.md'), /accepted_by: Bot/);
});

test('accept: active change that is already accepted falls back to the single draft', () => {
  const { root } = repo();
  put(root, 'intent/001-x/plan.md', fm('draft', 'low'));
  put(root, 'intent/002-y/plan.md', fm('accepted', 'low'));
  put(root, '.sdlc/active', '002-y\n');
  const r = accept(root, ['plan', '--by', 'A', '--no-commit']);
  assert.equal(r.code, 0, r.out);
  assert.match(rd(root, 'intent/001-x/plan.md'), /status: accepted/);
});
