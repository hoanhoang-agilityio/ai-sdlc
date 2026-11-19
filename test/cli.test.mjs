import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp, put, cli, fm } from './helpers.mjs';

const j = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const has = (root, rel) => fs.existsSync(path.join(root, rel));
const SKILLS = ['intent', 'spec', 'plan', 'build', 'review-pr', 'ship', 'incident', 'sdlc-status', 'sdlc-new-product', 'sdlc-adopt-existing',
  'grill-me', 'design', 'architecture', 'prototype', 'design-system', 'frontend-design', 'api-design', 'backend-design',
  'data-model', 'infra-design', 'security-design', 'test-strategy', 'observability-design'];

test('--help, --version, unknown command', () => {
  assert.equal(cli(['--help']).code, 0);
  assert.match(cli(['--version']).out, /^\d+\.\d+\.\d+/);
  const r = cli(['bogus']);
  assert.equal(r.code, 1);
  assert.match(r.out, /Usage/);
});

test('init in empty dir: new mode', () => {
  const root = tmp();
  const r = cli(['init', root]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\/sdlc-new-product/);
  assert.equal(j(root, '.sdlc/config.json').mode, 'new');
  assert.equal(j(root, '.sdlc/config.json').audience, 'non-developer');
  assert.equal(SKILLS.length, 23);
  for (const s of SKILLS) assert.ok(has(root, `.claude/skills/${s}/SKILL.md`), s);
  for (const f of ['.claude/hooks/sdlc-gate.mjs', '.claude/hooks/sdlc-stop.mjs', '.claude/hooks/lib.mjs',
    'REVIEW.md', '.sdlc/policies/README.md', 'intent/README.md', 'evals/review-cases/README.md',
    '.github/workflows/sdlc-ci.yml', '.github/pull_request_template.md', '.github/CODEOWNERS']) assert.ok(has(root, f), f);
  const s = j(root, '.claude/settings.json');
  assert.equal(s.hooks.PreToolUse.length, 1);
  assert.equal(s.hooks.Stop.length, 1);
  const md = rd(root, 'CLAUDE.md');
  assert.match(md, /^# /);
  assert.equal(md.split('<!-- ai-sdlc:start -->').length, 2);
  const lock = j(root, '.sdlc/kit-lock.json');
  assert.ok(lock.version);
  assert.ok(lock.files['.claude/skills/plan/SKILL.md']);
  assert.match(rd(root, '.gitignore'), /\.sdlc\/\.stop-attempts/);
});

test('init in existing project keeps user data, no CI', () => {
  const root = tmp();
  put(root, 'package.json', JSON.stringify({ name: 'p', scripts: { test: 'node t.js', lint: 'eslint .' } }));
  put(root, 'CLAUDE.md', 'Human notes here.\n');
  put(root, '.claude/settings.json', JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }] } }));
  const r = cli(['init', root]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\/sdlc-adopt-existing/);
  const cfg = j(root, '.sdlc/config.json');
  assert.equal(cfg.mode, 'existing');
  assert.equal(cfg.testCommand, 'npm test');
  assert.equal(cfg.lintCommand, 'npm run lint');
  const s = j(root, '.claude/settings.json');
  assert.equal(s.model, 'opus');
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.match(rd(root, 'CLAUDE.md'), /Human notes here\./);
  assert.match(rd(root, 'CLAUDE.md'), /ai-sdlc:start/);
  assert.equal(has(root, '.github/workflows/sdlc-ci.yml'), false);
  const r2 = tmp();
  put(r2, 'go.mod', 'module x');
  cli(['init', r2, '--ci']);
  assert.ok(has(r2, '.github/workflows/sdlc-ci.yml'));
  assert.equal(j(r2, '.sdlc/config.json').testCommand, 'go test ./...');
  const r3 = tmp();
  cli(['init', r3, '--no-ci']);
  assert.equal(has(r3, '.github/workflows/sdlc-ci.yml'), false);
});

test('init twice is idempotent', () => {
  const root = tmp();
  cli(['init', root]);
  const before = rd(root, '.claude/settings.json');
  const r = cli(['init', root]);
  assert.equal(r.code, 0, r.out);
  assert.equal(rd(root, '.claude/settings.json'), before);
  assert.equal(rd(root, 'CLAUDE.md').split('<!-- ai-sdlc:start -->').length, 2);
  assert.equal(rd(root, '.gitignore').split('.stop-attempts').length, 2);
});

test('init never overwrites existing config or project-owned files', () => {
  const root = tmp();
  put(root, 'REVIEW.md', 'mine');
  cli(['init', root]);
  assert.equal(rd(root, 'REVIEW.md'), 'mine');
  put(root, '.sdlc/config.json', JSON.stringify({ ...j(root, '.sdlc/config.json'), testCommand: 'custom' }));
  cli(['init', root]);
  assert.equal(j(root, '.sdlc/config.json').testCommand, 'custom');
});

test('update: overwrites unmodified, skips modified, --force overwrites', () => {
  const root = tmp();
  cli(['init', root]);
  const a = '.claude/skills/intent/SKILL.md';
  const b = '.claude/skills/spec/SKILL.md';
  fs.appendFileSync(path.join(root, a), '\nLOCAL EDIT\n');
  // pretend previous kit version for b: change file and lock together
  const lock = j(root, '.sdlc/kit-lock.json');
  const old = 'old kit content\n';
  fs.writeFileSync(path.join(root, b), old);
  lock.files[b] = crypto_sha(old);
  fs.writeFileSync(path.join(root, '.sdlc/kit-lock.json'), JSON.stringify(lock));
  const r = cli(['update', root]);
  assert.equal(r.code, 0, r.out);
  assert.match(rd(root, b), /^---\nname: spec/);
  assert.match(rd(root, a), /LOCAL EDIT/);
  assert.match(r.out, /modified locally/);
  assert.match(r.out, /-LOCAL EDIT/);
  const r2 = cli(['update', root, '--force']);
  assert.equal(r2.code, 0);
  assert.doesNotMatch(rd(root, a), /LOCAL EDIT/);
});

import crypto from 'node:crypto';
function crypto_sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

test('status table', () => {
  const root = tmp();
  cli(['init', root]);
  put(root, 'intent/001-a/intent.md', fm('accepted', 'medium'));
  put(root, 'intent/002-b/intent.md', fm('accepted', 'low'));
  put(root, 'intent/002-b/plan.md', fm('draft', 'low'));
  put(root, '.sdlc/active', '002-b');
  const r = cli(['status', root]);
  assert.equal(r.code, 0);
  assert.match(r.out, /change\s+intent\s+spec\s+design\s+plan\s+incident\s+risk\s+next gate/);
  assert.match(r.out, /001-a\s+accepted\s+-\s+-\s+-\s+-\s+medium\s+write spec\.md/);
  assert.match(r.out, /\*002-b\s+accepted\s+-\s+-\s+draft\s+-\s+low\s+accept plan\.md/);
});

test('status design column and next gate', () => {
  const root = tmp();
  cli(['init', root]);
  put(root, 'intent/001-a/intent.md', fm('accepted'));
  put(root, 'intent/001-a/spec.md', fm('accepted'));
  let r = cli(['status', root]);
  assert.match(r.out, /001-a\s+accepted\s+accepted\s+-\s+-\s+-\s+medium\s+write design\/design\.md/);
  put(root, 'intent/001-a/design/design.md', '---\nstatus: accepted\nrisk: medium\nrequires: [api-design, data-model, security-design]\n---\n');
  put(root, 'intent/001-a/design/api.md', fm('accepted'));
  put(root, 'intent/001-a/design/data-model.md', fm('draft'));
  r = cli(['status', root]);
  assert.match(r.out, /001-a\s+accepted\s+accepted\s+2\/4\s+-\s+-\s+medium\s+accept design\/data-model\.md/);
});

test('doctor counts all 23 skills', () => {
  const root = tmp();
  cli(['init', root]);
  let r = cli(['doctor', root]);
  assert.match(r.out, /all 23 skills present/);
  fs.rmSync(path.join(root, '.claude/skills/grill-me'), { recursive: true });
  r = cli(['doctor', root]);
  assert.equal(r.code, 1);
  assert.match(r.out, /missing grill-me/);
});

test('doctor passes after init, fails when broken', () => {
  const root = tmp();
  cli(['init', root]);
  const r = cli(['doctor', root]);
  assert.equal(r.code, 0, r.out);
  fs.rmSync(path.join(root, '.claude/hooks/sdlc-gate.mjs'));
  assert.equal(cli(['doctor', root]).code, 1);
});

test('uninstall removes kit, keeps intent/ and .sdlc/', () => {
  const root = tmp();
  put(root, 'CLAUDE.md', 'Human text\n');
  put(root, '.claude/settings.json', JSON.stringify({ model: 'opus' }));
  cli(['init', root, '--new']);
  put(root, 'intent/001-a/intent.md', fm());
  const r = cli(['uninstall', root]);
  assert.equal(r.code, 0, r.out);
  assert.equal(has(root, '.claude/skills'), false);
  assert.equal(has(root, '.claude/hooks'), false);
  const s = j(root, '.claude/settings.json');
  assert.equal(s.model, 'opus');
  assert.equal(s.hooks, undefined);
  const md = rd(root, 'CLAUDE.md');
  assert.match(md, /Human text/);
  assert.doesNotMatch(md, /ai-sdlc:start/);
  assert.ok(has(root, 'intent/001-a/intent.md'));
  assert.ok(has(root, '.sdlc/config.json'));
});
