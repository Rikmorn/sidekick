# Loop

Status: exploring · Scale: explore · 2026-10-12

Not started. The operator split the control-centre exploration into two initiatives on 2026-10-12: the control centre is R9, and this design follows it. It holds what the control-centre design learned for it, moved here before R9's Opening so that R9's close deletes none of it. No gate is credited here; gate 1 runs when this design opens, and confirms each goal in §Problem again.

Research: [`docs/research/control-centre/`](../../research/control-centre/README.md), in particular the memory-and-context report, the probes report's memory experiments, and the extension-fit report's map of the loop's pauses.

## Problem

Goals the operator stated at the control-centre design's gate 1 on 2026-10-12, and handed here, with what was known then:

- **Memory and context management** (was G5). Each fact has one home at the right scope and is retired where it lives. The operator wants more research on tools and approaches to adopt first.
- **The autonomous loop** (was G9, #140). Proposed wording: hold the pauses that guard neither quality nor an outward write, and make the rest cheaper to answer.
- **In-session context** (the second half of G3).
- **Views** (was G7) of plans, designs, and the loop itself. Made ad hoc on request until then.
- **Adopting official and community skills, agents, and tools.**
- **Prompt consistency** (#202).
- **Capture without stopping** (was G8), with its queue and triage, moved here on 2026-10-12. It changes `sk-track`'s "file it now" rule, and its open questions are memory's: where the queue lives, its scope across repos, and parallel writers. `$.store` is one JSON file per plugin under the user's configuration folder, shared by every repo (bundled types, read 2026-10-12). This design extends the board mod for it.
- **The memory mod** from §Candidate mods in this note: a guard on memory writes and a review pane. What is remembered, where, and when it ends is this design's question, moved here on 2026-10-12.
- **The ops mod and a `sidekick-ops` plugin,** with the trust and production safety thread, moved here at the control-centre design's gate 2 on 2026-10-12. The operator expects the loop milestone to set concrete targets for what each plugin bundles.
- **The plugin split,** moved here after the control-centre design's review on 2026-10-12. R9 keeps one plugin. When the split comes, the core is the base the others depend on, and [plugins.md](plugins.md) holds the findings it must answer.

## Threads

What was known, ruled, and open on each, as the control-centre design left them on 2026-10-12.

- **Memory scoping.** Ruled: facts about the operator live in a user rule file, not in auto memory. Known 2026-10-12, from the probes report: Claude Code's file tools already stop lost updates between parallel writers. The audit of sidekick's folder judged 7 of 27 notes current on 2026-10-12. Most of the damage comes from no lifecycle: notes retired only in the index, shipped rulings never removed, supersession recorded on one side. The parallel-session damage is handoff through shared notes, not races. Open: what each profile should remember, who may write memory, when a fact ends, and whether prod-issues sessions write memory at all.
- **Loop improvements and automation.** Take from Ralph fresh context per unit, a machine-checkable done, and an iteration cap. Known 2026-10-12, from the extension-fit report: no one mechanism fits #140. Handoff pauses fit background sessions with messaging; routing pauses fit a stated default in the skill. Outward writes and quality pauses stay with the operator, and a mechanism can only make the wait cheaper. The Workflow tool has no mid-run input, so it fits the sealed reviews before a pause, not the pause. Open: which pauses to change first. R9's workers piece settles how a dispatched worker gets its authority.
- **Visual outputs.** Pages generated from the source document and never hand-edited, so they stay a view and not a second copy. Open: the style, the trigger, and where the source lives.
- **Capture without stopping.** Parked by the operator. Shape from ostrakon: a command that runs with no turn, a model tool, and a queue.
- **Trust and production safety.** Known 2026-10-12: a permission deny rule keeps the model's tools off a path but not code it runs. It cannot be the prod boundary alone. Open: the prod-issues module's guards, the `sandbox` settings as a harder boundary, alert content as data, and whether prod-issues sessions write memory at all.

## Candidate mods

Sketched in the control-centre design on 2026-10-12 and moved here. Each is one plugin's hooks module.

| Mod | Module | Does | Built on |
|---|---|---|---|
| memory | not yet placed | a guard on memory writes that refuses a stale overwrite and untrusted sessions; a review pane to promote, close, or move entries | `tool.call`, `$.fs.stat`, `$.ui.open` |
| ops | ops | holds prod-changing commands for a yes with undo noted; marks monitoring results as data; `/note` timeline | `tool.call`, `session.append`, `$.command.register` |

A production session holding a change:

```text
  PROD-ISSUES · read-only until you say · timeline 7 [open]          ← ops band
 ┌ Hold: kubectl rollout restart deploy/payments -n prod ──────────┐
 │ changes: restarts 6 pods · undo: none needed (stateless)         │
 │ [ Run ]  [ Cancel ]  [ Note it ]                                 │
 └──────────────────────────────────────────────────────────────────┘
```

## The plugin split

R9 keeps one plugin. The split, with its rulings and the findings it must answer, is in [plugins.md](plugins.md).

## Not started

Constraints, the system map, prior art, options, the recommendation, the blast radius, the decision, and the review are written when this design opens.
