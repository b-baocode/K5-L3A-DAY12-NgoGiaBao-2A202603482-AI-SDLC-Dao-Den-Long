#!/usr/bin/env node
// Headless runner — Test Contract v1.0.
// node src/headless.js --seed <int> --night 1 [--scenario f.json] [--inputs f.json]
//                      --ticks <int> --out f.jsonl [--snapshot-every <int>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from './sim/game.js';
import { InputError, validateInputs, validateScenario } from './sim/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { snapshotEvery: 10 };
  const intArg = (name, v) => {
    if (v === undefined || !/^-?\d+$/.test(v)) throw new UsageError(`${name} expects an integer`);
    return parseInt(v, 10);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--seed': opts.seed = intArg(a, v); i++; break;
      case '--night': opts.night = intArg(a, v); i++; break;
      case '--ticks': opts.ticks = intArg(a, v); i++; break;
      case '--snapshot-every': opts.snapshotEvery = intArg(a, v); i++; break;
      case '--scenario': opts.scenario = v; i++; break;
      case '--inputs': opts.inputs = v; i++; break;
      case '--out': opts.out = v; i++; break;
      default: throw new UsageError(`unknown argument: ${a}`);
    }
    if (v === undefined) throw new UsageError(`${a} needs a value`);
  }
  if (opts.seed === undefined) throw new UsageError('--seed is required');
  if (opts.ticks === undefined || opts.ticks < 0) throw new UsageError('--ticks is required (>= 0)');
  if (!opts.out) throw new UsageError('--out is required');
  if (opts.night !== undefined && opts.night !== 1) throw new UsageError('only --night 1 exists in this version');
  if (opts.snapshotEvery < 1) throw new UsageError('--snapshot-every must be >= 1');
  return opts;
}

function readJson(file, what) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new InputError(`${what}: cannot read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new InputError(`${what}: invalid JSON in ${file}: ${e.message}`);
  }
}

export function run(opts) {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  const tuning = contract.tuning;
  const scenario = opts.scenario
    ? validateScenario(readJson(opts.scenario, 'scenario'), tuning.lantern_count_night1)
    : null;
  const frames = opts.inputs ? validateInputs(readJson(opts.inputs, 'inputs')) : new Map();

  const game = new Game(tuning, { seed: opts.seed, scenario });
  const lines = [];
  const every = opts.snapshotEvery;
  lines.push(JSON.stringify(game.snapshot())); // tick 0: after scenario, before input

  for (let k = 0; k < opts.ticks && game.state === 'playing'; k++) {
    game.applyFrame(frames.get(k));
    game.step();
    for (const e of game.drainEvents()) lines.push(JSON.stringify(e));
    if (game.steps % every === 0) lines.push(JSON.stringify(game.snapshot()));
  }
  lines.push(JSON.stringify({ type: 'end', ticks: game.steps, state: game.state, score: game.score }));
  fs.writeFileSync(opts.out, lines.join('\n') + '\n');
  return game;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    run(parseArgs(process.argv.slice(2)));
    process.exit(0);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(e instanceof InputError ? 2 : 1);
  }
}
