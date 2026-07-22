# sidekick — repository guide for AI agents

This repo is the **source for a personal AI engineering harness**: installable Claude Code skills, agents, and rules plus the `sidekick` planning CLI. It is a single TypeScript package (not a monorepo).

See `README.md` for the workflow overview and install instructions.

## Project vs usage — the boundary

Keep two things distinct when working here:

- **The project (this repo):** the harness *source* — `bin/`, `agents/`, `skills/`, `rules/`. This is what you edit, build, and test.
- **The usage (consumer repos):** the `.sidekick/` working tree the harness *creates elsewhere* when someone runs `/sk-*` in their project. This repo does **not** carry its own `.sidekick/` — the only ones present are under `smokes/fixtures/`, which deliberately simulate consumer repos.

Consequence: tech-debt, config, or "should be gitignored" concerns about a `.sidekick/` tree belong to the *consumer's* repo, set up by `sidekick init` — not to this project. Don't add consumer `.sidekick/` rules to this repo's own `.gitignore`.

## What lives where

| Path | Purpose |
|---|---|
| `agents/sk-*.md` | Subagent specialist definitions (drafters, reviewers, checkers, researchers, executor, fixer, explorer) |
| `skills/sk-*/SKILL.md` | Slash-command orchestrators that run in the main session and dispatch the agents |
| `rules/sk-*.md` | Coding + working standards (`sk-clean-code`, `sk-typescript`, `sk-workflow`, `sk-working-standards`) |
| `bin/` | The `sidekick` CLI — `cli.ts` + `helpers/*.ts`, with colocated `*.test.ts` |
| `smokes/` | CLI smoke fixtures (`minimal-repo`, `wave-build`) using `.sidekick/` config + plans |
| `.claude/rules/sk-agent-prompts.md` | Prompt-authoring discipline for the `sk-*` toolchain |

## Working in this repo

- **Single package.** `package.json` is the only manifest. Bundle with `bun build` (Node target, `bin/` → `dist/cli.js`); typecheck with `tsc --noEmit`; test with `bun test` (`bin/**/*.test.ts`); lint/format with Biome. The shipped CLI runs on Node; Bun is the dev toolchain.
- **Commands:** `bun run build`, `bun run test`, `bun run typecheck`, `bun run check`, `bun run format`, `bun bin/cli.ts <cmd>` (runs the CLI from source).
- **Naming:** lowercase, hyphens. Agents and skills are prefixed `sk-`; the per-project config dir is `.sidekick/`.
- **Authoring agents/skills:** follow `.claude/rules/sk-agent-prompts.md`. In short — goal-oriented identity over procedures, constitutional constraints over step lists, few-shot examples *with reasoning*, minimal directive density. Orchestrators live in slash commands (skills), not subagents, because the runtime forbids subagents from dispatching subagents.
- **Structured output at boundaries only:** a specialist's deliverable is one JSON object in a final ```json``` fence; everything else is natural-language reasoning.

## The project knowledge graph

The repo compiles itself into a queryable graph (ADR-0007): entities (epics, items, ADRs, objectives, agents, skills, helpers, eval suites, research, backlog) and typed edges between them, derived from the text sources and rebuilt on demand.

- **Build it:** `bun bin/cli.ts graph build` — writes `.kb/graph.db` (gitignored, derived, safe to delete).
- **Use it:** the database exists so status, coverage, applicability, and what-changed questions are *queried*, not reconstructed by grep archaeology. Sources stay the authority; the graph is a rebuildable index of them.

  | Question | Command |
  |---|---|
  | What is this, and what is it wired to? | `graph query <id\|term> [--budget N]` |
  | What changed since I was last here? | `graph diff <ref> [ref]` — the session catch-up |
  | What is tested, and what is not? | `graph coverage` |
  | What is unfinished or unlinked? | `graph gaps` |
  | Is there a backlog note about what I am about to touch? | `graph applies <path\|name>` — run before starting work |
  | Is the corpus still coherent? | `graph lint` |

- Authored edges use the typed convention: frontmatter fields (`implements:`, `deps:`, `grounds:`, `advances:`, `applies-to:`) and body links of the form `- <relation> [[<target>]]`, drawn from a closed vocabulary the lint enforces.
- `sidekick graph` is repo-internal — it ships with the harness source, not with an installed copy.

## Conventions the runtime depends on

- `.sidekick/config.json` is the source of truth for branch + gate commands, read by `branch-precheck`, `check-drift`, and dispatched subagents. `rules/sk-workflow.md` documents its schema (it is reference, not a runtime input).
- `.sidekick/plans/<slug>/{RFC.md, PLAN.md}` paths and the `T-NN` / `D-NN` / `A-NN` / `R-NN` symbol conventions are hardcoded in helpers and prompts.
- `.sidekick/{cache,state}/` is gitignored and reconstructable from PLAN.md checkboxes + git commit scopes — never treat it as authority.
