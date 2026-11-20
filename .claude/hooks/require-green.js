#!/usr/bin/env node
// Claude Code Stop hook: the agent may not finish while `npm test` is red.
// Exit 2 + stderr -> Claude Code shows the message to the agent and keeps it working.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

let payload = {};
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch {}
// Avoid infinite loops: if we already blocked once in this stop cycle, let it go.
if (payload.stop_hook_active) process.exit(0);

const r = spawnSync('npm', ['test', '--silent'], { encoding: 'utf8', shell: true });
if (r.status === 0) process.exit(0);
const tail = (r.stdout + r.stderr).split('\n').filter((l) => /not ok|fail|Error|expected|actual/i.test(l)).slice(0, 30).join('\n');
process.stderr.write(`Tests are red — fix them before finishing (or explain why a test must change).\n${tail}\n`);
process.exit(2);
