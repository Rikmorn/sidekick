# .claude/

Claude Code configuration for developing the sidekick harness itself (not distributed by `sidekick install`).

## Contents

| File | Purpose |
|---|---|
| `settings.json` | Shared settings — a PostToolUse hook that runs Biome on edited code files. |
| `settings.local.json` | Local-only settings (permissions). |
| `rules/sk-agent-prompts.md` | Prompt-authoring discipline for the `sk-*` agents and skills. Loaded as project context. |

## Note

The harness's own agents and skills live at the repo root (`agents/`, `skills/`, `rules/`) because they are **source to be installed** into `~/.claude/` via `sidekick install` — they are not this repo's own Claude Code agents. The only rule loaded for working *in* this repo is `rules/sk-agent-prompts.md`.
