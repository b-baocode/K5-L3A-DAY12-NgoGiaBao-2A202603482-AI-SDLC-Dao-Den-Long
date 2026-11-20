# AGENTS.md — Đảo Đèn Lồng

3D third-person game (Three.js + Vite), 3 nights, with a headless mode graded by **Test Contract v1.1** (Ticket-02).

## Commands
- Install: `npm install` · Play: `npm start` · Build: `npm run build`
- Test (must be green before you finish): `npm test`
- Headless: `node src/headless.js --seed 1 --night <1|2|3> --ticks 600 --out out.jsonl [--scenario f] [--inputs f] [--snapshot-every N]`
- Proof (regenerates docs/proof/<phase>/): `npm run proof -- phase-N`

## Layout
- `src/sim/` — ALL game rules. Pure JS, no DOM, no `Math.random`, no wall clock. Deterministic via `rng.js`.
  `maps.js` = the 3 standard maps (ground height function, lanterns, spawn points, pads, charms). `game.js` = rules;
  `step()` follows the ticket's 12-step tick order — keep the numbered comments in sync if you touch it.
- `src/headless.js` — CLI; exit 0 ok, 2 bad inputs/scenario, 1 other error.
- `src/web/` — rendering + keyboard only. Never put rules here.
- `game.contract.json` — tuning = Ticket-02 standard numbers (fixed, do NOT tune). Rules not in tuning live in `RULES` (game.js).
- `tests/` — node:test. `scenarios/` — scenario/inputs pairs used by tests and proof.
- `docs/notes/` — assumptions per phase, AI log, retro. `docs/proof/` — generated evidence, never hand-edited.

## Rules
- Contract wording beats your intuition: quote the lab board text when unsure; log new assumptions in `docs/notes/phase-N.md`.
- Tick model: step k reads input of tick k -> state k+1; events carry tick k+1. Pause: `tick` advances, `sim_tick` frozen.
- Shade states must be exactly: spawning, wander, chase, recoil, stunned. Mote `kind` is random/dropped (creative field = `variant`).
- Tests: a new button press needs at least one released tick in between (the `press()` helper does not release by itself).
- Distances are XZ only, "within r" means `<= r`. Round output coords to 3 decimals.
- Creative extras must not change headless output: they sit behind `extras` (web only); `tests/extras.test.js` forbids `extras` in headless.js.
- Unclear ticket point -> write the assumption in `docs/notes/phase-N.md` (A-numbered) before coding it.
- When a new phase replaces a rule: update the test with a one-line reason; never delete or skip a test silently.
- Never write tests that always pass; never edit files in `docs/proof/` by hand.
- Small commits, one concern each.
