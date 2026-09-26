# <Plan title>: run report

Plan: `<path>`. Spec: `<path>`. Baseline: `<commit>`. Last commit: `<commit>`.

## Mode

The superpowers skill that ran, and where: a branch, a worktree, or in place.

## Escalations

Each question sent to the orchestrator, in order, with its answer. Mark whether it exposed a plan defect.

## Review rounds

For each task, the review rounds and the fix waves.

## Defects by stage

Each defect, under the stage that found it: the plan scan, the implementer, the task review, or the whole-branch review. The orchestrator adds its own review's defects. Mark each one fixed, with its commit, or open, so the orchestrator can route what is still open.

## Deviations from the plan

Each ruling, and each step done differently from the plan, with the reason.

## Gates at handover

Each gate command with its result.

## Not covered

What the run did not check or did not finish.
