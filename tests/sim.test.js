// Unit tests for game rules (src/sim/game.js). Each test names the requirement it checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, defaultLanterns } from '../src/sim/game.js';
import { T, quietGame, runSteps, press } from './helpers.js';

test('contract: 5 lanterns on night 1, player starts at origin', () => {
  const g = new Game(T, { seed: 3 });
  assert.equal(g.lanterns.length, 5);
  assert.equal(T.lantern_count_night1, 5);
  assert.deepEqual(g.player.pos, [0, 0, 0]);
  assert.equal(g.player.flames, T.flames);
  assert.equal(defaultLanterns()[0].id, 'L1');
});

test('movement: player_speed m/s, move rotated by cam_yaw_deg', () => {
  const g = quietGame();
  runSteps(g, 60, { move: [0, 1], cam_yaw_deg: 0 });
  assert.ok(Math.abs(g.player.pos[2] - T.player_speed) < 1e-9);
  const g2 = quietGame();
  runSteps(g2, 60, { move: [0, 1], cam_yaw_deg: 90 }); // z forward rotated 90° -> +X
  assert.ok(Math.abs(g2.player.pos[0] - T.player_speed) < 1e-9);
  assert.ok(Math.abs(g2.player.pos[2]) < 1e-9);
  const g3 = quietGame();
  runSteps(g3, 60, { move: [1, 0], cam_yaw_deg: 90 }); // x' = cos, z' = -sin -> -Z
  assert.ok(Math.abs(g3.player.pos[2] + T.player_speed) < 1e-9);
});

test('movement: vectors longer than 1 are normalised', () => {
  const g = quietGame();
  runSteps(g, 60, { move: [1, 1] });
  assert.ok(Math.abs(Math.hypot(g.player.pos[0], g.player.pos[2]) - T.player_speed) < 1e-9);
});

test('island edge: no falling (fall_enabled=false), player clamped', () => {
  const g = quietGame();
  const ev = runSteps(g, 60 * 20, { move: [1, 0] });
  assert.equal(T.fall_enabled, false);
  assert.ok(Math.hypot(g.player.pos[0], g.player.pos[2]) <= 40 + 1e-9);
  assert.ok(!ev.some((e) => e.name === 'player_hit'));
});

test('jump: leaves the ground and lands', () => {
  const g = quietGame();
  press(g, 'jump');
  assert.ok(g.player.pos[1] > 0);
  runSteps(g, 120);
  assert.equal(g.player.pos[1], 0);
});

test('pickup: within pickup_radius (<=) picks, score per_mote', () => {
  const g = quietGame({ motes: [[0, 0, T.pickup_radius]] });
  const ev = runSteps(g, 1);
  assert.deepEqual(ev.map((e) => e.name), ['mote_picked']);
  assert.equal(g.player.carried, 1);
  assert.equal(g.score, T.score.per_mote);
  const g2 = quietGame({ motes: [[0, 0, T.pickup_radius + 0.01]] });
  assert.equal(runSteps(g2, 1).length, 0);
});

test('pickup: carry_capacity is respected', () => {
  const motes = Array.from({ length: T.carry_capacity + 2 }, () => [0, 0, 0.5]);
  const g = quietGame({ motes });
  runSteps(g, 1);
  assert.equal(g.player.carried, T.carry_capacity);
  assert.equal(g.motes.length, 2);
});

test('deposit: interact in range deposits, lantern lit at lantern_cost', () => {
  const g = quietGame({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius] }] });
  const ev = press(g, 'interact');
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost });
  assert.equal(g.score, T.score.per_lantern);
  assert.equal(g.player.carried, 0);
});

test('deposit: partial deposit, out of range does nothing, held button triggers once', () => {
  const g = quietGame({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] });
  g.applyFrame({ interact: true });
  const ev = runSteps(g, 10); // held for 10 ticks -> only one edge
  assert.equal(ev.filter((e) => e.name === 'deposit').length, 1);
  assert.equal(g.lanterns[0].deposited, 2);
  assert.equal(g.lanterns[0].lit, false);
  const g2 = quietGame({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius + 0.1] }] });
  assert.equal(press(g2, 'interact').length, 0);
});

test('win: lighting all lanterns -> won/all_lit with time + flame bonus', () => {
  const lanterns = ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true }));
  lanterns.push({ id: 'L5', pos: [0, 0, 1], deposited: T.lantern_cost - 1 });
  const g = quietGame({ player: { carried: 1 }, lanterns, time_left_s: 100 });
  assert.equal(g.score, 0); // pre-lit lanterns give no score
  const ev = press(g, 'interact');
  assert.equal(g.state, 'won');
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'all_lit' });
  const timeLeft = Math.floor(100 - 1 / 60);
  assert.equal(g.score, T.score.per_lantern + T.score.per_second_left * timeLeft + T.score.per_flame_left * T.flames);
});

test('pulse: costs pulse_cost, stuns + pushes shades within pulse_radius, per_stun score', () => {
  const g = quietGame({
    player: { carried: 2 },
    shades: [{ id: 'A', pos: [T.pulse_radius, 1, 0] }, { id: 'B', pos: [T.pulse_radius + 0.5, 1, 0] }],
  });
  const ev = press(g, 'pulse');
  const pulse = ev.find((e) => e.name === 'pulse');
  assert.deepEqual(pulse.data, { stunned_ids: ['A'] });
  assert.equal(g.player.carried, 2 - T.pulse_cost);
  assert.equal(g.score, T.score.per_stun);
  const a = g.shades[0];
  assert.equal(a.state, 'stunned');
  assert.ok(Math.abs(a.pos[0] - (T.pulse_radius + T.pulse_push_m)) < 1e-9);
  runSteps(g, Math.round(T.pulse_stun_s * 60) - 1);
  assert.equal(a.state, 'stunned');
  runSteps(g, 1);
  assert.notEqual(a.state, 'stunned');
});

test('pulse: not enough light or during cooldown -> no pulse', () => {
  const g = quietGame({ player: { carried: 0 } });
  assert.equal(press(g, 'pulse').length, 0);
  const g2 = quietGame({ player: { carried: 3 } });
  assert.equal(press(g2, 'pulse').length, 1);
  assert.equal(press(g2, 'pulse').length, 0); // cooldown
  runSteps(g2, Math.round(T.pulse_cooldown_s * 60));
  assert.equal(press(g2, 'pulse').length, 1);
});

test('shade: chases at shade_speed and hits within shade_hit_radius', () => {
  const g = quietGame({ shades: [{ id: 'S1', pos: [10, 1, 0] }] });
  runSteps(g, 60);
  assert.ok(Math.abs(g.shades[0].pos[0] - (10 - T.shade_speed)) < 1e-9);
  const g2 = quietGame({ player: { carried: 4 }, shades: [{ id: 'S1', pos: [T.shade_hit_radius + T.shade_speed / 60, 1, 0] }] });
  const ev = runSteps(g2, 1);
  const hit = ev.find((e) => e.name === 'player_hit');
  assert.deepEqual(hit.data, { by: 'shade', flames: T.flames - 1, dropped: Math.floor(4 * T.hit_drop_ratio) });
  assert.equal(g2.player.carried, 4 - Math.floor(4 * T.hit_drop_ratio));
  assert.equal(g2.motes.length, Math.floor(4 * T.hit_drop_ratio)); // dropped motes land on the ground
});

test('shade: invuln_s after a hit', () => {
  const g = quietGame({ shades: [{ id: 'S1', pos: [0, 1, 0] }] });
  const inv = Math.round(T.invuln_s * 60);
  const ev = runSteps(g, inv);
  assert.equal(ev.filter((e) => e.name === 'player_hit').length, 1);
  const ev2 = runSteps(g, 1);
  assert.equal(ev2.filter((e) => e.name === 'player_hit').length, 1);
});

test('lose: last flame -> lost/no_flames', () => {
  const g = quietGame({ player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] });
  const ev = runSteps(g, 5);
  assert.equal(g.state, 'lost');
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
  assert.equal(g.steps, 1);
});

test('lose: time runs out -> lost/dawn', () => {
  const g = quietGame({ time_left_s: 1 });
  const ev = runSteps(g, 100);
  assert.equal(g.steps, 60);
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'dawn' });
});

test('safe_radius: shades never get within safe_radius of a lit lantern', () => {
  const g = quietGame({
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
    shades: [{ id: 'S1', pos: [15, 1, 0] }],
  });
  for (let i = 0; i < 600; i++) {
    g.step();
    const s = g.shades[0];
    assert.ok(Math.hypot(s.pos[0], s.pos[2]) > T.safe_radius);
  }
  assert.equal(g.player.flames, T.flames);
});

test('random world: seeds give motes and shades, shades spawn over time', () => {
  const g = new Game(T, { seed: 42 });
  assert.equal(g.motes.length, 30);
  assert.equal(g.shades.length, 2);
  // stand inside a lit-lantern safe zone so we survive while counting spawns
  g.lanterns[0].lit = true;
  g.player.pos = [...g.lanterns[0].pos];
  const ev = runSteps(g, 60 * 31);
  assert.equal(ev.filter((e) => e.name === 'shade_spawned').length, 1);
});
