import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/sim/game.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
export const T = CONTRACT.tuning;

// A quiet world: nothing random, only what the test places.
export function quietGame(extra = {}, seed = 1) {
  return new Game(T, { seed, scenario: { random_motes: false, random_shades: false, motes: [], shades: [], ...extra } });
}

// Run n steps with a fixed held input; returns all events.
export function runSteps(game, n, frame) {
  if (frame) game.applyFrame(frame);
  const events = [];
  for (let i = 0; i < n; i++) {
    game.step();
    events.push(...game.drainEvents());
  }
  return events;
}

// Press a button for exactly one step (false -> true edge), then release.
export function press(game, button, extraFrame = {}) {
  game.applyFrame({ ...extraFrame, [button]: true });
  game.step();
  const ev = game.drainEvents();
  game.applyFrame({ [button]: false });
  return ev;
}

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-'));
}

export function headless(args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'src/headless.js'), ...args], { encoding: 'utf8' });
  return r;
}

export function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}
