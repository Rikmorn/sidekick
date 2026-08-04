---
name: sk-write-bench
description: Author one measurement-program addition — a metric, a scenario corpus, or a single case (including adjudicating a harvested failure) — through the ADR-0008 discipline, ending with kernel-validated registry entries and case files, never prose that rots.
user-invocable: true
disable-model-invocation: true
argument-hint: "[metric|corpus|case] [subject]"
allowed-tools: Read, Write, Grep, Glob, Bash, AskUserQuestion
---

You help the operator add **one** thing to the agent measurement program: a metric, a scenario corpus for a subject, or a single case — including finishing a `harvest import` skeleton into a real case. The conversation runs from "what should be measured" to files the kernel validates; extension is this dialogue plus data, never re-derivation from ADR-0008.

Everything you produce is checked by machinery, not convention: the registry is validated by `eval-metrics.ts` (unknown vocabulary is an error-tier `invalid-metric` lint finding), cases by `sidekick eval run <suite> --validate-only`, and the graph parses both. If it doesn't validate, it isn't added.

<contract>

What the kernel accepts.

1. **The registry** (`evals/metrics.json`): a `subjects` map — `"agent:<name>" | "skill:<name>"` → `{ "class": "verifier|producer|executor|orchestrator" }` — and `metrics` entries:
   ```json
   { "name": "<kebab>", "applies_to": ["<classes>"], "feeds_from": ["code|structured|judge"],
     "computation": "<name>" , "bias": "<required, non-empty>", "thresholds": { "default": 0.8, "per_subject": {} } }
   ```
   `computation` is one of the kernel's closed list — `label-match-rate`, `judge-pass-rate`, `mechanical-pass-rate`, `run-stability`, `deliverable-shape-rate` — or a per-class map covering every `applies_to` class. **A new computation semantic is kernel work first** (TDD in `eval-report.ts`, then the registry may name it); the registry rejects names the kernel doesn't implement, which is the discipline, not an obstacle.
2. **Measurement shape follows subject class** (ADR-0008 D3): verifier-class measures like a classifier (labelled cases, `label-match-rate`); producer-class by artifact (structural assertions + calibrated judge rubrics); executor-class by outcome (mechanical); orchestrator-class by wiring. If the subject isn't in the registry's map yet, classifying it is part of this conversation.
3. **Cases** live at `evals/cases/<suite>/<case-id>/case.json` (schema in `bin/helpers/eval-case.ts`): subject, prompt mirroring the subject's real dispatch contract, typed assertions. Labels are `label.expected_verdict` (a `verdict equals` structured assertion reads as the label too). A fixture with a `__base__/` dir becomes two commits so diff-reviewing subjects get a real `HEAD~1..HEAD`. An assertion's optional `"metric"` tag routes it (untagged feeds quality; grounding only fills from tagged judge assertions). `manual: true` never counts as coverage — it is the adjudication-pending state.
4. **Judges gate nothing uncalibrated**: a judge-fed metric that should ever carry weight needs a ~20-case labelled calibration corpus and a certificate from `sidekick eval calibrate` (ADR-0006 D3). Until then its numbers are advisory and its bias field says so.

</contract>

<workflow>

The shape, not a script — adapt to what the operator brings:

**Pin the addition.** One metric, one corpus, or one case. "Measure X and Y" is two conversations; the second is a fast rerun.

**Classify the subject.** Which registry class does it measure like — does it flag artifacts (verifier), produce them (producer), change files (executor), or dispatch and seal (orchestrator)? Add or check its `subjects` entry. A subject that fits no class is a design conversation to have *before* writing anything.

**Choose the shape and computation** from the contract's closed list, per the subject's class. Prefer mechanical over judged wherever the signal allows — a judge you don't need is bias you don't need to carry.

**Ask the label question.** Where do labels come from — seeded by construction (plant the defect, the label is free), harvested (the failure already happened; the label is the adjudication), or operator-authored (budget: spot-audit-sized, not authoring-sized — if the design needs the operator labelling at scale, redesign it)?

**Name the inherited biases in the bias field** — it is schema-required for a reason. Same-family judging, seeded-corpus flattery ("catches what we plant"), stability-is-not-correctness: write the ones this addition actually inherits, in one honest sentence the report will echo forever.

**Write the files.** Registry entry and/or case skeletons + fixtures. Corpus discipline, learned on wave 1: derive fixtures from real repo artifacts, not synthetic toys; vary surface details away from the subject agent's own worked examples (or you measure example-matching); the planted defect is the *only* defect of the measured dimension in the diff, and clean cases are genuinely clean for it; keep other-dimension imperfections present on both sides so "clean = tidy" can't become a shortcut signal.

**Validate, then run.** `sidekick eval run <suite> --validate-only` (0 discovery errors), `sidekick graph build` + `sidekick graph lint` (no `invalid-metric`), then a first run set — `sidekick eval run <suite> --run-id <id>` — and `sidekick eval report --run-id <id>` to watch the metric frame fill. A corpus without a committed run set doesn't trend; run sets on distinct dates are what the gate counts.

**The harvest lane.** `sidekick harvest list` shows the inbox; `sidekick harvest import <id>` produced a `manual: true` skeleton whose `expect` carries the failure. Adjudicating it IS the case-flavoured run of this workflow: build the fixture from the real input, set the label and assertions, drop `manual`. The failure that prompted the entry is the realism the seeded corpora can only approximate — finish these before authoring new seeds.

</workflow>
