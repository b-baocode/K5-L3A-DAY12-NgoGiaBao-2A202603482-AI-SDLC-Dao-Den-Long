#!/usr/bin/env node
// Soak test — Ticket-04 §2: 10 nights in ONE process (night 1 -> 2 -> 3 -> 1 ...), night i uses seed (seed + i),
// seeded random input: new move direction every 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact.
// Usage: node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, NIGHTS } from '../src/sim/game.js';
import { mulberry32 } from '../src/sim/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const seed = parseInt(args.seed ?? '7', 10);
const nights = parseInt(args.nights ?? '10', 10);
const out = args.out ?? 'soak.json';
if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1) {
  process.stderr.write('usage: soak.js --seed <int> --nights <int> --out <file>\n');
  process.exit(1);
}

const tuning = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8')).tuning;
const rssMb = () => {
  if (global.gc) { global.gc(); global.gc(); }
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

function playNight(game, rnd) {
  const maxTicks = Math.round(game.startTimeLeft * 60) + 10;
  const btn = { jump: false, dash: false, pulse: false, interact: false };
  for (let k = 0; k < maxTicks && (game.state === 'playing' || game.state === 'paused'); k++) {
    const f = {};
    if (k % 30 === 0) {
      const a = rnd() * 2 * Math.PI;
      f.move = [Math.cos(a), Math.sin(a)];
      f.cam_yaw_deg = 0;
    }
    // a "press" is a false -> true edge: release the button on the next tick
    for (const [b, p] of [['jump', 0.05], ['dash', 0.03], ['pulse', 0.02], ['interact', 0.1]]) {
      const v = !btn[b] && rnd() < p;
      if (v !== btn[b]) f[b] = v;
      btn[b] = v;
    }
    game.applyFrame(f);
    game.step();
    for (const e of game.drainEvents()) if (e.name === 'game_over') game.lastOver = e.data.reason;
  }
  return game.state === 'won' ? 'won' : 'lost';
}

const t0 = process.hrtime.bigint();
const results = [];
const detail = [];
let crashes = 0;
let memStart = null;
let game = null;
for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  try {
    game = new Game(tuning, { seed: seed + i, night });
    if (i === 0) memStart = rssMb(); // after the first night is loaded
    results.push(playNight(game, mulberry32((seed + i) ^ 0x9e3779b9)));
    detail.push({ night, seed: seed + i, ticks: game.tick, reason: game.lastOver ?? 'max_ticks' });
  } catch (e) {
    crashes++;
    results.push('crash');
    process.stderr.write(`night ${i} (Đêm ${night}, seed ${seed + i}) crashed: ${e.stack}\n`);
  }
  game = null; // reset: drop every reference to the finished night
}
const memEnd = rssMb(); // after the last night has been reset
const report = {
  nights,
  crashes,
  results,
  mem_start_mb: memStart,
  mem_end_mb: memEnd,
  duration_s: Math.round(Number(process.hrtime.bigint() - t0) / 1e8) / 10,
  seed,
  night_cycle: Array.from({ length: nights }, (_, i) => NIGHTS[(i % 3) + 1].name),
  per_night: detail, // random input usually walks Mây off the island: 3 falls = no_flames, which ends the night early
  pass: crashes === 0 && memEnd <= 1.2 * memStart,
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
process.exit(crashes ? 1 : 0);
