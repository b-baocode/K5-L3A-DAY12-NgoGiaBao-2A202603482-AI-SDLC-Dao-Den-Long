// Web game: renders the shared Game simulation with Three.js. All rules live in src/sim.
import * as THREE from 'three';
import contract from '../../game.contract.json';
import { Game, DT, NIGHTS, RULES } from '../sim/game.js';
import { benchScenario } from '../sim/bench.js';
import { validName, makeEntry, addEntry, sortEntries } from '../sim/leaderboard.js';
// Ticket-04 benchmark mode: index.html?bench=<seed>&duration=<s> (driven by scripts/bench.js)
const BENCH_Q = new URLSearchParams(location.search);
const BENCH_MODE = BENCH_Q.has('bench');
import { makeSky, makeStars, makeGrass, makeRock, makeShadeMaterial, makePost, glowMaterial, glowTexture, windUniforms, prng } from './visuals.js';

const T = contract.tuning;
const $ = (id) => document.getElementById(id);

// ---------- standard palette (Ticket-02) ----------
const C = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lampOn: 0xffb347, lampCore: 0xffe9b0, lampOff: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shadeBody: 0x120a1a, shadeRim: 0x7a3cff, shadeStun: 0x3a3450, robe: 0xe8e2d0, scarf: 0xc8102e,
  gold: 0xf2c14e, drifter: 0x8fa3b8,
};

// ---------- settings (persisted) ----------
// Ticket-04 §4: every action can be remapped (saved); Escape always pauses as a safety hatch
const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'KeyP' };
const ACTION_LABELS = { up: 'Đi lên', down: 'Đi xuống', left: 'Sang trái', right: 'Sang phải', jump: 'Nhảy', dash: 'Lướt', interact: 'Tương tác (nạp / châm dầu)', pulse: 'Tỏa Sáng', pause: 'Tạm dừng' };
const settings = { volume: 0.7, sens: 0.4, colorblind: false, post: true, grass: 1600, reduce: false, large: false, keys: { ...DEFAULT_KEYS } };
try {
  if (!BENCH_MODE) Object.assign(settings, JSON.parse(localStorage.getItem('ddl-settings') || '{}')); // bench = default settings
  if (BENCH_MODE && BENCH_Q.has('post')) settings.post = BENCH_Q.get('post') !== '0'; // diagnostics only
  if (BENCH_MODE && BENCH_Q.has('grass')) settings.grass = parseInt(BENCH_Q.get('grass'), 10);
  settings.keys = { ...DEFAULT_KEYS, ...(settings.keys || {}) };
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem('ddl-settings', JSON.stringify(settings));
  } catch {}
};

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.FogExp2(C.fog, 0.012);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 700);
const post = makePost(renderer, scene, camera);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});
function renderFrame() {
  if (settings.post) post.composer.render();
  else renderer.render(scene, camera);
}
// sky dome + stars (follow the camera so they never get close)
const sky = makeSky(C.sky, C.fog);
const stars = makeStars();
scene.add(sky, stars);
// hemisphere light: purple sky <-> moss ground; intensity follows the ticket formula 0.15 + 0.55 x lit/total
const ambient = new THREE.HemisphereLight(0x8f7fe0, 0x2f5d50, 0.15);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0xb8c0ff, 1.1); // moonlight keeps the night readable
moon.position.set(-30, 60, 20);
scene.add(moon);
// sea of clouds: rolling low-poly surface, pink-violet tint fading into the fog
const seaGeo = new THREE.PlaneGeometry(700, 700, 70, 70);
{
  const rnd = prng(11);
  const pa = seaGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, (rnd() - 0.5) * 2.2);
  seaGeo.computeVertexNormals();
}
const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: C.sea, emissive: 0x2a1f4a, emissiveIntensity: 0.35, flatShading: true }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -9;
scene.add(sea);

// ---------- sound: synthesized (Web Audio), no files ----------
const audio = (() => {
  let ctx = null;
  let master = null;
  let music = null;
  const ensure = () => {
    if (!ctx) {
      try {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.connect(ctx.destination);
      } catch { return null; }
    }
    master.gain.value = settings.volume;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  function tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0, dest = null } = {}) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  // night music: slow pentatonic pad, a new chord every 4 s
  function startMusic() {
    const c = ensure();
    if (!c || music) return;
    const bus = c.createGain();
    bus.gain.value = 0.35;
    bus.connect(master);
    const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
    let i = 0;
    const play = () => {
      for (const f of chords[i++ % chords.length]) tone(f, 4.2, { type: 'sine', vol: 0.05, dest: bus });
      if (Math.random() < 0.6) tone([660, 784, 880, 988][Math.floor(Math.random() * 4)], 1.2, { type: 'triangle', vol: 0.03, delay: 1 + Math.random() * 2, dest: bus });
    };
    play();
    music = { timer: setInterval(play, 4000), bus };
  }
  function stopMusic() {
    if (music) { clearInterval(music.timer); music.bus.disconnect(); music = null; }
  }
  return {
    ensure, startMusic, stopMusic,
    setVolume: (v) => { if (master) master.gain.value = v; },
    pick: (v) => v === 'gold' ? (tone(1320, 0.15), tone(1760, 0.2, { delay: 0.07 })) : v === 'heal' ? (tone(660, 0.3, { type: 'triangle' }), tone(990, 0.4, { type: 'triangle', delay: 0.1 })) : tone(1100 + Math.random() * 200, 0.12, { vol: 0.08 }),
    deposit: () => tone(520, 0.25, { type: 'triangle', slide: 1.5, vol: 0.1 }),
    lit: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 1.2, { type: 'triangle', vol: 0.09, delay: i * 0.08 })),
    pulse: () => tone(300, 0.5, { slide: 3, vol: 0.12 }),
    hit: () => tone(110, 0.5, { type: 'sawtooth', slide: 0.5, vol: 0.12 }),
    jump: () => tone(440, 0.15, { type: 'square', slide: 1.6, vol: 0.05 }),
    dash: () => tone(900, 0.18, { type: 'sawtooth', slide: 0.4, vol: 0.06 }),
    spawn: () => tone(70, 1.0, { type: 'sawtooth', slide: 0.7, vol: 0.06 }),
    steal: () => tone(800, 0.4, { type: 'triangle', slide: 0.5, vol: 0.08 }),
    charm: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.05, delay: i * 0.06 })),
    tick: () => tone(1000, 0.08, { type: 'square', vol: 0.06 }),
    wind: () => tone(200, 2, { type: 'sawtooth', slide: 0.5, vol: 0.03 }),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 1.5, { type: 'triangle', vol: 0.08, delay: i * 0.15 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.9, { vol: 0.09, delay: i * 0.3 })),
  };
})();

// ---------- world building per night ----------
// Lambert (not PBR) + one shared material per colour: much cheaper per pixel, same faceted low-poly look
const matCache = new Map();
const mat = (color, extra = {}) => {
  const { roughness, ...rest } = extra; // eslint-disable-line no-unused-vars
  const key = `${color}|${JSON.stringify(rest)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...rest }));
  return matCache.get(key);
};
let world = null;
function buildWorld(n) {
  if (world) {
    scene.remove(world);
    world.traverse((o) => { o.geometry?.dispose?.(); });
  }
  world = new THREE.Group();
  const map = NIGHTS[n];
  const rnd = prng(100 + n);
  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); world.add(mesh); return mesh; };
  // island: faceted grass top, sandy shore ring, rocky underside hanging over the cloud sea
  const island = (r, x, z) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 40), mat(C.grass)), x, -0.3, z);
    const shore = add(new THREE.Mesh(new THREE.RingGeometry(r - 1.4, r, 40), mat(C.sand)), x, 0.02, z);
    shore.rotation.x = -Math.PI / 2;
    const under = add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.98, r * 0.55, 14, 2), mat(0x5a4a6e, { roughness: 1 })), x, -0.6 - r * 0.275, z);
    under.rotation.x = Math.PI;
    // crystal rocks on the rim and floating below
    for (let i = 0; i < Math.round(r * 0.5); i++) {
      const a = rnd() * 6.283;
      const rr = r - 0.6 - rnd() * 1.2;
      const rock = makeRock(rnd, [0x7a6a8e, 0x8e7aa0, 0x5f5577][i % 3], 0.5 + rnd() * 1.1);
      add(rock, x + rr * Math.cos(a), 0.2, z + rr * Math.sin(a));
    }
    for (let i = 0; i < 6; i++) {
      const a = rnd() * 6.283;
      const rr = r * (0.6 + rnd() * 0.6);
      add(makeRock(rnd, 0x6b5a85, 1 + rnd() * 2.5), x + rr * Math.cos(a), -6 - rnd() * 8, z + rr * Math.sin(a));
    }
  };
  const pad = (pp) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.18, 16), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.6 })), pp[0], pp[1] + 0.09, pp[2]);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: C.lampCore })), pp[0], pp[1] + 0.2, pp[2]);
    ring.rotation.x = Math.PI / 2;
  };
  let area = { x0: -40, x1: 40, z0: -40, z1: 40 };
  if (n === 1) island(40, 0, 0);
  if (n === 2) {
    island(28, 0, 0);
    island(28, 70, 0);
    area = { x0: -28, x1: 98, z0: -28, z1: 28 };
    add(new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mat(C.wood)), 35, -0.15, 0);
    for (let x = 26; x <= 44; x += 1.2) add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 4.1), mat(0x4e3522)), x, -0.1, 0);
  }
  if (n === 3) {
    island(45, 0, 0);
    area = { x0: -45, x1: 45, z0: -45, z1: 45 };
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    const t1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 24 }), mat(0x3a6a5a));
    t1.rotation.x = Math.PI / 2;
    add(t1, 0, 3, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(8, 8.4, 6, 20), mat(0x467a66)), 0, 3, 0);
    for (const a of [30, 150]) {
      const r = (a * Math.PI) / 180;
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), mat(C.sand));
      ramp.position.set(27 * Math.cos(r), 1.5 - 0.15, 27 * Math.sin(r));
      ramp.rotation.order = 'YZX';
      ramp.rotation.y = -r;
      ramp.rotation.z = Math.atan2(3, 6);
      world.add(ramp);
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 8), mat(0x8a7a96)), 0, 10, 0);
    add(new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.5, 8), mat(C.wood)), 0, 15.2, 0);
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.8 })), 0, 13, 0);
  }
  for (const pp of map.pads) pad(pp.pos);
  const clear = (x, z) => map.lanterns.some((l) => Math.hypot(l.pos[0] - x, l.pos[2] - z) < 3) || map.pads.some((q) => Math.hypot(q.pos[0] - x, q.pos[2] - z) < 2) || (x > 25 && x < 45 && Math.abs(z) < 3 && n === 2);
  // swaying grass blades (instanced) and broad teal leaves
  world.add(makeGrass(map.ground, area, settings.grass, 0x3f8a6e, clear, 20 + n));
  world.add(makeGrass(map.ground, area, Math.round(settings.grass / 4), 0x2a6b5a, clear, 40 + n));
  // low-poly trees: wooden trunk + faceted teal canopy
  for (let i = 0; i < 34; i++) {
    const x = area.x0 + rnd() * (area.x1 - area.x0);
    const z = area.z0 + rnd() * (area.z1 - area.z0);
    const g = map.ground(x, z);
    if (g === null || clear(x, z) || Math.hypot(x - map.start[0], z - map.start[2]) < 4) continue;
    const h = 1.6 + rnd() * 1.6;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 5), mat(C.wood)), x, g + h / 2, z);
    const c = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rnd() * 0.7, 0), mat([0x2f6f62, 0x3c7d6a, 0x285e55][i % 3])), x, g + h + 0.4, z);
    c.scale.y = 1.2 + rnd() * 0.6;
    c.rotation.y = rnd() * 6;
  }
  scene.add(world);
}

// ---------- entities ----------
function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 12), mat(C.robe));
  body.position.y = 0.75;
  g.add(body);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 8, 16), mat(C.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.25;
  g.add(scarf);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 20), mat(0xe8d29a));
  hat.position.y = 1.65;
  g.add(hat);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: C.lampOn }));
  lamp.position.set(0.55, 1.25, 0);
  g.add(lamp);
  const light = new THREE.PointLight(C.lampOn, 2.5, 10, 1.6);
  light.position.copy(lamp.position);
  g.add(light);
  g.userData.light = light;
  return g;
}
const playerMesh = makePlayer();
scene.add(playerMesh);

const VARIANT = { normal: C.moteCore, gold: 0xffa800, heal: 0x5fffe0 };
const MOTE_MAX = 512;
function makeMotePoints(size, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MOTE_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture(), size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const moteCore = makeMotePoints(0.55, 1);
const moteHalo = makeMotePoints(1.4, 0.55);
const moteSpecial = makeMotePoints(1.6, 1);
const tmpColor = new THREE.Color();
function drawMotes(time) {
  const fill = (pts, list, colorOf) => {
    const pa = pts.geometry.attributes.position;
    const ca = pts.geometry.attributes.color;
    let n = 0;
    for (const m of list) {
      if (n >= MOTE_MAX) break;
      pa.setXYZ(n, m.pos[0], m.pos[1] + 0.6 + 0.2 * Math.sin(time * 3 + m.pos[0]), m.pos[2]);
      tmpColor.setHex(colorOf(m));
      ca.setXYZ(n, tmpColor.r, tmpColor.g, tmpColor.b);
      n++;
    }
    pts.geometry.setDrawRange(0, n);
    pa.needsUpdate = true;
    ca.needsUpdate = true;
  };
  const blinkOff = Math.floor(time * 8) % 2 === 1;
  const visible = game.motes.filter((m) => !(m.kind === 'dropped' && m.ttl < 120 && blinkOff)); // expiring dropped motes blink
  const normal = visible.filter((m) => m.variant === 'normal');
  fill(moteCore, normal, () => C.moteCore);
  fill(moteHalo, normal, () => C.moteHalo);
  fill(moteSpecial, visible.filter((m) => m.variant !== 'normal'), (m) => VARIANT[m.variant]);
}
const shadeGeo = new THREE.IcosahedronGeometry(0.8, 1);
const rimGeo = new THREE.IcosahedronGeometry(0.92, 1);
const SHADE_SCALE = { normal: 1, swift: 0.7, big: 1.8 };
const rimColor = new THREE.Color(C.shadeRim);
const SHADE_MAX = 256;
const shadeBodies = new THREE.InstancedMesh(shadeGeo, makeShadeMaterial(C.shadeBody, rimColor, C.shadeStun), SHADE_MAX);
shadeBodies.geometry.setAttribute('aStun', new THREE.InstancedBufferAttribute(new Float32Array(SHADE_MAX), 1).setUsage(THREE.DynamicDrawUsage));
const shadeEyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: rimColor }), SHADE_MAX * 2);
for (const im of [shadeBodies, shadeEyes]) {
  im.count = 0;
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(im);
}
const _m = new THREE.Matrix4();
const _e = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const EYE_OFFSETS = [new THREE.Matrix4().makeTranslation(-0.25, 0.2, 0.72), new THREE.Matrix4().makeTranslation(0.25, 0.2, 0.72)];
function drawShades(time, p) {
  const stun = shadeBodies.geometry.attributes.aStun;
  let n = 0;
  for (const s of game.shades) {
    if (n >= SHADE_MAX) break;
    let fear = 0;
    for (const l of game.lanterns) {
      if (!l.lit) continue;
      const d = Math.hypot(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]);
      fear = Math.max(fear, 1 - Math.min(1, (d - T.safe_radius) / 4));
    }
    const grow = s.state === 'spawning' ? 1 - s.stateTicks / RULES.shadeSpawningTicks : 1;
    const k = (SHADE_SCALE[s.kind] || 1) * (1 - 0.35 * fear) * Math.max(0.05, grow);
    _p.set(s.pos[0] + fear * 0.12 * Math.sin(time * 40 + s.pos[0]), s.pos[1] + 0.15 * Math.sin(time * 4 + s.pos[2]), s.pos[2]);
    _q.setFromAxisAngle(_up, Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]) + (s.kind === 'swift' ? Math.sin(time * 6) * 0.4 : 0));
    _s.set(k, k, k);
    _m.compose(_p, _q, _s);
    shadeBodies.setMatrixAt(n, _m);
    stun.setX(n, s.state === 'stunned' ? 1 : 0);
    for (let e = 0; e < 2; e++) shadeEyes.setMatrixAt(n * 2 + e, _e.multiplyMatrices(_m, EYE_OFFSETS[e]));
    n++;
  }
  shadeBodies.count = n;
  shadeEyes.count = n * 2;
  shadeBodies.instanceMatrix.needsUpdate = true;
  shadeEyes.instanceMatrix.needsUpdate = true;
  stun.needsUpdate = true;
}
function makeDrifter() {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(2.6, 0.35, 12, 1);
  const ribbon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: C.drifter, side: THREE.DoubleSide, transparent: true, opacity: 0.85, emissive: C.drifter, emissiveIntensity: 0.25 }));
  g.add(ribbon);
  g.userData.ribbon = ribbon;
  return g;
}
function makeCharm() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.04), new THREE.MeshBasicMaterial({ color: C.gold })));
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.06), new THREE.MeshBasicMaterial({ color: C.scarf }));
  g.add(red);
  return g;
}
function buildLantern(l) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3, 8), mat(C.wood));
  post.position.y = 1.5;
  g.add(post);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), new THREE.MeshLambertMaterial({ color: C.lampOff, flatShading: true })); // own material: colour follows this lantern's fuel
  lamp.position.y = 3.3;
  g.add(lamp);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: C.lampCore }));
  core.position.y = 3.3;
  core.visible = false;
  g.add(core);
  const light = new THREE.PointLight(C.lampOn, 0, 20, 1.4);
  light.position.y = 3.3;
  light.visible = false;
  g.add(light);
  const safe = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.08, T.safe_radius, 48), new THREE.MeshBasicMaterial({ color: C.lampOn, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  safe.rotation.x = -Math.PI / 2;
  safe.position.y = 0.05;
  g.add(safe);
  // fuel bar (Ticket-03): background + fill, shown on lit lanterns
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x1b2350, transparent: true, opacity: 0.8, depthTest: false }));
  barBg.position.y = 4.3;
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.11), new THREE.MeshBasicMaterial({ color: C.lampOn, depthTest: false }));
  barFill.position.z = 0.01;
  barBg.add(barFill);
  barBg.renderOrder = 10;
  g.add(barBg);
  // torn paper: dark gashes on the shade, visible only when the lantern is out (shape cue, not colour)
  const tears = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.5), new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide }));
    const a = i * 2.1;
    t.position.set(0.51 * Math.sin(a), 3.3 + (i - 1) * 0.15, 0.51 * Math.cos(a));
    t.rotation.set(0, a, 0.5 - i * 0.4);
    tears.add(t);
  }
  g.add(tears);
  g.position.set(l.pos[0], l.pos[1], l.pos[2]);
  g.userData = { lamp, light, safe, core, barBg, barFill, tears };
  scene.add(g);
  return g;
}
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc966, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
// wind leaves (warning 2 s before + during the gust)
const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.25, 0.12), new THREE.MeshBasicMaterial({ color: 0x9bbf6a, side: THREE.DoubleSide }), 60);
leaves.visible = false;
scene.add(leaves);
const tmpM = new THREE.Matrix4();

// ---------- sparks (creative: light flying into a lantern) ----------
const sparkMats = {};
const sparkMat = (color) => (sparkMats[color] ||= glowMaterial(color, 1));
const sparks = [];
function flySparks(from, to, n, color = 0xffc04d, opts = {}) {
  for (let i = 0; i < n; i++) {
    if (sparks.length > 220) return; // hard cap keeps frame time stable
    const mesh = new THREE.Sprite(sparkMat(color));
    mesh.scale.setScalar(0.5);
    scene.add(mesh);
    sparks.push({ mesh, from: from.clone(), to: to.clone(), t: opts.t0 ?? -i * 0.05, dur: 0.7, arc: opts.arc ?? 2 + Math.random() * 1.5, side: (Math.random() - 0.5) * 2, fade: opts.fade });
  }
}
function burst(at, n = 24) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    flySparks(at, at.clone().add(new THREE.Vector3(Math.cos(a) * 3.5, 1.5 + Math.random() * 2, Math.sin(a) * 3.5)), 1, C.lampCore, { t0: 0, arc: 0.5, fade: true });
  }
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.t += dt;
    const k = Math.max(0, Math.min(1, s.t / s.dur));
    s.mesh.visible = s.t >= 0;
    s.mesh.position.lerpVectors(s.from, s.to, k);
    s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
    s.mesh.position.x += Math.sin(k * Math.PI) * s.side;
    s.mesh.scale.setScalar(0.5 * (s.fade ? 1 - k : 1) + 0.05);
    if (k >= 1) { scene.remove(s.mesh); sparks.splice(i, 1); }
  }
}

// ---------- story ----------
const STORY = {
  1: 'Ông Đăng: "Sương đen đã nuốt Đảo Bến. Đèn giờ cạn dầu dần — thắp lên rồi nhớ châm thêm đom đóm, giữ ít nhất ba ngọn sáng tới bình minh nhé, Mây."',
  2: 'Ông Đăng: "Đảo Cau có hai hòn, nối bằng cây cầu tre. Bục vàng sẽ bắn cháu qua biển mây — cẩn thận Gió Lạc, nó thích đom đóm lắm!"',
  3: 'Ông Đăng: "Đảo Chuông cao ba tầng, gió thổi mạnh từng cơn. Lên đỉnh tháp mà thắp ngọn đèn cuối, bình minh sẽ tới."',
  lit: ['Ngọn đèn đầu tiên bừng sáng — sương đen lùi lại một bước.', 'Thêm một ngọn đèn! Tiếng sóng mây nghe đã ấm hơn.', 'Bóng Mực bắt đầu run rẩy.', 'Sắp xong rồi, Mây!', 'Chỉ còn chút nữa thôi!', 'Gần tới rồi!', 'Cả đảo rực sáng!'],
  hint: { gold: 'Đom đóm Vàng Kim: giá trị gấp đôi!', heal: 'Đom đóm Ngọc Lam: hồi 1 ngọn lửa!' },
  shade: { swift: 'Một Mực Lướt xuất hiện — nhỏ nhưng rất nhanh!', big: 'Mực Khổng Lồ trồi lên — chậm, nhưng với rất xa!', normal: 'Một Bóng Mực trồi lên từ sương…' },
};
let toastTimer = 0;
function toast(text, secs = 3.5) {
  $('toast').textContent = text;
  $('toast').style.opacity = 1;
  toastTimer = secs;
}

// ---------- game session (3-night chain) ----------
let game = null;
let lanternMeshes = new Map();
let drifterMeshes = new Map();
let charmMeshes = new Map();
let mode = 'menu'; // menu | intro | play | pause | result | dawn
let currentNight = 1;
const nightScores = {};
let pulseAnim = 0;
let lastCountdown = -1;
let windWarned = -1;
const seenHints = new Set();

function clearEntities() {
  for (const map of [lanternMeshes, drifterMeshes, charmMeshes]) {
    for (const m of map.values()) scene.remove(m);
    map.clear();
  }
}
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
}
// compile every shader up front (three.js otherwise compiles lazily when an object first enters the view -> hitch)
function precompile() {
  for (const l of lanternMeshes.values()) for (const k of ['barBg', 'tears', 'core']) l.userData[k].visible = true;
  renderer.compile(scene, camera);
  if (settings.post) post.composer.render(); // also warms up the bloom/vignette passes
}
let sessionSeed = (Math.random() * 2 ** 30) | 0;
function newSession() {
  sessionSeed = (Math.random() * 2 ** 30) | 0;
  for (const k of Object.keys(nightScores)) delete nightScores[k];
}
const sessionTotal = () => Object.values(nightScores).reduce((a, b) => a + b, 0);
// ---------- leaderboard: disk via scripts/run.js (/api/leaderboard), localStorage fallback (vite dev / static host) ----------
async function loadLeaderboard() {
  try {
    const r = await fetch('api/leaderboard');
    if (r.ok) return (await r.json()).entries;
  } catch {}
  try { return sortEntries(JSON.parse(localStorage.getItem('ddl-leaderboard') || '[]')); } catch { return []; }
}
async function saveScore(name) {
  const body = { name, score: sessionTotal(), nights_won: Object.keys(nightScores).length, seed: sessionSeed };
  try {
    const r = await fetch('api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return true;
  } catch {}
  try {
    const entries = addEntry(JSON.parse(localStorage.getItem('ddl-leaderboard') || '[]'), makeEntry({ name, score: body.score, nightsWon: body.nights_won, seed: body.seed }));
    localStorage.setItem('ddl-leaderboard', JSON.stringify(entries));
    return true;
  } catch { return false; }
}
async function showLeaderboard() {
  const tb = $('lb-table').querySelector('tbody');
  tb.innerHTML = '';
  const entries = await loadLeaderboard();
  if (!entries.length) tb.innerHTML = '<tr><td colspan="5">Chưa có ai — hãy là người đầu tiên!</td></tr>';
  entries.forEach((e, i) => {
    const tr = document.createElement('tr');
    for (const [v, cls] of [[i + 1, 'num'], [e.name, ''], [e.score, 'num'], [`${e.nights_won}/3`, 'num'], [e.achieved_at.slice(0, 16).replace('T', ' '), '']]) {
      const td = document.createElement('td');
      td.textContent = v;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  });
  mode = 'menu';
  showScreen('s-lb');
}
function askName() {
  $('name-score').textContent = `Tổng điểm: ${sessionTotal()} · Đêm đã thắng: ${Object.keys(nightScores).length}/3`;
  $('name-err').textContent = '';
  showScreen('s-name');
  setTimeout(() => $('name-input').focus(), 50);
}
function startNight(n) {
  currentNight = n;
  clearEntities();
  buildWorld(n);
  game = new Game(T, { seed: sessionSeed + n, night: n, extras: true });
  lanternMeshes = new Map(game.lanterns.map((l) => [l.id, buildLantern(l)]));
  precompile();
  camYaw = 0;
  pulseAnim = 0;
  lastCountdown = -1;
  $('i-night').textContent = `Đêm ${n}`;
  $('i-name').textContent = NIGHTS[n].name;
  $('i-quote').textContent = STORY[n];
  mode = 'intro';
  showScreen('s-intro');
}
function play() {
  mode = 'play';
  showScreen(null);
  audio.ensure();
  audio.startMusic();
}
function pauseGame() {
  if (mode !== 'play') return;
  mode = 'pause';
  showScreen('s-pause');
}
function resume() {
  mode = 'play';
  showScreen(null);
}
let settingsReturn = 's-menu';
function openSettings() {
  settingsReturn = mode === 'pause' ? 's-pause' : 's-menu';
  $('set-vol').value = settings.volume;
  $('set-sens').value = settings.sens;
  $('set-cb').checked = settings.colorblind;
  $('set-post').checked = settings.post;
  $('set-reduce').checked = settings.reduce;
  $('set-large').checked = settings.large;
  capturing = null;
  renderKeybinds();
  showScreen('s-settings');
}
function toMenu() {
  mode = 'menu';
  audio.stopMusic();
  showScreen('s-menu');
}
function finishNight(result) {
  mode = 'result';
  const won = result === 'won';
  if (won) nightScores[currentNight] = game.score;
  $('r-title').textContent = won ? `Bình minh trên ${NIGHTS[currentNight].name}!` : 'Đêm đã nuốt mất ánh sáng…';
  const why = game.player.flames <= 0 ? 'Mây đã hết Ngọn Lửa.' : `Bình minh tới mà chỉ còn ${game.litCount()}/${game.lanterns.length} đèn sáng (cần ${game.winNeed()}).`;
  $('r-text').textContent = won ? `Giữ được ${game.litCount()}/${game.lanterns.length} đèn sáng tới sáng. Điểm Đêm ${currentNight}: ${game.score}` : `${why} Điểm đêm này không được tính.`;
  const btns = $('r-btns');
  btns.innerHTML = '';
  const b = (label, act) => { const x = document.createElement('button'); x.textContent = label; x.dataset.act = act; btns.appendChild(x); };
  if (won && currentNight < 3) b(`Sang Đêm ${currentNight + 1}`, 'next');
  if (won && currentNight === 3) b('Đón Bình Minh', 'dawn');
  if (!won) b('Chơi lại Đêm này', 'retry');
  if (!won) b('Lưu điểm vào bảng xếp hạng', 'save-score');
  b('Về menu', 'menu');
  setTimeout(() => showScreen('s-result'), 900);
}
document.addEventListener('click', (e) => {
  const act = e.target?.dataset?.act;
  if (!act) return;
  audio.ensure();
  if (act === 'start') { newSession(); startNight(1); }
  if (act === 'night2') { newSession(); startNight(2); }
  if (act === 'night3') { newSession(); startNight(3); }
  if (act === 'leaderboard') showLeaderboard();
  if (act === 'save-score') askName();
  if (act === 'name-skip') toMenu();
  if (act === 'name-save') {
    const name = $('name-input').value.trim();
    if (!validName(name)) { $('name-err').textContent = 'Tên cần 3–12 ký tự: chữ, số hoặc _'; return; }
    saveScore(name).then((ok) => (ok ? showLeaderboard() : ($('name-err').textContent = 'Không lưu được điểm.')));
  }
  if (act === 'kb-reset') { settings.keys = { ...DEFAULT_KEYS }; capturing = null; saveSettings(); renderKeybinds(); }
  if (act === 'play') play();
  if (act === 'next') startNight(currentNight + 1);
  if (act === 'retry') startNight(currentNight);
  if (act === 'resume') resume();
  if (act === 'menu') toMenu();
  if (act === 'settings') openSettings();
  if (act === 'settings-back') showScreen(settingsReturn);
  if (act === 'dawn') {
    const total = sessionTotal();
    $('d-text').textContent = `Tổng điểm các Đêm đã thắng: ${total}`; // the dawn screen offers "Lưu điểm" -> name entry
    mode = 'dawn';
    showScreen('s-dawn');
    audio.win();
  }
});
$('set-vol').addEventListener('input', (e) => { settings.volume = +e.target.value; audio.setVolume(settings.volume); saveSettings(); });
$('set-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; saveSettings(); });
$('set-cb').addEventListener('change', (e) => { settings.colorblind = e.target.checked; saveSettings(); applyPalette(); });
$('set-post').addEventListener('change', (e) => { settings.post = e.target.checked; saveSettings(); });
$('set-reduce').addEventListener('change', (e) => { settings.reduce = e.target.checked; saveSettings(); applyA11y(); });
$('set-large').addEventListener('change', (e) => { settings.large = e.target.checked; saveSettings(); applyA11y(); });
function applyA11y() {
  document.body.classList.toggle('reduce', settings.reduce);
  document.body.classList.toggle('large', settings.large);
}
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift trái').replace('ShiftRight', 'Shift phải').replace('Space', 'Space').replace(/^Arrow/, 'Mũi tên ');
function renderKeybinds() {
  const list = $('kb-list');
  list.innerHTML = '';
  const users = {};
  for (const [a, code] of Object.entries(settings.keys)) (users[code] ||= []).push(a);
  const dups = Object.entries(users).filter(([, as]) => as.length > 1);
  for (const a of Object.keys(DEFAULT_KEYS)) {
    const row = document.createElement('div');
    row.className = 'kb-row';
    const label = document.createElement('span');
    label.textContent = ACTION_LABELS[a];
    const b = document.createElement('button');
    b.textContent = capturing === a ? 'Nhấn phím…' : keyName(settings.keys[a]);
    b.dataset.rebind = a;
    if (users[settings.keys[a]].length > 1) b.classList.add('dup');
    row.append(label, b);
    list.appendChild(row);
  }
  $('kb-warn').textContent = dups.length
    ? `Trùng phím: ${dups.map(([code, as]) => `${keyName(code)} đang dùng cho ${as.map((x) => ACTION_LABELS[x]).join(' và ')}`).join('; ')}`
    : '';
}
document.addEventListener('click', (e) => {
  const a = e.target?.dataset?.rebind;
  if (!a) return;
  capturing = a;
  renderKeybinds();
});
// Ticket-03 §6: colour-blind palette — shade rim #00B3FF, UI danger white + ⚠ (CSS body.cb)
function applyPalette() {
  document.body.classList.toggle('cb', settings.colorblind);
  rimColor.setHex(settings.colorblind ? 0x00b3ff : C.shadeRim);
  for (const d of document.querySelectorAll('.rimdot')) d.style.background = settings.colorblind ? '#00b3ff' : '#7a3cff';
}

// ---------- input ----------
const keys = new Set();
let camYaw = 0;
let pulseHeld = false;
let capturing = null; // action waiting for a new key in Settings
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // typing a name must never be eaten by game key bindings
  if (capturing) {
    e.preventDefault();
    if (e.code !== 'Escape') settings.keys[capturing] = e.code;
    capturing = null;
    saveSettings();
    renderKeybinds();
    return;
  }
  if (e.code === 'Escape' || e.code === settings.keys.pause) {
    if (mode === 'play') pauseGame();
    else if (mode === 'pause') resume();
    return;
  }
  if (e.code === 'F3') { const f = $('fps'); f.style.display = f.style.display === 'block' ? 'none' : 'block'; e.preventDefault(); }
  if (mode === 'intro' && (e.code === 'Enter' || e.code === 'Space')) { play(); return; }
  keys.add(e.code);
  if (Object.values(settings.keys).includes(e.code) || ['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let dragging = false;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 2) pulseHeld = true; else dragging = true; });
addEventListener('pointerup', (e) => { if (e.button === 2) pulseHeld = false; else dragging = false; });
addEventListener('pointermove', (e) => { if (dragging && mode === 'play') camYaw -= e.movementX * settings.sens; });
function readInput() {
  let x = 0;
  let z = 0;
  const K = settings.keys;
  if (keys.has(K.up)) z += 1;
  if (keys.has(K.down)) z -= 1;
  if (keys.has(K.left)) x += 1; // screen-left = world +x' (see docs/notes/phase-1.md)
  if (keys.has(K.right)) x -= 1;
  return {
    move: [x, z], cam_yaw_deg: camYaw,
    jump: keys.has(K.jump), interact: keys.has(K.interact), pulse: keys.has(K.pulse) || pulseHeld,
    dash: keys.has(K.dash),
  };
}

// ---------- events -> feedback ----------
const hatPos = () => playerMesh.localToWorld(new THREE.Vector3(0.55, 1.25, 0));
function onEvent(e) {
  const n = e.name;
  if (n === 'pulse') { pulseAnim = 1; audio.pulse(); }
  if (n === 'dash') audio.dash();
  if (n === 'mote_picked') {
    audio.pick(e.data.variant);
    if (STORY.hint[e.data.variant] && !seenHints.has(e.data.variant)) { seenHints.add(e.data.variant); toast(STORY.hint[e.data.variant]); }
  }
  if (n === 'deposit') {
    const l = game.lanterns.find((x) => x.id === e.data.lantern_id);
    flySparks(hatPos(), new THREE.Vector3(l.pos[0], l.pos[1] + 3.3, l.pos[2]), Math.min(10, e.data.amount));
    audio.deposit();
  }
  if (n === 'lantern_lit') {
    flash('#ffe9b0', 0.18);
    const l = game.lanterns.find((x) => x.id === e.data.lantern_id);
    setTimeout(() => { burst(new THREE.Vector3(l.pos[0], l.pos[1] + 3.3, l.pos[2])); audio.lit(); }, 600);
    toast(e.data.relight ? `Đèn ${l.id} sáng lại!` : STORY.lit[Math.min(STORY.lit.length - 1, game.litCount() - 1)]);
  }
  if (n === 'refuel') {
    const l = game.lanterns.find((x) => x.id === e.data.lantern_id);
    flySparks(hatPos(), new THREE.Vector3(l.pos[0], l.pos[1] + 3.3, l.pos[2]), Math.min(10, e.data.amount));
    audio.deposit();
  }
  if (n === 'lantern_out') { audio.lose(); toast(`Đèn ${e.data.lantern_id} đã cạn dầu và tắt! Thắp lại chỉ cần ${T.relight_cost} đom đóm.`); }
  if (n === 'player_hit') {
    audio.hit();
    flash(settings.colorblind ? '#ffffff' : '#ff5a5f', 0.35);
    shakeT = 0.35;
    toast(e.data.by === 'fall' ? 'Mây rơi xuống biển mây… mất hết đom đóm đang mang!' : `Bị Bóng Mực chạm! Còn ${e.data.flames} Ngọn Lửa.`, 2.5);
  }
  if (n === 'shade_spawned') {
    audio.spawn();
    toast(`⚠ ${STORY.shade[game.shades.find((s) => s.id === e.data.id)?.kind || 'normal']}`, 3);
    shadeCue = { id: e.data.id, until: performance.now() + 4000 }; // edge arrow towards the new shade
  }
  if (n === 'drifter_steal') { audio.steal(); toast(`Gió Lạc cướp mất ${e.data.amount} đom đóm! Tỏa Sáng vào nó để lấy lại.`); }
  if (n === 'drifter_drop') toast('Gió Lạc đánh rơi đom đóm!');
  if (n === 'charm_picked') { audio.charm(); toast('Bùa Gió: chạy nhanh hơn, Lướt không hồi chiêu!'); }
  if (n === 'game_over') { if (e.data.result === 'won') audio.win(); else audio.lose(); finishNight(e.data.result); }
}

// ---------- loop ----------
let acc = 0;
let last = performance.now();
const fpsTimes = [];
window.__fps = () => (fpsTimes.length > 1 ? ((fpsTimes.length - 1) * 1000) / (fpsTimes.at(-1) - fpsTimes[0]) : 0);
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  fpsTimes.push(now);
  while (fpsTimes.length > 120) fpsTimes.shift();
  if (game && mode === 'play') {
    if (keys.has('KeyQ')) camYaw += 90 * dt;
    if (keys.has('KeyC')) camYaw -= 90 * dt;
    acc += dt;
    while (acc >= DT && mode === 'play') {
      const wasGrounded = game.player.grounded;
      game.applyFrame(readInput());
      game.step();
      if (wasGrounded && game.player.vy > 0 && !game.player.launch) audio.jump();
      for (const e of game.drainEvents()) onEvent(e);
      if (game.state !== 'playing') break;
      acc -= DT;
    }
  } else acc = 0;
  updateSparks(dt);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;
  windUniforms.uTime.value = now / 1000;
  stars.material.uniforms.uTime.value = now / 1000;
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  if (game && (mode === 'play' || mode === 'pause' || mode === 'result')) draw(now / 1000);
  else { flyOver(now / 1000); renderFrame(); }
  autoQuality(dt);
  $('fps').textContent = `${window.__fps().toFixed(0)} fps`;
  requestAnimationFrame(frame);
}

function sync(mapping, list, create, keep = () => true) {
  const seen = new Set();
  for (const e of list) {
    if (!keep(e)) continue;
    seen.add(e.id);
    if (!mapping.has(e.id)) { const m = create(e); scene.add(m); mapping.set(e.id, m); }
  }
  for (const [id, m] of mapping) if (!seen.has(id)) { scene.remove(m); mapping.delete(id); }
}

const v3 = new THREE.Vector3();
function draw(time) {
  const p = game.player;
  playerMesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  playerMesh.visible = !(p.invulnTicks > 0 && Math.floor(time * 12) % 2 === 0) && p.fallWaitTicks === 0;
  playerMesh.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
  playerMesh.userData.light.intensity = 1.2 + p.carried * 0.25;

  for (const l of game.lanterns) {
    const m = lanternMeshes.get(l.id).userData;
    const fuel = l.fuel / RULES.fuelUnit;
    const low = l.lit && fuel < T.low_fuel_threshold;
    const blinkOff = low && Math.floor(time) % 2 === 1; // 1 Hz slow blink when fuel < 30
    const cost = l.everLit ? T.relight_cost : T.lantern_cost;
    const f = l.lit ? 1 : l.deposited / cost;
    m.lamp.material.color.setHex(l.lit ? C.lampOn : C.lampOff);
    m.lamp.material.emissive.setHex(C.lampOn);
    m.lamp.material.emissiveIntensity = l.lit ? (blinkOff ? 0.25 : 0.9) : f * 0.4;
    m.lamp.scale.set(1, l.lit ? 1 : 0.8, 1); // unlit lanterns are squashed 20% (colour-independent cue)
    m.tears.visible = !l.lit;
    m.core.visible = l.lit && !blinkOff;
    m.light.intensity = l.lit ? (blinkOff ? 2 : 3 + 4 * Math.min(1, fuel / 100)) : f * 1.5;
    m.light.visible = l.lit || l.deposited > 0; // fewer active point lights = cheaper shading
    m.safe.material.opacity = game.hasZone(l) ? 0.35 : 0;
    m.barBg.visible = l.lit && !blinkOff;
    m.barBg.quaternion.copy(camera.quaternion);
    m.barFill.scale.x = Math.max(0.001, fuel / 100);
    m.barFill.position.x = -0.75 * (1 - fuel / 100);
    m.barFill.material.color.setHex(low ? (settings.colorblind ? 0xffffff : 0xff5a5f) : C.lampOn);
  }
  // drain: a stream of light flowing from the lantern into each draining shade
  for (const s of game.shades) {
    if (s.state !== 'drain' || Math.random() > 0.25) continue;
    const l = game.lanterns.find((x) => x.id === s.target);
    if (l) flySparks(new THREE.Vector3(l.pos[0], l.pos[1] + 3.3, l.pos[2]), new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]), 1, C.lampCore, { t0: 0, arc: 0.6, fade: true });
  }
  const litFrac = game.litCount() / game.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * litFrac; // Ticket-02 formula
  scene.fog.density = 0.016 - litFrac * 0.008;

  drawMotes(time);
  drawShades(time, p);
  sync(drifterMeshes, game.drifters, makeDrifter, (d) => d.state !== 'removed');
  for (const d of game.drifters) {
    const m = drifterMeshes.get(d.id);
    if (!m) continue;
    m.position.set(d.pos[0], d.pos[1], d.pos[2]);
    m.rotation.y = Math.atan2(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]) + Math.PI / 2;
    const pos = m.userData.ribbon.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.35 * Math.sin(time * 8 + pos.getX(i) * 2.5));
    pos.needsUpdate = true;
    m.userData.ribbon.material.opacity = d.state === 'flee' ? 0.5 : 0.85;
  }
  sync(charmMeshes, game.charms, makeCharm, (c) => c.available);
  for (const c of game.charms) {
    const m = charmMeshes.get(c.id);
    if (!m) continue;
    m.position.set(c.pos[0], c.pos[1] + 1 + 0.15 * Math.sin(time * 2), c.pos[2]);
    m.rotation.y = time * 1.5;
  }

  // wind leaves: warning 2 s before the gust, and during it
  const st = game.simTick;
  const untilGust = RULES.windEvery - (st % RULES.windEvery);
  const warn = game.windEnabled && untilGust <= 120 && untilGust > 0;
  if (warn && windWarned !== Math.floor(st / RULES.windEvery)) { windWarned = Math.floor(st / RULES.windEvery); audio.wind(); }
  leaves.visible = game.windEnabled && (warn || game.wind.active);
  if (leaves.visible) {
    const a = (game.wind.dirDeg * Math.PI) / 180;
    const sp = game.wind.active ? 6 : 2;
    for (let i = 0; i < 60; i++) {
      const ph = (time * sp + i * 1.7) % 24;
      const ox = ((i * 37) % 20) - 10;
      tmpM.makeRotationY(time * 3 + i);
      tmpM.setPosition(p.pos[0] - 12 * Math.cos(a) + Math.cos(a) * ph - Math.sin(a) * ox, p.pos[1] + 0.5 + (i % 5) * 0.6, p.pos[2] - 12 * Math.sin(a) + Math.sin(a) * ph + Math.cos(a) * ox);
      leaves.setMatrixAt(i, tmpM);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }
  $('h-wind').textContent = game.wind.active ? 'Gió mạnh!' : warn ? 'Gió sắp tới…' : '';

  if (pulseAnim > 0) {
    pulseAnim = Math.max(0, pulseAnim - 0.03);
    const r = T.pulse_radius * (1 - pulseAnim) + 0.5;
    pulseRing.scale.set(r, r, r);
    pulseRing.position.set(p.pos[0], p.pos[1] + 0.1, p.pos[2]);
    pulseRing.material.opacity = pulseAnim;
  }

  // third-person camera: forward = (sin θ, cos θ)
  const th = (camYaw * Math.PI) / 180;
  const fy = p.fallWaitTicks > 0 ? Math.max(p.pos[1], -6) : p.pos[1];
  if (bench) {
    // bench camera: circle r = 30 m at Y = 15 around (0,0,0), starts at 0° = (30,15,0), CCW seen from above, 15 s per lap
    const a = (2 * Math.PI * (performance.now() - bench.start)) / 15000;
    camera.position.set(30 * Math.cos(a), 15, 30 * Math.sin(a));
    camera.lookAt(0, 0, 0);
  } else {
    camera.position.set(p.pos[0] - Math.sin(th) * 9, fy + 6, p.pos[2] - Math.cos(th) * 9);
    camera.lookAt(p.pos[0], fy + 1.2, p.pos[2]);
    if (shakeT > 0) {
      shakeT -= 1 / 60;
      if (!settings.reduce) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0));
    }
  }
  // wind: grass bends harder during a gust (direction from the sim)
  const wa = (game.wind.dirDeg * Math.PI) / 180;
  windUniforms.uWindDir.value.set(Math.cos(wa), Math.sin(wa));
  windUniforms.uWind.value += ((game.wind.active ? 1 : 0) - windUniforms.uWind.value) * 0.05;
  renderFrame();
  drawHud();
}

// ---------- HUD ----------
for (let i = 0; i < 20; i++) $('h-motes').appendChild(document.createElement('i'));
let shadeCue = null;
let windToastAt = -1;
const lowWarned = new Set();
let shakeT = 0;
let flashA = 0;
function flash(color, alpha) {
  if (settings.reduce) return; // reduced motion: no screen flash
  $('flash').style.background = color;
  flashA = alpha;
}
function drawHud() {
  if (flashA > 0) { flashA = Math.max(0, flashA - 0.02); $('flash').style.opacity = flashA; }
  const p = game.player;
  $('h-flames').textContent = '🔥'.repeat(Math.max(0, p.flames)) + '·'.repeat(Math.max(0, T.flames - p.flames));
  $('h-charm').textContent = p.charmTicks > 0 ? `Bùa Gió ${Math.ceil(p.charmTicks / 60)}s` : '';
  const tl = Math.max(0, game.timeLeft);
  $('h-time').textContent = `${String(Math.floor(tl / 60)).padStart(2, '0')}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  $('h-time').classList.toggle('danger', tl <= 30);
  const sec = Math.ceil(tl);
  if (mode === 'play' && sec <= 10 && sec > 0 && sec !== lastCountdown) {
    lastCountdown = sec;
    audio.tick();
    if (sec === 10) toast('⏳ Còn 10 giây tới bình minh!', 3);
  }
  // subtitles: wind about to blow, lanterns running out of fuel
  if (game.windEnabled) {
    const untilGust = RULES.windEvery - (game.simTick % RULES.windEvery);
    if (untilGust === 120 && windToastAt !== game.simTick) { windToastAt = game.simTick; toast('🍃 Gió mạnh sắp thổi!', 2.5); }
  }
  for (const l of game.lanterns) {
    const low = l.lit && l.fuel < T.low_fuel_threshold * RULES.fuelUnit;
    if (low && !lowWarned.has(l.id)) { lowWarned.add(l.id); toast(`⚠ Đèn ${l.id} sắp cạn dầu — châm thêm đom đóm!`, 3); }
    if (!low) lowWarned.delete(l.id);
  }
  // arrow at the screen edge towards a newly spawned shade
  const sa = $('shade-arrow');
  const cueShade = shadeCue && performance.now() < shadeCue.until && game.shades.find((x) => x.id === shadeCue.id);
  sa.style.display = 'none';
  if (cueShade && mode === 'play') {
    v3.set(cueShade.pos[0], cueShade.pos[1], cueShade.pos[2]).project(camera);
    const behind = v3.z > 1;
    let x = behind ? -v3.x : v3.x;
    let y = behind ? -v3.y : v3.y;
    const k = 0.88 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
    if (behind || Math.abs(x) > 1 || Math.abs(y) > 1) { x *= k; y *= k; }
    sa.style.display = 'block';
    sa.style.left = `${((x + 1) / 2) * innerWidth - 14}px`;
    sa.style.top = `${((1 - y) / 2) * innerHeight - 15}px`;
    sa.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
  }
  $('h-lit').textContent = `${game.litCount()}/${game.lanterns.length}`;
  $('h-score').textContent = game.score;
  const cap = game.capacity;
  const cells = $('h-motes').children;
  for (let i = 0; i < 20; i++) {
    cells[i].style.display = i < cap ? 'block' : 'none';
    cells[i].classList.toggle('on', i < p.carried);
  }
  $('h-carry').textContent = `${p.carried} / ${cap}`;
  $('h-goal').textContent = `Bình minh cần ≥ ${game.winNeed()} đèn sáng`;
  const cd = (id, ticks, max, ready) => {
    $(id).querySelector('.fill').style.height = `${(1 - Math.min(1, ticks / max)) * 100}%`;
    $(id).classList.toggle('ready', ready);
  };
  cd('cd-dash', p.charmTicks > 0 ? 0 : p.dashCdTicks, Math.round(T.dash_cooldown_s * 60), p.dashCdTicks === 0 || p.charmTicks > 0);
  cd('cd-pulse', p.pulseCdTicks, Math.round(T.pulse_cooldown_s * 60), p.pulseCdTicks === 0 && p.carried >= T.pulse_cost);
  // prompt near an unlit lantern
  const near = game.lanterns.filter((l) => game.lanternNeed(l) > 0 && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= T.interact_radius);
  const pr = $('h-prompt');
  if (near.length && mode === 'play') {
    const l = near.sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];
    pr.textContent = l.lit
      ? `E — Châm dầu (${Math.floor(l.fuel / RULES.fuelUnit)}/${T.fuel_max})`
      : `E — Nạp ánh sáng (${l.deposited}/${l.everLit ? T.relight_cost : T.lantern_cost})`;
    pr.style.display = 'block';
  } else pr.style.display = 'none';
  // arrow to the nearest unlit lantern when it is off screen
  const arrow = $('h-arrow');
  const unlit = game.lanterns.filter((l) => !l.lit);
  arrow.style.display = 'none';
  if (unlit.length && mode === 'play') {
    const l = unlit.reduce((a, b) => (Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) <= Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]) ? a : b));
    v3.set(l.pos[0], l.pos[1] + 3.3, l.pos[2]).project(camera);
    const behind = v3.z > 1;
    if (behind || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) {
      let x = behind ? -v3.x : v3.x;
      let y = behind ? -v3.y : v3.y;
      const k = 0.85 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x *= k;
      y *= k;
      arrow.style.display = 'block';
      arrow.style.left = `${((x + 1) / 2) * innerWidth - 14}px`;
      arrow.style.top = `${((1 - y) / 2) * innerHeight - 15}px`;
      arrow.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
    }
  }
}

applyPalette();
applyA11y();
// ---------- benchmark (Ticket-04 §1) ----------
let bench = null;
function startBench(seed, duration) {
  clearEntities();
  buildWorld(1);
  // full effects and lighting as in play; creative extras OFF so every submission measures the same scene
  game = new Game(T, { seed, night: 1, scenario: benchScenario(seed), bench: true, extras: false });
  lanternMeshes = new Map(game.lanterns.map((l) => [l.id, buildLantern(l)]));
  currentNight = 1;
  mode = 'play';
  showScreen(null);
  precompile();
  bench = { seed, duration, start: 0, firstFrameEpoch: 0, dts: [], last: 0, done: false };
  window.__bench = bench;
  const tick = (now) => {
    if (bench.done) return;
    if (!bench.start) { bench.start = now; bench.firstFrameEpoch = Date.now(); bench.last = now; }
    else {
      const t = now - bench.start;
      // a frame belongs to the measurement only if it STARTED after the 3 s warm-up
      if (bench.last - bench.start >= 3000) bench.dts.push(now - bench.last);
      if (t > 3000 + duration * 1000) bench.done = true;
    }
    bench.last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// slow camera glide over the island for menu / intro / dawn screens (like the lab page background)
function flyOver(t) {
  const n = game ? currentNight : 1;
  const cx = n === 2 ? 35 : 0;
  const a = t * 0.06;
  const r = n === 2 ? 70 : 52;
  const h = 9 + 7 * (0.5 + 0.5 * Math.sin(t * 0.13));
  camera.position.set(cx + r * Math.cos(a), h, r * Math.sin(a));
  camera.lookAt(cx, 2, 0);
}
// keep >= 30 FPS: if post-processing makes the game drop below 28 FPS for 4 s, turn it off (not saved)
let lowFpsFor = 0;
function autoQuality(dt) {
  if (!settings.post || mode !== 'play' || bench) { lowFpsFor = 0; return; }
  lowFpsFor = window.__fps() < 28 ? lowFpsFor + dt : 0;
  if (lowFpsFor > 4) {
    settings.post = false;
    lowFpsFor = 0;
    toast('Đã tắt hiệu ứng hậu kỳ để giữ khung hình mượt (bật lại trong Cài đặt).');
  }
}
window.__scene = scene; window.__renderer = renderer;
Object.defineProperty(window, '__game', { get: () => game }); // read-only hook for evidence scripts
window.__ui = { startNight, play, pauseGame, resume, mode: () => mode, setYaw: (d) => { camYaw = d; } }; // hooks for evidence/demo scripts
buildWorld(1);
requestAnimationFrame(frame);
if (BENCH_MODE) {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  window.__glRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  window.__threeRevision = THREE.REVISION;
  startBench(parseInt(BENCH_Q.get('bench'), 10) || 42, parseFloat(BENCH_Q.get('duration')) || 30);
}
