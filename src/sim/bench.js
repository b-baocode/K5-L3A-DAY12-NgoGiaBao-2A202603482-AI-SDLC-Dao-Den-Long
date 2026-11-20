// Standard benchmark scene (Ticket-04 §1): night 1, exactly 200 shades in `wander` and exactly 100 motes spread
// uniformly over the island with seed 42, L1-L3 lit with fuel 100, Mây standing at (0,0,0).
import { mulberry32 } from './rng.js';
import { NIGHTS } from './maps.js';

export const BENCH = { shades: 200, motes: 100, litLanterns: ['L1', 'L2', 'L3'], islandRadius: 38, shadeY: 1 };

export function benchScenario(seed = 42) {
  const rnd = mulberry32(seed);
  // uniform over the disc: r = R * sqrt(u)
  const point = (y) => {
    const a = rnd() * 2 * Math.PI;
    const r = BENCH.islandRadius * Math.sqrt(rnd());
    return [Math.round(r * Math.cos(a) * 1000) / 1000, y, Math.round(r * Math.sin(a) * 1000) / 1000];
  };
  return {
    player: { pos: [0, 0, 0] },
    random_motes: false,
    random_shades: false,
    random_drifters: false,
    wind_enabled: false,
    lanterns: NIGHTS[1].lanterns.map((l) => (BENCH.litLanterns.includes(l.id) ? { id: l.id, lit: true, fuel: 100 } : { id: l.id })),
    shades: Array.from({ length: BENCH.shades }, (_, i) => ({ id: `S${i + 1}`, pos: point(BENCH.shadeY), state: 'wander' })),
    motes: Array.from({ length: BENCH.motes }, () => point(0)),
  };
}
