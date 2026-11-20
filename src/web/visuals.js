// Visual style (render only — never imported by src/sim or headless).
// Follows the lab's visual brief: storybook low-poly, flat shading, gradient sky with stars, swaying grass,
// glowing fireflies, bloom + vignette. Uses only three.js and its bundled addons (MIT).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// deterministic pseudo-random for decoration placement (no effect on gameplay)
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- sky: gradient dome + twinkling stars ----------
export function makeSky(top, horizon) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) }, uGlow: { value: new THREE.Color(0x4a3a7a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; varying vec3 vP;
      void main(){ float h = clamp(vP.y, -0.2, 1.0);
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
        c = mix(c, uGlow, (1.0 - smoothstep(-0.05, 0.18, h)) * 0.55);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), mat);
  sky.renderOrder = -10;
  return sky;
}

export function makeStars(n = 900) {
  const rnd = prng(7);
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 * Math.PI;
    const v = 0.08 + rnd() * 0.9;
    const r = 300;
    pos[i * 3] = r * Math.cos(u) * Math.sqrt(1 - v * v);
    pos[i * 3 + 1] = r * v;
    pos[i * 3 + 2] = r * Math.sin(u) * Math.sqrt(1 - v * v);
    size[i] = 1 + rnd() * 2.5;
    phase[i] = rnd() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; varying float vA;
      void main(){ vA = 0.55 + 0.45 * sin(uTime * 1.7 + aPhase);
        gl_PointSize = aSize * (0.7 + 0.3 * vA); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(vec3(1.0, 0.96, 0.85), vA * (1.0 - d * 2.0)); }`,
  });
  return new THREE.Points(g, mat);
}

// ---------- soft round glow texture (fireflies, sparks) ----------
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
export function glowMaterial(color, opacity = 1) {
  return new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

// ---------- swaying grass (InstancedMesh, wind in the vertex shader) ----------
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) } };
export function makeGrass(ground, area, count, color, avoid = () => false, seed = 3) {
  const geo = new THREE.ConeGeometry(0.07, 0.75, 3, 1);
  geo.translate(0, 0.375, 0);
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = 'uniform float uTime; uniform float uWind; uniform vec2 uWindDir;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
       float h = position.y;
       float sway = sin(uTime * 2.2 + wp0.x * 0.45 + wp0.z * 0.31) * 0.12 + uWind * (0.35 + 0.15 * sin(uTime * 7.0 + wp0.x));
       transformed.x += h * sway * uWindDir.x;
       transformed.z += h * sway * uWindDir.y;`,
    );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rnd = prng(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 6; tries++) {
    const x = area.x0 + rnd() * (area.x1 - area.x0);
    const z = area.z0 + rnd() * (area.z1 - area.z0);
    const g = ground(x, z);
    if (g === null || avoid(x, z)) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
    const k = 0.6 + rnd() * 0.9;
    s.set(k, k, k);
    p.set(x, g, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ---------- low-poly crystal rocks ----------
const rockMats = new Map();
const rockMat = (color) => rockMats.get(color) || rockMats.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true })).get(color);
export function makeRock(rnd, color, size) {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + rnd() * 0.5;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (0.8 + rnd() * 0.7), pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, rockMat(color));
}

// ---------- Bóng Mực: dark body with a glowing fresnel rim ----------
export function makeShadeMaterial(body, rim, stun) {
  return new THREE.ShaderMaterial({
    uniforms: { uBody: { value: new THREE.Color(body) }, uRim: { value: rim }, uStun: { value: new THREE.Color(stun) }, uStunned: { value: 0 }, uTime: windUniforms.uTime },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uBody; uniform vec3 uRim; uniform vec3 uStun; uniform float uStunned; uniform float uTime; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
        vec3 body = mix(uBody, uStun, uStunned);
        vec3 rim = uRim * (1.6 + 0.4 * sin(uTime * 3.0)) * (1.0 - uStunned * 0.85);
        gl_FragColor = vec4(body + rim * f, 1.0); }`,
  });
}

// ---------- post-processing: bloom + vignette ----------
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.55 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - uStrength * smoothstep(0.35, 0.85, d); gl_FragColor = c; }`,
};
export function makePost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.85, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(VignetteShader));
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w / 2, h / 2); // half-resolution bloom keeps it cheap
    },
  };
}
