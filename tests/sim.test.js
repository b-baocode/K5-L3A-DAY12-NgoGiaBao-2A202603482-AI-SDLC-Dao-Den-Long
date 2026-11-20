// Rule tests (src/sim/game.js) against Ticket-02 standard numbers / Contract v1.1.
// Phase-1 tests that the ticket replaced are rewritten here; see docs/notes/phase-2.md "Test changes".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, NIGHTS, RULES } from '../src/sim/game.js';
import { T, quietGame, runSteps, press } from './helpers.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('tuning matches Ticket-02 standard numbers', () => {
  const want = {
    player_speed: 6, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1, interact_radius: 2,
    pulse_cost: 3, pulse_radius: 5, night1_duration_s: 300, night2_duration_s: 330, night3_duration_s: 360, flames: 3,
    invuln_s: 1.5, hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4, pulse_cooldown_s: 3, safe_radius: 6,
    shade_speed: 4, shade_hit_radius: 1, fall_enabled: true, dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5,
  };
  for (const [k, v] of Object.entries(want)) assert.equal(T[k], v, k);
  assert.deepEqual(T.score, { per_mote: 10, per_lantern: 100, per_stun: 5, per_second_left: 2, per_flame_left: 50 });
});

test('maps: standard lanterns, mote and shade points per night', () => {
  assert.deepEqual(NIGHTS[1].lanterns.map((l) => l.pos), [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]);
  assert.equal(NIGHTS[1].motePoints.length, 24);
  assert.equal(NIGHTS[1].shadePoints.length, 12);
  assert.equal(NIGHTS[2].lanterns.length, 6);
  assert.equal(NIGHTS[2].motePoints.length, 24);
  assert.equal(NIGHTS[3].lanterns.length, 7);
  assert.equal(NIGHTS[3].motePoints.length, 30);
  assert.equal(NIGHTS[3].shadePoints.length, 16);
  // N3 terrain
  const g = NIGHTS[3].ground;
  assert.equal(g(0, -30), 0);
  assert.equal(g(0, 18), 3);
  assert.equal(g(0, -18), 0); // tier 1 only on z > 0
  assert.equal(g(5, 0), 6);
  near(g(27 * Math.cos(Math.PI / 6), 27 * Math.sin(Math.PI / 6)), 1.5, 1e-6); // ramp halfway
  assert.equal(g(46, 0), null);
  assert.equal(NIGHTS[2].ground(35, 0), 0); // bridge
  assert.equal(NIGHTS[2].ground(35, 3), null);
});

test('start: 20 random motes on 20 distinct points, no shade before tick 300', () => {
  const g = new Game(T, { seed: 3 });
  assert.equal(g.motes.length, 20);
  assert.equal(new Set(g.motes.map((m) => m.pos.join())).size, 20);
  assert.equal(g.shades.length, 0);
  assert.deepEqual(g.player.pos, [0, 0, 0]);
});

test('movement: 6 m/s, camera-relative, normalised', () => {
  const g = quietGame();
  runSteps(g, 60, { move: [0, 1], cam_yaw_deg: 0 });
  near(g.player.pos[2], 6);
  const g2 = quietGame();
  runSteps(g2, 60, { move: [0, 1], cam_yaw_deg: 90 });
  near(g2.player.pos[0], 6);
  const g3 = quietGame();
  runSteps(g3, 60, { move: [1, 1] });
  near(Math.hypot(g3.player.pos[0], g3.player.pos[2]), 6);
});

test('jump: 7 m/s, gravity 20, only from the ground', () => {
  const g = quietGame();
  press(g, 'jump');
  assert.ok(g.player.pos[1] > 0 && !g.player.grounded);
  const y = g.player.pos[1];
  press(g, 'jump'); // mid-air: no double jump
  assert.ok(g.player.pos[1] < y + 7 / 60);
  runSteps(g, 60);
  assert.equal(g.player.pos[1], 0);
  assert.ok(g.player.grounded);
});

test('dash: 14 m/s for 12 ticks, cooldown 90 ticks from start, facing when idle', () => {
  const g = quietGame();
  const ev = press(g, 'dash'); // idle: facing +Z
  assert.equal(ev[0].name, 'dash');
  runSteps(g, 11);
  near(g.player.pos[2], 14 * 0.2);
  assert.equal(press(g, 'dash').length, 0); // still on cooldown at tick 13
  runSteps(g, 91 - 13 - 1); // cooldown 90 ticks counted from the dash start (tick 1) -> ready at tick 91
  assert.equal(press(g, 'dash')[0].name, 'dash');
  assert.equal(g.tick, 91);
});

test('dash in the air keeps altitude', () => {
  const g = quietGame();
  press(g, 'jump');
  runSteps(g, 10);
  const y = g.player.pos[1];
  press(g, 'dash');
  runSteps(g, 5);
  near(g.player.pos[1], y);
});

test('pickup: XZ <= 1 and height difference <= 1.5, capacity 10, no score for picking', () => {
  const g = quietGame({ motes: [[0, 0, 1], [0, 0, -1.01]] });
  const ev = runSteps(g, 1);
  assert.deepEqual(ev.map((e) => e.name), ['mote_picked']);
  assert.equal(g.score, 0);
  const g2 = quietGame({ motes: [[0, 1.6, 0.5]] });
  assert.equal(runSteps(g2, 1).length, 0);
  const g3 = quietGame({ motes: Array.from({ length: 12 }, () => [0, 0, 0.5]) });
  runSteps(g3, 1);
  assert.equal(g3.player.carried, 10);
});

test('lantern: 10 to light, partial deposits remembered, +10 per mote deposited, +100 lit', () => {
  const g = quietGame({ player: { carried: 4 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }] });
  let ev = press(g, 'interact');
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: 4, deposited: 4 });
  assert.equal(g.score, 40);
  g.player.carried = 10;
  runSteps(g, 1); // release the button: deposits trigger on false -> true
  ev = press(g, 'interact');
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.equal(ev[0].data.amount, 6);
  assert.equal(g.player.carried, 4);
  assert.equal(g.score, 100 + 100);
});

test('lantern: out of 2 m range no deposit; tie -> smaller id', () => {
  const g = quietGame({ player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 2.01] }] });
  assert.equal(press(g, 'interact').length, 0);
  const g2 = quietGame({ player: { carried: 5 }, lanterns: [{ id: 'L2', pos: [1, 0, 0] }, { id: 'L1', pos: [-1, 0, 0] }] });
  assert.equal(press(g2, 'interact')[0].data.lantern_id, 'L1');
});

test('win: all lit -> won/all_lit, bonus floor(seconds) x2 + 50 x flames', () => {
  const lanterns = ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true }));
  lanterns.push({ id: 'L5', pos: [0, 0, 1], deposited: 9 });
  const g = quietGame({ player: { carried: 1, flames: 2 }, lanterns, time_left_s: 100 });
  const ev = press(g, 'interact');
  assert.equal(g.state, 'won');
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'all_lit' });
  assert.equal(g.score, 10 + 100 + Math.floor(100 - 1 / 60) * 2 + 50 * 2);
});

test('pulse: needs 3 motes, radius 5 (3D from feet+0.8), +5 per shade, stun 120, push 4 m over 15 ticks', () => {
  const g = quietGame({
    player: { carried: 3 },
    // S3 at (3, 4.6, 0): 4.84 m from feet+0.8 (hit) but 5.49 m from the feet (would miss)
    shades: [{ id: 'S1', pos: [4.9, 0.8, 0], state: 'stunned' }, { id: 'S2', pos: [4, 4, 0] }, { id: 'S3', pos: [-3, 4.6, 0] }],
  });
  const ev = press(g, 'pulse');
  assert.deepEqual(ev.find((e) => e.name === 'pulse').data, { stunned_ids: ['S1', 'S3'] }); // S2: 3D distance > 5
  assert.equal(g.player.carried, 0);
  assert.equal(g.score, 10);
  const s1 = g.shades[0];
  runSteps(g, 14);
  near(s1.pos[0], 4.9 + 4);
  runSteps(g, 120 - 15 - 1);
  assert.equal(s1.state, 'stunned');
  runSteps(g, 2);
  assert.notEqual(s1.state, 'stunned');
  const g2 = quietGame({ player: { carried: 2 } });
  assert.equal(press(g2, 'pulse').length, 0);
});

test('pulse: cooldown 3 s', () => {
  const g = quietGame({ player: { carried: 9 } });
  assert.equal(press(g, 'pulse').length, 1); // tick 1
  runSteps(g, 1);
  assert.equal(press(g, 'pulse').length, 0); // tick 3: cooling down
  runSteps(g, 180 - 3);
  assert.equal(press(g, 'pulse').length, 1); // tick 181
});

test('shade: wander until within 12 m, chase at 4 m/s, give up beyond 18 m', () => {
  const g = quietGame({ shades: [{ id: 'S1', pos: [13, 1, 0] }] });
  runSteps(g, 1);
  assert.equal(g.shades[0].state, 'wander');
  const g2 = quietGame({ shades: [{ id: 'S1', pos: [11, 1, 0] }] });
  runSteps(g2, 60);
  assert.equal(g2.shades[0].state, 'chase');
  near(g2.shades[0].pos[0], 11 - 4);
  const g3 = quietGame({ shades: [{ id: 'S1', pos: [17.9, 1, 0], state: 'chase' }] });
  runSteps(g3, 1, { move: [-1, 0] }); // run away along -X
  runSteps(g3, 10);
  assert.equal(g3.shades[0].state, 'wander');
});

test('shade hit: -1 flame, drop floor(carried/2) on 1.5-2.5 m ring (ttl 480), invuln 90, recoil 2 m / 60 ticks', () => {
  const g = quietGame({ player: { carried: 5 }, shades: [{ id: 'S1', pos: [1, 1, 0], state: 'chase' }] });
  const ev = runSteps(g, 1);
  const hit = ev.find((e) => e.name === 'player_hit');
  assert.deepEqual(hit.data, { by: 'shade', flames: 2, dropped: 2 });
  assert.equal(g.motes.length, 2);
  for (const m of g.motes) {
    const r = Math.hypot(m.pos[0], m.pos[2]);
    assert.ok(r >= 1.5 - 1e-3 && r <= 2.5 + 1e-3);
    assert.equal(m.kind, 'dropped');
    assert.equal(m.ttl, 480);
  }
  assert.equal(g.shades[0].state, 'recoil');
  assert.equal(g.player.invulnTicks, 90);
  runSteps(g, 59);
  assert.equal(g.shades[0].state, 'recoil');
  near(g.shades[0].pos[0], 1 - 4 / 60 + 2 * (59 / 60), 1e-6);
});

test('dropped motes expire after 480 ticks; invuln blocks hits', () => {
  const h = quietGame({ player: { invuln_ticks: 30 }, shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }] });
  assert.equal(runSteps(h, 29).filter((e) => e.name === 'player_hit').length, 0);
  assert.equal(runSteps(h, 1).filter((e) => e.name === 'player_hit').length, 1);
  const g = quietGame();
  g.addMote([20, 0, 0], 'dropped', 480);
  runSteps(g, 479);
  assert.equal(g.motes.length, 1);
  runSteps(g, 1);
  assert.equal(g.motes.length, 0);
});

test('at most one flame lost per tick, shades checked by ascending id', () => {
  const g = quietGame({ shades: [{ id: 'S2', pos: [0.5, 1, 0], state: 'chase' }, { id: 'S1', pos: [-0.5, 1, 0], state: 'chase' }] });
  const ev = runSteps(g, 1);
  assert.equal(ev.filter((e) => e.name === 'player_hit').length, 1);
  assert.equal(g.shades.find((s) => s.id === 'S1').state, 'recoil');
  assert.equal(g.shades.find((s) => s.id === 'S2').state, 'chase');
});

test('safe zone 6 m: shades blocked at the edge; shades inside a newly lit lantern are evicted harmlessly', () => {
  const g = quietGame({ lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }], shades: [{ id: 'S1', pos: [10, 1, 0], state: 'chase' }] });
  for (let i = 0; i < 300; i++) {
    g.step();
    assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2]) > 6);
  }
  assert.equal(g.player.flames, 3);
  const g2 = quietGame({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1.5] }], shades: [{ id: 'S1', pos: [0.6, 1, 0], state: 'chase' }] });
  g2.player.invulnTicks = 1; // no hit on the lighting tick itself
  const ev = press(g2, 'interact');
  assert.ok(ev.some((e) => e.name === 'lantern_lit'));
  const ev2 = runSteps(g2, 30);
  assert.equal(ev2.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(g2.shades[0].pos[0], g2.shades[0].pos[2] - 1.5) > 6);
});

test('spawns: 2 shades at tick 300 then 1 every 480 (night 1), ids S1.., at >= 15 m, state spawning', () => {
  const g = new Game(T, { seed: 9, scenario: { random_motes: false } });
  let ev = runSteps(g, 300);
  assert.deepEqual(ev.filter((e) => e.name === 'shade_spawned').map((e) => [e.tick, e.data.id]), [[300, 'S1'], [300, 'S2']]);
  for (const s of g.shades) {
    assert.equal(s.state, 'spawning');
    assert.ok(Math.hypot(s.pos[0], s.pos[2]) >= 15);
  }
  ev = runSteps(g, 480);
  assert.deepEqual(ev.filter((e) => e.name === 'shade_spawned').map((e) => e.tick), [780]);
  runSteps(g, 480 * 10);
  assert.equal(g.shades.length, 6);
});

test('spawns: motes every 240 ticks up to 30 / free points only', () => {
  const g = new Game(T, { seed: 2, scenario: { random_shades: false } });
  runSteps(g, 239);
  assert.equal(g.motes.length, 20);
  runSteps(g, 1);
  assert.equal(g.motes.length, 21);
  runSteps(g, 240 * 10);
  assert.equal(g.motes.length, 24); // night 1 has only 24 points
});

test('fall: Y < -10 once, -1 flame, lose all motes, wait 60, respawn at start with invuln 90', () => {
  const g = quietGame({ player: { pos: [39.5, 0, 0], carried: 6 } });
  g.applyFrame({ move: [1, 0] });
  let ev = [];
  for (let i = 0; i < 200 && !ev.length; i++) { g.step(); ev = g.drainEvents().filter((e) => e.name === 'player_hit'); }
  assert.deepEqual(ev[0].data, { by: 'fall', flames: 2, dropped: 0, lost: 6 });
  g.applyFrame({ move: [0, 0] });
  runSteps(g, 59);
  assert.ok(g.player.pos[1] < -10);
  runSteps(g, 1);
  assert.deepEqual(g.player.pos, [0, 0, 0]);
  assert.equal(g.player.invulnTicks, 90);
});

test('fall on the last flame loses immediately (no respawn)', () => {
  const g = quietGame({ player: { pos: [39.9, 0, 0], flames: 1 } });
  g.applyFrame({ move: [1, 0] });
  const ev = runSteps(g, 200);
  assert.equal(g.state, 'lost');
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
});

test('dawn: time over -> lost/dawn; win on the last tick still wins', () => {
  const g = quietGame({ time_left_s: 1 });
  const ev = runSteps(g, 100);
  assert.equal(g.simTick, 60);
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'dawn' });
  const lanterns = ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true }));
  lanterns.push({ id: 'L5', pos: [0, 0, 1], deposited: 9 });
  const g2 = quietGame({ player: { carried: 1 }, lanterns, time_left_s: 1 / 60 });
  press(g2, 'interact');
  assert.equal(g2.state, 'won');
});

test('pause: tick advances, sim_tick/time/cooldowns frozen, paused/resumed events', () => {
  const g = quietGame({ player: { pulse_cd_ticks: 10 } });
  let ev = press(g, 'pause');
  assert.deepEqual(ev.map((e) => e.name), ['paused']);
  assert.equal(g.state, 'paused');
  runSteps(g, 50, { move: [0, 1] });
  assert.equal(g.tick, 51);
  assert.equal(g.simTick, 0);
  assert.equal(g.player.pulseCdTicks, 10);
  assert.deepEqual(g.player.pos, [0, 0, 0]);
  assert.equal(g.snapshot().state, 'paused');
  ev = press(g, 'pause');
  assert.deepEqual(ev.map((e) => e.name), ['resumed']);
  assert.equal(g.simTick, 1); // resume tick runs the gameplay step
});

test('night 2: jump pad launches toward the other island and lands there (~1.4 s)', () => {
  const g = quietGame({ player: { pos: [19.5, 0, 18] } }, 1, 2);
  g.applyFrame({ move: [1, 0] });
  runSteps(g, 5);
  g.applyFrame({ move: [-1, 0] }); // input must not override the launch
  let t = 0;
  while (!g.player.grounded && t < 200) { g.step(); t++; }
  assert.ok(t > 70 && t < 95, `flight ${t} ticks`);
  assert.ok(Math.hypot(g.player.pos[0] - 70, g.player.pos[2]) <= 28);
});

test('night 2: bridge is walkable, off the bridge you fall', () => {
  const g = quietGame({ player: { pos: [27, 0, 0] } }, 1, 2);
  runSteps(g, 60 * 3, { move: [1, 0] });
  assert.equal(g.player.pos[1], 0);
  assert.ok(g.player.pos[0] > 44);
  const g2 = quietGame({ player: { pos: [35, 0, 1.5] } }, 1, 2);
  const ev = runSteps(g2, 120, { move: [0, 1] });
  assert.ok(ev.some((e) => e.name === 'player_hit' && e.data.by === 'fall'));
});

test('night 3: tier edges are walls, ramps lead up, pad lands on tier 2, bell tower blocks', () => {
  const g = quietGame({ player: { pos: [0, 0, 10] } }, 1, 3); // tier 0 gap between tier2 (r8) and tier1 (r12)
  runSteps(g, 60, { move: [0, 1] }); // into tier 1 wall
  assert.ok(g.player.pos[2] < 12 && g.player.pos[1] === 0);
  const a = Math.PI / 6;
  const g2 = quietGame({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }, 1, 3);
  runSteps(g2, 90, { move: [-Math.cos(a), -Math.sin(a)].map((v) => v), cam_yaw_deg: 0 });
  // move [x,z] with yaw 0 maps x->+X, z->+Z
  assert.equal(g2.player.pos[1], 3);
  const g3 = quietGame({ player: { pos: [0, 3, 13.5] } }, 1, 3);
  runSteps(g3, 5, { move: [0, -1] });
  runSteps(g3, 120, { move: [0, 0] });
  assert.equal(g3.player.pos[1], 6);
  const g4 = quietGame({ player: { pos: [0, 6, 5] } }, 1, 3);
  runSteps(g4, 120, { move: [0, -1] });
  assert.ok(g4.player.pos[2] >= 2 - 1e-9);
});

test('night 3: wind every 30 s for 5 s pushes the player 2 m/s', () => {
  const g = quietGame({ wind_enabled: true }, 4, 3);
  runSteps(g, 1799);
  assert.equal(g.wind.active, false);
  runSteps(g, 1);
  assert.equal(g.wind.active, true);
  const x0 = [...g.player.pos];
  runSteps(g, 60);
  near(Math.hypot(g.player.pos[0] - x0[0], g.player.pos[2] - x0[2]), 2, 1e-6);
  runSteps(g, 240);
  assert.equal(g.wind.active, false);
});

test('drifter: idle -> chase (>=5 carried, <=15 m), steals min(3, carried), flees 240 then removed', () => {
  const g = quietGame({ player: { carried: 6 }, drifters: [{ id: 'D1', pos: [10, 1.5, 0] }] }, 1, 2);
  let ev = [];
  for (let i = 0; i < 120 && !ev.length; i++) { g.step(); ev = g.drainEvents().filter((e) => e.name === 'drifter_steal'); }
  assert.deepEqual(ev[0].data, { drifter_id: 'D1', amount: 3, carried: 3 });
  const d = g.drifters[0];
  assert.equal(d.state, 'flee');
  assert.equal(d.stolen, 3);
  runSteps(g, 240);
  assert.equal(d.state, 'removed');
  assert.equal(g.player.flames, 3); // never costs a flame
});

test('drifter: no chase below 5 carried; pulse on chase -> flee without stealing; pulse on loaded flee -> drop', () => {
  const g = quietGame({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [3, 1.5, 0] }] }, 1, 2);
  runSteps(g, 30);
  assert.equal(g.drifters[0].state, 'idle');
  const g2 = quietGame({ player: { carried: 8 }, drifters: [{ id: 'D1', pos: [4, 1.5, 0], state: 'chase' }] }, 1, 2);
  press(g2, 'pulse');
  assert.equal(g2.drifters[0].state, 'flee');
  assert.equal(g2.drifters[0].stolen, 0);
  const g3 = quietGame({ player: { carried: 3 }, drifters: [{ id: 'D1', pos: [2, 1.5, 0], state: 'flee', stolen: 3 }] }, 1, 2);
  const ev = press(g3, 'pulse');
  assert.deepEqual(ev.find((e) => e.name === 'drifter_drop').data, { drifter_id: 'D1', amount: 3 });
  assert.equal(g3.motes.filter((m) => m.kind === 'dropped').length, 3);
  runSteps(g3, 119);
  assert.equal(g3.drifters[0].state, 'flee');
  runSteps(g3, 1); // 120 ticks after the drop
  assert.equal(g3.drifters[0].state, 'removed');
});

test('drifter: spawns at 1200, 2400 (max 2 alive) on night 2 only', () => {
  const g = new Game(T, { seed: 1, night: 2, scenario: { random_shades: false, random_motes: false } });
  runSteps(g, 1200);
  assert.deepEqual(g.drifters.map((d) => d.id), ['D1']);
  runSteps(g, 1200 * 2);
  assert.equal(g.drifters.filter((d) => d.state !== 'removed').length, 2);
  const g1 = new Game(T, { seed: 1, night: 1, scenario: { random_shades: false } });
  runSteps(g1, 1300);
  assert.equal(g1.drifters.length, 0);
});

test('charm: picked like a mote, 600 ticks: 7.2 m/s and dash without cooldown, respawn after 2700', () => {
  const g = quietGame({ charms: [{ id: 'C1', pos: [0, 0, 0.5] }] }, 1, 2);
  const ev = runSteps(g, 1);
  assert.deepEqual(ev[0], { type: 'event', tick: 1, name: 'charm_picked', data: { charm_id: 'C1', charm_ticks: 600 } });
  g.player.pos = [0, 0, 0];
  runSteps(g, 60, { move: [1, 0] });
  near(g.player.pos[0], 7.2, 1e-6);
  g.applyFrame({ move: [0, 0] });
  assert.equal(press(g, 'dash').length, 1);
  runSteps(g, 12);
  assert.equal(press(g, 'dash').length, 1); // no cooldown with charm
  runSteps(g, 2700);
  assert.equal(g.charms[0].available, true);
});
