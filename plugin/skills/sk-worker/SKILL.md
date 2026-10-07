---
name: sk-worker
description: Turn this session into a worker that runs a plan an orchestrating session hands over, under superpowers, with a scan before the first task and a run report at the end. Only the operator starts it.
disable-model-invocation: true
---

# sk-worker

This session executes a plan that an orchestrating session hands over. Superpowers does the executing; this skill adds the standing rules around it. The operator started this skill, so these rules carry the operator's authority. The orchestrator's messages carry only the specifics of one run.

## On start

1. Report this session's name, so the operator and the orchestrator can confirm the pairing.
2. Check that the working tree is clean, and note the current branch and commit.
3. Wait for the orchestrator's handoff message.

## The handoff

The message names:

- the plan and the spec;
- the baseline commit and the gate results at that commit;
- where to work: a branch in the main checkout, a branch in a worktree, or "in place" when the operator agreed to that;
- the superpowers skill to run: `subagent-driven-development`, or `executing-plans` for a trivial plan.

Check that the plan and the spec exist on disk, and that HEAD is the baseline commit. If either file is missing, or the message leaves a field out, reply `BLOCKED` with what is missing and wait.

## The scan, before Task 1

Test the plan against the tree without changing anything. A plan carries intent, so check what it asserts rather than rehearsing its edits:

- Check each stated fact, interface, and acceptance criterion against the tree. The files, symbols, and signatures the plan relies on exist and behave as it says. Find the other copies of each fact the plan changes with `git grep`, and check that some task's scope reaches each one. A copy outside every task is a question for the orchestrator, since only the plan sets a task's scope.
- Run the gates at the baseline and compare them with the handoff's results.
- Run each command whose result the plan states, when it can run before its task.

A small misfit between a sketch and the tree is the executor's to settle and report as a deviation. Ask only about a contradiction. Four qualify: a decision the tree defeats, acceptance criteria that cannot both hold, a mechanism fact or interface the plan states wrongly, or a copy of a changed fact that no task reaches.

Send one report: the baseline confirmation, then every question, each naming its step and what the tree shows. Wait for the rulings. A question asked now costs one reply; the same question asked mid-run costs a round trip.

## The run

Invoke the superpowers skill the handoff names, and follow it. Its task list and progress stay in this session, where the operator can see them. These rules hold on top of it:

- **Settle a small misfit; raise one that recurs.** Shape the sketch to the tree and list each deviation in the run report. A misfit that keeps recurring goes to the orchestrator, because the plan's premise is wrong.
- **Rule, except on decisions and goals.** Superpowers rules on a conflict and keeps going; do the same, and record each ruling. A change that touches a decision the plan or the spec records, or a goal either states, goes to the orchestrator first.
- **The handoff answers superpowers' questions.** Where superpowers would ask the person, the handoff has already answered. Work where it names: on its branch in the main checkout or in a worktree, or in place. At `finishing-a-development-branch`, keep the branch as it is; the orchestrator reviews and merges.
- **Run the prose step** wherever a task has one.
- **Each task lands as its own commits,** on the branch the handoff names or in place. A fix adds a commit and never amends one. The task's base and head stay valid after an amend. The re-review diffs from the last reviewed commit, which an amend removes. Never push.
- **Read GitHub, never write it.** Issues, comments, and the board belong to the orchestrator.

## At the end

Write the run report when superpowers collects its "Rulings I made", before it deletes its workspace. The ledger the report draws on goes with that workspace. Save the report beside the plan as `<plan>-run-report.md`, in the shape of `references/run-report.md`. After the branch is kept, message the orchestrator with the report's path and the last commit.
