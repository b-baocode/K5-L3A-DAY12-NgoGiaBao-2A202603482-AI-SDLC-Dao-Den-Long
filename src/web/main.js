// Web game: renders the shared Game simulation with Three.js. All rules live in src/sim.
import * as THREE from 'three';
import contract from '../../game.contract.json';
import { Game, DT, NIGHTS, RULES } from '../sim/game.js';

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
const settings = { volume: 0.7, sens: 0.4, colorblind: false };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('ddl-settings') || '{}'));
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem('ddl-settings', JSON.stringify(settings));
  } catch {}
};

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.FogExp2(C.fog, 0.016);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const ambient = new THREE.HemisphereLight(0x9aa8ff, 0x1b2350, 0.15);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0xaab4ff, 1.1); // moonlight keeps the night readable; ambient follows the ticket formula
moon.position.set(-30, 60, 20);
scene.add(moon);
const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: C.sea, roughness: 1 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -8;
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
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
let world = null;
function buildWorld(n) {
  if (world) scene.remove(world);
  world = new THREE.Group();
  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); world.add(mesh); return mesh; };
  const island = (r, x, z, h = 6) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, h, 64), mat(C.grass)), x, -h / 2, z);
    const rim = add(new THREE.Mesh(new THREE.RingGeometry(r - 1.2, r, 64), mat(C.sand)), x, 0.02, z);
    rim.rotation.x = -Math.PI / 2;
  };
  const pad = (p) => {
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.15, 24), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.4 })), p[0], p[1] + 0.08, p[2]);
    return m;
  };
  if (n === 1) island(40, 0, 0);
  if (n === 2) {
    island(28, 0, 0);
    island(28, 70, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mat(C.wood)), 35, -0.15, 0);
    for (let x = 26; x <= 44; x += 1.2) add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 4.1), mat(0x4e3522)), x, -0.1, 0);
  }
  if (n === 3) {
    island(45, 0, 0);
    // tier 1: half annulus r12-24, z>0, Y=3
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    const t1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 48 }), mat(C.grass));
    t1.rotation.x = Math.PI / 2; // shape y -> world z, extrude depth -> world -y
    add(t1, 0, 3, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 48), mat(C.grass)), 0, 3, 0); // tier 2
    for (const a of [30, 150]) {
      const r = (a * Math.PI) / 180;
      const len = Math.hypot(6, 3);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 3), mat(C.sand));
      ramp.position.set(27 * Math.cos(r), 1.5 - 0.15, 27 * Math.sin(r));
      ramp.rotation.order = 'YZX';
      ramp.rotation.y = -r;
      ramp.rotation.z = Math.atan2(3, 6); // rises toward the centre (Y3 at r24)
      world.add(ramp);
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 24), mat(0x8a7a66)), 0, 10, 0); // bell tower
    add(new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.5, 24), mat(C.wood)), 0, 15.2, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.3 })), 0, 13, 0);
  }
  for (const p of NIGHTS[n].pads) pad(p.pos);
  // decorative trees (not on paths): few, cheap
  const map = NIGHTS[n];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = 6 + ((i * 13) % 34);
    const x = r * Math.cos(a) + (n === 2 && i % 2 ? 70 : 0);
    const z = r * Math.sin(a);
    const g = map.ground(x, z);
    if (g === null || map.lanterns.some((l) => Math.hypot(l.pos[0] - x, l.pos[2] - z) < 4) || Math.hypot(x, z) < 3) continue;
    if (map.pads.some((p) => Math.hypot(p.pos[0] - x, p.pos[2] - z) < 3)) continue;
    add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 6), mat(0x1f3d33)), x, g + 1.5, z);
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

const moteGeo = new THREE.SphereGeometry(0.13, 8, 6);
const haloGeo = new THREE.SphereGeometry(0.3, 8, 6);
const VARIANT = { normal: C.moteCore, gold: 0xffa800, heal: 0x5fffe0 };
function makeMote(m) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({ color: VARIANT[m.variant] || C.moteCore })));
  g.add(new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: m.variant === 'normal' ? C.moteHalo : VARIANT[m.variant], transparent: true, opacity: 0.35, depthWrite: false })));
  if (m.variant !== 'normal') g.scale.setScalar(1.6);
  return g;
}
const shadeGeo = new THREE.IcosahedronGeometry(0.8, 1);
const rimGeo = new THREE.IcosahedronGeometry(0.92, 1);
const SHADE_SCALE = { normal: 1, swift: 0.7, big: 1.8 };
const rimColor = new THREE.Color(C.shadeRim);
function makeShade(s) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(shadeGeo, mat(C.shadeBody, { roughness: 0.4 }));
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: rimColor, wireframe: true, transparent: true, opacity: s.kind === 'swift' ? 0.9 : 0.55 }));
  g.add(body, rim);
  g.userData = { body, rim };
  return g;
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
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), mat(C.lampOff, { emissive: 0x000000 }));
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
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 4);
const sparks = [];
function flySparks(from, to, n, color = 0xffc04d, opts = {}) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
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
    if (s.fade) s.mesh.material.opacity = 1 - k;
    if (k >= 1) { scene.remove(s.mesh); s.mesh.material.dispose(); sparks.splice(i, 1); }
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
let moteMeshes = new Map();
let shadeMeshes = new Map();
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
  for (const map of [lanternMeshes, moteMeshes, shadeMeshes, drifterMeshes, charmMeshes]) {
    for (const m of map.values()) scene.remove(m);
    map.clear();
  }
}
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
}
function startNight(n) {
  currentNight = n;
  clearEntities();
  buildWorld(n);
  game = new Game(T, { seed: (Math.random() * 2 ** 31) | 0, night: n, extras: true });
  lanternMeshes = new Map(game.lanterns.map((l) => [l.id, buildLantern(l)]));
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
  b('Về menu', 'menu');
  setTimeout(() => showScreen('s-result'), 900);
}
document.addEventListener('click', (e) => {
  const act = e.target?.dataset?.act;
  if (!act) return;
  audio.ensure();
  if (act === 'start') { for (const k of Object.keys(nightScores)) delete nightScores[k]; startNight(1); }
  if (act === 'night2') startNight(2);
  if (act === 'night3') startNight(3);
  if (act === 'play') play();
  if (act === 'next') startNight(currentNight + 1);
  if (act === 'retry') startNight(currentNight);
  if (act === 'resume') resume();
  if (act === 'menu') toMenu();
  if (act === 'settings') openSettings();
  if (act === 'settings-back') showScreen(settingsReturn);
  if (act === 'dawn') {
    const total = Object.values(nightScores).reduce((a, b) => a + b, 0);
    $('d-text').textContent = `Tổng điểm các Đêm đã thắng: ${total}`;
    mode = 'dawn';
    showScreen('s-dawn');
    audio.win();
  }
});
$('set-vol').addEventListener('input', (e) => { settings.volume = +e.target.value; audio.setVolume(settings.volume); saveSettings(); });
$('set-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; saveSettings(); });
$('set-cb').addEventListener('change', (e) => { settings.colorblind = e.target.checked; saveSettings(); applyPalette(); });
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
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pauseGame();
    else if (mode === 'pause') resume();
    return;
  }
  if (e.code === 'F3') { const f = $('fps'); f.style.display = f.style.display === 'block' ? 'none' : 'block'; e.preventDefault(); }
  if (mode === 'intro' && (e.code === 'Enter' || e.code === 'Space')) { play(); return; }
  keys.add(e.code);
  if (['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
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
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x += 1; // screen-left = world +x' (see docs/notes/phase-1.md)
  if (keys.has('KeyD') || keys.has('ArrowRight')) x -= 1;
  return {
    move: [x, z], cam_yaw_deg: camYaw,
    jump: keys.has('Space'), interact: keys.has('KeyE'), pulse: keys.has('KeyF') || pulseHeld,
    dash: keys.has('ShiftLeft') || keys.has('ShiftRight'),
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
  if (n === 'player_hit') { audio.hit(); if (e.data.by === 'fall') toast('Mây rơi xuống biển mây… mất hết đom đóm đang mang!'); }
  if (n === 'shade_spawned') { audio.spawn(); toast(STORY.shade[game.shades.find((s) => s.id === e.data.id)?.kind || 'normal'], 2.5); }
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
  if (game) draw(now / 1000);
  else renderer.render(scene, camera);
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

  sync(moteMeshes, game.motes, makeMote);
  for (const m of game.motes) {
    const mesh = moteMeshes.get(m.id);
    mesh.position.set(m.pos[0], m.pos[1] + 0.6 + 0.2 * Math.sin(time * 3 + m.pos[0]), m.pos[2]);
    if (m.kind === 'dropped' && m.ttl < 120) mesh.visible = Math.floor(time * 8) % 2 === 0;
  }
  sync(shadeMeshes, game.shades, makeShade);
  for (const s of game.shades) {
    const m = shadeMeshes.get(s.id);
    const { body, rim } = m.userData;
    m.position.set(s.pos[0], s.pos[1] + 0.15 * Math.sin(time * 4 + s.pos[2]), s.pos[2]);
    body.material.color.setHex(s.state === 'stunned' ? C.shadeStun : C.shadeBody);
    rim.visible = s.state !== 'stunned';
    m.rotation.y = time * (s.kind === 'swift' ? 3 : 1);
    let fear = 0;
    for (const l of game.lanterns) {
      if (!l.lit) continue;
      const d = Math.hypot(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]);
      fear = Math.max(fear, 1 - Math.min(1, (d - T.safe_radius) / 4));
    }
    m.position.x += fear * 0.12 * Math.sin(time * 40 + s.pos[0]);
    const grow = s.state === 'spawning' ? 1 - s.stateTicks / RULES.shadeSpawningTicks : 1;
    m.scale.setScalar((SHADE_SCALE[s.kind] || 1) * (1 - 0.35 * fear) * Math.max(0.05, grow));
  }
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
  camera.position.set(p.pos[0] - Math.sin(th) * 9, fy + 6, p.pos[2] - Math.cos(th) * 9);
  camera.lookAt(p.pos[0], fy + 1.2, p.pos[2]);
  renderer.render(scene, camera);
  drawHud();
}

// ---------- HUD ----------
for (let i = 0; i < 20; i++) $('h-motes').appendChild(document.createElement('i'));
function drawHud() {
  const p = game.player;
  $('h-flames').textContent = '🔥'.repeat(Math.max(0, p.flames)) + '·'.repeat(Math.max(0, T.flames - p.flames));
  $('h-charm').textContent = p.charmTicks > 0 ? `Bùa Gió ${Math.ceil(p.charmTicks / 60)}s` : '';
  const tl = Math.max(0, game.timeLeft);
  $('h-time').textContent = `${String(Math.floor(tl / 60)).padStart(2, '0')}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  $('h-time').classList.toggle('danger', tl <= 30);
  const sec = Math.ceil(tl);
  if (mode === 'play' && sec <= 10 && sec > 0 && sec !== lastCountdown) { lastCountdown = sec; audio.tick(); }
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
Object.defineProperty(window, '__game', { get: () => game }); // read-only hook for evidence scripts
window.__ui = { startNight, play, pauseGame, resume, mode: () => mode };
buildWorld(1);
camera.position.set(0, 25, -45);
camera.lookAt(0, 0, 0);
requestAnimationFrame(frame);
