import path from 'node:path';
import { exists, read, readJsonSafe, listFiles, KIT_DIR, MARK_START, MARK_END } from './util.mjs';

export function runDoctor(root) {
  const checks = [];
  const add = (name, ok, detail = '', warn = false) => checks.push({ name, ok, detail, warn });

  const major = parseInt(process.versions.node.split('.')[0], 10);
  add('Node >= 18', major >= 18, `found ${process.versions.node}`);

  const cfgPath = path.join(root, '.sdlc', 'config.json');
  const cfg = exists(cfgPath) ? readJsonSafe(cfgPath) : null;
  add('.sdlc/config.json parses', !!cfg, cfg ? '' : exists(cfgPath) ? 'invalid JSON' : 'missing; run ai-sdlc init');

  const hooks = ['sdlc-gate.mjs', 'sdlc-stop.mjs', 'lib.mjs'];
  const missing = hooks.filter((h) => !exists(path.join(root, '.claude', 'hooks', h)));
  add('hook files present', !missing.length, missing.length ? `missing ${missing.join(', ')}` : '');

  const skillNames = listFiles(path.join(KIT_DIR, '.claude', 'skills')).filter((f) => f.endsWith('/SKILL.md')).map((f) => f.split('/')[0]);
  const missingSkills = skillNames.filter((n) => !exists(path.join(root, '.claude', 'skills', n, 'SKILL.md')));
  add(`all ${skillNames.length} skills present`, !missingSkills.length, missingSkills.length ? `missing ${missingSkills.join(', ')}` : '');

  const s = exists(path.join(root, '.claude', 'settings.json')) ? readJsonSafe(path.join(root, '.claude', 'settings.json')) : null;
  const has = (event, file) => ((s && s.hooks && s.hooks[event]) || []).some((g) => ((g && g.hooks) || []).some((h) => String(h.command || '').includes(file)));
  add('settings.json has PreToolUse gate hook', has('PreToolUse', 'sdlc-gate.mjs'));
  add('settings.json has Stop hook', has('Stop', 'sdlc-stop.mjs'));
  add('settings.json denies edits to protected files', ((s && s.permissions && s.permissions.deny) || []).includes('Edit(.sdlc/config.json)'), 'run ai-sdlc update', true);
  add('accept command present', exists(path.join(root, '.sdlc', 'bin', 'accept.mjs')), 'run ai-sdlc update');

  const cm = exists(path.join(root, 'CLAUDE.md')) ? read(path.join(root, 'CLAUDE.md')) : '';
  add('CLAUDE.md has ai-sdlc markers', cm.includes(MARK_START) && cm.includes(MARK_END));

  if (cfg) add('testCommand set', !!cfg.testCommand, cfg.testCommand ? cfg.testCommand : 'not set; the Stop hook cannot enforce tests', !cfg.testCommand);

  const ok = checks.every((c) => c.ok || c.warn);
  return { checks, ok };
}
