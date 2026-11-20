// Web renderer: draws the shared Game simulation with Three.js. All rules live in src/sim.
import * as THREE from 'three';
import contract from '../../game.contract.json';
import { Game, DT, WORLD } from '../sim/game.js';

const T = contract.tuning;
const $ = (id) => document.getElementById(id);

// ---------- renderer & scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); // keeps frames capturable for evidence screenshots
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a0f2e, 0.022);
scene.background = new THREE.Color(0x120a22);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const ambient = new THREE.HemisphereLight(0x8a7ae0, 0x2a1840, 0.8);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0x9a8cff, 0.6);
moon.position.set(-20, 40, 10);
scene.add(moon);

// island + cloud sea
const island = new THREE.Mesh(
  new THREE.CylinderGeometry(WORLD.islandRadius, WORLD.islandRadius - 4, 3, 64),
  new THREE.MeshStandardMaterial({ color: 0x4f6650, roughness: 0.95 }),
);
island.position.y = -1.5;
scene.add(island);
const sea = new THREE.Mesh(new THREE.CircleGeometry(200, 48), new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 1 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -3.5;
scene.add(sea);
// a few rocks / trees as landmarks (decorative only)
const deco = new THREE.Group();
for (let i = 0; i < 24; i++) {
  const a = i * 2.39996;
  const r = 8 + ((i * 13) % 30);
  const tree = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 6), new THREE.MeshStandardMaterial({ color: 0x24392b }));
  tree.position.set(r * Math.sin(a), 1.5, r * Math.cos(a));
  deco.add(tree);
}
scene.add(deco);

// ---------- entity meshes ----------
function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 12), new THREE.MeshStandardMaterial({ color: 0x8fb3ff }));
  body.position.y = 0.75;
  g.add(body);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 20), new THREE.MeshStandardMaterial({ color: 0xe8d29a })); // nón lá
  hat.position.y = 1.65;
  g.add(hat);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  lamp.position.set(0.55, 1.25, 0);
  g.add(lamp);
  const light = new THREE.PointLight(0xffa040, 2.5, 9, 1.6);
  light.position.copy(lamp.position);
  g.add(light);
  g.userData.light = light;
  return g;
}
const playerMesh = makePlayer();
scene.add(playerMesh);

// ---------- entity looks per kind (creative extras) ----------
const moteGeo = new THREE.SphereGeometry(0.15, 8, 6);
const MOTE_LOOK = {
  normal: { mat: new THREE.MeshBasicMaterial({ color: 0xffe066 }), scale: 1 },
  gold: { mat: new THREE.MeshBasicMaterial({ color: 0xffa800 }), scale: 1.8 },   // Vàng Kim
  heal: { mat: new THREE.MeshBasicMaterial({ color: 0x5fffe0 }), scale: 1.5 },   // Ngọc Lam
};
const shadeGeo = new THREE.IcosahedronGeometry(0.8, 1);
const SHADE_LOOK = {
  normal: { mat: new THREE.MeshStandardMaterial({ color: 0x2a0f3d, emissive: 0x3a0f55, roughness: 0.4 }), scale: 1 },
  swift: { mat: new THREE.MeshStandardMaterial({ color: 0x3d0f5a, emissive: 0x8a2be2, roughness: 0.2 }), scale: 0.7 }, // Mực Lướt
  big: { mat: new THREE.MeshStandardMaterial({ color: 0x14061f, emissive: 0x24082f, roughness: 0.8 }), scale: 1.8 },  // Mực Khổng Lồ
};
const shadeStunMat = new THREE.MeshStandardMaterial({ color: 0x6a5a8a, emissive: 0x221133 });

// ---------- sound: synthesized with Web Audio (no audio files) ----------
const sfx = (() => {
  let ctx = null;
  const ensure = () => {
    if (!ctx) {
      try { ctx = new AudioContext(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  addEventListener('keydown', ensure, { once: true });
  addEventListener('pointerdown', ensure, { once: true });
  function tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0 } = {}) {
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
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  return {
    pick: (kind) => kind === 'gold' ? (tone(1320, 0.15), tone(1760, 0.2, { delay: 0.07 }))
      : kind === 'heal' ? (tone(660, 0.3, { type: 'triangle' }), tone(990, 0.4, { type: 'triangle', delay: 0.1 }))
      : tone(1100 + Math.random() * 200, 0.12, { vol: 0.08 }),
    deposit: () => tone(520, 0.25, { type: 'triangle', slide: 1.5, vol: 0.1 }),
    lit: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 1.2, { type: 'triangle', vol: 0.09, delay: i * 0.08 })),
    pulse: () => tone(300, 0.5, { type: 'sine', slide: 3, vol: 0.12 }),
    hit: () => tone(110, 0.5, { type: 'sawtooth', slide: 0.5, vol: 0.12 }),
    spawn: () => tone(70, 1.0, { type: 'sawtooth', slide: 0.7, vol: 0.05 }),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 1.5, { type: 'triangle', vol: 0.08, delay: i * 0.15 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.9, { type: 'sine', vol: 0.09, delay: i * 0.3 })),
  };
})();

// ---------- particles: light flying from Mây's hat-lantern into a Great Lantern ----------
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 4);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true });
const sparks = []; // { mesh, from, to, t, dur, arc }
function flySparks(from, to, n, color = 0xffc04d) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.material.color.setHex(color);
    scene.add(mesh);
    sparks.push({ mesh, from: from.clone(), to: to.clone(), t: -i * 0.08, dur: 0.7, arc: 2 + Math.random() * 1.5, side: (Math.random() - 0.5) * 2 });
  }
}
function burst(at, n = 24) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const to = at.clone().add(new THREE.Vector3(Math.cos(a) * 3.5, 1.5 + Math.random() * 2, Math.sin(a) * 3.5));
    flySparks(at, to, 1, 0xffd27a);
    sparks.at(-1).t = 0;
    sparks.at(-1).arc = 0.5;
    sparks.at(-1).fade = true;
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
    if (k >= 1) {
      scene.remove(s.mesh);
      s.mesh.material.dispose();
      sparks.splice(i, 1);
    }
  }
}

// ---------- story lines ----------
const STORY = {
  intro: 'Đêm nay sương đen đã nuốt hết ánh sáng của Đảo Bến. Mây ơi, hãy gom đom đóm và thắp lại 5 Đèn Lồng Lớn trước bình minh!',
  lit: [
    'Ngọn đèn đầu tiên bừng sáng — sương đen lùi lại một bước.',
    'Hai ngọn đèn! Tiếng sóng mây nghe đã ấm hơn.',
    'Ba ngọn đèn. Bóng Mực bắt đầu run rẩy.',
    'Chỉ còn một ngọn nữa thôi, Mây!',
    'Cả đảo rực sáng!',
  ],
  hint: { gold: 'Đom đóm Vàng Kim: giá trị gấp đôi!', heal: 'Đom đóm Ngọc Lam: hồi 1 ngọn lửa!' },
  shade: { swift: 'Một Mực Lướt xuất hiện — nhỏ nhưng rất nhanh!', big: 'Mực Khổng Lồ trồi lên — chậm, nhưng với rất xa!', normal: 'Một Bóng Mực mới trồi lên từ sương…' },
};
let toastTimer = 0;
function toast(text, secs = 3.5) {
  $('toast').textContent = text;
  $('toast').style.opacity = 1;
  toastTimer = secs;
}

const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xffc966, transparent: true, opacity: 0, side: THREE.DoubleSide }),
);
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);

let game, lanternMeshes, moteMeshes, shadeMeshes, pulseAnim;

function buildLantern(l) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3, 8), new THREE.MeshStandardMaterial({ color: 0x5a3d2b }));
  post.position.y = 1.5;
  g.add(post);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x553322, emissive: 0x000000 }));
  lamp.position.y = 3.3;
  g.add(lamp);
  const light = new THREE.PointLight(0xff9a3c, 0, 18, 1.4);
  light.position.y = 3.3;
  g.add(light);
  const safe = new THREE.Mesh(
    new THREE.RingGeometry(T.safe_radius - 0.08, T.safe_radius, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
  );
  safe.rotation.x = -Math.PI / 2;
  safe.position.y = 0.03;
  g.add(safe);
  g.position.set(l.pos[0], l.pos[1], l.pos[2]);
  g.userData = { lamp, light, safe };
  scene.add(g);
  return g;
}

function newGame() {
  if (lanternMeshes) for (const m of [...lanternMeshes.values(), ...moteMeshes.values(), ...shadeMeshes.values()]) scene.remove(m);
  game = new Game(T, { seed: (Math.random() * 2 ** 31) | 0, extras: true }); // web only: creative extras on
  lanternMeshes = new Map(game.lanterns.map((l) => [l.id, buildLantern(l)]));
  moteMeshes = new Map();
  shadeMeshes = new Map();
  pulseAnim = 0;
  $('overlay').style.display = 'none';
  toast(STORY.intro, 7);
}

function sync(mapping, list, create) {
  const seen = new Set();
  for (const e of list) {
    seen.add(e.id);
    if (!mapping.has(e.id)) {
      const m = create(e);
      scene.add(m);
      mapping.set(e.id, m);
    }
  }
  for (const [id, m] of mapping) if (!seen.has(id)) { scene.remove(m); mapping.delete(id); }
}

// ---------- input ----------
const keys = new Set();
let camYaw = 0; // degrees, same convention as contract cam_yaw_deg
let pulseHeld = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyR') newGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
let dragging = false;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 2) pulseHeld = true;
  else dragging = true;
});
addEventListener('pointerup', (e) => {
  if (e.button === 2) pulseHeld = false;
  else dragging = false;
});
addEventListener('pointermove', (e) => {
  if (dragging) camYaw -= e.movementX * 0.3;
});

function readInput() {
  // move [x, z]: z = forward (away from camera). Screen-right is world -x' (see docs/notes/phase-1.md).
  let x = 0;
  let z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x -= 1;
  return {
    move: [x, z],
    cam_yaw_deg: camYaw,
    jump: keys.has('Space'),
    interact: keys.has('KeyE'),
    pulse: keys.has('KeyF') || pulseHeld,
  };
}

// ---------- loop (fixed 60 Hz simulation, render every frame) ----------
let acc = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (keys.has('KeyQ')) camYaw += 90 * dt;
  if (keys.has('KeyC')) camYaw -= 90 * dt;
  acc += dt;
  while (acc >= DT) {
    if (game.state === 'playing') {
      game.applyFrame(readInput());
      game.step();
      for (const e of game.drainEvents()) onEvent(e);
    }
    acc -= DT;
  }
  updateSparks(dt);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;
  draw(now / 1000);
  requestAnimationFrame(frame);
}

const seenHints = new Set();
function hatLanternPos() {
  return playerMesh.localToWorld(new THREE.Vector3(0.55, 1.25, 0));
}
function onEvent(e) {
  if (e.name === 'pulse') { pulseAnim = 1; sfx.pulse(); }
  if (e.name === 'mote_picked') {
    sfx.pick(e.data.kind);
    if (STORY.hint[e.data.kind] && !seenHints.has(e.data.kind)) { seenHints.add(e.data.kind); toast(STORY.hint[e.data.kind]); }
  }
  if (e.name === 'deposit') {
    const l = game.lanterns.find((x) => x.id === e.data.lantern_id);
    flySparks(hatLanternPos(), new THREE.Vector3(l.pos[0], 3.3, l.pos[2]), e.data.amount);
    sfx.deposit();
  }
  if (e.name === 'lantern_lit') {
    const l = game.lanterns.find((x) => x.id === e.data.lantern_id);
    // the burst waits for the flying sparks to arrive
    setTimeout(() => { burst(new THREE.Vector3(l.pos[0], 3.3, l.pos[2])); sfx.lit(); }, 650);
    toast(STORY.lit[game.litCount() - 1]);
  }
  if (e.name === 'player_hit') sfx.hit();
  if (e.name === 'shade_spawned') {
    sfx.spawn();
    toast(STORY.shade[game.shades.find((s) => s.id === e.data.id)?.kind || 'normal']);
  }
  if (e.name === 'game_over') {
    if (e.data.result === 'won') sfx.win(); else sfx.lose();
    $('overlay').style.display = 'grid';
    $('ov-title').textContent = e.data.result === 'won' ? 'Đảo đã sáng trở lại!' : 'Đêm đã nuốt mất ánh sáng…';
    const why = { all_lit: 'Bạn đã thắp cả 5 Đèn Lồng Lớn.', dawn: 'Trời sáng trước khi kịp thắp hết đèn.', no_flames: 'Mây đã hết lửa.' };
    $('ov-text').textContent = `${why[e.data.reason]} Điểm: ${game.score}`;
  }
}

function draw(time) {
  const p = game.player;
  playerMesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const blink = p.invulnTicks > 0 && Math.floor(time * 12) % 2 === 0;
  playerMesh.visible = !blink;
  const [mx, mz] = game.input.move;
  if (mx || mz) {
    const th = (camYaw * Math.PI) / 180;
    playerMesh.rotation.y = Math.atan2(mx * Math.cos(th) + mz * Math.sin(th), -mx * Math.sin(th) + mz * Math.cos(th));
  }
  playerMesh.userData.light.intensity = 1 + p.carried * 0.6;

  // lanterns
  for (const l of game.lanterns) {
    const m = lanternMeshes.get(l.id).userData;
    const f = l.lit ? 1 : l.deposited / T.lantern_cost;
    m.lamp.material.emissive.setRGB(0.25 + 0.75 * f, 0.12 + 0.43 * f, 0.03 + 0.12 * f);
    m.light.intensity = l.lit ? 6 : f * 1.5;
    m.safe.material.opacity = l.lit ? 0.35 : 0;
  }
  // island brightens as lanterns are lit
  const litFrac = game.litCount() / game.lanterns.length;
  ambient.intensity = 0.8 + litFrac * 1.0;
  scene.fog.density = 0.022 - litFrac * 0.012;

  sync(moteMeshes, game.motes, (m) => {
    const look = MOTE_LOOK[m.kind] || MOTE_LOOK.normal;
    const mesh = new THREE.Mesh(moteGeo, look.mat);
    mesh.scale.setScalar(look.scale);
    return mesh;
  });
  for (const m of game.motes) {
    const mesh = moteMeshes.get(m.id);
    mesh.position.set(m.pos[0], 0.6 + 0.2 * Math.sin(time * 3 + m.pos[0]), m.pos[2]);
    if (m.kind !== 'normal' && MOTE_LOOK[m.kind]) mesh.scale.setScalar(MOTE_LOOK[m.kind].scale * (1 + 0.25 * Math.sin(time * 6))); // special ones twinkle
  }
  sync(shadeMeshes, game.shades, () => new THREE.Mesh(shadeGeo, SHADE_LOOK.normal.mat));
  for (const s of game.shades) {
    const m = shadeMeshes.get(s.id);
    const look = SHADE_LOOK[s.kind] || SHADE_LOOK.normal;
    m.position.set(s.pos[0], s.pos[1] + 0.15 * Math.sin(time * 4 + s.pos[2]), s.pos[2]);
    m.material = s.state === 'stunned' ? shadeStunMat : look.mat;
    m.rotation.y = time * (s.kind === 'swift' ? 3 : 1);
    // "Bóng Mực sợ đèn": shrink and tremble near a lit lantern (visual only)
    let fear = 0;
    for (const l of game.lanterns) {
      if (!l.lit) continue;
      const d = Math.hypot(s.pos[0] - l.pos[0], s.pos[2] - l.pos[2]);
      fear = Math.max(fear, 1 - Math.min(1, (d - T.safe_radius) / 4));
    }
    const shake = fear * 0.12 * Math.sin(time * 40 + s.pos[0]);
    m.position.x += shake;
    m.scale.setScalar(look.scale * (1 - 0.35 * fear));
  }

  if (pulseAnim > 0) {
    pulseAnim = Math.max(0, pulseAnim - 0.03);
    const r = T.pulse_radius * (1 - pulseAnim) + 0.5;
    pulseRing.scale.set(r, r, r);
    pulseRing.position.set(p.pos[0], 0.1, p.pos[2]);
    pulseRing.material.opacity = pulseAnim;
  }

  // third-person camera behind the player (forward = (sin θ, cos θ))
  const th = (camYaw * Math.PI) / 180;
  camera.position.set(p.pos[0] - Math.sin(th) * 9, p.pos[1] + 6, p.pos[2] - Math.cos(th) * 9);
  camera.lookAt(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  renderer.render(scene, camera);

  // HUD
  $('flames').textContent = '🔥'.repeat(Math.max(0, p.flames)) || '0';
  $('carried').textContent = `${p.carried}/${T.carry_capacity}`;
  $('lit').textContent = `${game.litCount()}/${game.lanterns.length}`;
  const tl = Math.max(0, game.timeLeft);
  $('time').textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  $('score').textContent = game.score;
  const cdMax = Math.round(T.pulse_cooldown_s * 60);
  const ready = p.carried >= T.pulse_cost ? 1 - p.cooldownTicks / cdMax : 0;
  document.querySelector('#cool > div').style.width = `${ready * 100}%`;
}

newGame();
Object.defineProperty(window, "__game", { get: () => game }); // read-only hook for evidence scripts
requestAnimationFrame(frame);
