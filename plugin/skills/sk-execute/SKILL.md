---
name: sk-execute
description: How a written plan runs. Lays out the execution modes with a recommendation, prepares the plan so the run is checked, and hands it to a worker session when that mode is chosen. Use when a plan is ready, when writing-plans asks which approach to take, or when asked how to run a plan.
---

# sk-execute

A written plan runs under superpowers: `subagent-driven-development`, or `executing-plans` for superpowers' native mode. This skill chooses how, prepares the plan, and hands it off. It adds to superpowers and replaces none of it, except two rules, each overridden where it applies. Superpowers' reviewers run a check only on a specific doubt; §Before the plan goes out describes the hook that has them reproduce claimed checks. Minor findings never enter superpowers' fix pass; §Route every finding overrides that. The worker side is `sk-worker`, which only the operator starts.

## Choose the mode

Lay out three modes and recommend one. The operator decides; there is no default.

| Mode | Fits | Costs |
|---|---|---|
| Inline in this session, superpowers' native mode | Few tasks, mostly prose | No independent review until the end; this session's context grows |
| Subagent-driven in this session | Code with tests at moderate size, where rulings come from the session that holds the context | A fresh context per task and per review |
| A worker session, running `subagent-driven-development`, or `executing-plans` for a trivial plan | Many tasks and code with tests, where keeping dispatches out of this session's context matters | A second context load, the worker's scan, and each question reloading this session |

`writing-plans` offers the first two with a recommendation of its own. Add the third, then recommend one mode in a sentence: the reason from the plan, and what would change it.

## Before the plan goes out

These hold in every mode.

- **The plan names its milestone plan.** It applies in a tracked repo, to a plan that carries issues of an active milestone with a plans header. The plan's header names which of those plans it is. A plan matching none means the milestone has grown. `sk-pm-conventions.md` §Change control then decides: a small addition, or a question for the operator before the plan goes out.
- **Expectations are measurements.** An `Expected:` value that depends on the tree states the command and what it measures, or a formula from the tree. A number measured somewhere else is true there and false at the worker's step.
- **Prose tasks run the prose check.** The repo may declare a `prose` script, such as `scripts.prose` in `package.json`. When it does, every task that writes or edits prose ends by running it on the files the task changed. Errors are fixed before the commit; warnings go in the task's report. Check that its summary counts every file named: some prose checkers read a mistyped path as text and pass it. The step sits inside the task because the task's own text is the one part of the plan every implementer is sure to read.
- **Reviewers reproduce claims, by a hook.** The reviewers that `subagent-driven-development` and `executing-plans` dispatch open a review package: `review-<base>..<head>.diff`, in the plan's workspace. Sidekick's hook on `Read` then adds two rules to the reviewer's context. The reviewer re-runs each non-test check the implementer reports as passing, and credits only what it reproduces. It also holds the comments the diff adds to `sk-clean-code.md` §Comments, which reading a diff does not load. The hook adds that section only when the package shows files the rule covers. The first rule departs from superpowers' rule that a reviewer runs checks only on a specific doubt, and the test suite stays exempt. The plan carries nothing for this; ADR-0011 records the mechanism.
- **Steps after the tasks go in an after-file.** Superpowers puts everything after the last task into that task's brief, so the plan ends with its last task. Steps that run once the tasks are done, and that `finishing-a-development-branch` does not cover, go in `<plan>-after.md` beside the plan. The orchestrator runs them.
- **The plan passes the prose check itself.** Run the repo's `prose` script on the plan file before the handoff. An error blocks the handoff.

## Review by kind

In the two subagent modes:

- A code task gets the normal task review.
- Tasks that copy prose verbatim from the plan are same-shape work. Mark them in the plan so the controller batches them into one dispatch and one review.
- The whole-branch review always runs.

## Route every finding

A review's findings are graded by their effect, not by the reviewer's label, and each gets a route before the workspace is deleted. Ask of each: if it were left, would the repo, the work, or the milestone stop being correct or consistent? Then it is part of the work, fixed in the branch. That covers text the branch wrote, and any place still stating a premise the branch retired. Anything else is an addition under `sk-pm-conventions.md` §Change control, or a drop whose reason the operator hears. This overrides superpowers' rule that minors never enter the fix pass. A finding left only in a closing message has no home once the session ends.

## Hand off to a worker

When the operator chooses the worker mode, they open a session in the repo and start `sk-worker` there. Then:

1. Find the worker with `ListAgents`.
2. Message it the handoff:
   - the plan and the spec;
   - the baseline commit and the gate results at that commit;
   - where to work: a branch in the main checkout, a branch in a worktree, or "in place" when the operator agreed to that;
   - the superpowers skill to run.
3. Answer its scan report in one reply where you can. Keep a table of any expected value a ruling moves, so later tasks' numbers stay right.
4. When the run report arrives, review the whole branch yourself, since a per-task review cannot see a defect at the seam between tasks. Add your review's defects under "Defects by stage" in the run report, and route every defect still open there as §Route every finding says. Then integrate the branch as the repo's guidance says: a fast-forward, or a pull request whose body carries `Closes #N`. Where the guidance is silent, infer the route from the repo's history. Confirm it with the operator, and record it where the repo keeps its guidance. Run the plan's after-file, if it has one, and close the issues through `sk-track`.

A change of scope goes in a fresh handoff, never in a message to a running worker.

## After an in-session run

At `finishing-a-development-branch`, take the option that matches the repo's route, as §Hand off to a worker step 4 describes. Then run the plan's after-file, if it has one.

The closing summary records these fields beside superpowers' "Rulings I made":

- the mode;
- the escalations, each marked as exposing a plan defect or not;
- the review rounds per task;
- the defects per stage: plan scan, implementer, task review, whole-branch review, and this session's review;
- the deviations from the plan;
- the gates at the end;
- what was not covered.
