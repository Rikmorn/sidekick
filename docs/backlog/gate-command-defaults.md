# Gate-command defaults assume `pnpm`

**Status:** ✅ Resolved 2026-07-03 — implemented in the `3.1` batch (as this note anticipated: both touch `.sidekick/config.json` schema + `init`). What landed: `gates.*` optional-but-loud in the config schema; `sidekick gates` as the single resolver both `sk-build` and `sk-executor` read (`gates_unconfigured` hard-stop in sk-build; `gate_commands` required in sk-executor — its pnpm defaults are gone); `init` suggests only what a lockfile identifies (bun/pnpm/yarn/npm) and writes only detected/answered values, warning loudly on the rest. Kept for the problem statement and direction record below.

## Issue

When a consumer repo's `.sidekick/config.json` does not set `gates.*`, both `sk-executor` (`agents/sk-executor.md` `<inputs>` default) and `sk-build` (`skills/sk-build/SKILL.md` Step 6 gate table) fall back to **`pnpm typecheck` / `pnpm lint` / `pnpm test`**. That is an arbitrary guess at the consumer's package manager — wrong for npm, yarn, and bun repos, where the gate would fail to run (or run nothing) on a fresh install with no `gates` config.

This is a **functionality** default, not a prompt-discipline issue, which is why the E3 Executors slice deliberately left it untouched (audit scope = discipline). It spans two files and the dispatch contract between them, so it wants its own small change.

## Direction (operator, 2026-07-03)

**No defaults at all.** Falling back to *any* runner bakes in assumptions about the consumer that don't generalise — pnpm-vs-bun is the visible symptom, but the consumer may not be a Node repo at all (the harness is deliberately stack-generic). So:

- `gates.*` becomes **explicitly configured, never guessed**: `sidekick init` populates it (lockfile/stack detection may *suggest* values at init time — a deterministic, testable helper per ADR-0002 — but what runs is always what config says).
- With no `gates.*` set, the gate **surfaces "gates unconfigured"** loudly rather than silently running a wrong command; `sk-executor` and `sk-build` read the *same* resolved value so they cannot diverge.

Timing: fine to leave until it bites (the operator's furnace dogfood sets `gates.*` explicitly); natural batching is with the `3.1` config-surface work, since both touch `.sidekick/config.json` schema + `init`.

## Why it matters

`sk-build` is the write-path; a wrong gate default means the FRESH verification gate silently does the wrong thing (or nothing) for the majority of consumers who aren't on pnpm — undermining the gate's whole purpose. Low-effort to fix once a direction is chosen.
