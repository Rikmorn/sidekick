# sidekick — repository guide for AI agents

This repo is a Claude Code plugin bundle and the one-plugin marketplace that serves it. Read `README.md` for what it is and how it installs; read ADR-0009 under `docs/adr/` for why it has this shape. Work state is on GitHub: issues, milestones, and the project board on `Rikmorn/sidekick`, per `plugin/rules/sk-pm-conventions.md`. Before starting work, run `gh issue list -R Rikmorn/sidekick --state all --search "<topic>"` to see whether anything is already filed.

## Layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | The marketplace `rikmorn`, listing the one plugin at `./plugin` |
| `plugin/.claude-plugin/plugin.json` | The plugin manifest: name `sidekick`, version, dependencies on superpowers and code-review |
| `plugin/rules/*.md` | The portable `sk-*` rules; the single source, delivered by `sidekick rules install` |
| `plugin/skills/` | Skills the plugin ships; `sidekick` today, the PM layer and the extensions later |
| `plugin/bin/sidekick` | The built executable, committed; rebuild with `bun run build` before a release |
| `bin/cli.ts`, `bin/helpers/rules.ts` | The executable's TypeScript source and its tests (`*.test.ts` beside them) |
| `.claude/rules/sk-*.md` | This repo's installed copies of its own rules, byte-identical to `plugin/rules/` |
| `docs/` | Records and steering docs; `docs/README.md` is the taxonomy |

## Working here

- One package, `package.json`. `bun run test`, `bun run typecheck`, `bun run check`, `bun run build`. Bun builds and tests; Node runs the executable.
- `claude plugin validate --strict .` and `claude plugin validate --strict plugin` gate the manifests. `tsc --noEmit` does not see `*.test.ts`; only `bun test` does.
- Rules are edited in `plugin/rules/`, then `node plugin/bin/sidekick rules install --project` refreshes this repo's copies. Never edit `.claude/rules/sk-*.md` directly.
- Prose follows `plugin/rules/sk-language.md`; guidance changes follow `plugin/rules/sk-guidance-authoring.md`; agent and skill prompts follow `plugin/rules/sk-agent-prompts.md`.
- Specs and plans live under `docs/superpowers/`, gitignored and transient. The durable record of a piece of work is its issue, its close comment, and any ADR or review it produced.

## Releasing

Bump `version` in both manifests, rebuild the executable, commit, then `claude plugin tag plugin --push -m "sidekick %s"` and `gh release create sidekick--v<version> --verify-tag`. Close the milestone last.
