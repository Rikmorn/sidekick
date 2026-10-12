# Mods: whether sidekick ships them

Status: decided; the ADR lands once the decision settles · Gate 2, decision 1 of the [control-centre design](design.md) · 2026-10-12

## Problem

Every visibility and control piece of R9 needs a mod. The context monitor (#146) was thought to need one too; the review showed a settings hook does its job, as the design's §Review says. ADR-0010's first revisit condition has also fired, since `skill.prompt` wraps another plugin's skill. Three questions follow. Each crosses pieces and is costly to undo:

1. Does sidekick ship mods, and for what?
2. What may a sidekick mod do? ADR-0010 Decision 2 limits a hook to adding context, but the ops mod holds commands and the scope mod filters what the model is offered.
3. How does sidekick attach to superpowers' skills now? The choices are to keep the hooks, append, splice, or run a mod with a hook fallback.

Goals served: G1, G4, and G11, from the design's §Two initiatives. Stated by the operator at gate 1: mods are the preferred surface for visibility and control.

## Constraints

Grades: **ran** means a probe ran on 2026-10-12. **Read** means read on 2026-10-12, either in the docs pages or in the `plugin-authoring` files bundled with Claude Code 2.1.296 (`types/claude-code.d.ts`, `reference.md`). **Measured** means counted on the operator's machine. A subagent gathered most rows; Claude re-read the lines marked ✓ in the bundled files.

| # | Constraint | Grade |
|---|---|---|
| K1 | Only a mod draws a pane or a band, runs a command with no turn, or reads `$.session.usage()` | read, in the surface report |
| K2 | The API is "EARLY ACCESS: this surface may change between releases without notice". It has no version field, deprecation policy, or changelog of its own | read ✓ (`claude-code.d.ts:4`); the policy was searched for and not found |
| K3 | A hook that throws or overruns its 10-second budget is skipped, and `next(e)` runs in its place. An installed plugin's mod errors reach only the debug log | read ✓ (`HookBudget`, `claude-code.d.ts:5107`); the debug log line is read, on the troubleshooting page |
| K4 | So a guard fails open unless its `.catch` answers | derived from K3 |
| K5 | No manifest field sets a minimum Claude Code version. `$.session.version()` reads it at runtime. Mods need 2.1.287 or later | the field was searched for and not found; `version()` read ✓ |
| K6 | A module loads TypeScript directly, with no build step. It imports only relative files and `claude-code`: no npm packages and no Node APIs. Bundler output may fail the loader's static scan | ran: an npm import failed to load. The scan is read |
| K7 | `claude plugin test` runs `*.test.ts` with no session, sign-in, or network, and exits 1 on failure | ran |
| K8 | A plugin has one hooks module. `modules` and settings `hooks` share one `hooks.json`, and both run | read; `claude plugin validate` ran on a probe holding both |
| K9 | Installed mods share one worker thread, and three untraced crashes unload every mod that is not built in. `--safe-mode`, `--bare`, `allowManagedModsOnly`, and a remote rollout switch turn mods off while the plugin's other parts load | read on the troubleshooting and admin pages; not re-read |
| K10 | Mods are not sandboxed. A mod can approve a tool call that an `ask` rule or a `PreToolUse` hook would stop | read, in the surface report |
| K11 | `skill.prompt` fires for a skill typed as `/name`, loaded through the Skill tool, or preloaded into a subagent. A subagent's tool calls raise their own `tool.call` | read ✓ (`claude-code.d.ts:11894`, `:12764`) |
| K12 | Since the Skill hook shipped on 2026-09-25, transcripts hold about 20 model-invoked loads of `superpowers:brainstorming`. A typed `/superpowers:brainstorming` appears in one session, a probe on 2026-10-12 | measured by a grep over `~/.claude/projects` for transcripts changed since 2026-09-25. Corrected after the review: the second hit was the grep's own output, recorded in this design's session |
| K13 | sidekick's three settings hooks have run since 2026-09-25 and 2026-09-30. Each prints nothing and exits 0 on any failure | read: `plugin/hooks/hooks.json`, ADR-0010, ADR-0011 |

Not read: the web reference's full event list, and any superpowers plan for extension points. A Claude Code older than 2.1.287 was not tried, since none is on disk.

## Options

### Part 1: whether sidekick ships mods

**A. No mods.** Settings hooks, the CLI, agent view, and the operator's status line carry everything.

1. No pattern: stay on the extension points that are not early access.
2. It avoids the moving API entirely.
3. Today's shape, in `plugin/hooks/hooks.json`.
4. Cost: G1's band and panes cannot exist (K1), and the monitor parses usage from the transcript. It contradicts the operator's stated surface.
5. Next change: each new view needs a separate screen, or the status line the operator owns.

**B. Mods for what only a mod can do.** A mod is added where K1 applies: drawing, in-session data, a no-turn command, a model tool, or rewriting an event. Settings hooks and the CLI keep every job they already do.

1. Anti-corruption layer, from Evans's *Domain-Driven Design*. A thin mod file adapts the moving API to plain TypeScript that it imports by relative path.
2. The API moves without notice (K2), so each move touches one adapter file per mod.
3. New here. `bin/helpers/hook.ts` makes the same split for settings hooks: a thin wrapper over tested logic.
4. Cost: two extension mechanisms in one plugin, and a check after each Claude Code upgrade. The mod shares logic with the CLI only as plain relative files (K6). Not for a job a settings hook already does.
5. Next change: a fifth mod is an adapter file, its logic file, and a `*.test.ts` that `claude plugin test` runs.

**C. Mods for everything.** The three settings hooks move into the mod too, so sidekick has one mechanism.

1. Consolidation onto one platform API.
2. It runs in-process, dropping the `node` start per Skill call (40 to 50 ms, ADR-0010) and the bash wrapper per `Read` (5 to 90 ms, ADR-0011). It also covers typed commands (K11).
3. New here.
4. Cost: every sidekick extension rides the early-access API, the PM pickup and the reviewer lines included. One release that moves the API silences all of them at once, without an error (K3, K9). `--safe-mode` would drop the reviewer lines too.
5. Next change: as for B, but a Claude Code release that breaks mods breaks the whole bundle.

### Part 2: what a sidekick mod may do

ADR-0010 Decision 2 limits a hook to adding context. The candidate mods need more: the ops mod holds a command for a yes, and the scope mod rewrites what the model is offered.

- **Context only.** It rules out the ops hold, scope filtering, and the memory guard the loop design wants.
- **A ladder, stated per mod.** The rungs are to observe and draw, and to add context. The higher rungs are rewriting what the model is offered or reads, and holding a call for the operator's yes. Each mod's issue names its highest rung. Two lines hold on every rung:
  - A sidekick mod never approves a call or answers a permission. Approval stays with the operator and their settings (K10).
  - A hook that holds fails closed through its `.catch`. Every other hook fails open (K3, K4). A `.catch` gets one second (`catchMs`), and an unloaded module holds nothing (K9), so a hold is a guard only while its module runs.

A hold guards the model's tools; it is not a boundary, as the probes found for deny rules. Thread 9 of the design keeps the question of a harder boundary for production.

### Part 3: attaching to superpowers' skills

| Option | Gains | Costs |
|---|---|---|
| Keep the hooks | Stays on the stable path, unchanged since 2026-09-25 | Typed commands stay uncovered, which real work has not hit (K12) |
| Append through `skill.prompt` | Covers typed commands and preloads. The nudge sits inside the skill's text | Moves a working nudge onto the early-access API, where a break is silent (K3). Reverses "never rewrites a skill" for a gap nobody has felt |
| Splice through `skill.prompt` | Removes superpowers' conflicting lines | Anchors break silently on any superpowers release inside `^6.4.1`, unless a test pins the version |
| Mod first, hook as fallback | Covers both | Two code paths and a risk of a double nudge. The fallback serves only a Claude Code older than 2.1.287 |

Keeping the hooks records ADR-0010's first revisit condition as fired and declined. It names what reopens it: typed superpowers commands in real work, a nudge shown ignored (#136), or a break in the Skill hook path. Splicing is the lever for the second.

ADR-0011's Read hook stays for the same reason. A mod's `tool.call` would see subagents' reads (K11), but the hook already reaches them.

## Recommendation

B, with the ladder, and keep the hooks.

Assumptions, and what changes if each is wrong:

- The operator is sidekick's only user, on a current Claude Code. If others run it on older builds, a runtime check on `$.session.version()` becomes owed (K5).
- A broken mod costs the operator a view, not a wrong result. That holds only because the model's context warning runs as a settings hook. Nothing that must stay out of a session relies on the scope mod alone either. Both follow from the review. If a later mod must not fail silently, it needs a check that it ran, not only a test.
- One adapter per mod and a check after each upgrade absorb the API's moves. If it moves every release, the carrying cost argues for fewer mods, with the gauge and the desk first.
- Typed superpowers commands stay rare (K12). If they become common, Part 3 switches to appending.

## Carried costs

- A check after each Claude Code upgrade that sidekick's mods load and fire, since their errors reach only the debug log (K3). An issue designs its shape.
- `claude plugin test` in the gates and in CI (K7).
- A Claude Code floor stated in `README.md`, since no manifest field holds one (K5).
- A crash in another installed mod can unload sidekick's (K9). Third-party mods are installed only after review, as the design's non-goals say.

## Routed elsewhere

- Which plugin holds which mod is decision 4, since a plugin holds one module (K8). After the review, R9 keeps one plugin, so its one module holds every mod.
- Each mod's rung and its tests belong to that mod's issue.

## Decision

The operator's answers on 2026-10-12, in a session with Claude:

- **Part 1: B,** mods only where a mod alone can do the job. Agreed.
- **Part 2: the ladder,** with "never approve" and "a hold fails closed". Agreed for now.
- **Part 3: keep the hooks.** Decided after Claude set out the difference: both options deliver the same notes, and only a superpowers command the operator types goes uncovered. Switching later is one mod handler, plus the nudge text moved into a plain file the mod can import. ADR-0010's first revisit condition is recorded as fired and declined. Three things reopen it: typed superpowers commands in real work, a nudge shown ignored (#136), or a break in the Skill hook path.
- **The ADR** lands in `docs/adr/` once the decision has settled, with no rush. Until then this note holds it.

At decision 4 the operator moved the ops mod to the loop milestone, so no R9 mod holds a call. The hold rung stays on the ladder for the memory guard and the ops mod, both in the loop design.

A draft Y-statement for the ADR, once decided. In the context of R9's control centre, facing a mod API that is early access, unsandboxed, and silent when it fails, we decided:

- for mods only where a mod alone can do the job;
- for each mod on a stated rung, never approving a call;
- for keeping the settings hooks on superpowers' skills.

This gives in-session visibility and the context monitor without moving working extensions onto a moving API. It accepts a check after each Claude Code upgrade, two extension mechanisms in one plugin, and typed superpowers commands left uncovered.
