---
name: verify
description: Run the game headless against scenarios and save phase evidence. Use after any change to src/sim or game.contract.json, and before tagging a phase.
---

1. `npm test` — unit + contract tests. All must pass.
2. New behaviour? Add a `scenarios/<name>.scenario.json` (+ `<name>.inputs.json`) and an entry with a
   plain-language `desc` and an `expect` check in `scripts/proof.js`.
3. `npm run proof -- phase-N` — runs each scenario twice through the real CLI, checks byte-identical
   output (determinism), writes `docs/proof/phase-N/*.jsonl` + `SUMMARY.md`. Exit 1 if any FAIL.
4. A FAIL means: first decide whether the scenario or the game is wrong (quote the requirement), fix that,
   rerun. Never edit the generated files.
5. Link the SUMMARY rows from `docs/notes/phase-N.md` (requirement -> evidence -> result).
