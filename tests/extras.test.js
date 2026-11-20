// Creative extras ("Sáng tạo của tôi"): special mote variants / shade kinds, web game only.
// v1.1: the contract owns mote `kind` (random/dropped), so the creative field is now `variant`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../src/sim/game.js';
import { T, ROOT, quietGame, runSteps } from './helpers.js';

test('guard: headless never enables extras', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/headless.js'), 'utf8');
  assert.ok(!/extras/.test(src), 'src/headless.js must not mention extras');
});

test('guard: extras off -> only normal variants/kinds, no extra event fields', () => {
  for (const night of [1, 2, 3]) {
    const g = new Game(T, { seed: 99, night });
    g.applyFrame({ move: [0.6, 1] });
    const ev = runSteps(g, 60 * 40);
    assert.ok(g.motes.every((m) => m.variant === 'normal'));
    assert.ok(g.shades.every((s) => s.kind === 'normal'));
    for (const e of ev.filter((e) => e.name === 'mote_picked')) assert.deepEqual(Object.keys(e.data), ['carried']);
  }
});

test('extras on: random world contains special variants/kinds, deterministic per seed', () => {
  const kinds = (seed) => {
    const g = new Game(T, { seed, extras: true });
    runSteps(g, 60 * 60);
    return { motes: g.motes.map((m) => m.variant), shades: g.shades.map((s) => s.kind) };
  };
  assert.deepEqual(kinds(5), kinds(5));
  const all = new Set();
  for (let s = 1; s <= 10; s++) for (const k of Object.values(kinds(s)).flat()) all.add(k);
  for (const k of ['normal', 'gold', 'heal', 'swift', 'big']) assert.ok(all.has(k), k);
});

const withMote = (variant, player = {}) => {
  const g = quietGame({ motes: [[0, 0, 0.5]], player });
  g.extras = true;
  g.motes[0].variant = variant;
  return g;
};

test('gold mote: +2 light (capped)', () => {
  const g = withMote('gold');
  const ev = runSteps(g, 1);
  assert.equal(g.player.carried, 2);
  assert.deepEqual(ev[0].data, { carried: 2, variant: 'gold' });
  const g2 = withMote('gold', { carried: T.carry_capacity - 1 });
  runSteps(g2, 1);
  assert.equal(g2.player.carried, T.carry_capacity);
});

test('heal mote: +1 flame up to max, picked even when full of light', () => {
  const g = withMote('heal', { flames: 1, carried: T.carry_capacity });
  runSteps(g, 1);
  assert.equal(g.player.flames, 2);
  assert.equal(g.player.carried, T.carry_capacity);
  assert.equal(g.motes.length, 0);
});

test('swift shade moves 1.6x faster; big shade is slower but hits from further', () => {
  const g = quietGame();
  const swift = g.addShade('A', [10, 1, 0], 'chase');
  Object.assign(swift, { kind: 'swift', speedMul: 1.6, hitMul: 0.8 });
  const big = g.addShade('B', [-10, 1, 0], 'chase');
  Object.assign(big, { kind: 'big', speedMul: 0.65, hitMul: 1.7 });
  runSteps(g, 30);
  assert.ok(Math.abs(10 - swift.pos[0] - T.shade_speed * 1.6 * 0.5) < 1e-9);
  assert.ok(Math.abs(big.pos[0] + 10 - T.shade_speed * 0.65 * 0.5) < 1e-9);
  const g2 = quietGame();
  const b2 = g2.addShade('B', [1.6, 1, 0], 'chase');
  Object.assign(b2, { kind: 'big', speedMul: 0, hitMul: 1.7 });
  assert.equal(runSteps(g2, 1).filter((e) => e.name === 'player_hit').length, 1);
});
