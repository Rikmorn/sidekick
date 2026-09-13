# sidekick — repository guide for AI agents

This repo is the **source for a personal AI engineering harness**: installable Claude Code skills, agents, and rules plus the `sidekick` planning CLI. It is a single TypeScript package (not a monorepo).

**Read [`MAP.md`](MAP.md) first** — the generated entry map: what exists here, how much of it, and where. [`docs/STATE.md`](docs/STATE.md) carries the bench rollup and corpus freshness. Both are regenerated from the knowledge graph (below), never hand-edited. Work state is not in either: it lives on GitHub — issues, milestones and the board on `Rikmorn/sidekick` (`rules/sk-pm-conventions.md`).

See `README.md` for the workflow overview and install instructions.

## Project vs usage — the boundary

Keep two things distinct when working here:

- **The project (this repo):** the harness *source* — `bin/`, `agents/`, `skills/`, `rules/`. This is what you edit, build, and test.
- **The usage (consumer repos):** the `.sidekick/` working tree the harness *creates elsewhere* when someone runs `/sk-*` in their project. This repo does **not** carry its own `.sidekick/` — the only ones present are under `smokes/fixtures/`, which deliberately simulate consumer repos.

Consequence: tech-debt, config, or "should be gitignored" concerns about a `.sidekick/` tree belong to the *consumer's* repo, set up by `sidekick init` — not to this project. Don't add consumer `.sidekick/` rules to this repo's own `.gitignore`.

## What lives where

| Path | Purpose |
|---|---|
| `agents/sk-*.md` | Subagent specialist definitions (drafters, reviewers, checkers, the researcher, executor, fixer, explorer) |
| `skills/sk-*/SKILL.md` | Slash-command orchestrators that run in the main session and dispatch the agents |
| `rules/sk-*.md` | Coding + working standards (`sk-clean-code`, `sk-typescript`, `sk-language`, `sk-guidance-authoring`, `sk-working-standards`, `sk-pm-conventions`) |
| `bin/` | The `sidekick` CLI — `cli.ts` + `helpers/*.ts`, with colocated `*.test.ts` |
| `smokes/` | CLI smoke fixtures (`minimal-repo`, `wave-build`) using `.sidekick/` config + plans |
| `.claude/rules/sk-agent-prompts.md` | Prompt-authoring discipline for the `sk-*` toolchain |

## Working in this repo

- **Single package.** `package.json` is the only manifest. Bundle with `bun build` (Node target, `bin/` → `dist/cli.js`); typecheck with `tsc --noEmit`; test with `bun test` (`bin/**/*.test.ts`); lint/format with Biome. The shipped CLI runs on Node; Bun is the dev toolchain.
- **Commands:** `bun run build`, `bun run test`, `bun run typecheck`, `bun run check`, `bun run format`, `bun run dashboard` (prepare + Quarto-render the operator dashboard to `.kb/site/index.html`), `bun bin/cli.ts <cmd>` (runs the CLI from source).
- **Naming:** lowercase, hyphens. Agents and skills are prefixed `sk-`; the per-project config dir is `.sidekick/`.
- **Authoring agents/skills:** follow `.claude/rules/sk-agent-prompts.md`. In short — goal-oriented identity over procedures, constitutional constraints over step lists, few-shot examples *with reasoning*, minimal directive density. Orchestrators live in slash commands (skills), not subagents, because the runtime forbids subagents from dispatching subagents.
- **Structured output at boundaries only:** a specialist's deliverable is one JSON object in a final ```json``` fence; everything else is natural-language reasoning.

## The project knowledge graph

The repo compiles itself into a queryable graph (ADR-0007): entities (ADRs, agents, skills, CLI helpers, eval suites and cases, run sets, metrics, calibration certificates, research topics, documents) and typed edges between them, derived from the text sources and rebuilt on demand. It models the *content corpus* only — work state is GitHub's.

- **Build it:** `bun bin/cli.ts graph build` — writes `.kb/graph.db` (gitignored, derived, safe to delete).
- **Use it:** the database exists so status, coverage, applicability, and what-changed questions are *queried*, not reconstructed by grep archaeology. Sources stay the authority; the graph is a rebuildable index of them.

  | Question | Command |
  |---|---|
  | What is this, and what is it wired to? | `graph query <id\|term> [--budget N]` |
  | What changed since I was last here? | `graph diff <ref> [ref]` — the session catch-up |
  | What is tested, and what is not? | `graph coverage` |
  | What is unfinished or unlinked? | `graph gaps` |
  | Is anything already filed about what I am about to touch? | `gh issue list -R Rikmorn/sidekick --state all --search "<topic\|path>"` — run before starting work |
  | Is the corpus still coherent? | `graph lint` |

- Edges are extracted, not authored: ADR status lines state decision-to-decision relations, eval cases name their subject, run records name what they measured. The relation set is closed (`bin/helpers/graph-model.ts`).
- `sidekick graph` is repo-internal — it ships with the harness source, not with an installed copy.
- **Retrieval ordering:** board and issues (`gh`) for work state → MAP.md for what exists → graph commands for content questions → `Read` for depth → grep only when all of those miss. A graph miss on something the layer should know is a layer bug — note it in one line rather than silently routing around it.
- **Session start:** run the orient ritual — [`.claude/skills/orient/SKILL.md`](.claude/skills/orient/SKILL.md): build, diff since last visit, briefing. It is the cheap version of the catch-up this repo used to cost an afternoon.

## Conventions the runtime depends on

- `.sidekick/config.json` is the source of truth for branch + gate commands, read by `branch-precheck`, `check-drift`, and dispatched subagents. `bin/helpers/config.ts` defines its schema; `README.md` carries the scaffolding and usage-contract table.
- `.sidekick/plans/<slug>/{RFC.md, PLAN.md}` paths and the `T-NN` / `D-NN` / `A-NN` / `R-NN` symbol conventions are hardcoded in helpers and prompts.
- `.sidekick/{cache,state}/` is gitignored and reconstructable from PLAN.md checkboxes + git commit scopes — never treat it as authority.
