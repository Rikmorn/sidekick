# sidekick

A personal AI engineering harness for Claude Code — a structured **design → build → review** workflow, packaged as installable skills, agents, and rules plus a small planning CLI.

Inspired by [superpowers](https://github.com/) and GSD, shaped to one developer's way of breaking problems down and solutioning for them.

sidekick has **two sides**, kept deliberately separate:

- **The product** — the harness *source* in this repo: the `sidekick` CLI, the `sk-*` agents, skills, and rules. You build and test it here.
- **The usage** — what sidekick *creates in your other projects* when you run it there: a `.sidekick/` working tree. This repo never carries one (the only `.sidekick/` here lives under `smokes/fixtures/`, simulating a consumer repo).

---

## Using sidekick (in your projects)

Install once into Claude Code, then use it in any repo — same as gsd or superpowers.

### Install

`sidekick install` copies `skills/`, `agents/`, and `rules/` into `~/.claude/` and records a manifest at `~/.claude/sidekick/manifest.json` so `sidekick uninstall` is precise.

```bash
pnpm build
node dist/cli.js install
```

> Until this package is published to a registry, make `sidekick` resolvable: `pnpm link --global` after `pnpm build`, or call `node /path/to/sidekick/dist/cli.js`.

### Set up a target project

`sidekick init` is the **single setup step** for a repo you want to work in. It:

- writes `.sidekick/config.json` (auto-detecting the default branch and gate commands), and
- ensures that repo's `.gitignore` covers `.sidekick/cache/` and `.sidekick/state/`.

```bash
cd your-project
sidekick init
```

### The workflow

| Skill | Does |
|---|---|
| `/sk-design <slug>` | Produces an RFC.md + PLAN.md design unit under `.sidekick/plans/<slug>/` |
| `/sk-build <slug>` | Executes PLAN.md wave-by-wave: executor → fresh gates → spec-review → atomic commit per task |
| `/sk-decide <topic>` | Records a MADR decision under `.sidekick/decisions/` |
| `/sk-review <slug>` | Multi-dimension review (correctness, maintainability, security, tests, architecture) |
| `/sk-goal-verify <slug>` | Goal-backward verification that the build delivered the plan's intent |
| `/sk-regen-plan <slug>` | Reconciles a PLAN.md against a changed RFC.md |

### What sidekick writes into your repo (the usage contract)

Everything lives under `.sidekick/` at your repo root. `sidekick init` establishes it; the orchestrators maintain it. You never hand-edit the gitignore entries.

| Path | Tracked | Contents |
|---|---|---|
| `.sidekick/config.json` | **committed** | runtime config — default branch, gate commands, `waveSizeCap`, `buildCheckpoints` |
| `.sidekick/plans/<slug>/` | **committed** | `RFC.md`, `PLAN.md`, `RESEARCH.md` |
| `.sidekick/decisions/<slug>.md` | **committed** | MADR decision records |
| `.sidekick/backlog/<slug>.md` | **committed** | deferred ideas, one per file |
| `.sidekick/cache/` | gitignored | review / goal-verify trails |
| `.sidekick/state/` | gitignored | reconstructable build progress (authority is PLAN.md + git) |

---

## Developing sidekick (this repo)

The harness source. A single TypeScript package (no monorepo).

```bash
pnpm install          # dev dependencies
pnpm build            # compile bin/ → dist/ (tsc)
pnpm test             # CLI test suite (vitest)
pnpm check            # biome lint + format check
pnpm sidekick <cmd>   # run the CLI from source (tsx) — e.g. pnpm sidekick init
```

CLI subcommands: `install`, `uninstall`, `init`, `branch-precheck`, `check-drift`, `reconcile-plan`, `wave-plan`.

### Layout

| Path | Purpose |
|---|---|
| `agents/` | `sk-*` subagent specialist definitions |
| `skills/` | `sk-*` slash-command orchestrators |
| `rules/` | `sk-*` coding + working standards |
| `bin/` | the `sidekick` CLI (TypeScript source + tests) |
| `smokes/` | end-to-end CLI smoke fixtures (each simulates a consumer repo) |
| `.claude/` | this repo's own Claude Code config + the `sk-agent-prompts` authoring rule |

### Authoring

When writing or editing `sk-*` agents and skills, follow `.claude/rules/sk-agent-prompts.md` — the prompt-engineering discipline for this toolchain (goal-oriented identity, constitutional constraints, few-shot examples with reasoning, minimal directive density).
