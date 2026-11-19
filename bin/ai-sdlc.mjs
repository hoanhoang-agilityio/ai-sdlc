#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    console.error(`ai-sdlc: ${err && err.message ? err.message : err}`);
    process.exit(1);
  },
);
