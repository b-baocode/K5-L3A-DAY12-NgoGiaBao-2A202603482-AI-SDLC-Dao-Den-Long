# AGENTS.md — Đảo Đèn Lồng

3D third-person game (Three.js + Vite) with a headless mode graded by **Test Contract v1.0**.

## Commands
- Install: `npm install` · Play: `npm start` · Build: `npm run build`
- Test (must be green before you finish): `npm test`
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f] [--snapshot-every N]`
- Proof (regenerates docs/proof/<phase>/): `npm run proof -- phase-N`

## Layout
- `src/sim/` — ALL game rules. Pure JS, no DOM, no `Math.random`, no wall clock. Deterministic via `rng.js`.
- `src/headless.js` — CLI; exit 0 ok, 2 bad inputs/scenario, 1 other error.
- `src/web/` — rendering + keyboard only. Never put rules here.
- `game.contract.json` — single source of truth for tuning; sim reads it. Change a number there, never hard-code it.
- `tests/` — node:test. `scenarios/` — scenario/inputs pairs used by tests and proof.
- `docs/notes/` — assumptions per phase, AI log, retro. `docs/proof/` — generated evidence, never hand-edited.

## Rules
- Contract wording beats your intuition: quote the lab board text when unsure; log new assumptions in `docs/notes/phase-N.md`.
- Tick model: step k reads input of tick k -> state k+1; events carry tick k+1.
- Distances are XZ only, "within r" means `<= r`. Round output coords to 3 decimals.
- Creative extras must not change headless output (gate them out of `src/sim` or behind a flag that headless leaves off).
- When a new phase replaces a rule: update the test with a one-line reason; never delete or skip a test silently.
- Never write tests that always pass; never edit files in `docs/proof/` by hand.
- Small commits, one concern each.
