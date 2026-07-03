# `--fix` scope gate is finding-file-only; cross-file mechanical fixes route to the human

**Status:** Open (deliberate `3.2` narrowing, 2026-07-03). Not a bug — a conservative policy with a known cost, recorded so the widening path is ready if the cost turns out to be material.

## Issue

`3.2` mounted an independent scope gate on `/sk-review --fix`: after `sk-fixer` applies a fix, the orchestrator runs `sidekick scope-check --declared <finding's file>` against the actual working-tree changes; anything outside the finding's file → rollback + `fix_failed`, no retry. `sk-fixer`'s contract previously permitted a co-located second-file change ("e.g. an import") — that clause was reconciled away in the same batch: the fixer now declines (`applied: false`) when a fix needs a second file, and the finding goes to the human.

**Cost:** genuinely mechanical cross-file fixes (add an export here, its import there) are no longer auto-committable. They were before `3.2`.

## Why the gate can't just trust the fixer's report

The whole point of the `3.2` scope gate is that the *producer never defines the scope it is checked against* — the executor/fixer self-report was the hole being closed. Letting the fixer's `files_changed` widen the declared set would reopen it.

## The widening path that preserves independence

Verifier-defined scope: let the *reviewer's* finding schema name companion files (e.g. `related_files` on the finding JSON) and pass `--declared <finding.file>,<related_files...>`. The reviewer is already independent of the fixer, so the declared set stays producer-independent. Costs a schema change across the dimensional reviewers + the sk-review parse — do it only if `fix_failed` on cross-file fixes shows up materially in practice (the `3.3` eval layer is the natural place to measure that).
