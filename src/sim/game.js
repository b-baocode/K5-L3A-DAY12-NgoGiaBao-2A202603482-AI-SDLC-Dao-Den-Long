// Pure game logic for Đảo Đèn Lồng. No DOM, no Three.js, no wall clock.
// Used by both the headless CLI and the web renderer, so both behave identically.
import { mulberry32 } from './rng.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// Fixed world constants (not part of contract tuning; documented in docs/notes/phase-1.md).
export const WORLD = {
  islandRadius: 40,      // player is clamped inside this circle (fall_enabled = false)
  lanternRing: 25,       // default lanterns sit on this circle, L1 at (0,0,25)
  moteSpawnRadius: 37,   // random motes appear inside this circle
  initialMotes: 30,      // random_motes: keep this many motes on the island
  initialShades: 2,      // random_shades: shades at the start of the night
  maxShades: 6,
  shadeSpawnEvery_s: 30, // random_shades: one new shade every 30 s (up to maxShades)
  shadeSpawnMinDist: 18, // new shades spawn at least this far from the player
  shadeY: 1,             // shade.pos is the centre of the blob
  dropRing: 2.5,         // dropped motes land on a ring of this radius around the player
  gravity: 20,
  jumpSpeed: 7,
};

const r3 = (x) => {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
};
const r3v = (v) => v.map(r3);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const secToTicks = (s) => Math.round(s * TICK_RATE);

export function defaultLanterns(count = 5) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i * 2 * Math.PI) / count;
    out.push({
      id: `L${i + 1}`,
      pos: [r3(WORLD.lanternRing * Math.sin(a)), 0, r3(WORLD.lanternRing * Math.cos(a))],
      lit: false,
      deposited: 0,
    });
  }
  return out;
}

const BUTTONS = ['jump', 'interact', 'pulse', 'dash'];

// ---------- creative extras (web game only, see constructor `extras`) ----------
// chance = probability when a random entity spawns; the rest is 'normal'.
export const MOTE_KINDS = {
  normal: { chance: 0, light: 1, scoreMul: 1 },
  gold: { chance: 0.15, light: 2, scoreMul: 2 },   // Đom đóm Vàng Kim: worth 2 light, double score
  heal: { chance: 0.07, light: 0, scoreMul: 1 },   // Đom đóm Ngọc Lam: +1 flame, ignores carry limit
};
export const SHADE_KINDS = {
  normal: { chance: 0, speedMul: 1, hitMul: 1 },
  swift: { chance: 0.25, speedMul: 1.6, hitMul: 0.8 }, // Mực Lướt: small and fast
  big: { chance: 0.2, speedMul: 0.65, hitMul: 1.7 },   // Mực Khổng Lồ: slow, long reach
};
function pickKind(kinds, r) {
  let acc = 0;
  for (const [name, k] of Object.entries(kinds)) {
    acc += k.chance;
    if (name !== 'normal' && r < acc) return name;
  }
  return 'normal';
}

export class Game {
  /**
   * @param {object} tuning  contract tuning block (game.contract.json -> tuning)
   * @param {object} opts    { seed:int, scenario?:object (already validated), extras?:bool }
   *   extras: creative content (special mote/shade kinds). ONLY the web game turns it on;
   *   headless never does, so contract output is byte-identical with or without this code.
   */
  constructor(tuning, { seed = 0, scenario = null, extras = false } = {}) {
    this.t = tuning;
    this.extras = extras;
    this.rng = mulberry32(seed);
    this.state = 'playing';
    this.steps = 0;
    this.score = 0;
    this.events = [];
    this.moteSeq = 0;
    this.shadeSeq = 0;
    this.usedShadeIds = new Set();
    this.input = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false };
    this.prevButtons = { jump: false, interact: false, pulse: false, dash: false };

    const sc = scenario || {};
    this.randomMotes = sc.random_motes !== undefined ? sc.random_motes : true;
    this.randomShades = sc.random_shades !== undefined ? sc.random_shades : true;
    this.startTimeLeft = sc.time_left_s !== undefined ? sc.time_left_s : tuning.night1_duration_s;

    this.player = {
      pos: [0, 0, 0],
      vy: 0,
      flames: tuning.flames,
      carried: 0,
      invulnTicks: 0,
      cooldownTicks: 0,
    };
    if (sc.player) {
      if (sc.player.pos) this.player.pos = [...sc.player.pos];
      if (sc.player.carried !== undefined) this.player.carried = sc.player.carried;
      if (sc.player.flames !== undefined) this.player.flames = sc.player.flames;
    }

    this.lanterns = defaultLanterns(tuning.lantern_count_night1);
    if (sc.lanterns) {
      for (const l of sc.lanterns) {
        const target = this.lanterns.find((x) => x.id === l.id);
        if (l.pos) target.pos = [...l.pos];
        if (l.deposited !== undefined) target.deposited = l.deposited;
        if (l.lit !== undefined) {
          target.lit = l.lit;
          if (l.lit && l.deposited === undefined) target.deposited = tuning.lantern_cost;
        }
      }
    }

    // Motes: scenario list replaces the initial list; otherwise random if enabled.
    this.motes = [];
    if (sc.motes) {
      for (const m of sc.motes) this.motes.push({ id: this.nextMoteId(), pos: [...m], kind: 'normal' });
    } else if (this.randomMotes) {
      for (let i = 0; i < WORLD.initialMotes; i++) this.spawnRandomMote();
    }

    // Shades: same rule.
    this.shades = [];
    if (sc.shades) {
      for (const s of sc.shades) if (s.id) this.usedShadeIds.add(s.id);
      for (const s of sc.shades) this.addShade(s.id || this.nextShadeId(), [...s.pos]);
    } else if (this.randomShades) {
      for (let i = 0; i < WORLD.initialShades; i++) this.spawnRandomShade();
    }
  }

  // ---------- ids & spawning ----------
  nextMoteId() {
    return `M${++this.moteSeq}`;
  }
  nextShadeId() {
    let id;
    do id = `S${++this.shadeSeq}`;
    while (this.usedShadeIds.has(id));
    this.usedShadeIds.add(id);
    return id;
  }
  addShade(id, pos, kind = 'normal') {
    const k = SHADE_KINDS[kind];
    const s = { id, pos, state: 'chase', stunTicks: 0, kind, speedMul: k.speedMul, hitMul: k.hitMul };
    this.shades.push(s);
    return s;
  }
  spawnRandomMote() {
    const a = this.rng() * 2 * Math.PI;
    const r = WORLD.moteSpawnRadius * Math.sqrt(this.rng());
    const m = { id: this.nextMoteId(), pos: [r3(r * Math.sin(a)), 0, r3(r * Math.cos(a))], kind: 'normal' };
    if (this.extras) m.kind = pickKind(MOTE_KINDS, this.rng()); // extra rng draw ONLY with extras
    this.motes.push(m);
  }
  spawnRandomShade() {
    let pos;
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rng() * 2 * Math.PI;
      const r = 30 + this.rng() * 8;
      pos = [r3(r * Math.sin(a)), WORLD.shadeY, r3(r * Math.cos(a))];
      if (distXZ(pos, this.player.pos) >= WORLD.shadeSpawnMinDist) break;
    }
    const kind = this.extras ? pickKind(SHADE_KINDS, this.rng()) : 'normal';
    const s = this.addShade(this.nextShadeId(), pos, kind);
    this.applySafeRadius(s);
    return s;
  }

  // ---------- helpers ----------
  get timeLeft() {
    return this.startTimeLeft - this.steps / TICK_RATE;
  }
  litCount() {
    return this.lanterns.filter((l) => l.lit).length;
  }
  applySafeRadius(s) {
    const R = this.t.safe_radius;
    if (!R) return;
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      const d = distXZ(s.pos, l.pos);
      if (d <= R) {
        let dx = s.pos[0] - l.pos[0];
        let dz = s.pos[2] - l.pos[2];
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        const out = R + 0.01; // strictly outside "within R"
        s.pos[0] = l.pos[0] + dx * out;
        s.pos[2] = l.pos[2] + dz * out;
      }
    }
  }
  endGame(result, reason, ev) {
    this.state = result;
    if (result === 'won') {
      const sc = this.t.score;
      this.score += sc.per_second_left * Math.floor(Math.max(0, this.timeLeft)) + sc.per_flame_left * this.player.flames;
    }
    ev('game_over', { result, reason });
  }

  // Apply one input frame (only fields present change, missing ones keep their value).
  applyFrame(f) {
    if (!f) return;
    if (f.move) this.input.move = [f.move[0], f.move[1]];
    if (f.cam_yaw_deg !== undefined) this.input.cam_yaw_deg = f.cam_yaw_deg;
    for (const b of BUTTONS) if (f[b] !== undefined) this.input[b] = f[b];
  }

  // ---------- one fixed step: reads current input, produces state steps+1 ----------
  step() {
    if (this.state !== 'playing') return;
    const t = this.t;
    const tick = this.steps + 1;
    const ev = (name, data) => this.events.push({ type: 'event', tick, name, data });
    const pressed = {};
    for (const b of BUTTONS) pressed[b] = this.input[b] && !this.prevButtons[b];
    for (const b of BUTTONS) this.prevButtons[b] = this.input[b];
    const p = this.player;

    // timers
    if (p.invulnTicks > 0) p.invulnTicks--;
    if (p.cooldownTicks > 0) p.cooldownTicks--;
    for (const s of this.shades) {
      if (s.stunTicks > 0 && --s.stunTicks === 0) s.state = 'chase';
    }

    // movement (camera-relative, normalised if longer than 1)
    let [mx, mz] = this.input.move;
    mx = Math.max(-1, Math.min(1, mx));
    mz = Math.max(-1, Math.min(1, mz));
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = (this.input.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    p.pos[0] += wx * t.player_speed * DT;
    p.pos[2] += wz * t.player_speed * DT;
    const rc = Math.hypot(p.pos[0], p.pos[2]);
    if (rc > WORLD.islandRadius) {
      p.pos[0] *= WORLD.islandRadius / rc;
      p.pos[2] *= WORLD.islandRadius / rc;
    }
    if (pressed.jump && p.pos[1] <= 0) p.vy = WORLD.jumpSpeed;
    if (p.pos[1] > 0 || p.vy > 0) {
      p.vy -= WORLD.gravity * DT;
      p.pos[1] += p.vy * DT;
      if (p.pos[1] <= 0) { p.pos[1] = 0; p.vy = 0; }
    }

    // pick up motes (automatic, in list order, until capacity)
    let picked = 0;
    // (normal motes: identical to "pick until full"; extras kinds handled per mote)
    for (let i = 0; i < this.motes.length; ) {
      const m = this.motes[i];
      const kind = MOTE_KINDS[m.kind || 'normal'];
      const canTake = m.kind === 'heal' || p.carried < t.carry_capacity;
      if (canTake && distXZ(m.pos, p.pos) <= t.pickup_radius) {
        this.motes.splice(i, 1);
        if (m.kind === 'heal') p.flames = Math.min(t.flames, p.flames + 1);
        p.carried = Math.min(t.carry_capacity, p.carried + kind.light);
        picked++;
        this.score += t.score.per_mote * kind.scoreMul;
        const data = { carried: p.carried };
        if (this.extras) data.kind = m.kind;
        ev('mote_picked', data);
      } else i++;
    }
    if (this.randomMotes) for (let i = 0; i < picked; i++) this.spawnRandomMote();

    // interact: deposit into the nearest unlit lantern in range
    if (pressed.interact && p.carried > 0) {
      let best = null;
      let bestD = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(l.pos, p.pos);
        if (d <= t.interact_radius && d < bestD) { best = l; bestD = d; }
      }
      if (best) {
        const amount = Math.min(p.carried, t.lantern_cost - best.deposited);
        if (amount > 0) {
          p.carried -= amount;
          best.deposited += amount;
          ev('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= t.lantern_cost) {
            best.lit = true;
            this.score += t.score.per_lantern;
            ev('lantern_lit', { lantern_id: best.id });
            if (this.litCount() === this.lanterns.length) {
              this.steps = tick;
              this.endGame('won', 'all_lit', ev);
              return;
            }
          }
        }
      }
    }

    // pulse: costs pulse_cost carried motes, stuns + pushes shades in radius
    if (pressed.pulse && p.cooldownTicks === 0 && p.carried >= t.pulse_cost) {
      p.carried -= t.pulse_cost;
      p.cooldownTicks = secToTicks(t.pulse_cooldown_s);
      const ids = [];
      for (const s of this.shades) {
        const d = distXZ(s.pos, p.pos);
        if (d > t.pulse_radius) continue;
        s.state = 'stunned';
        s.stunTicks = secToTicks(t.pulse_stun_s);
        let dx = s.pos[0] - p.pos[0];
        let dz = s.pos[2] - p.pos[2];
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        s.pos[0] += dx * t.pulse_push_m;
        s.pos[2] += dz * t.pulse_push_m;
        this.applySafeRadius(s);
        ids.push(s.id);
      }
      this.score += t.score.per_stun * ids.length;
      ev('pulse', { stunned_ids: ids });
    }

    // shades chase the player (XZ plane), never enter a lit lantern's safe radius
    const step = t.shade_speed * DT;
    for (const s of this.shades) {
      if (s.state === 'stunned') continue;
      const dx = p.pos[0] - s.pos[0];
      const dz = p.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 1e-9) {
        const m = Math.min(step * s.speedMul, d);
        s.pos[0] += (dx / d) * m;
        s.pos[2] += (dz / d) * m;
      }
      this.applySafeRadius(s);
    }

    // shade touches player
    if (p.invulnTicks === 0) {
      const hitter = this.shades.find((s) => s.state !== 'stunned' && distXZ(s.pos, p.pos) <= t.shade_hit_radius * s.hitMul);
      if (hitter) {
        const dropped = Math.floor(p.carried * t.hit_drop_ratio);
        p.carried -= dropped;
        p.flames -= 1;
        p.invulnTicks = secToTicks(t.invuln_s);
        for (let i = 0; i < dropped; i++) {
          const a = (i * 2 * Math.PI) / dropped;
          const pos = [p.pos[0] + WORLD.dropRing * Math.sin(a), 0, p.pos[2] + WORLD.dropRing * Math.cos(a)];
          const rr = Math.hypot(pos[0], pos[2]);
          if (rr > WORLD.islandRadius) { pos[0] *= WORLD.islandRadius / rr; pos[2] *= WORLD.islandRadius / rr; }
          this.motes.push({ id: this.nextMoteId(), pos: [r3(pos[0]), 0, r3(pos[2])], kind: 'normal' });
        }
        ev('player_hit', { by: 'shade', flames: p.flames, dropped });
        if (p.flames <= 0) {
          this.steps = tick;
          this.endGame('lost', 'no_flames', ev);
          return;
        }
      }
    }

    // new shades over the night
    if (this.randomShades && tick % secToTicks(WORLD.shadeSpawnEvery_s) === 0 && this.shades.length < WORLD.maxShades) {
      const s = this.spawnRandomShade();
      ev('shade_spawned', { id: s.id });
    }

    this.steps = tick;
    if (this.timeLeft <= 1e-9) this.endGame('lost', 'dawn', ev);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot() {
    return {
      type: 'snapshot',
      tick: this.steps,
      sim_tick: this.steps,
      state: this.state,
      time_left_s: r3(Math.max(0, this.timeLeft)),
      score: this.score,
      player: { pos: r3v(this.player.pos), flames: this.player.flames, carried: this.player.carried },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited })),
      shades: this.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: r3v(m.pos) })),
    };
  }
}
