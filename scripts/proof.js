// Generates docs/proof/<phase>/: runs every scenario twice through the real headless CLI,
// checks determinism, and writes the raw JSONL + a summary. Never edit the outputs by hand.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2] || 'phase-1';
const outDir = path.join(ROOT, 'docs/proof', phase);
fs.mkdirSync(outDir, { recursive: true });
const SC = path.join(ROOT, 'scenarios');

// name, night, seed, ticks, expectation (checked on the parsed output). Phase-1 rows were re-tuned to the
// Ticket-02 standard numbers (lantern cost 10, safe radius 6); see docs/notes/phase-2.md.
const snaps = (L) => L.filter((l) => l.type === 'snapshot');
const runs = [
  // --- phase 1 behaviour (regression, standard numbers) ---
  { name: 'pickup_deposit', night: 1, desc: '10 motes picked, L1 lit by one deposit (+100 +10x10)', seed: 1, ticks: 400, expect: (L) => ev(L, 'mote_picked').length === 10 && ev(L, 'lantern_lit')[0]?.data.lantern_id === 'L1' && L.at(-1).score === 200 },
  { name: 'win', night: 1, desc: '5 deposits -> won / all_lit', seed: 1, ticks: 600, expect: (L) => L.at(-1).state === 'won' && ev(L, 'game_over')[0].data.reason === 'all_lit' },
  { name: 'shade_hit_pulse', night: 1, desc: 'shade hits player (recoil), pulse stuns a shade', seed: 1, ticks: 1200, expect: (L) => ev(L, 'player_hit').length >= 1 && ev(L, 'pulse').some((e) => e.data.stunned_ids.length > 0) && snaps(L).some((s) => s.shades.some((x) => x.state === 'recoil')) },
  { name: 'lit_lanterns', night: 1, desc: 'player at lit L1: no hit, shades stay > 6 m from lit lanterns', seed: 1, ticks: 1200, expect: (L) => ev(L, 'player_hit').length === 0 && snaps(L).every((s) => s.shades.every((sh) => s.lanterns.filter((x) => x.lit).every((lt) => Math.hypot(sh.pos[0] - lt.pos[0], sh.pos[2] - lt.pos[2]) > 6))) },
  { name: 'wander', night: 1, desc: 'long random run with inputs ends with an end line', seed: 2026, ticks: 18000, expect: (L) => L.at(-1).type === 'end' },
  { name: 'random_idle', night: 1, desc: 'idle player in random world: shades spawn at 300 (+480k), dawn', seed: 7, ticks: 18000, expect: (L) => L.at(-1).state === 'lost' && ev(L, 'shade_spawned').slice(0, 3).map((e) => e.tick).join() === '300,300,780' },
  // --- phase 2 features ---
  { name: 'dash', night: 1, desc: 'dash 14 m/s x 12 ticks; second press inside 1.5 s ignored', seed: 1, ticks: 200, expect: (L) => ev(L, 'dash').length === 2 && ev(L, 'mote_picked').length === 1 },
  { name: 'pause', night: 1, desc: 'pause at tick 31, resume at 151: sim_tick frozen while paused', seed: 1, ticks: 200, scenarioFrom: 'charm', expect: (L) => ev(L, 'paused')[0]?.tick === 31 && ev(L, 'resumed')[0]?.tick === 151 && snaps(L).find((s) => s.tick === 100).state === 'paused' && L.at(-1).ticks === 200 },
  { name: 'fall', night: 1, desc: 'walk off the island: player_hit by fall, lost 7, respawn at start', seed: 1, ticks: 300, expect: (L) => ev(L, 'player_hit')[0]?.data.by === 'fall' && ev(L, 'player_hit')[0].data.lost === 7 && snaps(L).at(-1).player.pos.join() === '0,0,0' },
  { name: 'jump_pad', night: 2, desc: 'night 2 pad launches Mây over the sea to island B', seed: 1, ticks: 300, expect: (L) => { const p = snaps(L).at(-1).player.pos; return Math.hypot(p[0] - 70, p[2]) <= 28 && p[1] === 0; } },
  { name: 'drifter', night: 2, desc: 'Gió Lạc steals 3, pulse makes it drop them', seed: 1, ticks: 400, expect: (L) => ev(L, 'drifter_steal')[0]?.data.amount === 3 && ev(L, 'drifter_drop')[0]?.data.amount === 3 },
  { name: 'charm', night: 2, desc: 'Bùa Gió picked: 600 ticks, dash without cooldown', seed: 1, ticks: 200, expect: (L) => ev(L, 'charm_picked')[0]?.data.charm_ticks === 600 && ev(L, 'dash').length === 2 },
  { name: 'tiers_wind', night: 3, desc: 'night 3: walk up the 30° ramp to tier 1 (Y=3); wind gust at 30 s', seed: 3, ticks: 1900, expect: (L) => snaps(L).find((s) => s.tick === 100).player.pos[1] === 3 && snaps(L).find((s) => s.tick === 1800).wind.active === true },
  { name: 'night3_full', night: 3, desc: 'full night 3 with inputs: completes, deterministic', seed: 5, ticks: 21600, inputsFrom: 'wander', expect: (L) => L.at(-1).type === 'end' },
];
const ev = (L, n) => L.filter((l) => l.name === n);

const rows = [];
for (const r of runs) {
  const args = ['--seed', String(r.seed), '--night', String(r.night), '--ticks', String(r.ticks)];
  const sc = path.join(SC, `${r.scenarioFrom || r.name}.scenario.json`);
  const inp = path.join(SC, `${r.inputsFrom || r.name}.inputs.json`);
  if (fs.existsSync(sc)) args.push('--scenario', sc);
  if (fs.existsSync(inp)) args.push('--inputs', inp);
  const outA = path.join(outDir, `${r.name}.jsonl`);
  const outB = path.join(os.tmpdir(), `ddl-proof-${r.name}-b.jsonl`);
  const t0 = process.hrtime.bigint();
  const a = spawnSync(process.execPath, ['src/headless.js', ...args, '--out', outA], { cwd: ROOT, encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const b = spawnSync(process.execPath, ['src/headless.js', ...args, '--out', outB], { cwd: ROOT, encoding: 'utf8' });
  const same = fs.readFileSync(outA, 'utf8') === fs.readFileSync(outB, 'utf8');
  const L = fs.readFileSync(outA, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  const end = L.at(-1);
  const counts = {};
  for (const e of L.filter((l) => l.type === 'event')) counts[e.name] = (counts[e.name] || 0) + 1;
  const ok = a.status === 0 && b.status === 0 && same && r.expect(L);
  rows.push({ ...r, cmd: `node src/headless.js ${args.map((x) => x.replace(ROOT + path.sep, '').replaceAll('\\', '/')).join(' ')} --out ...`, exit: a.status, same, end, counts, ms, ok });
}

const md = [
  `# Proof ${phase}`,
  '',
  `Generated by \`npm run proof\` — ${new Date().toISOString()} · node ${process.version} · ${os.platform()} ${os.arch()} · ${os.cpus()[0]?.model}`,
  '',
  'Each scenario is run twice; "Deterministic" = byte-identical output. Raw output is the `.jsonl` next to this file.',
  '',
  '| Scenario | Checks | Exit | Deterministic | End | Events | Time (ms) | Result |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.desc} | ${r.exit} | ${r.same} | ${r.end.state} @${r.end.ticks}, score ${r.end.score} | ${Object.entries(r.counts).map(([k, v]) => `${k}×${v}`).join(', ')} | ${r.ms.toFixed(0)} | ${r.ok ? 'PASS' : 'FAIL'} |`),
  '',
  '<details><summary>Commands</summary>',
  '',
  ...rows.map((r) => `- \`${r.cmd}\``),
  '',
  '</details>',
  '',
];
fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), md.join('\n'));
console.log(md.join('\n'));
process.exit(rows.every((r) => r.ok) ? 0 : 1);
