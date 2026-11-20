import path from 'node:path';
import { PKG } from './util.mjs';
import { init, update, uninstall } from './install.mjs';
import { renderStatus } from './status.mjs';
import { runDoctor } from './doctor.mjs';
import { acceptCommand } from '../kit/.sdlc/bin/accept.mjs';

const HELP = `ai-sdlc ${PKG.version} - AI-native SDLC kit for Claude Code

Usage:
  ai-sdlc init [dir] [--new|--existing] [--force] [--no-ci] [--ci]
  ai-sdlc accept <spec|design|plan|incident> [NNN-slug] [--by <name>] [--no-commit]
                                   a human accepts a stage and commits it
  ai-sdlc update [dir] [--force]   refresh skills and hooks; skip files you edited
  ai-sdlc status [dir]             changes in intent/ and the next gate
  ai-sdlc doctor [dir]             check the install (exit 1 on failure)
  ai-sdlc uninstall [dir]          remove kit files; keeps intent/ and .sdlc/

Options:
  --help, -h     show this help
  --version, -v  show version
`;

function parse(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--version' || a === '-v') opts.version = true;
    else if (a === '--new') opts.new = true;
    else if (a === '--existing') opts.existing = true;
    else if (a === '--no-commit') opts.noCommit = true;
    else if (a === '--by') { opts.by = argv[++i]; if (!opts.by) opts.unknown = '--by (needs a name)'; }
    else if (a === '--force') opts.force = true;
    else if (a === '--no-ci') opts.noCi = true;
    else if (a === '--ci') opts.ci = true;
    else if (a.startsWith('-')) opts.unknown = a;
    else pos.push(a);
  }
  return { opts, pos };
}

export async function main(argv, out = console.log) {
  const { opts, pos } = parse(argv);
  if (opts.version) { out(PKG.version); return 0; }
  const [cmd, dirArg] = pos;
  if (opts.help) { out(HELP); return 0; }
  if (!cmd) { out(HELP); return argv.length ? 1 : 0; }
  if (opts.unknown) { out(`Unknown option: ${opts.unknown}\n\n${HELP}`); return 1; }
  if (cmd === 'accept') return acceptCommand(argv.filter((a) => a !== 'accept'), { out });
  const target = path.resolve(dirArg || process.cwd());
  switch (cmd) {
    case 'init': {
      if (opts.new && opts.existing) { out('Choose only one of --new / --existing.'); return 1; }
      const { mode, log } = init(target, opts);
      out(`ai-sdlc init (${mode} product) in ${target}\n`);
      log.forEach((l) => out('  ' + l));
      out('\nNext: open Claude Code in this folder and run /sdlc-init');
      return 0;
    }
    case 'update':
      update(target, opts).log.forEach((l) => out('  ' + l));
      return 0;
    case 'status':
      out(renderStatus(target));
      return 0;
    case 'doctor': {
      const { checks, ok } = runDoctor(target);
      for (const c of checks) out(`${c.ok ? 'ok  ' : c.warn ? 'warn' : 'FAIL'}  ${c.name}${c.detail ? ' - ' + c.detail : ''}`);
      out(ok ? '\nAll checks passed.' : '\nSome checks failed. Try: ai-sdlc update');
      return ok ? 0 : 1;
    }
    case 'uninstall':
      uninstall(target).log.forEach((l) => out('  ' + l));
      return 0;
    default:
      out(`Unknown command: ${cmd}\n\n${HELP}`);
      return 1;
  }
}
