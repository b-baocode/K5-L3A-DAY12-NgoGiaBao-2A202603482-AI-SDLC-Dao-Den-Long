// Validation of --inputs and --scenario files. Any problem -> InputError (headless exits 2).
export class InputError extends Error {}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isNonNegInt = (x) => Number.isInteger(x) && x >= 0;
const fail = (msg) => {
  throw new InputError(msg);
};

export function validateInputs(data) {
  if (!isObj(data) || !Array.isArray(data.frames)) fail('inputs: expected object with "frames" array');
  let last = -1;
  data.frames.forEach((f, i) => {
    const at = `inputs.frames[${i}]`;
    if (!isObj(f)) fail(`${at}: not an object`);
    if (!isNonNegInt(f.tick)) fail(`${at}.tick: must be a non-negative integer`);
    if (f.tick <= last) fail(`${at}.tick: ticks must be strictly increasing`);
    last = f.tick;
    if (f.move !== undefined && !(Array.isArray(f.move) && f.move.length === 2 && f.move.every(isNum)))
      fail(`${at}.move: must be [x, z] numbers`);
    if (f.cam_yaw_deg !== undefined && !isNum(f.cam_yaw_deg)) fail(`${at}.cam_yaw_deg: must be a number`);
    for (const b of ['jump', 'interact', 'pulse', 'dash'])
      if (f[b] !== undefined && typeof f[b] !== 'boolean') fail(`${at}.${b}: must be boolean`);
  });
  return new Map(data.frames.map((f) => [f.tick, f]));
}

export function validateScenario(sc, lanternCount = 5) {
  if (!isObj(sc)) fail('scenario: expected an object');
  if (sc.player !== undefined) {
    if (!isObj(sc.player)) fail('scenario.player: expected object');
    if (sc.player.pos !== undefined && !isVec3(sc.player.pos)) fail('scenario.player.pos: expected [x,y,z]');
    if (sc.player.carried !== undefined && !isNonNegInt(sc.player.carried)) fail('scenario.player.carried: integer >= 0');
    if (sc.player.flames !== undefined && !isNonNegInt(sc.player.flames)) fail('scenario.player.flames: integer >= 0');
  }
  for (const k of ['random_motes', 'random_shades'])
    if (sc[k] !== undefined && typeof sc[k] !== 'boolean') fail(`scenario.${k}: must be boolean`);
  if (sc.motes !== undefined) {
    if (!Array.isArray(sc.motes)) fail('scenario.motes: expected array');
    sc.motes.forEach((m, i) => {
      if (!isVec3(m)) fail(`scenario.motes[${i}]: expected [x,y,z]`);
    });
  }
  if (sc.shades !== undefined) {
    if (!Array.isArray(sc.shades)) fail('scenario.shades: expected array');
    const ids = new Set();
    sc.shades.forEach((s, i) => {
      if (!isObj(s) || !isVec3(s.pos)) fail(`scenario.shades[${i}]: expected {pos:[x,y,z]}`);
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || !s.id) fail(`scenario.shades[${i}].id: must be a non-empty string`);
        if (ids.has(s.id)) fail(`scenario.shades[${i}].id: duplicate id ${s.id}`);
        ids.add(s.id);
      }
    });
  }
  if (sc.lanterns !== undefined) {
    if (!Array.isArray(sc.lanterns)) fail('scenario.lanterns: expected array');
    const valid = new Set(Array.from({ length: lanternCount }, (_, i) => `L${i + 1}`));
    sc.lanterns.forEach((l, i) => {
      if (!isObj(l) || !valid.has(l.id)) fail(`scenario.lanterns[${i}].id: must be one of ${[...valid].join(',')}`);
      if (l.pos !== undefined && !isVec3(l.pos)) fail(`scenario.lanterns[${i}].pos: expected [x,y,z]`);
      if (l.lit !== undefined && typeof l.lit !== 'boolean') fail(`scenario.lanterns[${i}].lit: must be boolean`);
      if (l.deposited !== undefined && !isNonNegInt(l.deposited)) fail(`scenario.lanterns[${i}].deposited: integer >= 0`);
    });
  }
  if (sc.time_left_s !== undefined && !(isNum(sc.time_left_s) && sc.time_left_s >= 0))
    fail('scenario.time_left_s: number >= 0');
  return sc;
}
