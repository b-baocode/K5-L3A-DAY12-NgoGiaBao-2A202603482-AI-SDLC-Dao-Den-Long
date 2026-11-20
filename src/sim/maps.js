// Standard maps for the 3 nights (Ticket-02, Part 2). Angles: from +X, pos = (r·cos a, y, r·sin a).
const r3 = (x) => {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
};
const rad = (d) => (d * Math.PI) / 180;
const polar = (cx, cz, r, aDeg, y = 0) => [r3(cx + r * Math.cos(rad(aDeg))), y, r3(cz + r * Math.sin(rad(aDeg)))];
const ring = (cx, cz, r, n, start, step, y = 0) => Array.from({ length: n }, (_, i) => polar(cx, cz, r, start + i * step, y));
const ids = (prefix, list) => list.map((pos, i) => ({ id: `${prefix}${i + 1}`, pos }));

function groundN1(x, z) {
  return Math.hypot(x, z) <= 40 ? 0 : null;
}
function groundN2(x, z) {
  if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
  if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // bamboo bridge, no railings
  return null;
}
const RAMPS_N3 = [30, 150];
function groundN3(x, z) {
  const r = Math.hypot(x, z);
  if (r > 45) return null;
  if (r <= 8) return 6; // tier 2 (bell tower in the middle is an obstacle, see obstacles)
  if (z > 0 && r >= 12 && r <= 24) return 3; // tier 1 half-annulus
  for (const a of RAMPS_N3) {
    const ux = Math.cos(rad(a));
    const uz = Math.sin(rad(a));
    const along = x * ux + z * uz;
    const perp = Math.abs(-x * uz + z * ux);
    if (perp <= 1.5 && along >= 24 && along <= 30) return (3 * (30 - along)) / 6; // 3 m wide ramp, r30 Y0 -> r24 Y3
  }
  return 0;
}

export const NIGHTS = {
  1: {
    name: 'Đảo Bến',
    duration_s: 300,
    start: [0, 0, 0],
    ground: groundN1,
    obstacles: [],
    lanterns: ids('L', [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
    motePoints: [...ring(0, 0, 12, 8, 0, 45), ...ring(0, 0, 33, 16, 0, 22.5)],
    shadePoints: ring(0, 0, 37, 12, 15, 30, 1),
    shadeEvery: 480,
    shadeMax: 6,
    shadeSpeedMul: 1,
    pads: [],
    charms: [],
    drifters: false,
    wind: false,
  },
  2: {
    name: 'Đảo Cau',
    duration_s: 330,
    start: [0, 0, 0],
    ground: groundN2,
    obstacles: [],
    lanterns: ids('L', [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
    motePoints: [
      ...ring(0, 0, 10, 4, 0, 90), ...ring(0, 0, 22, 8, 0, 45),
      ...ring(70, 0, 10, 4, 0, 90), ...ring(70, 0, 22, 8, 0, 45),
    ],
    shadePoints: [...ring(0, 0, 26, 8, 22.5, 45, 1), ...ring(70, 0, 26, 8, 22.5, 45, 1)],
    shadeEvery: 420,
    shadeMax: 8,
    shadeSpeedMul: 1,
    // feet touch pad -> launch: vy, horizontal speed towards the other island's centre
    pads: [
      { pos: [20, 0, 18], vy: 14, speed: 24, target: [70, 0, 0] },
      { pos: [50, 0, -18], vy: 14, speed: 24, target: [0, 0, 0] },
    ],
    charms: ids('C', [[35, 0, 0]]),
    drifters: true,
    wind: false,
  },
  3: {
    name: 'Đảo Chuông',
    duration_s: 360,
    start: [0, 0, -30], // ASSUMPTION A21: (0,0,0) is inside the bell tower on tier 2
    ground: groundN3,
    obstacles: [{ center: [0, 0], radius: 2, top: 14 }], // bell tower, 8 m tall on tier 2 (Y 6..14)
    lanterns: ids('L', [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
    motePoints: [...ring(0, 0, 34, 18, 0, 20), ...ring(0, 0, 18, 8, 20, 20, 3), ...ring(0, 0, 5, 4, 45, 90, 6)],
    shadePoints: ring(0, 0, 43, 16, 0, 22.5, 1),
    shadeEvery: 360,
    shadeMax: 10,
    shadeSpeedMul: 4.5 / 4.0,
    pads: [{ pos: [0, 3, 13], vy: 12, speed: 8, dir: [0, -1] }],
    charms: ids('C', [[30, 0, 25], [-30, 0, 25]]),
    drifters: true,
    wind: true,
  },
};
