---
name: sk-design
description: "Designs a change before it is built, as an architect and senior engineer would. It breaks the problem down, maps the system, and searches for existing libraries, platform features, and patterns. It weighs options and records the decision and any debt. Use before or during brainstorming when a change adds a concept, module, dependency, or a second of an existing kind. Also use for a branch on a discriminator, a contract or data change, a cross-boundary change, a security- or performance-sensitive path, or a refactor. Also use when asked to explore, evaluate, or plan a design without building. Skip when the diff fits in one sentence."
---

# sk-design

Design the change so the codebase absorbs the next one. Work as the architect and the senior engineer in the room would. Break the problem down, map the system, find what already solves it, weigh the options, and agree the tradeoffs with the operator. A problem considered, researched, and designed with care usually yields a sound solution, and big refactors become small or unnecessary.

The surrounding code shows what exists, not what is right. Matching it is a choice, so make it consciously and say why. A file with three special cases argues for a different shape, not a fourth case. Aim for the least-worst option: every option trades something, and the note says what. A hack is a valid outcome when it is conscious, with its carrying cost written down and its debt registered. A hack without a note is an accident that will be mistaken for a design.

This pass sits beside superpowers' `brainstorming` and replaces none of it. `sk-working-standards.md` covers verification and `sk-clean-code.md` the shape of code once written; this skill covers the step before both.

## When it runs

Run the pass when a wrong choice would be expensive to undo later. The usual signs:

- a new concept, module, service, or dependency;
- a second of a kind that already exists: the second decides the abstraction, and the third makes it mandatory;
- a new branch on a discriminator;
- a contract change: an API, a schema, an event, a field's meaning, anything an LLM reads;
- a change crossing a layer, package, or service boundary;
- data: a migration, a new store, a changed lifecycle;
- a refactor;
- a path where performance, security, or credentials matter.

Skip it when the diff fits in one sentence, or when only one answer is sensible. The usual cases are a copy change, a rename, a fix within the existing shape, config, tests, and docs. When unsure, write the five-line version.

The pass does not run inside debugging. A root cause whose fix would be a special case is a design problem. Register it as §Decide and route says, rather than patching around it. The pass runs when that registered item is picked up.

## Two scales

| | Shape | Explore |
|---|---|---|
| When | Inside a brainstorm, on the change at hand | No build in hand: a large change, a subsystem to evaluate, a direction to plan |
| Note | `docs/superpowers/designs/<YYYY-MM-DD>-<topic>.md`, transient | `docs/designs/<topic>/design.md`, fluid across sessions |
| Gates | Brainstorming's own | Three of its own |
| Ends in | The spec brainstorming writes | A reviewed breakdown that PM files |

Explore scale is in `references/explore.md`. Read it when the operator asks to explore, evaluate, or plan, or when a shape note outgrows one spec. Read it too when the pass starts without a topic: it says how to resume a design in progress.

## Before the note

Restate the problem, split it into its parts, and name the unknowns before proposing anything. Read the repo's architecture sources: `AGENTS.md`, `CLAUDE.md`, the ADRs, any design-vision doc, and any design lenses the repo's rules add. Cite the one that binds rather than restating it. A README's claim is an assumption until the code confirms it.

## The note

Write it as a file from the start, so brainstorming, a reviewer, and a later session can read it. The sections keep this order, constraints before conclusion, so do not lead with the recommendation.

```markdown
# <Topic>
Status: exploring | ready for PM | planned (#NN, #NN) · Scale: shape | explore · <date>

## Problem
## Constraints
## System map
## Prior art
## Options
## Recommendation
## Blast radius
## Decision
## Review
```

- **Problem.** What is wrong, for whom, with evidence: a `file:line`, a log line. The goals and the non-goals.
- **Constraints.** Label each constraint as verified, because you read the code or ran it, or as assumed. List what you read and what you skipped. A reviewer cannot trust an omission the note does not declare. An assumption the design rests on is named again in the recommendation.
- **System map.** The nouns and how they relate: one-to-many, owns, references, derives from. Where each lives, and where the extension point is today: a registry, a config file, a switch, or nothing. When more than two concepts interact, draw a fenced Mermaid flowchart.
- **Prior art.** Search in this order: what the repo already has, then the platform's own features, then libraries, then documented practice. Each find is used or rejected, with the reason. A new dependency is a cost as well as a gain, since the team lives with it long after adding it. The search may run in a subagent; its findings become evidence once you re-read the lines the recommendation rests on.
- **Options.** Two or three, each with a pattern card. `references/patterns.md` indexes recurring problem shapes and the question that decides between their patterns; "no pattern" is one of its rows. State tradeoffs as "X over Y". "Refactor to be cleaner" is not an option.
- **Recommendation.** First line. Then the assumptions it rests on, and what changes if each is wrong.
- **Blast radius.** Files, modules, contracts, data, and who else is affected. What cannot be undone, what order the steps go in, what ships alone. Additive contract changes ship first and alone.
- **Decision.** One of: do it now; do the seam now and register the rest; register it as debt. Write it as a Y-statement: in the context of …, facing …, we decided for …, to achieve …, accepting …. The "accepting" clause names the debt and what it costs to carry.
- **Review.** Each finding from §Review and its answer.

A shape note's status line names its issue, when it has one, and later the spec it fed.

### Pattern card

Five lines per option, so a reviewer can check it and a junior engineer can learn from it:

1. The pattern, and its source when one exists.
2. The problem it solves, and why it applies here.
3. Where it already appears in the repo, with a file, or "new here".
4. What it costs, and when not to use it.
5. The cost of the next change: the diff of the fifth similar change after this design.

### Lenses

Weigh each while building the constraints and options:

- data model: state, identity, lifecycle, who writes each field;
- boundaries and dependency direction;
- extension points: a new kind should be a registration, not a branch;
- contracts, including anything an LLM reads;
- concurrency and failure: the second delivery, the partial failure, the retry after success;
- operability: how a failure is seen;
- testability: the deterministic test the design allows;
- security and data sensitivity;
- performance;
- reversibility.

A shape note names the load-bearing ones where they bite. An explore note records each in a short table, as `references/explore.md` says.

### The five-line version

Problem, one line on the options considered, the recommendation, and the decision. It gets no review.

## Review

A note with options gets an adversarial review before its decision is taken. Dispatch a fresh subagent with the prompt in `references/review.md`, giving it the note's path and nothing from the conversation. Skip the review only on a trivial note, and say why in the note.

Answer every finding in the Review section. Accept it and change the note, or reject it with a reason held to the same evidence standard as the finding. List the minor findings. The operator sees each challenge beside its answer, and their objections outrank the reviewer's. Run one round; a second runs only when the answers changed the recommendation.

## Shape scale in a brainstorm

Brainstorming sorts work into a spike, a bounded change, or an architectural change, and the pass fits each differently.

- **Architectural.** The pass takes brainstorming's "Propose 2-3 approaches" step.
  1. Write the note and run the review.
  2. Present the recommendation, the options, and the review, with the note's path. Brainstorming's approval at that step is the decision.
  3. Brainstorming continues to its design sections and the spec. The spec cites the note and carries its constraints, decision, and blast radius as settled. Brainstorming asks only what the note leaves open; re-asking a settled question is a defect in the hand-off.
- **Bounded.** Run the pass before brainstorming presents its short design. That design cites the note and carries its decision as settled. If the pass shows the change is larger than a bounded one, say so; brainstorming's own ratchet then moves it to the architectural path.
- **Spike.** A spike answers a question and keeps no code, so the pass does not run.

When the pass ran before brainstorming, brainstorming starts from the note the same way. When the design outgrows one spec, move the note to explore scale as `references/explore.md` says. Then stop the brainstorm and tell the operator, who decides whether to replan.

## Decide and route

The decision is the operator's. Do not act on a recommendation until it is chosen, and do not read silence as a choice. With no operator to ask, in a worker session or a headless run, decide "register it as debt" and say so; never "do it now".

| What | Tracked repo | Untracked repo |
|---|---|---|
| Do it now | Into the spec | Into the spec |
| Small debt, whole in an issue body | An issue through `sk-track` | `docs/tech-debt/<area>/<item>.md`, one file per item, deleted when paid |
| Debt or a design needing more work | `docs/designs/<topic>/design.md` | `docs/designs/<topic>/design.md` |
| A decision that binds future work | An ADR in the repo's ADR folder | An ADR in the repo's ADR folder |

"Seam now, register the rest" sends the seam into the spec and routes the rest by those rows. `sk-track` knows whether the repo is tracked; where it reports untracked, write the tech-debt file. When the operator accepts a conscious hack, the brainstorm continues on the narrow fix, and the note says it is narrow.

## Red flags

| Thought | Reality |
|---|---|
| "The operator wants to start today, be decisive" | One plan is not a decision. Two or three options and a recommendation, then the gate |
| "This seam is the right one" | Say what it beats and what it costs, or it is not reviewable |
| "No time to look outside" | The search takes minutes; building blind takes days |
| "It's one more case" | The fourth branch on a discriminator is a model that cannot express the fourth thing |
| "Match the file" | Consistency with a wrong shape spreads the wrong shape |
| "Make it configurable, in case we need it" | Speculative generality. Take the seam, not the framework |
| "The subagent's survey said so" | A survey is a map. Re-read the lines the recommendation rests on |
| "We'll refactor later" | Later has no owner. Register it, or it is forgotten |
| "Blast radius is implied by the file list" | That section decides now or later. Write it |
