# sidekick — repository guide for AI agents

This repo is a Claude Code plugin bundle and the one-plugin marketplace that serves it. Read `README.md` for what it is and how it installs; read ADR-0009 under `docs/adr/` for why it has this shape. Work state is on GitHub: issues, milestones, and the project board on `Rikmorn/sidekick`, per `plugin/rules/sk-pm-conventions.md`. Before starting work, run `gh issue list -R Rikmorn/sidekick --state all --search "<topic>"` to see whether anything is already filed.

## Layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | The marketplace `rikmorn`, listing the one plugin at `./plugin` |
| `plugin/.claude-plugin/plugin.json` | The plugin manifest: name `sidekick`, version, dependencies on superpowers and code-review |
| `plugin/rules/*.md` | The portable `sk-*` rules; the single source, delivered by `sidekick rules install` |
| `plugin/skills/` | Skills the plugin ships: the reference skill `sidekick`, the PM skills `sk-orient`, `sk-track`, and `sk-milestone`, the execution skills `sk-execute` and `sk-worker`, and the design skill `sk-design` |
| `plugin/hooks/` | The session-start hook that prints the board's pickup in a tracked repo, and the Skill-tool hook that points the model at `sk-design` when brainstorming loads |
| `plugin/bin/sidekick` | The built executable, committed; rebuild with `bun run build` before a release |
| `bin/cli.ts`, `bin/helpers/` | The executable's TypeScript source and its tests (`*.test.ts` beside them) |
| `.vale.ini`, `.vale/styles/Sidekick/` | The house prose style that `bun run prose` checks Markdown against |
| `docs/` | Records and steering docs; `docs/README.md` is the taxonomy |

## Working here

- One package, `package.json`. `bun run test`, `bun run typecheck`, `bun run check`, `bun run build`, and `bun run prose <files>` for Markdown. Bun builds and tests; Node runs the executable.
- `claude plugin validate --strict .` and `claude plugin validate --strict plugin` gate the manifests. `tsc --noEmit` does not see `*.test.ts`; only `bun test` does.
- Rules are edited in `plugin/rules/`. This repo carries no copies: like the other home repos it runs on user-level delivery. After editing, run `node plugin/bin/sidekick rules install --user`, then `node plugin/bin/sidekick rules check --user`. The `sidekick` on your PATH is the released plugin, and it installs the released rules, not your edit.
- Prose follows `plugin/rules/sk-language.md`; guidance changes follow `plugin/rules/sk-guidance-authoring.md`; agent and skill prompts follow `plugin/rules/sk-agent-prompts.md`.
- Specs and plans live under `docs/superpowers/`, gitignored and transient. The durable record of a piece of work is its issue, its close comment, and any ADR or review it produced.

## Releasing

Bump the three `version` fields (plugin.json, and both in marketplace.json), rebuild the executable, and commit. Then `claude plugin tag plugin --push -m "sidekick %s"` and `gh release create sidekick--v<version> --verify-tag --title "sidekick <version>" --notes-file <notes>`. Close the milestone last.
