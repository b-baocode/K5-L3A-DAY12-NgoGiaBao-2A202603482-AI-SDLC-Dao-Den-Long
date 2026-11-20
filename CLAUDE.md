@AGENTS.md

Claude Code specifics:
- A Stop hook (`.claude/hooks/require-green.js`) runs `npm test` and blocks finishing while tests are red.
- Skill `verify` (`.claude/skills/verify/SKILL.md`) = how to run the game headless and save evidence.
