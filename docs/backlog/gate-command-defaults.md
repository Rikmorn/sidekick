# Gate-command defaults assume `pnpm`

**Status:** Backlog (surfaced 2026-06-16 during the E3 Executors audit).

## Issue

When a consumer repo's `.sidekick/config.json` does not set `gates.*`, both `sk-executor` (`agents/sk-executor.md` `<inputs>` default) and `sk-build` (`skills/sk-build/SKILL.md` Step 6 gate table) fall back to **`pnpm typecheck` / `pnpm lint` / `pnpm test`**. That is an arbitrary guess at the consumer's package manager — wrong for npm, yarn, and bun repos, where the gate would fail to run (or run nothing) on a fresh install with no `gates` config.

This is a **functionality** default, not a prompt-discipline issue, which is why the E3 Executors slice deliberately left it untouched (audit scope = discipline). It spans two files and the dispatch contract between them, so it wants its own small change.

## Proposed direction (not yet decided)

- **Detect** the package manager from the lockfile (`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lockb`) and pick the matching runner — likely a small CLI helper (`bin/helpers/`) so the detection is deterministic and testable, consistent with the own-the-loop kernel posture (ADR-0002).
- **Or** require `gates.*` in config (no guess) and have `sidekick init` populate it from the detected manager.
- Either way, keep `sk-executor` and `sk-build` reading the *same* resolved value so they cannot diverge.

## Why it matters

`sk-build` is the write-path; a wrong gate default means the FRESH verification gate silently does the wrong thing (or nothing) for the majority of consumers who aren't on pnpm — undermining the gate's whole purpose. Low-effort to fix once a direction is chosen.
