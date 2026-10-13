# Control centre

Status: planned (#146, #203, #204, #205, #206, #207, #208, #209, #210, #211, #213, #214, #215) · Scale: explore · 2026-10-12

How the operator runs Claude Code as a control centre. Many sessions run at once, each loading only what its profile declares, all visible and controllable from inside Claude Code. Memory and the loop itself are a second initiative, as §Two initiatives says. Opened from an exploration on 2026-10-11 and 2026-10-12 that the operator expects to seed R9. Gates 1, 2, and 3 are credited, and R9 opened on 2026-10-13.

Research: [`docs/research/control-centre/`](../../research/control-centre/README.md).

## Problem

The operator uses Claude Code for development, production incidents, and work beyond code, often in many parallel sessions. What they said, 2026-10-11 and 2026-10-12:

- They find organising ideas, research and review, and visualising what is happening hard. The PM layer and the review machinery exist for that reason.
- Context switching between parallel sessions is costly, which is why they pushed the worker handoff.
- Context is precious: the most capable model is for reasoning.
- Memory hygiene is already poor, and parallel work makes it worse.
- Long plans and designs are hard to take in; a visual page with diagrams, examples, and sections works better.

### Two initiatives

The operator split the goals into two initiatives on 2026-10-12. This design covers the first, the control centre, which the operator expects to be R9 and the largest. The second is the loop: memory, context, agents, skills, and tools from official and community work. It follows the control centre, and its design, seeded in [`docs/designs/loop/`](../loop/design.md), opens when it starts. Its goals moved there, as §Handed to the loop design says.

Goals of the control centre, each confirmed by the operator at gate 1 on 2026-10-12.

| # | Goal | Mark |
|---|---|---|
| G1 | See which sessions need the operator, and what each is doing, without switching between them | confirmed |
| G2 | A sound management system for declared profiles: create, list, switch, and launch sessions with one, background sessions included. A session loads only the plugins, rules, and stance its profile declares | confirmed, reframed from the profiles themselves to their management. What "sound" means, and what Claude Code allows, is explored in the issues |
| G3 | Keep each session's start cost lean, so the reasoning model spends its window on the work | confirmed; the in-session half went to the loop design |
| G4 | GSD can be uninstalled with nothing lost: a sidekick-owned context monitor, and a status line of the operator's choice | confirmed, reworded as the outcome |
| G11 | Manage sessions, agents, and profiles from inside Claude Code: dispatch, steer, stop, and switch profile, with no process to start by hand outside a session | confirmed |

Rulings on 2026-10-12:

- **Profiles are content; the system is the goal.** A specific profile, such as one for production issues, is made ad hoc between the two initiatives, possibly in another repo such as odin. Production issues may need several, for front end and back end. One test profile serves as the test bench.
- **Everything runs in session.** The operator wants no ad hoc process to start by hand; every worker is visible and reachable from a session.
- **One milestone, R9.** The operator prefers one fully working release to partial pieces that might behave unpredictably, and accepts the longer wait for it.
- **Order inside the control centre:** first profile management and GSD out, then background agents, then the visibility and control mods.
- **Mods:** the control centre takes all the candidate mods it can; the memory mod moved to the loop design. At gate 2 the operator moved the ops mod there too, as [plugins.md](../loop/plugins.md) records. The piece is fixed by what it must achieve, G1 and G11; which mods it takes is designed in its own issue, not at Opening.

G10, "use mods for visibility of sessions, agents, context, and status", moved to the constraints as the operator's preferred surface. G6, modules beyond development, became the profile-management goal G2 plus profiles made ad hoc.

Non-goals, stated: installing a third-party mod without reviewing it; Moltamp; profile composition as a blocker; building any one domain profile inside this initiative.

### Handed to the loop design

The goals the loop design takes up, and what this design learned for it, moved to [the loop design](../loop/design.md) on 2026-10-12. R9's close then deletes none of them. They are memory and context, the autonomous loop, in-session context, views, adopting community work, prompt consistency, and capture. The memory and ops mods and the plugin split went with them.

## Constraints

Stated by the operator: mods are the preferred surface for visibility and control, agreed 2026-10-12. They run unsandboxed on an early-access API, as the verified list says.

Verified, with the source in the research reports:

- Mods run in-process and unsandboxed, on an early-access API that moves between releases. Each plugin has one hooks module, and mods draw only in the terminal and the Desktop app.
- Background sessions are separate processes under a supervisor. They run where dispatched, isolate edits in worktrees, run the same hooks, accept `--settings` and `--append-system-prompt`, and refuse untrusted folders.
- A session in sidekick starts at 74,229 tokens. An estimated 42k of that is Claude Code's own: the remainder after estimating the other parts.
- `--settings` switches whole plugins, rule files, connectors, bypass mode, and the auto-memory folder per session. Nothing found switches loose agents or user-settings hooks per session.
- Auto memory is one folder per repo, shared across worktrees, never expired; a session gets one folder.
- The user instruction layer (`~/.claude/CLAUDE.md`, `~/.claude/rules/`) loads in every session.
- sidekick's rules installer writes and prunes only `sk-*.md` files (`bin/helpers/rules.ts`).

Verified on 2026-10-12, in the probes report:

- A mod's `$.ui.status` line draws directly above a custom `statusLine`, and both stay drawn. The engine prefixes it with `⚠` and the plugin's name.
- A background session takes a plugin slash command as its first prompt, and the skill expands. It was probed with a harmless skill, not `sk-worker`.
- A background session loads a mod from `--plugin-dir`. Every `--bg` probe ran in auto mode, from a source not found.
- A profile loads a shared notes file through `--append-system-prompt-file`. An `Edit(path)` deny rule keeps the edit tools and parsed Bash writes off it, even in bypass mode, but a `python3` write got through. Read-only is a guard on the model's tools, not an enforcement boundary.
- `autoMemoryDirectory` in `--settings` moves memory writes in headless and background sessions. It moves the startup index in headless ones; the background case was not checked.
- Claude Code's file tools carry a precondition. `Write` refuses a file changed since it was read. `Edit` applies while its anchor still matches, and says the file changed. Two background writers on one memory folder lost no index line.
- `skill.prompt` rewrites a superpowers skill's text, whether typed as a command or loaded by the Skill tool, in the extension-fit report.
- A background session that edited in a worktree it entered commits without asking and pushes its branch. The exception is a task, `CLAUDE.md`, or memory saying the operator handles git. Read in the agent view docs, cited in the extension-fit report.

Read for this note: the four research reports, ADR-0009, ADR-0010, ADR-0011, `sk-execute` §Hand off to a worker, issues #101, #140, and #146, and the docs layout. The Workflow authoring reference was read by a subagent for the extension-fit report.

## System map

```mermaid
flowchart LR
  OP[operator] --> T[iTerm2 tabs]
  OP --> AV[agent view]
  T --> IS[interactive sessions]
  AV --> SUP[supervisor] --> BG[background sessions]
  IS -->|claude --bg| SUP
  IS <-->|SendMessage| BG
  PR[profile: settings + stance] --> IS
  PR --> BG
  subgraph loads[each session loads]
    UL[user layer: CLAUDE.md, user rules]
    PL[project layer: AGENTS.md, repo rules]
    PG[plugins: sidekick, superpowers, others]
    AM[auto memory: one folder]
  end
  IS --> loads
  BG --> loads
  PG --> MODS[mods: hooks modules]
  PG --> BOARD[GitHub board via sidekick pm]
```

Extension points today: the profile file is a registration; a new module is a new plugin; a mod is that plugin's one hooks module. sidekick's own hooks are settings hooks in `plugin/hooks/hooks.json`.

## Lenses

Revised after gate 2 and the review, 2026-10-12; confirmed at gate 3.

| Lens | Load-bearing | Where it bites |
|---|---|---|
| Data model | yes | The profile manifest and its two stores, written by the operator or a session they ask. The worker's brief. The usage file the gauge writes for the monitor hook |
| Boundaries | yes | one plugin in R9, so one module holds every mod; the split moved to the loop design |
| Extension points | yes | a new profile is a folder; a new mod is an adapter and a logic file; the manifest's scope filters switch mod parts as data |
| Contracts | yes | the mod API is early access; agent view, with `claude --bg` and `claude agents --json`, is a research preview; the brief's fields; skill and CLI names |
| Concurrency and failure | yes | A worker's worktree against the main checkout: its base, its dependencies, the excluded folder. Mods failing open and silently. A raw dispatch without the push block. Two drivers on an attached session |
| Operability | yes | the whole goal: seeing sessions, profiles, and context. A check after each Claude Code upgrade, since mod errors reach only the debug log |
| Testability | yes | `bun test` for logic files; `claude plugin test` for mod adapters; probes for profile and worker behaviour |
| Security | yes | Unsandboxed mods. A repo profile's settings and its folder's trust. The push block's limits (W12 in [workers.md](workers.md)). Production content moved to the loop design with the ops mod |
| Performance | yes | the startup token budget per session; the monitor hook's `node` start and transcript read per tool call; the desk's polling |
| Reversibility | partly | profiles and mods are files, cheap to undo; the deferred split changes install records when it comes |

## Prior art

Each find is a candidate until the options are written; rejections carry the reason.

- **Use now:** native `--settings` profiles (no profile manager exists to integrate); agent view and `claude --bg`; `autoMemoryDirectory`; the user rules layer.
- **Weigh for G1, found by the review:** the footer's count of waiting background agents, and the `Notification` hook's `agent_needs_input` and `agent_completed` types. The reviewer read both in the docs; Claude has not re-read them. Agent teams are left out, since teammates share the lead's setting sources, so no worker gets its own profile.
- **Borrow ideas, review before any install:**
  - harness-scope: mod-level filtering, per repo.
  - ostrakon: capture while busy.
  - `token-weather` and `blast-radius`: Anthropic's samples.
  - Flightdeck: a single-session dashboard.
  - `catchup`: a re-entry summary.
  - segmem: typed and scoped memory.
  - VoltAgent memory-curator: closes a fact with a status line.
  - session-handoff: per-session handoffs.
  - Claude HUD: a status line.
- **Rejected:** Moltamp, ruled out by the operator; wshobson's `context-management`, prose with no mechanism; `ralph-loop`, which loses Ralph's fresh context.

## Sub-problems

Each was a thread the operator could pull at gate 2. What is known, what is ruled, and what is open. Since the split on 2026-10-12, threads 5, 6, 7, and 8 belong to the loop design, and so does the in-session half of thread 4. Thread 9 followed the ops mod there at gate 2. Their content moved to [the loop design](../loop/design.md) on 2026-10-12.

1. **Profiles and modularity.** Ruled: declared profiles through aliases; split sidekick into plugins exactly where a profile must separate things, pm, dev, and ops. After gate 2's review, the split moved to the loop design, since no R9 profile must separate them yet. Ruled 2026-10-12: profiles are built and documented properly, not kept as local drafts. Trial `core` and `prod-issues` drafts were tested on 2026-10-11 and then deleted; the surface report keeps the results. Open: the catalogue, composition, and the gaps for loose agents and settings hooks. The format and the store were decided at gate 2, in [profiles.md](profiles.md).
2. **Sessions and agents.** Background sessions make the orchestrator pattern real (#101). Known 2026-10-12: a `--bg` session takes a slash command as its first prompt, and one that edits in its own worktree commits and pushes by default. `sk-worker`'s "never push" is then an instruction the model follows, not a guard. Open: `sk-worker` through `claude --bg` and its authority premise, a guard on push or isolation off, and a model per worker.
3. **Visibility.** Agent view covers which session needs the operator. Open: what a mod adds, such as profile, context, unit of work, and re-entry.
4. **Context budget.** Open: the levers, ranked: profiles, GSD's listings, a brief instead of the whole `sk-orient` text at session start, and lean worker launches.
5. **Memory scoping.** Moved to the loop design.
6. **Loop improvements and automation.** Moved to the loop design.
7. **Visual outputs.** Moved to the loop design.
8. **Capture without stopping.** Moved to the loop design.
9. **Trust and production safety.** Moved to the loop design.
10. **Leaving GSD.** Ruled: the status line is the operator's choice; the monitor is sidekick's (#146, comment of 2026-10-11). Open: the read-injection scanner.
11. **Extension mechanism.** Known 2026-10-12, from the extension-fit report: `skill.prompt` rewrites superpowers' skills, probed. That meets ADR-0010's first revisit condition, and ADR-0009's override condition in mechanism, on an early-access API. ADR-0011 is unaffected. Decided at gate 2 on 2026-10-12, in [mods.md](mods.md). sidekick ships mods only where a mod alone can do the job, each on a stated rung that never approves a call. It keeps the hooks on superpowers' skills.

## Candidate mods

A sketch the operator asked for on 2026-10-12, high level, to be designed properly later. Each mod is one plugin's hooks module, so each rides the module a profile switches. In R9 every mod shares sidekick's one module; the module column names where each would go after the split.

| Mod | Module | Does | Built on |
|---|---|---|---|
| gauge | core | context and profile in the status line; flags an unprofiled session. Since the review, the warning to the model runs as a settings hook | `$.session.usage()`, `session.measure`, `$.ui.status` |
| scope | core | per-session filtering native settings cannot do: loose agents, single plugin skills, tools; `/profile` lists what loaded and its start cost | `agent.offer`, `prompt.attachment`, `tool.describe`, `$.command.register` |
| desk | core | a band naming sessions that need the operator, in any session; a workers pane; a `dispatch_worker` tool; a "since you left" summary on attach | `claude agents --json` through `$.process.run`, `$.clock.every`, `$.tool.register`, `session.attach`, `$.model.fork` |
| board | pm | the board pickup as a band; capture, its queue, and triage moved to the loop design on 2026-10-12 | `$.command.register`, `$.tool.register`, `$.store`, `ui.render` on `AbovePrompt` |

Visual outputs are mostly a skill and a house style; a mod would add only the trigger.

A development session in a tracked repo, with core, pm, and desk:

```text
 ⏺ …transcript…                                        │ Desk
                                                        │ ● worker-146   needs you ▸
                                                        │   #146 · ctx 41% · backend
                                                        │ ○ mem-audit    working
                                                        │   ctx 18% · core
                                                        │ ✓ prod-db      done 4m ago
 ──────────────────────────────────────────────────────┴──────────────────────────
  R9 · plan B in progress · next #140                                 ← board band
 ❯ _
  backend · ctx 37% · 5h 22% · Opus 5.5                              ← gauge
```

The memory and ops mods, with a sketch of a production session holding a change, moved to [the loop design](../loop/design.md) on 2026-10-12.

What changes for the operator: which session needs them, which profile it runs, and how full it is are on screen in every session. Dispatching a worker is a tool call.

Carried costs: each mod is code with full access, written and tested here. Every Claude Code release can move the API, and background sessions draw nothing until attached.

## Options

Gate 2's four decisions each hold their options in a sibling note: [mods.md](mods.md), [profiles.md](profiles.md), [workers.md](workers.md), and [plugins.md](../loop/plugins.md). §Recommendation integrates them, as gate 3 approved.

## Recommendation

Adopt gate 2's four decisions as the review revised them, and build R9 to the breakdown in §Blast radius.

The assumptions it rests on are in each sibling note's §Recommendation. Three cross the whole design:

- The operator stays sidekick's only user, on a current Claude Code. If others use it, a version check and a migration guide become owed.
- The mod API and agent view move without breaking R9 between releases faster than a check after each upgrade can catch. If they move every release, the mods shrink to the gauge and the desk.
- No R9 profile must separate pm from dev, or drop superpowers. If one must, the split or the dependency lever comes forward from the loop design.

Checked for composition on 2026-10-12. The decisions agree, with one seam: a worker's launch merges the push block and `worktree.baseRef` into its profile's `settings` block. That is a merge of two objects, not the allowlist compile step decision 2 left out. A worker launched under `--setting-sources` would also drop the user layer's permissions; piece 5 checks that case.

## Blast radius

The breakdown, drafted 2026-10-12 for gate 3. The whole is one release, R9, as the operator ruled. Pieces follow the ruled order: profile management and GSD's removal, then background workers, then the visibility and control mods. Each piece is a brief for an issue. R9's Opening filed them on 2026-10-13: pieces 1 to 10 are #203, #146, #204, #205, #206, #207, #208, #209, #210, and #211. After its scope review, Opening revised the breakdown. Piece 3 became #204 and #214, which disable GSD in two stages with its files kept. Piece 4 became #205 and #213. #215 updates the docs that say what sidekick is, and the desk lost its dispatch tool. The issues are the current briefs, not this section.

Proposed outcome, to settle at Opening: GSD is gone with nothing lost, and sessions launch with declared profiles. A session dispatches workers, and every session shows which others need the operator.

### Plan A: foundations

1. **The mods ADR, and ADR-0010's amendment.** Problem: [mods.md](mods.md)'s decision lives in a folder R9's close deletes, and ADR-0010 Decision 2 still says a hook never rewrites a skill. Resolves: ADR-0012 from [mods.md](mods.md)'s Y-statement, and an amendment line on ADR-0010 for the ladder's rewrite rung and the declined revisit. Out of scope: any mod code. Verified by: `bun run check:docs`, and the ADR index listing 0012.
2. **The context monitor as a settings hook (#146).** Problem: G4 needs the model warned before its window fills, without GSD. Resolves: a `PostToolUse` hook that warns at thresholds, reading usage from the gauge's file when present and from the transcript against a configured window otherwise. Out of scope: the gauge's display. Verified by: `bun test` on the threshold logic, and a probe whose session gets the warning near the threshold. Depends on nothing; the gauge's file is optional.
3. **Leave GSD.** Problem: G4 says GSD goes with nothing lost. Resolves: the operator's chosen status line in place, #146 running, and a ruling on the read-injection scanner (thread 10). GSD's settings, hooks, skills, and agents are removed. Out of scope: replacing GSD's other workflows, which sidekick already covers. Verified by: no GSD entry left in `~/.claude/settings.json` or `~/.claude/hooks/`, and a start cost measured before and after. Depends on 2.

### Plan B: profiles

4. **Profile management.** Problem: G2 and G3; no profile feature exists ([profiles.md](profiles.md)). Resolves: the manifest, holding a description, scope filters, and a `settings` block passed through. It holds no stance file: the profile folder's `.claude/rules/` carries the stance (#205; [probes report](../../research/control-centre/2026-10-13-profile-launch-probes.md)). User and repo stores, the repo's first. The CLI's list, show, new, and launch, aliases for interactive starts, and launch with `--bg` from a session. Also a trust check before a repo profile applies, profile switching, the test profile as the bench, and the docs. No compile step: "only what it names" is tried through `--setting-sources`. Out of scope: domain profiles, which are content made later. Verified by: `bun test` on parsing and store resolution. Probes show the test profile's sessions load what it declares, interactive and in the background. Depends on nothing.

### Plan C: workers

5. **Dispatched workers.** Problem: G11; `sk-worker` assumes the operator starts it ([workers.md](workers.md)); it realises #101's aim. Resolves: `sk-worker`'s premise and `sk-execute`'s handoff rewritten for a brief file. The launcher adds the push block, `worktree.baseRef` set to `"head"`, and the `.git/info/exclude` entry. The worker enters its worktree before its scan, with its dependencies. It writes its run report there and sends the path. The orchestrator integrates before any delete. Also the model per worker, and the permission mode the two sessions share. The launcher merges the worker's settings into its profile's `settings` block. Out of scope: dispatch without the operator's choice of mode (#140). Verified by: a dispatched run of a small plan in a scratch repo that starts at the baseline, fails a push, reports, and integrates. Depends on 4.

### Plan D: mods

6. **The mod foundation.** Problem: decision 1's carried costs. Resolves: sidekick's one hooks module beside its settings hooks, and the adapter-and-logic pattern. `claude plugin test` joins the gates and CI, and `README.md` states a Claude Code floor. A check after each upgrade confirms the mods load and fire. Out of scope: any one mod's behaviour. Verified by: the check failing on a deliberately broken module, and CI running the mod tests. Depends on 1.
7. **The gauge.** Problem: G1 and G3's visible half. Resolves: the session's profile and context shown in the session; the usage file #146's hook reads; an unprofiled session flagged. It starts with a survey of community status lines and mods, from `docs/WATCHLIST.md` on. The operator ruled on 2026-10-12 that a good community one is welcome. Borrow one that fits, after its code is reviewed, and build only what it lacks. It decides between a status line, with its `⚠` prefix, and a band. Out of scope: the warning to the model, which is 2. Verified by: `claude plugin test`, and a session showing its profile. Depends on 2, 4, and 6.
8. **The scope mod.** Problem: native settings cannot hide loose agents, single plugin skills, or mod parts per session. Resolves: those filters, read from the profile's manifest, and a `/profile` command listing what loaded and its start cost. Filters fail open, so nothing that must stay out relies on them alone. Out of scope: anything native settings already switch. Verified by: `claude plugin test`, and a probe in which the test profile's hidden agent is not offered. Depends on 4 and 6.
9. **The desk.** Problem: G1 and G11. Resolves: a band naming the sessions that need the operator, and a workers pane. A dispatch tool goes through the launcher, and attaching shows a summary. It weighs the `Notification` hook against polling `claude agents --json`. Out of scope: holding a dispatch. Verified by: `claude plugin test`, and a session that shows a worker needing the operator. Depends on 5 and 6.
10. **The board band.** Problem: the pickup is text at session start, and the start carries `sk-orient`'s whole body. Resolves: the pickup as a band, silent in an untracked repo, with the start keeping only the brief. #176's hook timeout is weighed here. Out of scope: capture and triage, which went to the loop design. Verified by: `claude plugin test`, and the start's measured size before and after. Depends on 6.

### Order and what ships alone

- Plan A first. Piece 1 is docs and ships alone; piece 2 ships alone and serves sessions before any mod exists.
- Plans B and C follow; C needs B's launcher.
- Plan D last, as ruled. Piece 6 comes before every other mod.

Opening's scope review decides whether each plan fits one session. Plans A and D are the likeliest to split.

## Decision

Gate 2's four decisions are recorded in their sibling notes, named in §Options. Gate 3 took the integrated decision on 2026-10-12:

In the context of running many Claude Code sessions as one control centre, the platform has no profile feature. Its mod API is in early access, and agent view in research preview. We decided for:

- Declared profiles as a thin manifest over native settings, with no compile step yet.
- Workers a session dispatches after the operator chooses the mode, behind a git push block, each in its own worktree.
- Mods only where a mod alone can act, on a stated rung that never approves a call.
- One plugin until the loop design sets what each plugin bundles.

This achieves G1, G2, G3, G4, and G11 in one release, R9. It accepts a check after each Claude Code upgrade, and mods that fail open and silently. It accepts a raw dispatch outside the guard, and superpowers loaded with sidekick until the split. Profiles subtract from the user layer until use settles what a declaration means.

## Review

One round on 2026-10-12, by a fresh subagent given `sk-design`'s review prompt, this note, and its four sibling notes. Claude re-read or re-ran the evidence each answer rests on.

1. **A dispatched worker's worktree starts at the remote's default branch, without the plan, and cannot write beside it.** Accepted, verified in the worktrees docs. [workers.md](workers.md) gains W9 and W10. Part 3 now sets `worktree.baseRef` to `"head"`, reads the plan in the main checkout, and writes the run report in the worktree.
2. **A live worktree under `.claude/worktrees/` dirties the main checkout and breaks its gates.** Accepted. [workers.md](workers.md) gains W11. The launcher excludes the folder through `.git/info/exclude` before a repo's first dispatch, and an assumption names tools that may not honour that file.
3. **The CLI reads skill and rule files from its own plugin folder, so moving them breaks the nudges and the PM rule silently.** Accepted, verified at `bin/cli.ts:87`, `bin/helpers/hook.ts:41-42,177,181`, and `bin/helpers/rules.ts:53-54,98`. [plugins.md](../loop/plugins.md) records it for whenever the split runs.
4. **pm and dev reference each other, and R9 builds no profile that must separate them.** Accepted, verified at `sk-execute/SKILL.md:83`, `sk-design/SKILL.md:138`, `sk-milestone/SKILL.md:43`, and `release-review.md:58`. It changed Claude's recommendation for decision 4. The operator agreed on 2026-10-12: one plugin in R9, and the split moved to the loop design.
5. **`--setting-sources` gives a native plugin allowlist.** Partly accepted, re-run on 2026-10-12. [profiles.md](profiles.md) gains P10 and routes the choice of compile target to the profile issue. Option C stands, since rules, scope filters, and a description still need the manifest.
6. **The context monitor's warning to the model should not ride a mod.** Accepted. By decision 1's own rule, a settings hook already does that job: #146 records reading usage from the transcript, checked on 2026-09-29. It also fires per tool call, where `session.measure` fires per main-thread turn. The monitor becomes a settings hook, at the cost of an approximate figure and a window size looked up from the model. The gauge mod keeps the display, and [mods.md](mods.md)'s assumption is amended. The operator accepted the approximation, noting that GSD's monitor is a hook too. Claude checked: it is a `PostToolUse` hook, but it reads an exact figure that GSD's own status line writes to a bridge file (`~/.claude/hooks/gsd-statusline.js:321-334`). sidekick cannot rely on the operator's chosen status line, so its figure approximates.
7. **The worker cannot verify that the operator chose the mode.** Accepted. [workers.md](workers.md)'s card now rests the authority on the orchestrating session following `sk-execute`, and on the desk showing every dispatch.

Minor, as reported:

- §Next session said no constraint was left assumed, though the sibling notes carry unchecked items. Reworded.
- `$.env.get` exists, and `$.env.set` lets any mod lift the push block. [profiles.md](profiles.md) and [workers.md](workers.md) (W12) updated.
- The agent-view docs say what deleting a worker's session does to its branch. [workers.md](workers.md)'s assumption updated.
- "Never pushed unasked" came from interactive sessions. Noted in [workers.md](workers.md)'s decision.
- Missed prior art for G1: the footer's count of waiting background agents, the `Notification` hook's `agent_needs_input` and `agent_completed` types, and agent teams. Added to §Prior art.
- The order put GSD's removal first, though its monitor was a mod. Resolved by finding 6.
- A hold's `.catch` gets one second, and an unloaded module holds nothing. [mods.md](mods.md) Part 2 updated.
- [plugins.md](../loop/plugins.md) said the skills' commands keep their names while skill names change. It meant the CLI's commands; reworded.
- Install records naming only `sidekick@rikmorn` would load the core alone after a split. Recorded in [plugins.md](../loop/plugins.md).
- Agent view keeps a session's `--settings` across restarts, so the compiled file's place matters. Routed in [profiles.md](profiles.md).
- K12 counted two typed loads; one was the grep's own output. Corrected in [mods.md](mods.md).
- The desk's polling cost is not estimated. Routed to the desk's issue, with the `Notification` hook as a way to avoid polling.

### Round 2

A second round ran on 2026-10-12, since round 1's answers changed the recommendation. It is the last, so what it leaves open is named, not reviewed again. Claude re-read the evidence each answer rests on.

1. **A background session moves into its worktree only before its first edit, so `sk-worker`'s start checks and baseline gates run in the main checkout.** Accepted, verified in the agent-view docs. [workers.md](workers.md) gains W13: the worker enters its worktree before its scan, and the worktree gets its dependencies and the gitignored files it needs. The workers issue picks the mechanism.
2. **The dispatch hold in round 1's answer 7 contradicts [mods.md](mods.md), and a raw `claude --bg` bypasses any hold.** Accepted. The hold is withdrawn. R9 carries the debt that a session can start a worker through `claude --bg` without the operator's choice of the mode, and without the launcher's push block. Agent view shows every such session. The operator agreed on 2026-10-12.
3. **One plugin carries superpowers and `code-review` into every profile that uses sidekick, until the split.** Accepted as a stated cost, verified in `plugin/.claude-plugin/plugin.json`. Claude recommends carrying it until the split; dropping the manifest's dependencies is the lever if a profile needs sidekick without them sooner. The operator agreed on 2026-10-12.
4. **`--agent` runs the main thread with its own prompt, tools, model, MCP servers, and hooks, and the notes never weigh it.** Accepted as prior art. [profiles.md](profiles.md) gains P11 and routes it to the profile issue. The manifest still holds plugins, rules, and scope filters, which `--agent` does not reach.
5. **One `CLAUDE_CONFIG_DIR` per profile switches the whole user layer, and nobody weighed it.** Rejected for R9. Each folder needs its own login (session memory, 2026-10-11), and runs its own supervisor with its own sessions (agent-view docs). Agent view would then split by profile, against G1. [profiles.md](profiles.md) records it as the fallback if scope filtering proves too weak.
6. **G2 and G11 ask to switch a session's profile, and no note says how.** Accepted. [profiles.md](profiles.md) routes it to the profile issue, on the unchecked premise that a switch relaunches or resumes the session under the new profile's settings.
7. **"C holds both meanings, so trying both costs nothing" is false: the allowlist half alone needs the compile step.** Accepted. Claude now recommends building the manifest without a compile step in R9, with "only what it names" tried through `--setting-sources` (P10). The operator agreed on 2026-10-12.
8. **Agent view is a research preview, and its instability is not costed.** Accepted, verified in the agent-view docs. [workers.md](workers.md) gains W14, and the desk and the workers carry it as they carry the mod API's.
9. **Durable content sits in a folder that R9's close deletes.** Accepted, verified: `sk-milestone` §Closing deletes the design folders its audit lists. Before R9's Opening, §Handed to the loop design, threads 5 to 9, and the split's findings move to `docs/designs/loop/`. The mods ADR, with ADR-0010's amendment for the rewrite rung, becomes a piece of R9's breakdown. The operator agreed on 2026-10-12.

Minor, as reported:

- "About 42k of that is Claude Code's own" is an estimate from a remainder. Reworded in §Constraints.
- Round 1's answer 3 cited `hook.ts:40-41`; the constants sit at `:41-42`, and the folder read at `:177`. Corrected.
- `$.settings.read({ source: "flag" })` returns what `--settings` carries, so a mod can read the profile without an environment variable. [profiles.md](profiles.md) updated.
- A model id carries no window size, so the monitor hook cannot look it up. The gauge mod could write `$.session.usage()` to a file the hook reads, falling back to the transcript, as GSD's status line feeds its monitor. Routed to #146's design.
- The monitor hook costs a `node` start and a transcript read per tool call, about what GSD's monitor costs now. Added to the Performance lens.
- A mod's status line always carries a `⚠` prefix, and the operator's status line already shows context. The gauge's issue decides what the gauge shows, and where.
- With one plugin, every worker loads the desk and the board. The manifest's scope filters can switch mod parts as data, so no code branches on the profile. Routed to the scope mod's issue.
- "Sessions launch through aliases" sits beside "no process started by hand". The second covers workers. Clarified in [profiles.md](profiles.md).
- `using-git-worktrees` may run `npm install` in a bun repo and leave a stray lockfile. Unverified; routed to the workers issue.

The operator agreed to all four rulings on 2026-10-12. Still open after round 2: each item the sibling notes mark unchecked.

## Gates

- **Gate 1, credited 2026-10-12.** The operator confirmed the goals, the constraints, the two initiatives, and the rulings in §Two initiatives, answer by answer in a session with Claude. This note records each answer; the commit that lands it names the gate.
- **Gate 2, credited 2026-10-12.** The operator decided the four questions §Next session lists, answer by answer in a later session with Claude. Each sibling note's §Decision records the answers. After the review, the operator revised decision 4: R9 keeps one plugin. What a profile's declaration means was left to use, by the operator's choice.
- **Gate 3, credited 2026-10-12.** The operator approved the integrated note: the recommendation, the breakdown, and the outcome sentence. Opening's scope review decides whether each plan fits one session. The operator checked a rendered summary of the design the same day. They added one ruling: the gauge borrows a good community one where it fits.

## Next session

The owed research and the three experiments were done on 2026-10-12, in the probes and extension-fit reports. Gate 2's notes still carry a few unchecked items, each marked where it sits and routed to an issue.

Gate 2 was light, agreed with the operator on 2026-10-12. Each thread's open questions were sorted into two kinds. Those that cross pieces and are costly to undo were decided at that gate. The rest went into the breakdown as questions for each issue's own design, when it is picked up. Four questions were decided there, in this order, since the other three lean on the first:

1. **Whether sidekick ships mods**, as an ADR. The context monitor (#146) and every R9 mod depend on it, and it settles ADR-0010's revisit; the extension-fit report holds the four options. Its options and a recommendation are in [mods.md](mods.md), written 2026-10-12. The operator decided all three parts that day, as the recommendation gave them. The ADR is piece 1 of §Blast radius.
2. **Where profiles live and how one is declared.** Launching workers, the gauge, and scope filtering all read this data model. Decided in [profiles.md](profiles.md) on 2026-10-12. A thin manifest is compiled to native settings and stored at user and repo level. What a declaration means is left to use.
3. **`sk-worker` dispatched from a session.** Its premise that only the operator starts it, and a guard against a background session's default push. Decided in [workers.md](workers.md) on 2026-10-12. A session dispatches a worker after the operator chooses the mode, git blocks its pushes, and it works in its own worktree.
4. **The plugin split** along pm, dev, and ops, which changes install records in every repo that uses sidekick. Decided in [plugins.md](../loop/plugins.md) on 2026-10-12, then revised after the review. R9 keeps one plugin, and the split moved to the loop design with the ops mod.

All four were decided on 2026-10-12, and the adversarial review ran two rounds the same day, answered in §Review. The rest was done the same day:

1. The lens table was confirmed.
2. The breakdown was written in §Blast radius. It includes the mods ADR with ADR-0010's amendment, which must land before R9 closes.
3. Gate 3 approved the integrated note.
4. §Handed to the loop design, threads 5 to 9, and the split's findings moved to `docs/designs/loop/`, so R9's close deletes none of them.

R9 opened through `sk-milestone` on 2026-10-13, and the status line names its issues.

Questions already routed to an issue's design:

- The band's issue decides what stays in the model's context at start. Measured 2026-10-12: `plugin/hooks/session-start` injects the pickup brief (148 characters, no milestone open) and the body of `sk-orient` (4,766 characters). Keeping the brief and dropping the body keeps the model oriented.
- What "sound" means for profile management, and what Claude Code allows, per G2.
- Which mods the visibility and control piece takes, per §Two initiatives.
