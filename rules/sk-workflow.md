# sk-* Workflow Configuration

The sk-* engineering toolchain reads its per-project configuration from `.sidekick/config.json` at repo root. This document describes what that file contains and how it's used.

## Source of truth

Runtime configuration lives in `.sidekick/config.json` (JSON, parsed by helpers). This file is the **source of truth** — it's read by `branch-precheck`, `check-drift`, and the dispatched subagents at runtime. This rule document is a **reference**, not a runtime input; the helpers do not parse this file.

## Schema (v1)

```json
{
  "schemaVersion": 1,
  "defaultBranch": "main",
  "gates": {
    "typecheck": "pnpm typecheck",
    "lint":      "pnpm lint",
    "test":      "pnpm test"
  },
  "waveSizeCap": 4,
  "buildCheckpoints": "deviations-only"
}
```

### Fields

| Field | Required | Purpose |
|---|---|---|
| `schemaVersion` | yes | Enables future schema migrations. Currently `1`. |
| `defaultBranch` | yes | The repo's default branch (`main` / `master` / `dev` / etc.). Used by `branch-precheck` to detect "you're on the default branch" before allowing `/sk-design` / `/sk-build`. |
| `gates.typecheck` | yes | Command run by `/sk-build` per task to verify types. |
| `gates.lint` | yes | Command run by `/sk-build` per task to verify lint. |
| `gates.test` | yes | Command run by `/sk-build` per task to verify tests. Most projects use a path-derived narrower scope (e.g., `pnpm test src/lib/foo`) — sk-executor will narrow as appropriate. |
| `waveSizeCap` | no (default `4`) | Caps the parallel `sk-spec-reviewer` verification fan-out per wave in `/sk-build`. (Reserved as the worktree-concurrency cap when M4 adds parallel writes.) |
| `buildCheckpoints` | no (default `deviations-only`) | Human-gate granularity in `/sk-build`: `deviations-only` (narrate clean waves, pause on deviations), `per-wave` (checkpoint every wave), `autonomous` (pause only on hard gates / unrecoverable errors). |

## How to scaffold

Run `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" init` at repo root. The command:

- Detects `defaultBranch` from `origin/HEAD` and a cascade (`main` / `master` / `dev` / `trunk` / `develop`).
- Detects gate commands from `package.json scripts.*`.
- Prompts you to confirm or override each value.
- Writes `.sidekick/config.json`.

Re-running `init` overwrites the existing config with the new values.

## Folder convention (informational)

sk-* artifacts live under `.sidekick/` at repo root:

- `.sidekick/plans/<slug>/` — RFC.md, PLAN.md, RESEARCH.md for each design unit
- `.sidekick/decisions/<slug>.md` — MADR decision docs from `/sk-decide`
- `.sidekick/backlog/<concern-slug>.md` — deferred ideas, one per file
- `.sidekick/config.json` — this file's runtime sibling

These paths are **hardcoded** in sk-* helpers and subagents in v1. Path customisation is deferred to v1.x.

## PLAN.md task format

Each task block in a PLAN.md's `## Tasks` section follows this shape:

```markdown
### T-NN: <title>

**Deps:** T-01, T-02
**Files:**
- Create: `path/to/new-file.ts`
- Modify: `path/to/existing.ts`
- Test: `path/to/new-file.test.ts`
```

**`Deps:`** — inline comma-separated list of `T-NN` identifiers this task requires to be complete before it can start. Root tasks (no prerequisites) leave the value empty: `**Deps:**` with nothing after it.

**`Files:`** — bullet list under three optional sub-labels:
- `Create:` — files that will be created from scratch (path in backticks)
- `Modify:` — files that already exist and will be changed (path in backticks)
- `Test:` — test files written or updated as part of this task (path in backticks)

### Wave computation

`sidekick wave-plan <slug>` reads the `**Deps:**` and `**Files:**` lines from `.sidekick/plans/<slug>/PLAN.md` and computes execution waves:

1. **Topological order from `Deps:`** — tasks whose deps are all satisfied in earlier waves move to the next wave.
2. **File-overlap serialization** — two dependency-independent tasks that touch the same file are placed in different waves; the file overlap is treated as an ordering constraint even if no explicit dep is declared.

The result is a sequence of waves. Within each wave, `/sk-build` executes tasks sequentially (writes), then runs verification (`sk-spec-reviewer`) in parallel up to `waveSizeCap` concurrent checks.

### Build state cache

`.sidekick/state/<slug>/build.json` is a **gitignored, reconstructable** cache of build progress and deviations for the current run. It is not the authority on what has been completed — that authority is PLAN.md checkboxes and git commit scopes. If the cache is lost or corrupt, `sidekick wave-plan` can regenerate it from those sources.
