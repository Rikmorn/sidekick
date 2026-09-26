---
name: sk-execute
description: How a written plan runs. Lays out the execution modes with a recommendation, prepares the plan so the run is checked, and hands it to a worker session when that mode is chosen. Use when a plan is ready, when writing-plans asks which approach to take, or when asked how to run a plan.
---

# sk-execute

A written plan runs under superpowers: `subagent-driven-development`, or `executing-plans` for superpowers' native mode. This skill chooses how, prepares the plan, and hands it off. It adds to superpowers and replaces none of it. The worker side is `sk-worker`, which only the operator starts.

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

- **The plan names its milestone plan.** It applies in a tracked repo, to a plan that carries issues of an active milestone with a `Plans:` clause. The plan's header names which of those plans it is. A plan matching none means the milestone has grown. `sk-pm-conventions.md` §Change control then decides: a small addition, or a question for the operator before the plan goes out.
- **Expectations are measurements.** An `Expected:` value that depends on the tree states the command and what it measures, or a formula from the tree. A number measured somewhere else is true there and false at the worker's step.
- **Prose tasks run the prose check.** The repo may declare a `prose` script, such as `scripts.prose` in `package.json`. When it does, every task that writes or edits prose ends by running it on the files the task changed. Errors are fixed before the commit; warnings go in the task's report. Check that its summary counts every file named: some prose checkers read a mistyped path as text and pass it. The step sits inside the task because an implementer's brief holds only its own task, and Global Constraints never reach it.
- **Reviewers reproduce claims.** Superpowers passes Global Constraints to each task reviewer verbatim, so they carry this line:

  > Re-run each check the brief names that the implementer reports as passing, and credit only what you reproduce.

  The test suite stays exempt, as superpowers rules.
- **Nothing follows the last task.** Superpowers appends any section after the last task to that task's brief, so orchestrator-only steps go before the tasks.
- **The plan passes the prose check itself.** Run the repo's `prose` script on the plan file before the handoff. An error blocks the handoff.

## Review by kind

In the two subagent modes:

- A code task gets the normal task review.
- Tasks that copy prose verbatim from the plan are same-shape work. Mark them in the plan so the controller batches them into one dispatch and one review.
- The whole-branch review always runs.

## Hand off to a worker

When the operator chooses the worker mode, they open a session in the repo and start `sk-worker` there. Then:

1. Find the worker with `ListAgents`.
2. Message it the handoff:
   - the plan and the spec;
   - the baseline commit and the gate results at that commit;
   - the branch to work on, or "in place" when the operator agreed to that;
   - the superpowers skill to run.
3. Answer its scan report in one reply where you can. Keep a table of any expected value a ruling moves, so later tasks' numbers stay right.
4. When the run report arrives, review the whole branch yourself, since a per-task review cannot see a defect at the seam between tasks. Add your review's defects under "Defects by stage" in the run report. Then fast-forward the base branch and close the issues through `sk-track`.

A change of scope goes in a fresh handoff, never in a message to a running worker.

## After an in-session run

The closing summary records these fields beside superpowers' "Rulings I made":

- the mode;
- the escalations, each marked as exposing a plan defect or not;
- the review rounds per task;
- the defects per stage: plan scan, implementer, task review, whole-branch review, and this session's review;
- the deviations from the plan;
- the gates at the end;
- what was not covered.
