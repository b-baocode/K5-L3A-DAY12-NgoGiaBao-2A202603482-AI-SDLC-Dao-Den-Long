---
name: verify
description: Run the game headless against scenarios and save phase evidence. Use after any change to src/sim or game.contract.json, and before tagging a phase.
---

1. `npm test` — rule, fuel (v1.2), contract and extras tests. All must pass. One full night must stay well under 30 s.
2. New behaviour? Add a `scenarios/<name>.scenario.json` (+ `<name>.inputs.json`) and an entry with `night`, a
   plain-language `desc` and an `expect` check in `scripts/proof.js` (`scenarioFrom`/`inputsFrom` reuse files).
3. `npm run proof -- phase-N` — runs each scenario twice through the real CLI, checks byte-identical
   output (determinism), writes `docs/proof/phase-N/*.jsonl` + `SUMMARY.md`. Exit 1 if any FAIL.
4. A FAIL means: first decide whether the scenario or the game is wrong (quote the requirement), fix that,
   rerun. Never edit the generated files.
5. Link the SUMMARY rows from `docs/notes/phase-N.md` (requirement -> evidence -> result).
6. Visual / UI requirements: build (`npm run build`), serve (`npx vite preview`), drive the page with a headless
   browser (puppeteer-core + Edge/Chrome, `--use-angle=swiftshader`), use `window.__ui` / `window.__game` to
   stage a moment, save screenshots + `window.__fps()` into `docs/proof/phase-N/`. Look at every screenshot.
