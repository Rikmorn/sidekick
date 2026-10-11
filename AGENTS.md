# sidekick — repository guide for AI agents

This repo is a Claude Code plugin bundle and the one-plugin marketplace that serves it. Read `README.md` for what it is and how it installs; read ADR-0009 under `docs/adr/` for why it has this shape. Work state is on GitHub: issues, milestones, and the project board on `Rikmorn/sidekick`, per `plugin/rules/sk-pm-conventions.md`. Before starting work, run `gh issue list -R Rikmorn/sidekick --state all --search "<topic>"` to see whether anything is already filed.

## Layout

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | The marketplace `rikmorn`, listing the one plugin at `./plugin` |
| `plugin/.claude-plugin/plugin.json` | The plugin manifest: name `sidekick`, version, dependencies on superpowers and code-review |
| `plugin/rules/*.md` | The portable `sk-*` rules; the single source, delivered by `sidekick rules install` |
| `plugin/skills/` | Skills the plugin ships: the reference skill `sidekick`, the PM skills `sk-orient`, `sk-track`, and `sk-milestone`, the execution skills `sk-execute` and `sk-worker`, and the design skill `sk-design` |
| `plugin/agents/` | Agents the plugin ships: the sealed reviewer `sk-holistic-reviewer`, which `sk-milestone` dispatches to review a milestone's scope at Opening and its release at the close |
| `plugin/hooks/` | The session-start hook prints the board's pickup in a tracked repo. The Skill-tool hook points the model at `sk-design` when brainstorming loads. It gives `writing-plans` the plan stance and the handoff of `sk-execute`. The Read hook gives sidekick's reviewer lines to superpowers' reviewers and to the release check's |
| `plugin/bin/sidekick` | The built executable, committed. Rebuild it with `bun run build` in every commit that changes `bin/`; CI rebuilds with the bun its last line records and fails on any difference. Its co-located `package.json` declares `"type": "module"` to match the build format. Without it, Node takes the type from the nearest `package.json` up the tree, and `~/.claude/package.json` declares commonjs, so the installed CLI exits 0 silently |
| `bin/cli.ts`, `bin/helpers/` | The executable's TypeScript source and its tests (`*.test.ts` beside them) |
| `bin/prose.ts`, `bin/check-docs.ts` | Repo-only checks that the shipped CLI never imports: `bun run prose` runs Vale on Markdown, and `bun run check:docs` checks links, permalinks, and the docs layout. `bin/prose-style.test.ts` tests the Vale style, and `bin/check-docs.test.ts` tests the docs check |
| `bin/release-install.sh` | A repo-only script that the shipped CLI never runs. `bun run release:install` runs it as the last step of §Releasing |
| `.vale.ini`, `.vale/styles/Sidekick/` | The house prose style that `bun run prose` checks Markdown against |
| `docs/` | Records and steering docs; `docs/README.md` lists what sidekick adds to the docs layout |

## Working here

- One package, `package.json`. `bun run test`, `bun run typecheck`, `bun run check`, `bun run build`, `bun run prose <files>` for Markdown, and `bun run check:docs`, which checks Markdown links, permalinks, and the docs layout's indexes and status lines. Bun builds and tests; Node runs the executable.
- `claude plugin validate --strict .` and `claude plugin validate --strict plugin` gate the manifests. `tsc --noEmit` does not see `*.test.ts`; only `bun test` does.
- Work integrates by fast-forward onto `master`; this repo takes no pull requests.
- Rules are edited in `plugin/rules/`. This repo carries no copies: like the other home repos, it reads the user-level rules, which are always the released ones. A rule edit reaches `~/.claude/rules/` only through a release, so unreleased work stays out of every other repo; do not install rules from the repo bundle. For in-progress skills, agents, hooks, and the CLI, start the session with `claude --plugin-dir ./plugin`. Rules are not plugin content, so an edited rule takes effect after its release.
- Prose follows `plugin/rules/sk-language.md`; guidance changes follow `plugin/rules/sk-guidance-authoring.md`; agent and skill prompts follow `plugin/rules/sk-agent-prompts.md`.
- Specs and plans live under `docs/superpowers/`, gitignored and transient. The durable record of a piece of work is its issue, its close comment, and any ADR, research report, or learning record it produced.

## Releasing

`sk-milestone` §Closing runs the close, and this section is sidekick's release inside it. The skill checks the release as a whole before the ask, then writes the learning record and deletes the design folders. After the release, it posts the closing status update and closes the milestone. Start the closing session with `claude --plugin-dir ./plugin`, so the close runs the skills and the agent it ships.

Preparation runs before the ask and changes nothing but the working tree:

1. Bump the three `version` fields: `plugin/.claude-plugin/plugin.json`, and `metadata.version` and `plugins[0].version` in `.claude-plugin/marketplace.json`.
2. Run `bun run build`, then the gates §Working here names, and `claude plugin validate --strict` on `.` and on `plugin`.
3. Write the release notes under `docs/superpowers/`, which git ignores. Their Upgrading line gives the update commands in `README.md` §Install.

Publication runs after the yes:

1. Commit everything the preparation changed, with the record and the deletions.
2. Run `git push origin master`. The marketplace serves `origin/master`, so the update finds the release only after this push. Land nothing else on `master` until step 5 passes.
3. Run `claude plugin tag plugin --push -m "sidekick %s"`. It creates `sidekick--v<version>` and pushes it. It refuses a dirty tree, which is why the notes sit on an ignored path.
4. Run `gh release create sidekick--v<version> --verify-tag --title "sidekick <version>" --notes-file <notes>`.
5. Run `bun run release:install`. It updates the user install with `-s user` and stops unless that install's version matches `plugin.json`. Then it installs and checks the user-level rules from the released binary, never from `PATH`. Only an install from the released plugin writes user-level rules.

The milestone closes once step 5 passes. The session keeps the plugin it started with, and the next session loads the release. If step 5 stops, fix what it names and run it again, since each of its steps is safe to repeat. A defect in the shipped binary or rules takes a patch release before the milestone closes.
