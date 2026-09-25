---
kind: north-star
status: living
---

# North star

> sidekick is the loop I use every day in every repo. Superpowers and the official plugins do the work. sidekick adds the house guidance, the project-management layer on GitHub where I own the tracking, and the design-side extensions the ecosystem lacks. Research is standing work, not a gate: proactive on harnesses and loops, reactive inside a piece of work, and recorded where the work can find it.

Recalibrated 2026-09-18 with ADR-0009. The objective tree this replaces described a research programme; it stays in git history as its record, and the audits under `docs/reviews/2026-09-18-*.md` say what the programme found.

## What that means in practice

- **Superpowers is the trunk.** Design, plan, execute, review, and finish run on its skills and on the official plugins the bundle depends on. sidekick builds something itself only for a gap felt in daily use, and the bar for owning a piece of the loop is a felt limit, not a speculative one.
- **Guidance travels with the plugin.** The portable rules reach every repo the operator works in, delivered without touching files sidekick does not own.
- **Work is tracked on GitHub.** Issues are work items, milestones are releases, one board per repo. The PM layer exists where the operator owns the tracking and stays out of the way where someone else does.
- **Extensions sit around the trunk.** A design pass before or during brainstorming, a sealed review after a spec, a verdict after a build, a record on close. None of them recreates an artifact contract of its own.
- **Research feeds work.** Proactive research on harnesses and loops lands under `docs/research/`; research inside a piece of work starts in the working scratch and is promoted only when it outlives its issue.

## Evidence of progress

The plugin is enabled in every repo the operator works in, the PM layer runs at the start of each session in the home repos, and each milestone closes with a release. When a component of sidekick has not been used in a month, that is the signal to retire it.
