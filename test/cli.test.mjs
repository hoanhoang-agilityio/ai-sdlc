import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmp, put, cli, fm, ROOT } from './helpers.mjs';

const j = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const has = (root, rel) => fs.existsSync(path.join(root, rel));
const KIT = path.join(ROOT, 'kit');
const kitSkillFiles = () => fs.readdirSync(path.join(KIT, '.claude/skills'), { recursive: true })
  .filter((f) => fs.statSync(path.join(KIT, '.claude/skills', f)).isFile());

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
  assert.match(r.out, /\/sdlc-init/);
  assert.equal(j(root, '.sdlc/config.json').mode, 'new');
  assert.equal(j(root, '.sdlc/config.json').audience, 'non-developer');
  assert.ok(kitSkillFiles().length > 0);
  for (const f of kitSkillFiles()) assert.ok(has(root, `.claude/skills/${f}`), f);
  for (const f of ['.claude/hooks/sdlc-gate.mjs', '.claude/hooks/sdlc-stop.mjs', '.claude/hooks/lib.mjs', '.sdlc/bin/accept.mjs', '.github/workflows/sdlc-accept.yml',
    'REVIEW.md', '.sdlc/policies/README.md', 'intent/README.md', 'evals/review-cases/README.md',
    '.github/workflows/sdlc-ci.yml', '.github/pull_request_template.md', '.github/CODEOWNERS']) assert.ok(has(root, f), f);
  const s = j(root, '.claude/settings.json');
  assert.equal(s.hooks.PreToolUse.length, 1);
  assert.equal(s.hooks.Stop.length, 1);
  assert.ok(s.permissions.deny.includes('Edit(.sdlc/config.json)'));
  assert.ok(s.permissions.deny.includes('Write(.sdlc/bin/**)'));
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
  const cfg = j(root, '.sdlc/config.json');
  assert.equal(cfg.mode, 'existing');
  assert.equal(cfg.testCommand, 'npm test');
  assert.equal(cfg.lintCommand, 'npm run lint');
  const s = j(root, '.claude/settings.json');
  assert.equal(s.model, 'opus');
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.ok(s.permissions.deny.length > 10);
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

const [SK_A, SK_B] = ['.claude/skills/spec/SKILL.md', '.claude/skills/plan/SKILL.md'];

test('update: overwrites unmodified, skips modified, --force overwrites', () => {
  const root = tmp();
  cli(['init', root]);
  const a = SK_A;
  const b = SK_B;
  fs.appendFileSync(path.join(root, a), '\nLOCAL EDIT\n');
  // pretend previous kit version for b: change file and lock together
  const lock = j(root, '.sdlc/kit-lock.json');
  const old = 'old kit content\n';
  fs.writeFileSync(path.join(root, b), old);
  lock.files[b] = crypto_sha(old);
  fs.writeFileSync(path.join(root, '.sdlc/kit-lock.json'), JSON.stringify(lock));
  const r = cli(['update', root]);
  assert.equal(r.code, 0, r.out);
  assert.equal(rd(root, b), fs.readFileSync(path.join(KIT, b), 'utf8'));
  assert.match(rd(root, a), /LOCAL EDIT/);
  assert.match(r.out, /modified locally/);
  assert.match(r.out, /-LOCAL EDIT/);
  const r2 = cli(['update', root, '--force']);
  assert.equal(r2.code, 0);
  assert.doesNotMatch(rd(root, a), /LOCAL EDIT/);
});

test('update: prunes files removed from the kit when unmodified, keeps modified ones', () => {
  const root = tmp();
  cli(['init', root]);
  const gone = '.claude/skills/old-skill/SKILL.md';
  const goneMod = '.claude/skills/old-mod/SKILL.md';
  put(root, gone, 'old\n');
  put(root, goneMod, 'old\n');
  const lock = j(root, '.sdlc/kit-lock.json');
  lock.files[gone] = crypto_sha('old\n');
  lock.files[goneMod] = crypto_sha('old\n');
  fs.writeFileSync(path.join(root, '.sdlc/kit-lock.json'), JSON.stringify(lock));
  fs.appendFileSync(path.join(root, goneMod), 'mine\n');
  const r = cli(['update', root]);
  assert.equal(r.code, 0, r.out);
  assert.equal(has(root, gone), false);
  assert.equal(has(root, '.claude/skills/old-skill'), false);
  assert.ok(has(root, goneMod));
  assert.match(r.out, /keep   \.claude\/skills\/old-mod\/SKILL\.md \(removed from kit, modified locally\)/);
  const l2 = j(root, '.sdlc/kit-lock.json');
  assert.equal(l2.files[gone], undefined);
  assert.equal(l2.files[goneMod] === undefined, false);
});

import crypto from 'node:crypto';
function crypto_sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

test('status shows spec/design/plan status and risk lane', () => {
  const root = tmp();
  cli(['init', root]);
  put(root, 'intent/001-a/spec.md', fm('accepted', 'medium'));
  put(root, 'intent/002-b/plan.md', fm('draft', 'low'));
  put(root, 'intent/003-c/spec.md', fm('accepted', 'high'));
  put(root, 'intent/003-c/design/design.md', fm('draft', 'high'));
  put(root, '.sdlc/active', '002-b');
  const r = cli(['status', root]);
  assert.equal(r.code, 0);
  assert.match(r.out, /change\s+risk\s+spec\s+design\s+plan\s+next gate/);
  assert.match(r.out, /001-a\s+medium\s+accepted\s+-\s+-\s+write design\/design\.md/);
  assert.match(r.out, /\*002-b\s+low\s+-\s+-\s+draft\s+accept plan/);
  assert.match(r.out, /003-c\s+high\s+accepted\s+draft\s+-\s+accept design/);
});

test('doctor reports skills present and flags a missing one', () => {
  const root = tmp();
  cli(['init', root]);
  const n = kitSkillFiles().filter((f) => f.endsWith('/SKILL.md')).length;
  let r = cli(['doctor', root]);
  assert.match(r.out, new RegExp(`all ${n} skills present`));
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
  assert.equal(s.permissions, undefined);
  assert.equal(has(root, '.sdlc/bin'), false);
  const md = rd(root, 'CLAUDE.md');
  assert.match(md, /Human text/);
  assert.doesNotMatch(md, /ai-sdlc:start/);
  assert.ok(has(root, 'intent/001-a/intent.md'));
  assert.ok(has(root, '.sdlc/config.json'));
});

test('settings: deny rules merge deduped and uninstall keeps user rules', () => {
  const root = tmp();
  put(root, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'], deny: ['Read(.env)', 'Edit(.sdlc/config.json)'] } }));
  cli(['init', root]);
  cli(['update', root]);
  const deny = j(root, '.claude/settings.json').permissions.deny;
  assert.equal(new Set(deny).size, deny.length);
  assert.equal(deny.filter((d) => d === 'Edit(.sdlc/config.json)').length, 1);
  assert.ok(deny.includes('Read(.env)') && deny.includes('Write(.github/workflows/sdlc-accept.yml)'));
  cli(['uninstall', root]);
  const s = j(root, '.claude/settings.json');
  assert.deepEqual(s.permissions.deny, ['Read(.env)']);
  assert.deepEqual(s.permissions.allow, ['Bash(ls)']);
});

test('update: refreshes unmodified CI, creates sdlc-accept.yml, skips modified; gitignore has .sdlc/active', () => {
  const root = tmp();
  cli(['init', root, '--new']);
  assert.match(rd(root, '.gitignore'), /^\.sdlc\/active$/m);
  fs.rmSync(path.join(root, '.github/workflows/sdlc-accept.yml'));
  const ci = path.join(root, '.github/workflows/sdlc-ci.yml');
  const lock = j(root, '.sdlc/kit-lock.json');
  fs.writeFileSync(ci, 'old ci\n');
  lock.files['.github/workflows/sdlc-ci.yml'] = crypto_sha('old ci\n');
  fs.writeFileSync(path.join(root, '.sdlc/kit-lock.json'), JSON.stringify(lock));
  let r = cli(['update', root]);
  assert.match(r.out, /update \.github\/workflows\/sdlc-ci\.yml/);
  assert.equal(rd(root, '.github/workflows/sdlc-ci.yml'), fs.readFileSync(path.join(KIT, '.github/workflows/sdlc-ci.yml'), 'utf8'));
  assert.ok(has(root, '.github/workflows/sdlc-accept.yml'));
  fs.writeFileSync(ci, 'mine\n');
  r = cli(['update', root]);
  assert.match(r.out, /skip   \.github\/workflows\/sdlc-ci\.yml/);
  assert.equal(rd(root, '.github/workflows/sdlc-ci.yml'), 'mine\n');
  cli(['uninstall', root]);
  assert.ok(has(root, '.github/workflows/sdlc-ci.yml'));
});
