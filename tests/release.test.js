// Ticket-04: leaderboard rules, bench scene, soak test, leaderboard export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Game } from '../src/sim/game.js';
import { benchScenario, BENCH } from '../src/sim/bench.js';
import { validName, makeEntry, addEntry, isoWithOffset, LEADERBOARD_SIZE } from '../src/sim/leaderboard.js';
import { T, ROOT, tmpDir, runSteps } from './helpers.js';

test('leaderboard: names 3-12 of [A-Za-z0-9_] (Vietnamese letters accepted)', () => {
  for (const n of ['Bao', 'ngo_gia_bao', 'A1_', 'Mây', 'NgôGiaBảo']) assert.ok(validName(n), n);
  for (const n of ['ab', 'abcdefghijklm', 'a b c', 'bao!', '', null]) assert.ok(!validName(n), String(n));
});

test('leaderboard: score desc, ties -> earlier first, top 10 only, ISO 8601 with offset', () => {
  let e = [];
  const d = (s) => new Date(Date.parse('2026-11-20T10:00:00Z') + s * 1000);
  e = addEntry(e, makeEntry({ name: 'late', score: 500, nightsWon: 2, seed: 1, date: d(10) }));
  e = addEntry(e, makeEntry({ name: 'early', score: 500, nightsWon: 2, seed: 1, date: d(5) }));
  e = addEntry(e, makeEntry({ name: 'best', score: 900, nightsWon: 3, seed: 1, date: d(20) }));
  assert.deepEqual(e.map((x) => x.name), ['best', 'early', 'late']);
  for (let i = 0; i < 12; i++) e = addEntry(e, makeEntry({ name: `p${i}xx`, score: i, nightsWon: 0, seed: i, date: d(30 + i) }));
  assert.equal(e.length, LEADERBOARD_SIZE);
  assert.equal(e.at(-1).score, 5);
  assert.match(isoWithOffset(new Date()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.deepEqual(Object.keys(e[0]), ['name', 'score', 'nights_won', 'achieved_at', 'seed']);
  assert.throws(() => makeEntry({ name: 'x', score: 1, nightsWon: 0, seed: 1 }));
});

test('leaderboard export: run.js --export-leaderboard writes ranked entries from disk', () => {
  const d = tmpDir();
  const lb = path.join(d, 'lb.json');
  fs.writeFileSync(lb, JSON.stringify({ entries: [
    { name: 'two', score: 10, nights_won: 1, achieved_at: '2026-11-20T10:00:00+07:00', seed: 1 },
    { name: 'one', score: 99, nights_won: 3, achieved_at: '2026-11-20T11:00:00+07:00', seed: 2 },
  ] }));
  const out = path.join(d, 'out.json');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/run.js'), '--export-leaderboard', out], { encoding: 'utf8', env: { ...process.env, DDL_LEADERBOARD: lb } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).entries.map((x) => x.name), ['one', 'two']);
});

test('bench scene: 200 wander shades, 100 motes, L1-L3 lit fuel 100, deterministic for seed 42', () => {
  const sc = benchScenario(42);
  assert.deepEqual(benchScenario(42), sc);
  assert.equal(sc.shades.length, BENCH.shades);
  assert.equal(sc.motes.length, BENCH.motes);
  const g = new Game(T, { seed: 42, night: 1, scenario: sc, bench: true });
  assert.equal(g.shades.length, 200);
  assert.ok(g.shades.every((s) => s.state === 'wander'));
  assert.equal(g.motes.length, 100);
  assert.deepEqual(g.lanterns.filter((l) => l.lit).map((l) => [l.id, l.fuel / 60]), [['L1', 100], ['L2', 100], ['L3', 100]]);
  for (const s of sc.shades) assert.ok(Math.hypot(s.pos[0], s.pos[2]) <= 40);
});

test('bench scene: no spawns, damage, pickups, fuel decay or night end; shades keep wandering and moving', () => {
  const g = new Game(T, { seed: 42, night: 1, scenario: benchScenario(42), bench: true });
  const p0 = g.shades.map((s) => [...s.pos]);
  const ev = runSteps(g, 60 * 260); // longer than night 1 (240 s)
  assert.deepEqual(ev, []);
  assert.equal(g.state, 'playing');
  assert.equal(g.shades.length, 200);
  assert.equal(g.motes.length, 100);
  assert.equal(g.player.flames, T.flames);
  assert.ok(g.lanterns.filter((l) => l.lit).every((l) => l.fuel === 6000));
  assert.ok(g.shades.every((s) => s.state === 'wander'));
  assert.ok(g.shades.some((s, i) => Math.hypot(s.pos[0] - p0[i][0], s.pos[2] - p0[i][2]) > 1));
});

test('soak: 10 nights in one process, 0 crashes, memory within 1.2x', () => {
  const out = path.join(tmpDir(), 'soak.json');
  const r = spawnSync(process.execPath, ['--expose-gc', path.join(ROOT, 'scripts/soak.js'), '--seed', '7', '--nights', '10', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(s.nights, 10);
  assert.equal(s.crashes, 0);
  assert.equal(s.results.length, 10);
  assert.ok(s.results.every((x) => x === 'won' || x === 'lost'));
  assert.ok(s.mem_end_mb <= 1.2 * s.mem_start_mb, `${s.mem_end_mb} > 1.2 x ${s.mem_start_mb}`);
});
