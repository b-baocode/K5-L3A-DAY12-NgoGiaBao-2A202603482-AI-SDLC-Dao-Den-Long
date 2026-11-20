// Contract tests for the headless CLI (Test Contract v1.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CONTRACT, headless, readJsonl, tmpDir } from './helpers.js';

const SC = path.join(ROOT, 'scenarios');

test('contract file: required fields present', () => {
  assert.equal(CONTRACT.contract_version, '1.2');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.equal(typeof CONTRACT[k], 'string');
  const keys = ['player_speed', 'carry_capacity', 'lantern_cost', 'lantern_count_night1', 'pickup_radius',
    'interact_radius', 'pulse_cost', 'pulse_radius', 'night1_duration_s', 'flames', 'invuln_s', 'hit_drop_ratio',
    'pulse_stun_s', 'pulse_push_m', 'pulse_cooldown_s', 'safe_radius', 'shade_speed', 'shade_hit_radius', 'fall_enabled',
    'dash_speed', 'dash_duration_s', 'dash_cooldown_s', 'night2_duration_s', 'night3_duration_s',
    'fuel_max', 'fuel_decay_per_s', 'fuel_per_mote', 'relight_cost', 'win_ratio', 'drain_per_s', 'low_fuel_threshold', 'capacity_max'];
  for (const k of keys) assert.ok(k in CONTRACT.tuning, k);
  for (const k of ['per_mote', 'per_lantern', 'per_stun', 'per_second_left', 'per_flame_left'])
    assert.equal(typeof CONTRACT.tuning.score[k], 'number', k);
});

test('output format: snapshot at tick 0 and every N, end line last, exit 0', () => {
  const out = path.join(tmpDir(), 'o.jsonl');
  const r = headless(['--seed', '7', '--night', '1', '--ticks', '95', '--out', out, '--snapshot-every', '20']);
  assert.equal(r.status, 0, r.stderr);
  const lines = readJsonl(out);
  const snaps = lines.filter((l) => l.type === 'snapshot');
  assert.deepEqual(snaps.map((s) => s.tick), [0, 20, 40, 60, 80]);
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 95, state: 'playing', score: lines.at(-1).score });
  const s0 = snaps[0];
  for (const k of ['type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms'])
    assert.ok(k in s0, k);
  for (const k of ['pos', 'vel', 'grounded', 'invuln', 'flames', 'carried', 'capacity', 'dash_cd_s', 'pulse_cd_s', 'charm_s']) assert.ok(k in s0.player, k);
  for (const l of s0.lanterns) assert.deepEqual(Object.keys(l), ['id', 'pos', 'lit', 'deposited', 'fuel', 'ever_lit', 'relit_count']);
  assert.deepEqual(Object.keys(s0.wind), ['active', 'dir_deg']);
  for (const m of s0.motes) assert.deepEqual(Object.keys(m), ['id', 'pos', 'kind', 'ttl_s']);
  assert.equal(s0.time_left_s, CONTRACT.tuning.night1_duration_s);
  assert.equal(snaps[1].time_left_s, Math.round((CONTRACT.tuning.night1_duration_s - 20 / 60) * 1000) / 1000);
  for (const s of s0.shades) for (const c of s.pos) assert.equal(c, Math.round(c * 1000) / 1000);
});

test('default snapshot-every is 10', () => {
  const out = path.join(tmpDir(), 'o.jsonl');
  headless(['--seed', '1', '--night', '1', '--ticks', '30', '--out', out]);
  assert.deepEqual(readJsonl(out).filter((l) => l.type === 'snapshot').map((s) => s.tick), [0, 10, 20, 30]);
});

test('tick model: input of tick k -> event tick k+1; tick 0 snapshot before input', () => {
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'sc.json'), JSON.stringify({ random_motes: false, random_shades: false, motes: [], shades: [], player: { carried: 3 } }));
  fs.writeFileSync(path.join(d, 'in.json'), JSON.stringify({ frames: [{ tick: 0, move: [0, 1] }, { tick: 5, pulse: true }] }));
  const out = path.join(d, 'o.jsonl');
  const r = headless(['--seed', '1', '--night', '1', '--scenario', path.join(d, 'sc.json'), '--inputs', path.join(d, 'in.json'), '--ticks', '10', '--out', out, '--snapshot-every', '1']);
  assert.equal(r.status, 0, r.stderr);
  const lines = readJsonl(out);
  assert.deepEqual(lines[0].player.pos, [0, 0, 0]);
  assert.equal(lines.find((l) => l.name === 'pulse').tick, 6);
  assert.equal(lines.find((l) => l.type === 'snapshot' && l.tick === 1).player.pos[2], 0.1);
});

test('game over stops the run early, end.ticks = steps run', () => {
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'sc.json'), JSON.stringify({ random_motes: false, random_shades: false, time_left_s: 0.5 }));
  const out = path.join(d, 'o.jsonl');
  headless(['--seed', '1', '--night', '1', '--scenario', path.join(d, 'sc.json'), '--ticks', '1000', '--out', out]);
  const lines = readJsonl(out);
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 30, state: 'lost', score: 0 });
  assert.deepEqual(lines.find((l) => l.name === 'game_over'), { type: 'event', tick: 30, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
});

test('determinism: same seed/scenario/inputs -> identical output; other seed differs', () => {
  const d = tmpDir();
  const args = (seed, f) => ['--seed', String(seed), '--night', '1', '--inputs', path.join(SC, 'wander.inputs.json'), '--ticks', '3000', '--out', path.join(d, f)];
  headless(args(123, 'a.jsonl'));
  headless(args(123, 'b.jsonl'));
  headless(args(124, 'c.jsonl'));
  const a = fs.readFileSync(path.join(d, 'a.jsonl'), 'utf8');
  assert.equal(a, fs.readFileSync(path.join(d, 'b.jsonl'), 'utf8'));
  assert.notEqual(a, fs.readFileSync(path.join(d, 'c.jsonl'), 'utf8'));
});

test('bad inputs / scenario -> exit 2 with stderr', () => {
  const d = tmpDir();
  const cases = {
    'notjson.json': '{oops',
    'dup.json': JSON.stringify({ frames: [{ tick: 3 }, { tick: 3 }] }),
    'move.json': JSON.stringify({ frames: [{ tick: 0, move: 'up' }] }),
    'btn.json': JSON.stringify({ frames: [{ tick: 0, pulse: 1 }] }),
  };
  for (const [f, body] of Object.entries(cases)) {
    fs.writeFileSync(path.join(d, f), body);
    const r = headless(['--seed', '1', '--night', '1', '--inputs', path.join(d, f), '--ticks', '5', '--out', path.join(d, 'o.jsonl')]);
    assert.equal(r.status, 2, f);
    assert.ok(r.stderr.length > 0);
  }
  const scen = { 'l.json': { lanterns: [{ id: 'L9' }] }, 'p.json': { player: { pos: [0, 0] } }, 's.json': { shades: [{}] } };
  for (const [f, body] of Object.entries(scen)) {
    fs.writeFileSync(path.join(d, f), JSON.stringify(body));
    const r = headless(['--seed', '1', '--night', '1', '--scenario', path.join(d, f), '--ticks', '5', '--out', path.join(d, 'o.jsonl')]);
    assert.equal(r.status, 2, f);
  }
  fs.writeFileSync(path.join(d, 'missing'), '');
  assert.equal(headless(['--seed', '1', '--ticks', '5', '--inputs', path.join(d, 'nope.json'), '--out', path.join(d, 'o.jsonl')]).status, 2);
});

test('usage errors -> non-zero exit (not 0)', () => {
  const r = headless(['--seed', 'x', '--ticks', '5']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes('error'));
});

test('scenario setup emits no events and no score', () => {
  const out = path.join(tmpDir(), 'o.jsonl');
  headless(['--seed', '1', '--night', '1', '--scenario', path.join(SC, 'lit_lanterns.scenario.json'), '--ticks', '0', '--out', out]);
  const lines = readJsonl(out);
  assert.deepEqual(lines.map((l) => l.type), ['snapshot', 'event', 'end']); // only night_start
  assert.equal(lines[1].name, 'night_start');
  assert.equal(lines[0].score, 0);
  assert.equal(lines[0].lanterns.filter((l) => l.lit).length, 2);
});

test('--night 1/2/3: night field, lantern count, night_start; other values -> usage error', () => {
  const d = tmpDir();
  for (const n of [1, 2, 3]) {
    const out = path.join(d, `n${n}.jsonl`);
    const r = headless(['--seed', '1', '--night', String(n), '--ticks', '20', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const L = readJsonl(out);
    assert.equal(L[0].night, n);
    assert.equal(L[0].lanterns.length, [5, 6, 7][n - 1]);
    assert.equal(L[0].time_left_s, [240, 270, 300][n - 1]); // Ticket-03 durations
    assert.deepEqual(L.find((l) => l.name === 'night_start').data, { night: n });
    assert.equal(L[0].charms.length, [0, 1, 2][n - 1]);
  }
  assert.notEqual(headless(['--seed', '1', '--night', '4', '--ticks', '5', '--out', path.join(d, 'x')]).status, 0);
});

test('pause via inputs: state paused, tick advances, sim_tick frozen', () => {
  const d = tmpDir();
  fs.writeFileSync(path.join(d, 'in.json'), JSON.stringify({ frames: [{ tick: 3, pause: true }, { tick: 4, pause: false }, { tick: 13, pause: true }] }));
  const out = path.join(d, 'o.jsonl');
  headless(['--seed', '1', '--night', '1', '--inputs', path.join(d, 'in.json'), '--ticks', '20', '--out', out, '--snapshot-every', '1']);
  const L = readJsonl(out);
  const s10 = L.find((l) => l.type === 'snapshot' && l.tick === 10);
  assert.equal(s10.state, 'paused');
  assert.equal(s10.sim_tick, 3);
  assert.equal(L.find((l) => l.name === 'paused').tick, 4);
  assert.equal(L.find((l) => l.name === 'resumed').tick, 14);
  assert.equal(L.find((l) => l.type === 'snapshot' && l.tick === 20).sim_tick, 10);
});

test('performance: a full night (21600 ticks) runs in <= 30 s', () => {
  const d = tmpDir();
  for (const n of [1, 2, 3]) {
    const t0 = Date.now();
    const r = headless(['--seed', '11', '--night', String(n), '--inputs', path.join(SC, 'wander.inputs.json'), '--ticks', '21600', '--out', path.join(d, `p${n}.jsonl`)]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Date.now() - t0 < 30000);
  }
});

test('bad v1.1 scenario fields -> exit 2', () => {
  const d = tmpDir();
  const cases = {
    'st.json': { shades: [{ pos: [1, 1, 1], state: 'angry' }] },
    'dr.json': { drifters: [{ pos: [1, 1, 1], state: 'sleep' }] },
    'ch.json': { charms: [{ id: 'C1', available: 'yes' }] },
    'pl.json': { player: { invuln_ticks: -1 } },
  };
  for (const [f, body] of Object.entries(cases)) {
    fs.writeFileSync(path.join(d, f), JSON.stringify(body));
    const r = headless(['--seed', '1', '--night', '2', '--scenario', path.join(d, f), '--ticks', '5', '--out', path.join(d, 'o.jsonl')]);
    assert.equal(r.status, 2, f);
  }
});
