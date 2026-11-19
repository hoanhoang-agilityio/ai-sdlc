import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, put, fm, gate, bash, gitInit } from './helpers.mjs';

const blocked = (r) => assert.equal(r.code, 2, r.err);
const allowed = (r) => assert.equal(r.code, 0, r.err);

test('no config allows everything', () => {
  const root = project();
  fs.rmSync(path.join(root, '.sdlc/config.json'));
  allowed(gate(root, 'Write', { file_path: path.join(root, 'src/a.js'), content: 'x' }));
  allowed(bash(root, 'git push --force origin main'));
});

test('rule 1: cannot write status: accepted (Write, Edit, MultiEdit) or accepted_by', () => {
  const root = project();
  const f = path.join(root, 'intent/001-x/intent.md');
  blocked(gate(root, 'Write', { file_path: f, content: '---\nstatus: accepted\n---\n' }));
  blocked(gate(root, 'Write', { file_path: f, content: '---\nstatus: "Accepted"\n---\n' }));
  blocked(gate(root, 'Edit', { file_path: f, old_string: 'draft', new_string: 'status: accepted' }));
  blocked(gate(root, 'MultiEdit', { file_path: f, edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'status: accepted' }] }));
  blocked(gate(root, 'Write', { file_path: f, content: '---\nstatus: draft\naccepted_by: hoan\n---\n' }));
  allowed(gate(root, 'Write', { file_path: f, content: fm('draft') }));
});

test('rule 1: bash writes of accepted blocked, reads allowed', () => {
  const root = project();
  blocked(bash(root, `sed -i 's/status: draft/status: accepted/' intent/001-x/intent.md`));
  blocked(bash(root, `echo "status: accepted" >> intent/001-x/intent.md`));
  blocked(bash(root, `printf 'accepted_by: me' | tee intent/001-x/plan.md`));
  allowed(bash(root, `grep -rn "status: accepted" intent/`));
  allowed(bash(root, `rg "accepted_by: " intent/ 2>&1`));
});

test('rule 2: accepted artifacts are frozen', () => {
  const root = project();
  for (const a of ['intent', 'spec', 'plan', 'incident']) {
    put(root, `intent/001-x/${a}.md`, fm('accepted', 'low'));
    blocked(gate(root, 'Edit', { file_path: path.join(root, `intent/001-x/${a}.md`), old_string: 'T', new_string: 'U' }));
  }
  put(root, 'intent/002-y/intent.md', fm('draft'));
  allowed(gate(root, 'Edit', { file_path: path.join(root, 'intent/002-y/intent.md'), old_string: 'T', new_string: 'U' }));
});

test('rule 3: spec and plan prerequisites', () => {
  const root = project();
  const spec = path.join(root, 'intent/001-x/spec.md');
  const plan = path.join(root, 'intent/001-x/plan.md');
  put(root, 'intent/001-x/intent.md', fm('draft', 'low'));
  blocked(gate(root, 'Write', { file_path: spec, content: fm() }));
  blocked(gate(root, 'Write', { file_path: plan, content: fm() }));
  put(root, 'intent/001-x/intent.md', fm('accepted', 'low'));
  allowed(gate(root, 'Write', { file_path: plan, content: fm('draft', 'low') }));
  allowed(gate(root, 'Write', { file_path: spec, content: fm() }));
  put(root, 'intent/001-x/intent.md', fm('accepted', 'medium'));
  blocked(gate(root, 'Write', { file_path: plan, content: fm() }));
  put(root, 'intent/001-x/spec.md', fm('accepted', 'medium'));
  allowed(gate(root, 'Write', { file_path: plan, content: fm() }));
  allowed(gate(root, 'Write', { file_path: path.join(root, 'intent/001-x/incident.md'), content: fm() }));
  allowed(gate(root, 'Write', { file_path: path.join(root, 'intent/001-x/build-log.md'), content: 'x' }));
});

test('rule 4: code needs active change with accepted plan', () => {
  const root = project();
  const code = path.join(root, 'src/app.js');
  blocked(gate(root, 'Write', { file_path: code, content: 'x' }));
  for (const rel of ['intent/001-x/intent.md', '.sdlc/x.json', '.claude/skills/a.md', 'docs/a.md', 'evals/a.md', 'CLAUDE.md', 'REVIEW.md', 'README.md']) {
    allowed(gate(root, 'Write', { file_path: path.join(root, rel), content: 'x' }));
  }
  put(root, 'intent/001-x/plan.md', fm('draft'));
  put(root, '.sdlc/active', '001-x\n');
  blocked(gate(root, 'Write', { file_path: code, content: 'x' }));
  put(root, 'intent/001-x/plan.md', fm('accepted'));
  allowed(gate(root, 'Write', { file_path: code, content: 'x' }));
  allowed(gate(root, 'Write', { file_path: 'src/rel.js', content: 'x' }));
  put(root, '.sdlc/active', '009-gone\n');
  blocked(gate(root, 'Write', { file_path: code, content: 'x' }));
});

test('rule 4: custom allowlist', () => {
  const root = project({ codePathsAllowlist: ['notes/**', 'a/*.txt'] });
  allowed(gate(root, 'Write', { file_path: path.join(root, 'notes/deep/x.md'), content: 'x' }));
  allowed(gate(root, 'Write', { file_path: path.join(root, 'a/x.txt'), content: 'x' }));
  blocked(gate(root, 'Write', { file_path: path.join(root, 'a/b/x.txt'), content: 'x' }));
});

test('rule 5: secrets', () => {
  const root = project();
  for (const n of ['.env', '.env.local', 'k.pem', 'a/server.key', 'id_rsa', 'credentials.json', 'secrets.yml']) {
    blocked(gate(root, 'Write', { file_path: path.join(root, n), content: 'x' }));
  }
  // .env.example is not a secret but is still code, so needs an active change; make one
  put(root, 'intent/001-x/plan.md', fm('accepted'));
  put(root, '.sdlc/active', '001-x');
  allowed(gate(root, 'Write', { file_path: path.join(root, '.env.example'), content: 'A=' }));
  blocked(gate(root, 'Write', { file_path: path.join(root, '.env'), content: 'A=1' }));
});

test('rule 6: git push / merge', () => {
  const root = project();
  const g = gitInit(root);
  put(root, 'a.txt', 'x'); g('add', '.'); g('commit', '-qm', 'init');
  blocked(bash(root, 'git push origin main'));
  blocked(bash(root, 'git push --force origin feat/001-x'));
  blocked(bash(root, 'git push -f'));
  blocked(bash(root, 'git push --force-with-lease origin feat/001-x'));
  blocked(bash(root, 'git push origin +feat/001-x'));
  blocked(bash(root, 'git push origin HEAD:main'));
  blocked(bash(root, 'git push origin :main'));
  blocked(bash(root, 'git push'));            // on main
  blocked(bash(root, 'git commit --no-verify -m x'));
  blocked(bash(root, 'git push --no-verify origin feat/001-x'));
  blocked(bash(root, 'gh pr merge 12 --squash'));
  blocked(bash(root, 'gh api -X PUT repos/o/r/pulls/1/merge'));
  blocked(bash(root, 'git merge feat/001-x'));
  allowed(bash(root, 'git push -u origin feat/001-x'));
  g('checkout', '-qb', 'feat/001-x');
  allowed(bash(root, 'git push'));
  allowed(bash(root, 'git merge main'));
  allowed(bash(root, 'git status && git log --oneline'));
});

test('SDLC_GATE=off allows and logs', () => {
  const root = project();
  const r = gate(root, 'Write', { file_path: path.join(root, 'src/a.js'), content: 'x' }, { SDLC_GATE: 'off' });
  allowed(r);
  assert.match(r.err, /bypass/i);
  const line = JSON.parse(fs.readFileSync(path.join(root, '.sdlc/bypass.log'), 'utf8').trim().split('\n')[0]);
  assert.equal(line.tool, 'Write');
  assert.match(line.target_or_command, /a\.js$/);
  assert.ok(line.ts);
});

test('fails open on bad input', () => {
  const root = project();
  fs.writeFileSync(path.join(root, '.sdlc/config.json'), '{bad');
  allowed(gate(root, 'Write', { file_path: path.join(root, 'src/a.js'), content: 'x' }));
});

test('protected files: human-only (Write/Edit/MultiEdit)', () => {
  const root = project();
  const files = ['.claude/hooks/sdlc-gate.mjs', '.claude/hooks/lib.mjs', '.claude/settings.json', '.claude/settings.local.json',
    '.sdlc/config.json', '.sdlc/kit-lock.json', '.sdlc/bypass.log', '.github/workflows/sdlc-ci.yml', '.github/CODEOWNERS'];
  for (const f of files) {
    const p = path.join(root, f);
    const r = gate(root, 'Write', { file_path: p, content: 'x' });
    blocked(r);
    assert.match(r.err, /is protected; propose the change and ask the human to apply it/);
    blocked(gate(root, 'Edit', { file_path: p, old_string: 'a', new_string: 'b' }));
    blocked(gate(root, 'MultiEdit', { file_path: p, edits: [{ old_string: 'a', new_string: 'b' }] }));
  }
  allowed(gate(root, 'Write', { file_path: path.join(root, '.sdlc/active'), content: '001-x' }));
  allowed(gate(root, 'Write', { file_path: path.join(root, '.claude/skills/x/SKILL.md'), content: 'x' }));
});

test('protected files: bash mutation blocked, reads allowed', () => {
  const root = project();
  blocked(bash(root, `sed -i 's/a/b/' .sdlc/config.json`));
  blocked(bash(root, `echo '{}' > .sdlc/config.json`));
  blocked(bash(root, 'rm .claude/hooks/sdlc-gate.mjs'));
  blocked(bash(root, 'mv x .claude/settings.json'));
  blocked(bash(root, 'cp x .github/CODEOWNERS'));
  blocked(bash(root, 'truncate -s0 .sdlc/bypass.log'));
  blocked(bash(root, 'chmod -x .claude/hooks/lib.mjs'));
  blocked(bash(root, 'git checkout -- .sdlc/config.json'));
  blocked(bash(root, 'git restore .github/workflows/sdlc-ci.yml'));
  allowed(bash(root, 'cat .sdlc/config.json'));
  allowed(bash(root, 'grep testCommand .sdlc/config.json 2>&1'));
  allowed(bash(root, 'jq .testCommand .sdlc/config.json'));
  allowed(bash(root, 'cat .claude/settings.json | jq .hooks'));
  allowed(bash(root, 'echo 001-x > .sdlc/active'));
});
