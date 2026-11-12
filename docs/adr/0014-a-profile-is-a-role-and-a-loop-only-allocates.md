# ADR-0014 — a profile is a role, and a loop is a thin manifest that only allocates

> **Amended 2026-11-12, at R11's Opening (#367, #377):** Decision 3's "the loop runs only fixed `sidekick loop` verbs" overstated it. The loop also runs its reads and applies its outward classes. It never runs `sidekick worker` or `claude`, and anything that runs code still runs in a worker.

**Status:** Accepted (2026-11-12), as the operator decided it at the loop design's third gate. Milestone R11, not yet opened; its Opening files the design's pieces as issues.

## Context

Claude Code has a loop's parts. A cron job runs inside a session, a background session outlives its terminal, and `--plugin-dir` loads a plugin into a session. Nothing in sidekick joins them ([loop design §Problem](https://github.com/Rikmorn/sidekick/blob/dff1a64076b83ccc24a65828e393302a3905a761/docs/designs/loop/design.md#problem)).

- `profile.json` was a strict object of four keys, and could not name a plugin of its own (`bin/helpers/profile-manifest.ts:36-57`, read 2026-11-11; #248).
- The operator's model of a profile is a role, which serves an interactive session and any number of loops alike (the operator, 2026-10-27).
- An agent with a prompt replaces Claude Code's default system prompt. A role carried by `--agent` would then run on a hand-written prompt alone (the design's §Review, finding 6).
- Loops are personal by default, and a loop changes nothing for a colleague who does not use sidekick (the design's G5 and G6).
- Today an attended orchestrator does most of the work on an issue. The operator ruled on 2026-11-12 that a loop "calls workers which we have and does nothing else".

## Options considered

- **The profile is the loop.** One concept and one store, but a role cannot serve two loops without a copy.
- **The loop is a self-contained plugin folder.** The probes' shape and the cheaper build, but an interactive session cannot take the role.
- **The profile is the role, and the loop is a thin manifest that runs it.** Chosen.
- **A fresh session per tick, started by launchd.** Rejected by the operator on 2026-11-12, to stay on Claude Code's native tooling.

## Decision

In the context of R11, facing a native loop that lives in one session's memory and nothing in sidekick that defines, starts, or keeps one, we decided for profiles as roles and loops as thin manifests in sidekick's own folder. A loop only allocates work to workers. This achieves roles that serve interactive sessions and loops alike, and a loop session whose context grows by little per unit. We accept a second manifest to keep in step with the profile's, and one worker at a time.

1. **A profile is a role.** `profile.json` gains `pluginDirs`, resolved against the profile's folder. The role's stance lives in its rules, and a role names no agent.
2. **A loop is a `loop.json`** in `~/.claude/sidekick/loops/<name>/`, under `CLAUDE_CONFIG_DIR` when that is set. It names a repo, a profile, a schedule, a tick, a mandate, and four caps. sidekick owns `~/.claude/sidekick/` by its namespace (ADR-0013 Decision 1), and the profile user store moves there.
3. **A loop only allocates.** Each unit runs in one dispatched worker, from a unit brief, with the loop's role profile. The loop runs only fixed `sidekick loop` verbs, and anything that runs code runs in a worker.
4. **A loop is one long-lived background session on Claude Code's own cron,** armed and renewed by a sidekick skill. Every change takes one route: edit the files, then run `sidekick loop start`.
5. **Loops never talk to each other.** Each raises only to the operator, through the desk.

## Consequences

**Positive:** a new loop under an existing role is one `loop.json` and no code. A role is reusable, and the loop's conversation holds a brief and a report per unit, not the unit's work.

**Negative, accepted:**

- `profile.json` gains a key and `loop.json` is a new contract, so a role's change reaches every loop that runs it.
- The profile user store moves, so launch and `dispatch` refuse until the operator moves the old folder.
- Loops are personal only. Committed loops wait for a team that adopts one.
- One worker at a time bounds a loop's throughput.

## Assumptions

- The operator still means profiles as roles. If a loop should own its role, the self-contained plugin is right, and it is the cheaper build.
- A respawn restores a session's cron jobs, measured on Claude Code 2.1.319 ([the loop probes](../research/loop/2026-11-08-loop-probes.md)). The design's probes measure the rest on the build of the day.
- The operator is sidekick's only user, as ADR-0012 assumes.

## Revisit when

- A team adopts a loop, which brings committed loops and #223's trust gate.
- Claude Code ships a documented durable scheduler for local sessions.
- A loop's ready units queue behind one worker (#285).

## Links

ADR-0012 · ADR-0013 · ADR-0015 · [loop design](https://github.com/Rikmorn/sidekick/blob/dff1a64076b83ccc24a65828e393302a3905a761/docs/designs/loop/design.md) · [loop research](../research/loop/README.md)
