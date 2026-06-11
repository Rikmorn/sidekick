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

**Requires** [Bun](https://bun.com) to build, and Node.js (≥20) to run the installed CLI. The workflow fan-out backend is **optional** — it additionally needs Claude Code ≥ 2.1.154 with dynamic workflows enabled. Run `sidekick capabilities` to check; everything else works without it.

`sidekick` is a private, unpublished package, so you install it **from a clone**:

```bash
git clone https://github.com/Rikmorn/sidekick.git
cd sidekick
bun install
bun run build              # bundle bin/ → dist/cli.js (Node target)
node dist/cli.js install   # or: bun bin/cli.ts install
```

`sidekick install` copies `skills/`, `agents/`, and `rules/` into `~/.claude/`, deploys the CLI bundle to `~/.claude/sidekick/bin/sidekick`, and writes a manifest at `~/.claude/sidekick/manifest.json` so `sidekick uninstall` is precise.

> The installed CLI is a small Node-run bundle, so Node is the only runtime requirement. To call `sidekick` as a bare command in your own projects, add `~/.claude/sidekick/bin` to your `PATH`; otherwise use the full path. The `sk-*` agents already invoke it by full path, so they work either way.

**Installing without a clone** isn't wired up yet: the package is unpublished and the build artifact (`dist/cli.js`) is gitignored, so `bunx github:…` / `npm i -g` have nothing to run. A no-clone install would require publishing to a registry (then `bunx sidekick install`) or adding a `prepare`-build and making the repo public.

### Set up a target project

`sidekick init` is the **single setup step** for a repo you want to work in. It:

- writes `.sidekick/config.json` (auto-detecting the default branch and gate commands), and
- ensures that repo's `.gitignore` covers `.sidekick/cache/` and `.sidekick/state/`.

```bash
cd your-project
sidekick init   # not on PATH? use ~/.claude/sidekick/bin/sidekick init
```

### Check what your environment supports

```bash
sidekick capabilities
```

Prints a JSON report: your Claude Code version, whether dynamic workflows are available (`likely` / `false` / `unknown` — plan-level gating isn't detectable), and what disabled them, if anything. The `/sk-design` research fan-out uses this probe to pick its backend automatically; everything in sidekick works without workflows (it falls back to in-session agents). See [docs/LIMITS.md](./docs/LIMITS.md) for the full limits-and-hardening picture.

`.sidekick/config.json` knobs for fan-out:

| Field | Values | Default | Meaning |
|---|---|---|---|
| `fanout.backend` | `auto` / `workflow` / `agents` | `auto` | How research fan-out dispatches. `auto` probes and prefers workflows when likely available. |
| `fanout.budget` | `quick` / `standard` / `deep` | `standard` | Fan-out width + verification depth. `deep` (adversarial cross-checking) is token-expensive and never used unless you opt in. |

### The workflow

| Skill | Does |
|---|---|
| `/sk-design <slug>` | Produces an RFC.md + PLAN.md design unit under `.sidekick/plans/<slug>/` |
| `/sk-build <slug>` | Executes PLAN.md wave-by-wave: executor → fresh gates → spec-review → atomic commit per task |
| `/sk-decide <topic>` | Records a MADR decision under `.sidekick/decisions/` |
| `/sk-review <slug>` | Multi-dimension review (correctness, maintainability, security, tests, architecture) |
| `/sk-goal-verify <slug>` | Goal-backward verification that the build delivered the plan's intent |
| `/sk-regen-plan <slug>` | Reconciles a PLAN.md against a changed RFC.md |

### A typical session

The `sk-*` skills are slash commands you run **inside Claude Code**, in a project you've `init`-ed. A feature usually flows:

```text
/sk-design refund-window       # research → RFC.md + PLAN.md under .sidekick/plans/refund-window/
/sk-build  refund-window       # execute the plan wave-by-wave; atomic commit per task
/sk-review refund-window       # multi-dimension review of the diff
/sk-goal-verify refund-window  # confirm the build delivered the plan's intent
```

On demand: `/sk-decide <topic>` records a MADR decision; `/sk-regen-plan <slug>` re-syncs a PLAN.md after its RFC.md changed. The CLI subcommands (`branch-precheck`, `check-drift`, `wave-plan`, `reconcile-plan`) are called by the skills and agents — you don't normally run them by hand.

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
bun install            # dev dependencies
bun run build          # bundle bin/ → dist/cli.js (bun build, node target)
bun run typecheck      # tsc --noEmit (types only)
bun run test           # CLI test suite (bun test, scoped to bin/)
bun run check          # biome lint + format check
bun bin/cli.ts <cmd>   # run the CLI from source — e.g. bun bin/cli.ts init
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
