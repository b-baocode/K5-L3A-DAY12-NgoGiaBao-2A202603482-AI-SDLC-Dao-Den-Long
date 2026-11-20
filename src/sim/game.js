// Pure game logic for Đảo Đèn Lồng — Test Contract v1.2 (Ticket-03 lantern fuel) on Ticket-02 standard numbers.
// No DOM, no Three.js, no wall clock, no Math.random. Shared by headless CLI and web renderer.
import { mulberry32 } from './rng.js';
import { NIGHTS } from './maps.js';

export { NIGHTS };
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// Fixed rules from Ticket-02 that are not contract tuning keys.
export const RULES = {
  jumpSpeed: 7, gravity: 20, stepUp: 0.35,
  pickupDy: 1.5, hitDy: 1.5,
  moteCap: 30, moteInitial: 20, moteSpawnEvery: 240,
  droppedTtl: 480, dropRingMin: 1.5, dropRingMax: 2.5,
  shadeFirstSpawn: 300, shadeFirstCount: 2, shadeSpawnMinDist: 15, shadeY: 1,
  shadeSpawningTicks: 60, // ASSUMPTION A22: length of the 'spawning' state
  shadeWanderSpeed: 1.5, shadeDetect: 12, shadeGiveUp: 18,
  recoilTicks: 60, recoilDist: 2,
  evictTicks: 30,
  pulseCenterDy: 0.8, pulsePushTicks: 15,
  fallY: -10, fallWaitTicks: 60, respawnInvulnTicks: 90,
  charmTicks: 600, charmRespawnTicks: 2700, charmSpeed: 7.2,
  drifterSpeed: 7, drifterIdleSpeed: 2, drifterMax: 2, drifterEvery: 1200, drifterY: 1.5,
  drifterChaseCarry: 5, drifterChaseDist: 15, drifterTouch: 1.2, drifterStealMax: 3,
  drifterFleeTicks: 240, drifterDropFleeTicks: 120,
  windEvery: 1800, windTicks: 300, windSpeed: 2,
  // Ticket-03
  fuelUnit: 60, // fuel is stored in integer 1/60 units (1 fuel/s decay = 1 unit per tick)
  drainRange: 2, drainBreakDist: 6, fuelDrainEventEvery: 60,
  weakSeekSpeedMul: 1, // ASSUMPTION A41: wander shades head to a weak lantern at shade_speed
};

const r3 = (x) => {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
};
const r3v = (v) => v.map(r3);
const r1 = (x) => Math.round(x * 10) / 10;
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const secToTicks = (s) => Math.round(s * TICK_RATE);
const idNum = (id) => {
  const m = /(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : 0;
};
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const BUTTONS = ['jump', 'interact', 'pulse', 'dash', 'pause'];

// ---------- creative extras (web game only, see constructor `extras`) ----------
export const MOTE_VARIANTS = {
  normal: { chance: 0, light: 1 },
  gold: { chance: 0.15, light: 2 }, // Đom đóm Vàng Kim: worth 2 light
  heal: { chance: 0.07, light: 0 }, // Đom đóm Ngọc Lam: +1 flame, ignores carry limit
};
export const SHADE_KINDS = {
  normal: { chance: 0, speedMul: 1, hitMul: 1 },
  swift: { chance: 0.25, speedMul: 1.6, hitMul: 0.8 }, // Mực Lướt
  big: { chance: 0.2, speedMul: 0.65, hitMul: 1.7 }, // Mực Khổng Lồ
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
   * @param {object} tuning contract tuning block
   * @param {object} opts { seed, night=1, scenario (validated), extras=false }
   *   extras: creative content. ONLY the web game turns it on; headless never does.
   */
  constructor(tuning, { seed = 0, night = 1, scenario = null, extras = false } = {}) {
    this.t = tuning;
    this.night = night;
    this.map = NIGHTS[night];
    this.extras = extras;
    this.rng = mulberry32(seed);
    this.state = 'playing';
    this.paused = false;
    this.tick = 0; // output ticks (advance while paused)
    this.simTick = 0; // gameplay ticks
    this.score = 0;
    this.events = [];
    this.seq = { M: 0, S: 0, D: 0 };
    this.usedIds = new Set();
    this.input = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
    this.prevButtons = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    this.wind = { active: false, dirDeg: 0, ticks: 0 };

    const sc = scenario || {};
    this.randomMotes = sc.random_motes ?? true;
    this.randomShades = sc.random_shades ?? true;
    this.randomDrifters = sc.random_drifters ?? this.map.drifters;
    this.windEnabled = sc.wind_enabled ?? this.map.wind;
    this.duration = tuning[`night${night}_duration_s`] ?? this.map.duration_s;
    this.startTimeLeft = sc.time_left_s ?? this.duration;

    const p = (this.player = {
      pos: [...this.map.start], vel: [0, 0, 0], vy: 0, grounded: true, facing: [0, 1],
      flames: tuning.flames, carried: 0,
      invulnTicks: 0, dashCdTicks: 0, pulseCdTicks: 0, charmTicks: 0,
      dashTicks: 0, dashDir: [0, 1], launch: null, fallWaitTicks: 0, successfulLights: 0,
    });
    if (sc.player) {
      const sp = sc.player;
      if (sp.pos) p.pos = [...sp.pos];
      if (sp.carried !== undefined) p.carried = sp.carried;
      if (sp.flames !== undefined) p.flames = sp.flames;
      if (sp.invuln_ticks !== undefined) p.invulnTicks = sp.invuln_ticks;
      if (sp.dash_cd_ticks !== undefined) p.dashCdTicks = sp.dash_cd_ticks;
      if (sp.pulse_cd_ticks !== undefined) p.pulseCdTicks = sp.pulse_cd_ticks;
      if (sp.charm_ticks !== undefined) p.charmTicks = sp.charm_ticks;
      if (sp.successful_lights !== undefined) p.successfulLights = sp.successful_lights;
      const g = this.groundAt(p.pos[0], p.pos[2]);
      p.grounded = g !== null && Math.abs(p.pos[1] - g) < 1e-6;
    }

    this.fuelMaxU = tuning.fuel_max * RULES.fuelUnit;
    this.lowFuelU = tuning.low_fuel_threshold * RULES.fuelUnit;
    this.lanterns = this.map.lanterns.map((l) => ({ id: l.id, pos: [...l.pos], lit: false, deposited: 0, fuel: 0, everLit: false, relitCount: 0 }));
    for (const l of sc.lanterns || []) {
      const target = this.lanterns.find((x) => x.id === l.id);
      if (l.pos) target.pos = [...l.pos];
      if (l.deposited !== undefined) target.deposited = l.deposited;
      if (l.lit !== undefined) {
        target.lit = l.lit;
        if (l.lit && l.deposited === undefined) target.deposited = tuning.lantern_cost;
      }
      if (target.lit) {
        target.fuel = l.fuel !== undefined ? Math.round(l.fuel * RULES.fuelUnit) : this.fuelMaxU; // lit without fuel -> 100
        target.everLit = l.ever_lit ?? true;
      } else {
        target.fuel = 0;
        target.everLit = l.ever_lit ?? false;
      }
    }

    // motes
    this.motes = [];
    if (sc.motes) for (const m of sc.motes) this.addMote([...m], 'random');
    else if (this.randomMotes) for (let i = 0; i < RULES.moteInitial; i++) this.spawnMoteAtFreePoint();

    // shades: scenario list replaces; random ones arrive on schedule from tick 300
    this.shades = [];
    for (const s of sc.shades || []) if (s.id) this.usedIds.add(s.id);
    for (const s of sc.shades || []) {
      const sh = this.addShade(s.id || this.nextId('S'), [...s.pos], s.state || 'wander');
      if (s.target_lantern_id !== undefined) sh.target = s.target_lantern_id;
      if (s.state_ticks_left !== undefined) sh.stateTicks = s.state_ticks_left;
      else if (sh.state === 'stunned') sh.stateTicks = secToTicks(tuning.pulse_stun_s);
      else if (sh.state === 'recoil') sh.stateTicks = RULES.recoilTicks;
      else if (sh.state === 'spawning') sh.stateTicks = RULES.shadeSpawningTicks;
    }

    // drifters
    this.drifters = [];
    for (const d of sc.drifters || []) if (d.id) this.usedIds.add(d.id);
    for (const d of sc.drifters || []) {
      const dr = this.addDrifter(d.id || this.nextId('D'), [...d.pos]);
      if (d.state) dr.state = d.state;
      if (d.stolen !== undefined) dr.stolen = d.stolen;
      if (d.state_ticks_left !== undefined) dr.stateTicks = d.state_ticks_left;
      else if (dr.state === 'flee') dr.stateTicks = RULES.drifterFleeTicks;
    }

    // charms
    const charmDefs = sc.charms || this.map.charms.map((c) => ({ id: c.id, pos: c.pos }));
    this.charms = charmDefs.map((c, i) => ({
      id: c.id || `C${i + 1}`,
      pos: [...(c.pos || this.map.charms.find((x) => x.id === c.id)?.pos || [0, 0, 0])],
      available: c.available ?? true,
      respawnTicks: c.respawn_ticks ?? 0,
    }));
  }

  // ---------- world queries ----------
  groundAt(x, z) {
    return this.map.ground(x, z);
  }
  inObstacle(x, z, y) {
    return this.map.obstacles.some((o) => Math.hypot(x - o.center[0], z - o.center[1]) <= o.radius && y < o.top);
  }
  get timeLeft() {
    return this.startTimeLeft - this.simTick / TICK_RATE;
  }
  litCount() {
    return this.lanterns.filter((l) => l.lit).length;
  }
  // Ticket-03: a lit lantern keeps its safe zone only while fuel >= low_fuel_threshold
  hasZone(l) {
    return l.lit && l.fuel >= this.lowFuelU;
  }
  get capacity() {
    return Math.min(this.t.capacity_max, this.t.carry_capacity + 2 * this.player.successfulLights);
  }
  winNeed() {
    return Math.ceil(this.t.win_ratio * this.lanterns.length - 1e-9);
  }

  // ---------- ids & spawning ----------
  nextId(prefix) {
    let id;
    do id = `${prefix}${++this.seq[prefix]}`;
    while (this.usedIds.has(id));
    this.usedIds.add(id);
    return id;
  }
  addMote(pos, kind, ttl = null) {
    const m = { id: this.nextId('M'), pos, kind, ttl, variant: 'normal' };
    if (this.extras && kind === 'random') m.variant = pickKind(MOTE_VARIANTS, this.rng());
    this.motes.push(m);
    return m;
  }
  spawnMoteAtFreePoint() {
    const free = this.map.motePoints.filter((pt) => !this.motes.some((m) => m.kind === 'random' && distXZ(m.pos, pt) < 0.01));
    if (!free.length) return null;
    return this.addMote([...free[Math.floor(this.rng() * free.length)]], 'random');
  }
  addShade(id, pos, state = 'wander') {
    const kind = this.extras && state === 'spawning' ? pickKind(SHADE_KINDS, this.rng()) : 'normal';
    const k = SHADE_KINDS[kind];
    const s = { id, pos, state, stateTicks: 0, kind, speedMul: k.speedMul, hitMul: k.hitMul, push: null, evict: null, wanderTo: null, recoilDir: null, target: null, drainTicks: 0 };
    this.shades.push(s);
    return s;
  }
  spawnShade() {
    const p = this.player.pos;
    const valid = this.map.shadePoints.filter(
      (pt) => distXZ(pt, p) >= RULES.shadeSpawnMinDist && !this.lanterns.some((l) => this.hasZone(l) && distXZ(l.pos, pt) <= this.t.safe_radius),
    );
    if (!valid.length) return null;
    const pt = valid[Math.floor(this.rng() * valid.length)];
    const s = this.addShade(this.nextId('S'), [...pt], 'spawning');
    s.stateTicks = RULES.shadeSpawningTicks;
    return s;
  }
  addDrifter(id, pos) {
    const d = { id, pos, state: 'idle', stolen: 0, stateTicks: 0, home: [pos[0], pos[2]], angle: 0, stoleOnce: false };
    this.drifters.push(d);
    return d;
  }

  applyFrame(f) {
    if (!f) return;
    if (f.move) this.input.move = [f.move[0], f.move[1]];
    if (f.cam_yaw_deg !== undefined) this.input.cam_yaw_deg = f.cam_yaw_deg;
    for (const b of BUTTONS) if (f[b] !== undefined) this.input[b] = f[b];
  }

  // ---------- one tick, in the mandatory Ticket-02 order ----------
  step() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const t = this.t;
    const p = this.player;
    this.tick++;
    const tick = this.tick;
    const ev = (name, data) => this.events.push({ type: 'event', tick, name, data });
    const pressed = {};
    for (const b of BUTTONS) pressed[b] = this.input[b] && !this.prevButtons[b];
    for (const b of BUTTONS) this.prevButtons[b] = this.input[b];

    // 1. input / pause
    if (!this.paused && pressed.pause) {
      this.paused = true;
      this.state = 'paused';
      ev('paused', {});
      return;
    }
    if (this.paused) {
      if (!pressed.pause) return;
      this.paused = false;
      this.state = 'playing';
      ev('resumed', {});
    }
    this.simTick++;
    const st = this.simTick;

    // 2. counters
    if (p.invulnTicks > 0) p.invulnTicks--;
    if (p.dashCdTicks > 0) p.dashCdTicks--;
    if (p.pulseCdTicks > 0) p.pulseCdTicks--;
    if (p.charmTicks > 0) p.charmTicks--;
    for (const s of this.shades) if (s.stateTicks > 0) s.stateTicks--;
    for (const d of this.drifters) if (d.stateTicks > 0) d.stateTicks--;
    this.motes = this.motes.filter((m) => m.ttl === null || --m.ttl > 0);
    for (const c of this.charms) if (!c.available && c.respawnTicks > 0 && --c.respawnTicks === 0) c.available = true;
    // fuel: natural decay + drain by shades in 'drain'; right after, lanterns at fuel <= 0 go out (Ticket-03)
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      const drainers = this.shades.filter((s) => s.state === 'drain' && s.target === l.id).sort(byId);
      l.fuel -= Math.round(t.fuel_decay_per_s) + Math.round(t.drain_per_s) * drainers.length;
      for (const s of drainers) {
        if (++s.drainTicks % RULES.fuelDrainEventEvery === 0) ev('fuel_drain', { lantern_id: l.id, shade_id: s.id, fuel: r1(Math.max(0, l.fuel) / RULES.fuelUnit) });
      }
    }
    for (const l of [...this.lanterns].sort(byId)) {
      if (l.lit && l.fuel <= 0) {
        l.lit = false;
        l.fuel = 0;
        l.deposited = 0;
        ev('lantern_out', { lantern_id: l.id });
      }
    }
    if (this.windEnabled) {
      if (this.wind.active && --this.wind.ticks === 0) this.wind.active = false;
      if (st % RULES.windEvery === 0) {
        this.wind = { active: true, dirDeg: Math.floor(this.rng() * 360), ticks: RULES.windTicks };
      }
    }
    if (p.fallWaitTicks > 0 && --p.fallWaitTicks === 0) {
      p.pos = [...this.map.start];
      p.vel = [0, 0, 0];
      p.vy = 0;
      p.launch = null;
      p.dashTicks = 0;
      p.grounded = true;
      p.invulnTicks = RULES.respawnInvulnTicks;
    }

    // 3. move Mây, then fall check
    if (p.fallWaitTicks === 0) this.movePlayer(pressed, ev);

    // 4. pick up motes and charms
    if (p.fallWaitTicks === 0) this.pickup(ev);

    // 5. lanterns
    if (pressed.interact && p.carried > 0 && p.fallWaitTicks === 0) this.interact(ev);

    // 6. safe zones (evict shades caught inside a newly lit lantern)
    this.updateSafeZones();

    // 7. pulse
    if (pressed.pulse && p.pulseCdTicks === 0 && p.carried >= t.pulse_cost && p.fallWaitTicks === 0) this.pulse(ev);

    // 8. shades and drifters move
    this.moveShades();
    this.moveDrifters();

    // 9. touches: drifters steal first, then shades hit (ascending id)
    if (p.fallWaitTicks === 0) this.touches(ev);

    // 10. spawns (new entities interact from the next tick)
    if (this.randomMotes && st % RULES.moteSpawnEvery === 0 && this.motes.length < RULES.moteCap) this.spawnMoteAtFreePoint();
    if (this.randomShades && st >= RULES.shadeFirstSpawn && (st - RULES.shadeFirstSpawn) % this.map.shadeEvery === 0) {
      const n = st === RULES.shadeFirstSpawn ? RULES.shadeFirstCount : 1;
      for (let i = 0; i < n && this.shades.length < this.map.shadeMax; i++) {
        const s = this.spawnShade();
        if (s) ev('shade_spawned', { id: s.id });
      }
    }
    if (this.randomDrifters && st % RULES.drifterEvery === 0) {
      const alive = this.drifters.filter((d) => d.state !== 'removed').length;
      if (alive < RULES.drifterMax) {
        const pts = this.map.shadePoints;
        const pt = pts[Math.floor(this.rng() * pts.length)];
        this.addDrifter(this.nextId('D'), [pt[0], RULES.drifterY, pt[2]]);
      }
    }

    // 11. win / lose
    // Ticket-03: no early win; at dawn you need ceil(win_ratio x lanterns) lit and to be alive
    if (p.flames <= 0) this.endGame('lost', 'no_flames', ev);
    else if (this.timeLeft <= 1e-9) {
      if (this.litCount() >= this.winNeed()) this.endGame('won', 'dawn_survived', ev);
      else this.endGame('lost', 'dawn', ev);
    }
  }

  endGame(result, reason, ev) {
    this.state = result;
    if (result === 'won') {
      const sc = this.t.score;
      for (const l of this.lanterns) if (l.lit) this.score += sc.per_lit_lantern_dawn + Math.floor(l.fuel / RULES.fuelUnit);
      this.score += sc.per_flame_left * this.player.flames;
    }
    ev('game_over', { result, reason });
  }

  // ---------- 3. player movement ----------
  movePlayer(pressed, ev) {
    const t = this.t;
    const p = this.player;
    // input direction in world space
    let [mx, mz] = this.input.move;
    mx = Math.max(-1, Math.min(1, mx));
    mz = Math.max(-1, Math.min(1, mz));
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = (this.input.cam_yaw_deg * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const moving = Math.hypot(wx, wz) > 1e-9;
    if (moving) {
      const l = Math.hypot(wx, wz);
      p.facing = [wx / l, wz / l];
    }

    // dash: on press, if not dashing and cooldown ready (charm = no cooldown)
    if (pressed.dash && p.dashTicks === 0 && (p.dashCdTicks === 0 || p.charmTicks > 0)) {
      p.dashTicks = secToTicks(t.dash_duration_s);
      p.dashDir = moving ? [...p.facing] : [...p.facing];
      p.dashCdTicks = p.charmTicks > 0 ? 0 : secToTicks(t.dash_cooldown_s);
      ev('dash', {});
    }

    let hx;
    let hz;
    const dashing = p.dashTicks > 0;
    if (dashing) {
      hx = p.dashDir[0] * t.dash_speed;
      hz = p.dashDir[1] * t.dash_speed;
      p.dashTicks--;
    } else if (p.launch) {
      hx = p.launch[0];
      hz = p.launch[1];
    } else {
      const speed = p.charmTicks > 0 ? RULES.charmSpeed : t.player_speed;
      hx = wx * speed;
      hz = wz * speed;
    }
    if (this.wind.active) {
      const a = (this.wind.dirDeg * Math.PI) / 180;
      hx += Math.cos(a) * RULES.windSpeed;
      hz += Math.sin(a) * RULES.windSpeed;
    }

    // vertical
    if (pressed.jump && p.grounded && !dashing) {
      p.vy = RULES.jumpSpeed;
      p.grounded = false;
    }
    if (dashing) p.vy = 0; // air dash keeps altitude
    else if (!p.grounded) p.vy -= RULES.gravity / TICK_RATE;

    // horizontal with walls (cannot walk up a tier edge; slide along axes)
    const x0 = p.pos[0];
    const z0 = p.pos[2];
    const canStand = (x, z) => {
      if (this.inObstacle(x, z, p.pos[1])) return false;
      const g = this.groundAt(x, z);
      return g === null || g <= p.pos[1] + RULES.stepUp;
    };
    let nx = x0 + hx * DT;
    let nz = z0 + hz * DT;
    if (!canStand(nx, nz)) {
      if (canStand(nx, z0)) nz = z0;
      else if (canStand(x0, nz)) nx = x0;
      else { nx = x0; nz = z0; }
    }
    p.pos[0] = nx;
    p.pos[2] = nz;
    p.pos[1] += p.vy * DT;

    // ground contact
    const g = this.groundAt(nx, nz);
    if (g !== null && p.vy <= 0 && p.pos[1] <= g + (p.grounded ? RULES.stepUp : 0) + 1e-9 && p.pos[1] >= g - 1.0) {
      p.pos[1] = g;
      p.vy = 0;
      if (!p.grounded) p.launch = null;
      p.grounded = true;
    } else if (g === null || p.pos[1] > g + 1e-9) {
      p.grounded = false;
    }
    if (dashing && g !== null && p.pos[1] > g) p.grounded = false;

    // jump pads
    if (p.grounded) {
      for (const pad of this.map.pads) {
        if (distXZ(p.pos, pad.pos) <= 1 && Math.abs(p.pos[1] - pad.pos[1]) < 0.05) {
          let dx;
          let dz;
          if (pad.target) { dx = pad.target[0] - pad.pos[0]; dz = pad.target[2] - pad.pos[2]; }
          else { [dx, dz] = pad.dir; }
          const l = Math.hypot(dx, dz);
          p.launch = [(dx / l) * pad.speed, (dz / l) * pad.speed];
          p.vy = pad.vy;
          p.grounded = false;
          break;
        }
      }
    }
    p.vel = [(nx - x0) * TICK_RATE, p.vy, (nz - z0) * TICK_RATE];

    // fall off the island
    if (p.pos[1] < RULES.fallY) {
      const lost = p.carried;
      p.carried = 0;
      p.flames -= 1;
      p.fallWaitTicks = RULES.fallWaitTicks;
      p.vel = [0, 0, 0];
      p.vy = 0;
      p.launch = null;
      p.dashTicks = 0;
      ev('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
    }
  }

  // ---------- 4. pickups ----------
  pickup(ev) {
    const t = this.t;
    const p = this.player;
    for (let i = 0; i < this.motes.length; ) {
      const m = this.motes[i];
      const v = MOTE_VARIANTS[m.variant] || MOTE_VARIANTS.normal;
      const canTake = m.variant === 'heal' || p.carried < this.capacity;
      if (canTake && distXZ(m.pos, p.pos) <= t.pickup_radius && Math.abs(p.pos[1] - m.pos[1]) <= RULES.pickupDy) {
        this.motes.splice(i, 1);
        if (m.variant === 'heal') p.flames = Math.min(t.flames, p.flames + 1);
        p.carried = Math.min(this.capacity, p.carried + v.light);
        const data = { carried: p.carried };
        if (this.extras) data.variant = m.variant;
        ev('mote_picked', data);
      } else i++;
    }
    for (const c of this.charms) {
      if (c.available && distXZ(c.pos, p.pos) <= t.pickup_radius && Math.abs(p.pos[1] - c.pos[1]) <= RULES.pickupDy) {
        c.available = false;
        c.respawnTicks = RULES.charmRespawnTicks;
        p.charmTicks = RULES.charmTicks;
        p.dashCdTicks = 0;
        ev('charm_picked', { charm_id: c.id, charm_ticks: p.charmTicks });
      }
    }
  }

  // ---------- 5. lanterns (Ticket-03: light, relight, refuel) ----------
  lanternNeed(l) {
    // motes this lantern would accept right now (0 = cannot be chosen)
    if (!l.lit) return (l.everLit ? this.t.relight_cost : this.t.lantern_cost) - l.deposited;
    return Math.ceil((this.fuelMaxU - l.fuel) / (this.t.fuel_per_mote * RULES.fuelUnit));
  }
  interact(ev) {
    const t = this.t;
    const p = this.player;
    let best = null;
    let bestD = Infinity;
    for (const l of [...this.lanterns].sort(byId)) {
      if (this.lanternNeed(l) <= 0) continue; // full lanterns are not selectable
      const d = distXZ(l.pos, p.pos);
      if (d <= t.interact_radius && d < bestD - 1e-12) { best = l; bestD = d; }
    }
    if (!best) return;
    const used = Math.min(p.carried, this.lanternNeed(best));
    if (used <= 0) return;
    p.carried -= used;
    this.score += t.score.per_mote * used;
    if (best.lit) {
      const wasWeak = best.fuel < this.lowFuelU;
      best.fuel = Math.min(this.fuelMaxU, best.fuel + t.fuel_per_mote * RULES.fuelUnit * used);
      ev('refuel', { lantern_id: best.id, amount: used, fuel: r1(best.fuel / RULES.fuelUnit) });
      if (wasWeak && best.fuel >= this.lowFuelU) best.justLit = true; // zone returns: evict shades inside
      return;
    }
    best.deposited += used;
    ev('deposit', { lantern_id: best.id, amount: used, deposited: best.deposited });
    const cost = best.everLit ? t.relight_cost : t.lantern_cost;
    if (best.deposited >= cost) {
      const relight = best.everLit;
      best.lit = true;
      best.fuel = this.fuelMaxU;
      best.everLit = true;
      best.justLit = true;
      if (relight) best.relitCount++;
      p.successfulLights++;
      this.score += relight ? t.score.per_relight : t.score.per_lantern;
      ev('lantern_lit', { lantern_id: best.id, relight });
    }
  }

  // ---------- 6. safe zones ----------
  updateSafeZones() {
    const R = this.t.safe_radius;
    for (const l of this.lanterns) {
      if (!l.justLit) continue;
      l.justLit = false;
      for (const s of this.shades) {
        const d = distXZ(s.pos, l.pos);
        if (d > R) continue;
        let dx = s.pos[0] - l.pos[0];
        let dz = s.pos[2] - l.pos[2];
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        const need = R + 0.001 - d;
        s.evict = { dir: [dx, dz], perTick: need / RULES.evictTicks, ticks: RULES.evictTicks };
        if (s.state === 'drain') s.state = 'wander';
      }
    }
  }
  // keep a shade out of every lit lantern's zone (blocked at the edge)
  clampSafe(s) {
    const R = this.t.safe_radius;
    for (const l of this.lanterns) {
      if (!this.hasZone(l)) continue;
      const d = distXZ(s.pos, l.pos);
      if (d <= R) {
        let dx = s.pos[0] - l.pos[0];
        let dz = s.pos[2] - l.pos[2];
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        s.pos[0] = l.pos[0] + dx * (R + 0.001);
        s.pos[2] = l.pos[2] + dz * (R + 0.001);
      }
    }
  }
  blockedForShade(x, z) {
    if (this.map.obstacles.some((o) => Math.hypot(x - o.center[0], z - o.center[1]) <= o.radius)) return true;
    return this.lanterns.some((l) => this.hasZone(l) && Math.hypot(x - l.pos[0], z - l.pos[2]) <= this.t.safe_radius);
  }

  // ---------- 7. pulse ----------
  pulse(ev) {
    const t = this.t;
    const p = this.player;
    p.carried -= t.pulse_cost;
    p.pulseCdTicks = secToTicks(t.pulse_cooldown_s);
    const c = [p.pos[0], p.pos[1] + RULES.pulseCenterDy, p.pos[2]];
    const ids = [];
    for (const s of [...this.shades].sort(byId)) {
      if (s.state === 'spawning' || dist3(s.pos, c) > t.pulse_radius) continue;
      let dx = s.pos[0] - c[0];
      let dz = s.pos[2] - c[2];
      const d = Math.hypot(dx, dz);
      if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      this.score += s.state === 'drain' ? t.score.per_stun_drain : t.score.per_stun;
      s.state = 'stunned';
      s.stateTicks = secToTicks(t.pulse_stun_s);
      s.push = { dir: [dx, dz], perTick: t.pulse_push_m / RULES.pulsePushTicks, ticks: RULES.pulsePushTicks };
      ids.push(s.id);
    }
    ev('pulse', { stunned_ids: ids });
    for (const d of [...this.drifters].sort(byId)) {
      if (dist3(d.pos, c) > t.pulse_radius) continue;
      if (d.state === 'chase') {
        d.state = 'flee';
        d.stateTicks = RULES.drifterFleeTicks;
      } else if (d.state === 'flee' && d.stolen > 0) {
        const amount = d.stolen;
        for (let i = 0; i < amount; i++) {
          const g = this.groundAt(d.pos[0], d.pos[2]);
          this.addMote([d.pos[0], g ?? 0, d.pos[2]], 'dropped', RULES.droppedTtl);
        }
        d.stolen = 0;
        d.stateTicks = RULES.drifterDropFleeTicks;
        ev('drifter_drop', { drifter_id: d.id, amount });
      }
    }
  }

  // ---------- 8. shades / drifters ----------
  moveShadeTowards(s, tx, tz, step) {
    const dx = tx - s.pos[0];
    const dz = tz - s.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < 1e-9) return;
    const m = Math.min(step, d);
    s.pos[0] += (dx / d) * m;
    s.pos[2] += (dz / d) * m;
  }
  followTerrain(e, dy) {
    const g = this.groundAt(e.pos[0], e.pos[2]);
    if (g !== null) e.pos[1] = g + dy;
  }
  resumeState(s) {
    const d = distXZ(s.pos, this.player.pos);
    return this.player.fallWaitTicks === 0 && d <= RULES.shadeDetect ? 'chase' : 'wander';
  }
  moveShades() {
    const p = this.player;
    const speed = (this.t.shade_speed * this.map.shadeSpeedMul) / TICK_RATE;
    const visible = p.fallWaitTicks === 0;
    for (const s of this.shades) {
      if (s.evict) {
        s.pos[0] += s.evict.dir[0] * s.evict.perTick;
        s.pos[2] += s.evict.dir[1] * s.evict.perTick;
        if (--s.evict.ticks === 0) s.evict = null;
        this.followTerrain(s, RULES.shadeY);
        continue;
      }
      // state timers ran out
      if (s.state === 'spawning' && s.stateTicks === 0) s.state = this.resumeState(s);
      else if (s.state === 'stunned' && s.stateTicks === 0) { s.state = 'wander'; s.push = null; } // Ticket-03: stun ends -> wander
      else if (s.state === 'recoil' && s.stateTicks === 0) s.state = this.resumeState(s);

      const d = distXZ(s.pos, p.pos);
      if (s.state === 'drain') {
        const l = this.lanterns.find((x) => x.id === s.target);
        if (visible && d <= RULES.drainBreakDist) s.state = 'chase';
        else if (!l || !l.lit || l.fuel >= this.lowFuelU || distXZ(s.pos, l.pos) > RULES.drainRange) s.state = 'wander';
      }
      if (s.state === 'wander' && visible && d <= RULES.shadeDetect) s.state = 'chase';
      else if (s.state === 'chase' && (!visible || d > RULES.shadeGiveUp)) { s.state = 'wander'; s.wanderTo = null; }

      if (s.state === 'stunned' && s.push && s.push.ticks > 0) {
        const nx = s.pos[0] + s.push.dir[0] * s.push.perTick;
        const nz = s.pos[2] + s.push.dir[1] * s.push.perTick;
        if (this.blockedForShade(nx, nz)) s.push.ticks = 0;
        else { s.pos[0] = nx; s.pos[2] = nz; s.push.ticks--; }
      } else if (s.state === 'chase') {
        this.moveShadeTowards(s, p.pos[0], p.pos[2], speed * s.speedMul);
      } else if (s.state === 'recoil' && s.recoilDir) {
        const nx = s.pos[0] + s.recoilDir[0] * (RULES.recoilDist / RULES.recoilTicks);
        const nz = s.pos[2] + s.recoilDir[1] * (RULES.recoilDist / RULES.recoilTicks);
        if (!this.blockedForShade(nx, nz)) { s.pos[0] = nx; s.pos[2] = nz; }
      } else if (s.state === 'wander') {
        this.wanderMove(s, speed);
      } // 'drain': stands still; the fuel is drained in step 2
      // obstacles and lit lanterns stop shades at their edge
      this.clampSafe(s);
      for (const o of this.map.obstacles) {
        const dd = Math.hypot(s.pos[0] - o.center[0], s.pos[2] - o.center[1]);
        if (dd <= o.radius) {
          const k = dd < 1e-9 ? 1 : (o.radius + 0.001) / dd;
          s.pos[0] = o.center[0] + (dd < 1e-9 ? o.radius + 0.001 : (s.pos[0] - o.center[0]) * k);
          s.pos[2] = o.center[1] + (dd < 1e-9 ? 0 : (s.pos[2] - o.center[1]) * k);
        }
      }
      this.followTerrain(s, RULES.shadeY);
    }
  }
  // Ticket-03: wander -> nearest lit lantern with fuel < threshold (tie: smaller id), else nearest unlit lantern
  nearestLantern(s, pred) {
    let best = null;
    let bestD = Infinity;
    for (const l of [...this.lanterns].sort(byId)) {
      if (!pred(l)) continue;
      const d = distXZ(s.pos, l.pos);
      if (d < bestD - 1e-12) { best = l; bestD = d; }
    }
    return best;
  }
  wanderMove(s, speed) {
    const weakOf = (l) => l.lit && l.fuel < this.lowFuelU;
    const preset = this.lanterns.find((l) => l.id === s.target);
    const weak = preset && weakOf(preset) ? preset : this.nearestLantern(s, weakOf);
    if (weak) {
      s.target = weak.id;
      this.moveShadeTowards(s, weak.pos[0], weak.pos[2], speed * RULES.weakSeekSpeedMul * s.speedMul);
      if (distXZ(s.pos, weak.pos) <= RULES.drainRange) {
        s.state = 'drain';
        s.drainTicks = 0;
      }
      return;
    }
    s.target = null;
    const off = this.nearestLantern(s, (l) => !l.lit);
    if (off && distXZ(s.pos, off.pos) > RULES.drainRange) {
      this.moveShadeTowards(s, off.pos[0], off.pos[2], RULES.shadeWanderSpeed / TICK_RATE);
      return;
    }
    // nothing to go to (or already at an unlit lantern): drift around
    if (!s.wanderTo || distXZ(s.pos, [s.wanderTo[0], 0, s.wanderTo[1]]) < 0.2) {
      const a = this.rng() * 2 * Math.PI;
      const r = 2 + this.rng() * 6;
      s.wanderTo = [s.pos[0] + r * Math.cos(a), s.pos[2] + r * Math.sin(a)];
    }
    this.moveShadeTowards(s, s.wanderTo[0], s.wanderTo[1], RULES.shadeWanderSpeed / TICK_RATE);
  }

  moveDrifters() {
    const p = this.player;
    const step = RULES.drifterSpeed / TICK_RATE;
    for (const d of this.drifters) {
      if (d.state === 'removed') continue;
      const dist = distXZ(d.pos, p.pos);
      const wants = p.carried >= RULES.drifterChaseCarry && dist <= RULES.drifterChaseDist && p.fallWaitTicks === 0;
      if (d.state === 'idle' && wants && !d.stoleOnce) d.state = 'chase';
      else if (d.state === 'chase' && !wants) { d.state = 'idle'; d.home = [d.pos[0], d.pos[2]]; d.angle = 0; }

      if (d.state === 'idle') {
        // slow circling glide (2 m/s on a 3 m circle around home)
        d.angle += RULES.drifterIdleSpeed / 3 / TICK_RATE;
        d.pos[0] = d.home[0] + 3 * Math.cos(d.angle) - 3;
        d.pos[2] = d.home[1] + 3 * Math.sin(d.angle);
      } else if (d.state === 'chase') {
        this.moveShadeTowards(d, p.pos[0], p.pos[2], step);
      } else if (d.state === 'flee') {
        let dx = d.pos[0] - p.pos[0];
        let dz = d.pos[2] - p.pos[2];
        const l = Math.hypot(dx, dz);
        if (l < 1e-9) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
        d.pos[0] += dx * step;
        d.pos[2] += dz * step;
        if (d.stateTicks === 0) d.state = 'removed';
      }
      this.followTerrain(d, RULES.drifterY);
    }
  }

  // ---------- 9. touches ----------
  touches(ev) {
    const t = this.t;
    const p = this.player;
    for (const d of [...this.drifters].sort(byId)) {
      if (d.state !== 'chase' || distXZ(d.pos, p.pos) > RULES.drifterTouch) continue;
      const amount = Math.min(RULES.drifterStealMax, p.carried);
      p.carried -= amount;
      d.stolen = amount;
      d.stoleOnce = true;
      d.state = 'flee';
      d.stateTicks = RULES.drifterFleeTicks;
      ev('drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
    }
    if (p.invulnTicks > 0) return;
    for (const s of [...this.shades].sort(byId)) {
      if ((s.state !== 'chase' && s.state !== 'wander') || s.evict) continue;
      if (distXZ(s.pos, p.pos) > t.shade_hit_radius * s.hitMul || Math.abs(s.pos[1] - p.pos[1]) > RULES.hitDy) continue;
      const dropped = Math.floor(p.carried * t.hit_drop_ratio);
      p.carried -= dropped;
      p.flames -= 1;
      p.invulnTicks = secToTicks(t.invuln_s);
      for (let i = 0; i < dropped; i++) {
        const a = this.rng() * 2 * Math.PI;
        const r = RULES.dropRingMin + this.rng() * (RULES.dropRingMax - RULES.dropRingMin);
        const x = p.pos[0] + r * Math.cos(a);
        const z = p.pos[2] + r * Math.sin(a);
        const g = this.groundAt(x, z);
        this.addMote([r3(x), g ?? p.pos[1], r3(z)], 'dropped', RULES.droppedTtl);
      }
      let dx = s.pos[0] - p.pos[0];
      let dz = s.pos[2] - p.pos[2];
      const l = Math.hypot(dx, dz);
      if (l < 1e-9) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
      s.state = 'recoil';
      s.stateTicks = RULES.recoilTicks;
      s.recoilDir = [dx, dz];
      ev('player_hit', { by: 'shade', flames: p.flames, dropped });
      break; // at most one flame lost per tick
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot() {
    const p = this.player;
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: r3(Math.max(0, this.timeLeft)),
      score: this.score,
      wind: { active: this.wind.active, dir_deg: this.wind.dirDeg },
      player: {
        pos: r3v(p.pos),
        vel: r3v(p.vel),
        grounded: p.grounded,
        invuln: p.invulnTicks > 0,
        flames: p.flames,
        carried: p.carried,
        capacity: this.capacity,
        dash_cd_s: r3(p.dashCdTicks / TICK_RATE),
        pulse_cd_s: r3(p.pulseCdTicks / TICK_RATE),
        charm_s: r3(p.charmTicks / TICK_RATE),
      },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited, fuel: l.lit ? r1(l.fuel / RULES.fuelUnit) : 0, ever_lit: l.everLit, relit_count: l.relitCount })),
      shades: this.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: r3v(m.pos), kind: m.kind, ttl_s: m.ttl === null ? null : r3(m.ttl / TICK_RATE) })),
      drifters: this.drifters.map((d) => ({ id: d.id, pos: r3v(d.pos), state: d.state, stolen: d.stolen })),
      charms: this.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: r3(c.respawnTicks / TICK_RATE) })),
    };
  }
}
