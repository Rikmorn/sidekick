# .claude/

Claude Code configuration for this repo. The repo consumes its own plugin like any other repo, so nothing here is special to sidekick as a product.

| File | Purpose |
|---|---|
| `settings.json` | Shared settings: the plugin enablement and a PostToolUse hook that runs Biome on edited code files |
| `settings.local.json` | Local-only settings (permissions), untracked |
| `rules/sk-*.md` | The installed copies of the plugin's own rules, written by `sidekick rules install --project`; edit the source under `plugin/rules/` instead |
