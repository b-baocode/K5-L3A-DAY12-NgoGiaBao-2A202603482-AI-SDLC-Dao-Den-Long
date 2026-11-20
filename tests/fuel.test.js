// Ticket-03 "Đèn cạn dầu" / Contract v1.2: fuel, refuel, relight, drain, dawn win, capacity, score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietGame, runSteps, press } from './helpers.js';

const L1 = (extra = {}) => [{ id: 'L1', pos: [0, 0, 1.5], ...extra }];
const snapL = (g, id = 'L1') => g.snapshot().lanterns.find((l) => l.id === id);

test('lighting sets fuel 100; fuel decays 1/s; at 0 the lantern goes out (deposited 0, ever_lit kept)', () => {
  const g = quietGame({ player: { carried: 10 }, lanterns: L1() });
  const ev = press(g, 'interact');
  assert.deepEqual(ev.find((e) => e.name === 'lantern_lit').data, { lantern_id: 'L1', relight: false });
  assert.equal(snapL(g).fuel, 100);
  runSteps(g, 60);
  assert.equal(snapL(g).fuel, 99);
  const g2 = quietGame({ lanterns: L1({ lit: true, fuel: 0.5 }) });
  const ev2 = runSteps(g2, 30);
  assert.deepEqual(ev2.map((e) => [e.tick, e.name]), [[30, 'lantern_out']]);
  assert.deepEqual(snapL(g2), { id: 'L1', pos: [0, 0, 1.5], lit: false, deposited: 0, fuel: 0, ever_lit: true, relit_count: 0 });
});

test('relight costs 5 for an ever-lit lantern, +40; first light +100; relit_count', () => {
  const g = quietGame({ player: { carried: 5 }, lanterns: L1({ lit: false, ever_lit: true }) });
  const ev = press(g, 'interact');
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.equal(ev[1].data.relight, true);
  assert.equal(g.score, 5 * 5 + 40);
  assert.equal(snapL(g).relit_count, 1);
});

test('refuel: used = min(carried, ceil((100 - fuel)/10)), +10 fuel each, +5 points each; full lantern not selectable', () => {
  const g = quietGame({ player: { carried: 9 }, lanterns: L1({ lit: true, fuel: 55 }) });
  const ev = press(g, 'interact');
  // fuel 55 - 1/60 at step 2 -> need ceil(45.0167/10) = 5
  assert.deepEqual(ev[0].name, 'refuel');
  assert.equal(ev[0].data.amount, 5);
  assert.equal(ev[0].data.fuel, 100);
  assert.equal(g.player.carried, 4);
  assert.equal(g.score, 25);
  runSteps(g, 1);
  // full except 1/60 decay -> need ceil(0.033/10) = 1 -> still accepts 1
  const g2 = quietGame({ player: { carried: 3 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true }, { id: 'L2', pos: [0, 0, 1.9] }] });
  g2.lanterns[0].fuel = g2.fuelMaxU + 1; // stays exactly 100 after this tick's decay
  const ev2 = press(g2, 'interact');
  assert.equal(ev2[0].data.lantern_id, 'L2'); // full L1 is skipped even though it is closer
});

test('capacity = 10 + 2 x successful lights (max 20), relights count, scenario lanterns do not', () => {
  const g = quietGame({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, { id: 'L2', lit: true }] });
  assert.equal(g.snapshot().player.capacity, 10);
  press(g, 'interact');
  assert.equal(g.snapshot().player.capacity, 12);
  const g2 = quietGame({ player: { successful_lights: 7 } });
  assert.equal(g2.snapshot().player.capacity, 20);
});

test('low fuel (< 30) loses the safe zone; exactly 30 keeps it', () => {
  const g = quietGame({ lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 29 }], shades: [{ id: 'S1', pos: [8, 1, 0], state: 'chase' }] });
  runSteps(g, 60);
  assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2]) < 6);
  const g2 = quietGame({ lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 100 }], shades: [{ id: 'S1', pos: [8, 1, 0], state: 'chase' }] });
  g2.lanterns[0].fuel = 30 * 60 + 120; // 30.0 after two seconds of decay
  runSteps(g2, 120);
  assert.equal(g2.lanterns[0].fuel, 30 * 60);
  assert.ok(Math.hypot(g2.shades[0].pos[0], g2.shades[0].pos[2]) > 6);
});

test('wander shade goes to the nearest weak lantern, drains 5/s (+1/s decay), fuel_drain every 60 ticks', () => {
  const g = quietGame({
    player: { pos: [0, 0, -30] },
    lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true, fuel: 20 }, { id: 'L2', pos: [-10, 0, 0], lit: true, fuel: 25 }],
    shades: [{ id: 'S1', pos: [1, 1, 0] }],
  });
  let ev = runSteps(g, 150);
  const s = g.shades[0];
  assert.equal(s.state, 'drain');
  assert.equal(s.target, 'L1');
  const f0 = g.lanterns[0].fuel;
  ev = runSteps(g, 60);
  assert.equal(f0 - g.lanterns[0].fuel, 60 * 6); // 5 drain + 1 decay per second
  const drains = ev.filter((e) => e.name === 'fuel_drain');
  assert.equal(drains.length, 1);
  assert.equal(drains[0].data.lantern_id, 'L1');
  assert.equal(drains[0].data.shade_id, 'S1');
});

test('drain -> chase when Mây within 6 m; -> stunned by pulse (+15 total); -> wander when refuelled to >= 30', () => {
  const mk = (player) => quietGame({ player, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [1.5, 1, 0], state: 'drain', target_lantern_id: 'L1' }] });
  const g = mk({ pos: [7.6, 0, 0] }); // 6.1 m from the shade
  runSteps(g, 1);
  assert.equal(g.shades[0].state, 'drain');
  g.player.pos = [7.4, 0, 0]; // 5.9 m
  runSteps(g, 1);
  assert.equal(g.shades[0].state, 'chase');
  const g3 = quietGame({ player: { pos: [0, 0, 6.5], carried: 3 }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 1.6], state: 'drain', target_lantern_id: 'L1' }] });
  press(g3, 'pulse');
  assert.equal(g3.shades[0].state, 'stunned');
  assert.equal(g3.score, 15);
  const g4 = mk({ pos: [0, 0, -1.5], carried: 2 });
  g4.player.invulnTicks = 999;
  const ev4 = press(g4, 'interact');
  assert.equal(ev4[0].name, 'refuel');
  runSteps(g4, 1);
  assert.notEqual(g4.shades[0].state, 'drain');
});

test('stun ends -> wander (Ticket-03)', () => {
  const g = quietGame({ player: { pos: [0, 0, -50] }, shades: [{ id: 'S1', pos: [0, 1, 0], state: 'stunned', state_ticks_left: 3 }] }, 1, 1);
  runSteps(g, 3);
  assert.equal(g.shades[0].state, 'wander');
});

test('dawn: alive and >= ceil(0.6 x lanterns) lit -> won/dawn_survived, +50+floor(fuel) per lit lantern, +50 per flame', () => {
  const lanterns = [
    { id: 'L1', lit: true, fuel: 80.5 }, { id: 'L2', lit: true, fuel: 40 }, { id: 'L3', lit: true, fuel: 10 },
  ];
  const g = quietGame({ player: { flames: 2 }, lanterns, time_left_s: 1 });
  const ev = runSteps(g, 60);
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'dawn_survived' });
  const fuels = g.lanterns.filter((l) => l.lit).map((l) => Math.floor(l.fuel / 60));
  assert.deepEqual(fuels, [79, 39, 9]);
  assert.equal(g.score, 3 * 50 + 79 + 39 + 9 + 2 * 50);
  const g2 = quietGame({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }], time_left_s: 1 });
  runSteps(g2, 60);
  assert.equal(g2.state, 'lost');
});

test('win thresholds: night 1 needs 3/5, night 2 4/6, night 3 5/7', () => {
  assert.equal(quietGame({}, 1, 1).winNeed(), 3);
  assert.equal(quietGame({}, 1, 2).winNeed(), 4);
  assert.equal(quietGame({}, 1, 3).winNeed(), 5);
});

test('no_flames beats dawn on the last tick', () => {
  const g = quietGame({ player: { flames: 1 }, lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true })), time_left_s: 1 / 60, shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }] });
  const ev = runSteps(g, 1);
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
});

test('refuelling a weak lantern back to >= 30 evicts shades inside its zone harmlessly', () => {
  const g = quietGame({ player: { pos: [0, 0, -1.5], carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [3, 1, 0], state: 'wander' }] });
  g.shades[0].wanderTo = [3, 0];
  const ev = press(g, 'interact');
  assert.equal(ev[0].name, 'refuel');
  const ev2 = runSteps(g, 30);
  assert.equal(ev2.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2]) > 6);
});
