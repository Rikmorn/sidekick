# Architecture decision records

These records hold the decisions that bind sidekick, the plugin bundle, after the work that made them has closed. `plugin/skills/sidekick/references/docs-layout.md` §adr/ says what an ADR holds and how it changes. A record keeps the words it was written with, so an old one can name work items and files that no longer exist.

## Reading the work-item IDs

ADRs 0001 to 0003 cite work items by their historical `E#` IDs, such as `E13`. ADRs 0004 and 0005 cite v2 `{phase}.{item}` IDs. Both resolve through the [EPIC crosswalk](https://github.com/Rikmorn/sidekick/blob/dce44d75b669cdd824e30c928df1bbcac983a700/docs/work/EPIC.md#crosswalk--legacy-e--phaseitem), kept at that commit. EPIC re-baseline 3 (2026-07-03) renumbered Phase 3 after both were accepted, and the editorial pointer at the top of each ADR gives the renumbering.

## Index

Each line gives the standing from the ADR's own status and amendment lines, plus any later ADR whose status line names it. The pre-pivot ADRs (0001 to 0008) predate ADR-0009, which records the pivot.

### Pre-pivot

- [0001](./0001-harness-shape.md): Harness shape, behavioural-leaning with the lifecycle as a thin skeleton. Accepted as direction (2026-06-07). Superseded by ADR-0009 in its harness shape.
- [0002](./0002-platform-primitives-scoping.md): Platform primitives, own the loop and rent the fan-out. Accepted (2026-06-10). Superseded by ADR-0009 in its substrate scoping.
- [0003](./0003-design-interaction-model.md): Design interaction model, research-as-dialogue against produce-then-confirm. Accepted (2026-06-15). ADR-0004 supersedes its `--auto`-as-a-design-mode.
- [0004](./0004-loop-identity-reentry-autonomy-seam.md): Loop identity, re-entry, and the autonomy seam. Accepted (2026-06-18). Supersedes ADR-0003's `--auto` as a design mode.
- [0005](./0005-operator-authored-verifiers.md): Operator-authored verifiers, quorum membership as configuration. Accepted (2026-07-02).
- [0006](./0006-eval-harness-contracts.md): Eval harness, case convention, subscription runner, and graduation by certificate. Accepted (2026-07-23). ADR-0009 parks its programme.
- [0007](./0007-knowledge-layer.md): Project knowledge layer, glue with a thin build over typed text. Accepted (2026-07-22). Decisions 6 and 7 are superseded (amended 2026-09, #30). ADR-0009 parks its programme.
- [0008](./0008-agent-measurement-program.md): Agent measurement program, metric registry, corpus strategy, and the sk-* gate. Accepted (2026-08-04). Decision 6's gate condition is superseded (amended 2026-09, CR #1). ADR-0009 parks its programme.

### The plugin bundle

- [0009](./0009-pivot-to-plugin-bundle.md): Pivot to a plugin bundle, where superpowers does the work and sidekick adds what it lacks. Accepted (2026-09-18). Supersedes the harness shape of ADR-0001 and the substrate scoping of ADR-0002, and parks the programmes of ADR-0006, ADR-0007, and ADR-0008. Amended by #119, #132, and #142.
- [0010](./0010-extensions-attach-through-skill-hooks.md): Extensions attach to superpowers through hooks on the Skill tool. Accepted (2026-09-25). Amends ADR-0009's Consequences. Amended by #161, #177, and #188.
- [0011](./0011-extensions-attach-to-superpowers-work-files.md): Extensions attach to superpowers' work files through hooks on Read. Accepted (2026-09-30). Amends ADR-0010's Decision 1. Amended by #160.
