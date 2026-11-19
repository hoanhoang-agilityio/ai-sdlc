import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, put, fm, runHook, STOP, gitInit } from './helpers.mjs';

const stop = (root) => runHook(STOP, root, {});

function repo(testCommand, lintCommand) {
  const root = project({ testCommand, lintCommand });
  const g = gitInit(root);
  put(root, 'a.txt', 'x'); g('add', '.'); g('commit', '-qm', 'init');
  put(root, 'intent/001-x/plan.md', fm('accepted'));
  put(root, '.sdlc/active', '001-x');
  put(root, 'src/changed.js', 'x');
  return root;
}

test('no active change -> exit 0', () => {
  const root = repo('exit 1');
  fs.rmSync(path.join(root, '.sdlc/active'));
  assert.equal(stop(root).code, 0);
});

test('plan not accepted or no testCommand -> exit 0', () => {
  const root = repo('exit 1');
  put(root, 'intent/001-x/plan.md', fm('draft'));
  assert.equal(stop(root).code, 0);
  const r2 = repo(null);
  assert.equal(stop(r2).code, 0);
});

test('only intent/.sdlc changes -> exit 0', () => {
  const root = repo('exit 1');
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  assert.equal(stop(root).code, 0);
});

test('failing command blocks 3 times then hands back', () => {
  const root = repo('echo boom-output; exit 1');
  for (let i = 1; i <= 3; i++) {
    const r = stop(root);
    assert.equal(r.code, 2);
    assert.match(r.err, new RegExp(`Attempt ${i}/3`));
    assert.match(r.err, /boom-output/);
  }
  const r = stop(root);
  assert.equal(r.code, 0);
  assert.match(r.err, /human/);
  assert.equal(stop(root).code, 2); // counter was reset
});

test('lint failure blocks; passing resets counter', () => {
  const root = repo('true', 'exit 3');
  assert.equal(stop(root).code, 2);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.sdlc/config.json'), 'utf8'));
  cfg.lintCommand = 'true';
  put(root, '.sdlc/config.json', JSON.stringify(cfg));
  assert.equal(stop(root).code, 0);
  assert.equal(fs.existsSync(path.join(root, '.sdlc/.stop-attempts')), false);
});
