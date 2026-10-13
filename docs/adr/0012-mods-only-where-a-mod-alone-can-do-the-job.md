# ADR-0012 — Mods only where a mod alone can do the job

**Status:** Accepted (2026-10-13), as the operator decided it on 2026-10-12. Bounds ADR-0010's Decision 2 to settings hooks. Records ADR-0010's first revisit condition and ADR-0009's override condition as met and declined. Issue #203, milestone R9.

## Context

A mod is a plugin's TypeScript hooks module, which Claude Code added in 2.1.287. It runs inside Claude Code's process. Each view and control in R9's control centre needs one: the gauge, the desk, the board band, and the scope mod. ADR-0010 and ADR-0011 attach sidekick to superpowers through settings hooks instead, which run as separate processes.

The mod API's facts were read on 2026-10-12. Most come from the `plugin-authoring` files bundled with Claude Code 2.1.296, and the rest from the docs' mods pages. Probes that day checked some of them. The control centre's design records each fact with its source and grade, in [`mods.md`](https://github.com/Rikmorn/sidekick/blob/0ce8a277453a4c86046666e47bdc64ae4dbf7267/docs/designs/control-centre/mods.md) §Constraints. The lines marked ✓ were re-read in the bundled files of the same build on 2026-10-13.

- Only a mod draws a pane or a band, runs a command that takes no turn, or reads the session's usage through `$.session.usage()`. Settings hooks can rewrite some events too: a `PreToolUse` hook can replace a tool's input.
- The API is "EARLY ACCESS: this surface may change between releases without notice" (`claude-code.d.ts:4`, ✓). It has no version field, deprecation policy, or changelog of its own.
- A hook that overruns its 10-second budget (`HookBudget`, ✓), or throws, is skipped. Its `.catch` then answers within a one-second grace, or else `next(e)` runs in its place. An installed plugin's mod errors reach only the debug log. So a guard fails open unless its `.catch` answers.
- Mods are not sandboxed. A mod can approve a tool call that an `ask` rule or a `PreToolUse` hook would stop. The mods overview in the docs says so.
- No manifest field sets a minimum Claude Code version. `$.session.version()` reads it at runtime.
- A plugin has one hooks module. Its `modules` entry and its settings `hooks` share one `hooks.json`, and both run.
- A module imports only relative files and `claude-code`: no npm packages and no Node APIs.
- Installed mods share one worker thread. Three untraced crashes unload every installed mod that is not built in. The docs' troubleshooting and admin pages say so; these were not re-read.

The mod event `skill.prompt` fires when Claude Code expands a skill's prompt for the model (✓). That covers a skill typed as `/name`, one loaded through the Skill tool, and one preloaded into a subagent. Its hook returns the text the model reads instead. A probe on 2026-10-12 appended a line to two superpowers skills. One was `/superpowers:brainstorming` typed as a command, and the other `superpowers:writing-plans` loaded through the Skill tool. The extension-fit report under `docs/research/control-centre/` records it, in §What `skill.prompt` does. The probe meets two revisit conditions in mechanism, on an early-access API:

- ADR-0010's first, in its second half: "Claude Code documents a way to order or wrap another plugin's skill."
- ADR-0009's second: "Plugins gain a way to ship path-scoped rules or to override another plugin's skill".

The gap a mod would close is small. Transcripts on the operator's machine hold about 20 model-invoked loads of `superpowers:brainstorming` since the Skill hook shipped on 2026-09-25. They hold one typed `/superpowers:brainstorming`, and that was a probe. A grep over `~/.claude/projects` counted both on 2026-10-12.

## Options considered

The control centre's design weighed these in full, in [`mods.md`](https://github.com/Rikmorn/sidekick/blob/0ce8a277453a4c86046666e47bdc64ae4dbf7267/docs/designs/control-centre/mods.md) as it stood when R9 opened.

Whether sidekick ships mods:

- **No mods.** Settings hooks, the CLI, and the operator's status line carry everything. It avoids the moving API, but the panes and bands the operator asked for cannot exist.
- **Mods only where a mod alone can do the job.** Chosen.
- **Mods for everything.** The settings hooks move into the mod too, so sidekick has one mechanism. It drops a `node` start per Skill call and covers typed commands. But one Claude Code release that moves the API would silence every extension at once, without an error. `--safe-mode` would drop the reviewer lines too.

How sidekick attaches to superpowers' skills:

- **Keep the settings hooks.** Chosen.
- **Append through `skill.prompt`.** It covers typed commands and preloads. It moves a working nudge onto the early-access API, for a gap real work has not hit.
- **Splice through `skill.prompt`.** It removes superpowers' conflicting lines. Its anchors break silently on any superpowers release, unless a test pins the version.
- **A mod, with the hooks as its fallback.** It covers both paths, at the cost of two code paths and a risk of a double nudge. The fallback serves only a Claude Code older than 2.1.287.

## Decision

In the context of R9's control centre, facing a mod API that is early access, unsandboxed, and silent when it fails, we decided:

- for mods only where a mod alone can do the job;
- for each mod on a stated rung that never approves a call;
- for keeping the settings hooks on superpowers' skills.

This gives in-session visibility without moving working extensions onto a moving API. It accepts a check after each Claude Code upgrade, two extension mechanisms in one plugin, and typed superpowers commands left uncovered.

1. **Mods only where a mod alone can do the job.** The job is drawing a pane or band, reading in-session usage, a command that takes no turn, a model tool, or rewriting an event. The test is the first clause. Settings hooks and the CLI keep every job they already do. A job that a settings hook, an MCP server, or the CLI can do stays there. Each mod is a thin adapter file over plain TypeScript logic, which it imports by relative path. An API move then touches one file per mod.
2. **Each mod on a stated rung.** The rungs, from the lowest:
   1. observe and draw;
   2. add context;
   3. rewrite what the model is offered or reads;
   4. hold a call for the operator's yes.

   Each mod's issue names its highest rung. Two lines hold on every rung. A sidekick mod never approves a call or answers a permission, so approval stays with the operator and their settings. A hook that holds a call fails closed through its `.catch`, and every other hook fails open.
3. **The settings hooks stay on superpowers' skills.** ADR-0010's Skill hook and ADR-0011's Read hook keep their jobs, and ADR-0010's Decision 2 still binds them. ADR-0010's first revisit condition and ADR-0009's override condition are met and declined. Three things reopen the choice: typed superpowers commands in real work, a nudge shown ignored (#136), or a break in the Skill hook path.

No R9 mod holds a call. The ops mod and the memory guard would; both moved to the loop initiative that follows R9.

## Consequences

**Positive:** the control centre's views run inside the session they describe, where the operator already works. An API move costs one adapter file per mod. The extensions that already work stay off the early-access API: the PM pickup, the design nudge, the plan stance, and the reviewer lines.

**Negative, accepted:**

- Each Claude Code upgrade needs a check that sidekick's mods load and fire, since their errors reach only the debug log. #207 designs it.
- `claude plugin test` joins the gates and CI, and `README.md` states a Claude Code floor, since no manifest field holds one. #207 adds both.
- sidekick carries two extension mechanisms in one plugin.
- A superpowers skill the operator types as a command gets no nudge.
- A crash in another installed mod can unload sidekick's. Third-party mods are installed only after their code is reviewed.

## Assumptions

- The operator is sidekick's only user, on a current Claude Code. If others run it on older builds, a runtime check on `$.session.version()` is owed.
- A broken mod costs the operator a view, not a wrong result. It holds because the model's context warning is decided as a settings hook (#146). Nothing that must stay out of a session relies on the scope mod alone either. A later mod that must not fail silently needs a check that it ran, not only a test.
- One adapter per mod, and a check after each upgrade, absorb the API's moves.
- Typed superpowers commands stay rare.

## Revisit when

- The mod API moves often enough that one adapter per mod stops absorbing it. That argues for fewer mods, keeping the gauge and the desk first.
- Typed superpowers commands appear in real work, a nudge is shown ignored (#136), or the Skill hook path breaks. Appending or splicing through `skill.prompt` is then the lever.
- The mod API leaves early access with a version policy, which lowers the cost of a mod.
- Others run sidekick on Claude Code builds older than its floor.

## Links

ADR-0009 · ADR-0010 · ADR-0011 · `docs/research/control-centre/` · #203 · #207 · #146 · #136
