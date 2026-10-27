# .claude/

Claude Code configuration for this repo. The repo consumes its own plugin like any other repo, so nothing here is special to sidekick as a product.

| File | Purpose |
|---|---|
| `settings.json` | Shared settings: the plugins it enables, the `rikmorn` marketplace, and a PostToolUse hook that runs Biome on edited code files |
| `settings.local.json` | Local-only settings (permissions), untracked |
| `worktrees/` | The worktrees Claude Code makes, such as a dispatched worker's `.claude/worktrees/<name>`, ignored by git |

No `rules/` directory: the plugin's own rules reach this repo through user-level delivery (`sidekick rules install --user`), the same as the other home repos.
