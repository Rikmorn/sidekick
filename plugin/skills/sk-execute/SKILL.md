---
name: sk-execute
description: How a written plan runs. Lays out the execution modes with a recommendation, prepares the plan so the run is checked, and hands it to a worker session when that mode is chosen. Use when a plan is being written or is ready, when writing-plans asks which approach to take, or when asked how to run a plan.
---

# sk-execute

A written plan runs under superpowers: `subagent-driven-development`, or `executing-plans` for superpowers' native mode. §Outward writes and a plan's after-file run outside superpowers. This skill chooses how, prepares the plan, and hands it off. It adds to superpowers and replaces none of it, except the rules this paragraph names, each overridden where it applies. `writing-plans` asks for complete code with no placeholders. Superpowers also tells its executors to carry out the plan exactly, in the implementer's prompt and in `executing-plans`. §A plan carries intent overrides both. Superpowers' task reviewers run a check only on a specific doubt; §Before the plan goes out describes the hook that has them reproduce claimed checks. Minor findings never enter superpowers' fix pass; §Route every finding overrides that. `writing-plans`' handoff question offers two modes with a recommendation. It says, as `executing-plans` does, that native execution runs well on a mid-tier model because the plan carries the design. §Choose the mode replaces the question, and §A plan carries intent replaces the premise. The worker side is `sk-worker`, which only the operator starts.

## Choose the mode

Lay out three modes and recommend one. The operator decides; there is no default.

| Mode | Fits | Costs |
|---|---|---|
| Inline in this session, superpowers' native mode | Few tasks, mostly prose | No independent review until the end; this session's context grows |
| Subagent-driven in this session | Code with tests at moderate size, where rulings come from the session that holds the context | A fresh context per task and per review |
| A worker session, running `subagent-driven-development`, or `executing-plans` for a trivial plan | Many tasks and code with tests, where keeping dispatches out of this session's context matters | A second context load, the worker's scan, and each question reloading this session |

`writing-plans` offers the first two with a recommendation of its own, in the question that asks the operator to review the saved plan. Add the third to that question, so the operator reviews the plan and chooses once. Give one recommendation across the three, in place of its own: the reason from the plan, and what would change it. When the operator has already named a method, `writing-plans` asks only for the review, and the method stands. Leave out its claim that native execution runs well on a mid-tier model. Under §A plan carries intent, the session running the plan settles what the plan leaves open. For a plan whose writes go mostly outside the branch, offer §Outward writes beside the modes.

## Outward writes

For a plan whose writes go mostly outside the branch, such as a triage, a relabel, or a milestone opening, recommend draft, verify, apply. Offer it beside the three modes in §Choose the mode, not as a fourth, since its writes run under no superpowers skill. A branch plan with a few outward steps keeps them in its after-file.

Draft, verify, apply runs in this session, as the orchestrator, because `sk-worker` reads GitHub and never writes it. A branch part of the plan, such as a docs commit, runs in one of the three modes.

1. Read-only subagents draft each write and return it as data. The orchestrator writes each draft to a scratch file, as `sk-agent-prompts.md` Rule 9 asks.
2. Fresh verifiers, sealed from the drafters as Rule 5 asks, get each draft and its sources, but not the drafters' commands or reasoning. Each verifier measures every claim with commands of its own, so a wrong command is caught rather than repeated. It fails any claim it cannot reproduce. A failed draft is redrafted once, and a second failure goes to the operator.
3. The operator sees the verified drafts as one batch and approves it, vetoing any item they choose.
4. The orchestrator applies the approved drafts.

Review here comes before the write, per draft, where a branch run reviews after the commit. A public write cannot be reviewed away.

The closing summary of this run records the drafts, the verifier failures by claim, the redrafts, the operator's vetoes, and the writes applied. §After an in-session run lists fields for a branch run and does not apply here.

## A plan carries intent

A plan carries intent and acceptance criteria, and code in it is a sketch in the right language. The executor is whoever implements a task: superpowers' implementer subagents, or the session itself in native mode. A plan scripted to the character fails twice. The planner spends its effort predicting the tree. The executor, told to implement exactly, stops on every misfit that a competent engineer would settle in a line.

- **The executor reasons past a small misfit.** It shapes the sketch to the tree and lists each deviation in its report, so the reviewer can check it. It raises a genuine contradiction, or a misfit that keeps recurring, because a recurring one means the plan's premise is wrong.
- **Precision stays where reasoning cannot reach.** Decisions and mechanism facts go in the design note or spec, since the executor cannot derive them. Contracts between tasks are stated, because in the subagent modes each task is built without sight of the others. Outward and irreversible steps stay exact, operator-gated, and run by the orchestrator, since a deviation there cannot be reviewed away.
- **Run the plan on a model that can reason.** The session that runs the plan, this one or a worker, settles what the plan leaves open. A plan that leaves small decisions assumes that session can make them. Superpowers decides how it dispatches implementers, and on which models.
- **State the stance in the plan's Global Constraints.** Superpowers hands those to every implementer and to inline execution alike. A section of its own reaches no implementer, because each receives only its task, the interfaces it touches, and the global constraints. The stance includes the executor's claims check. The executor checks each claim it writes against its source, and finds the other copies of each fact it changes. It lists a copy outside its task as a concern rather than editing it, since only the plan sets a task's scope.

## Before the plan goes out

These hold in every mode.

- **The plan names its milestone plan.** It applies in a tracked repo, to a plan that carries issues of an active milestone with a plans header. The plan's header names which of those plans it is. A plan matching none means the milestone has grown. `sk-pm-conventions.md` §Change control then decides: a small addition, or a question for the operator before the plan goes out.
- **Gate expectations are measurements.** A gate value that depends on the tree, such as a test count, states the command that measures it, or a formula from the tree. A number measured somewhere else is true there and false at the worker's step. Everything else in the plan is intent, and the executor checks it against the tree.
- **The planner checks the plan's claims.** Name the source of each fact the plan states: the file, or the command that measures it, so the executor can check it there. Re-measure a fact taken from an issue body or a report before the plan states it; it held only where it was measured. Find every other copy of each fact the plan changes with `git grep`, read the block each copy sits in, and put it in a task's scope. Each implementer sees only its own task, so a copy that no task names costs a fix round when review finds it. An output the plan hands someone to decide on states what complete means, such as one line per removed line, so a gap shows.
- **Prose tasks run the prose check.** The repo may declare a `prose` script, such as `scripts.prose` in `package.json`. When it does, every task that writes or edits prose ends by running it on the files the task changed. Errors are fixed before the commit; warnings go in the task's report. Check that its summary counts every file named: some prose checkers read a mistyped path as text and pass it. The step sits inside the task because the task's own text is the one part of the plan every implementer is sure to read.
- **Reviewers check claims, by a hook.** The reviewers that `subagent-driven-development` and `executing-plans` dispatch open a review package: `review-<base>..<head>.diff`, in the plan's workspace. Sidekick's hook on `Read` then adds its reviewer lines to the reviewer's context. Under the reproduce rule, the reviewer re-runs each non-test check the implementer reports as passing, and credits only what it reproduces. That rule departs from superpowers' rule that a task reviewer runs checks only on a specific doubt, and the test suite stays exempt. Under the claims check, the reviewer confirms each stated fact at its source, and reports a claim it cannot trace. It uses `git grep` to find stale copies of each fact the diff changes. The claims check works inside superpowers' rule that a task reviewer looks outside the diff only for a risk it can name. A stated fact is such a risk, and a changed fact's copies are its call sites. The reviewer also holds the comments the diff adds to `sk-clean-code.md` §Comments, which reading a diff does not load. The hook adds that section only when the package shows files the rule covers. The plan carries nothing for these lines; ADR-0011 records the mechanism.
- **Steps after the tasks go in an after-file.** Superpowers puts everything after the last task into that task's brief, so the plan ends with its last task. Steps that run once the tasks are done, and that `finishing-a-development-branch` does not cover, go in `<plan>-after.md` beside the plan. The orchestrator runs them.
- **The plan passes the prose check itself.** Run the repo's `prose` script on the plan file before the handoff. An error blocks the handoff.

## Review by kind

In the two subagent modes:

- A code task gets the normal task review.
- Tasks that apply the same kind of prose change to many files are same-shape work. Mark them in the plan so the controller batches them into one dispatch and one review.
- The whole-branch review always runs.

## Route every finding

A review's findings are graded by their effect, not by the reviewer's label, and each gets a route before the workspace is deleted. Ask of each: if it were left, would the repo, the work, or the milestone stop being correct or consistent? Then it is part of the work, fixed in the branch. That covers text the branch wrote, and any place still stating a premise the branch retired. Anything else is an addition under `sk-pm-conventions.md` §Change control, or a drop whose reason the operator hears. This overrides superpowers' rule that minors never enter the fix pass. A finding left only in a closing message has no home once the session ends.

The whole-branch reviewer also lists what it declined to judge. In every mode, the session running the plan rules on each line, and a line it rules a finding is routed like any other. A worker records those rulings in its run report.

## Hand off to a worker

When the operator chooses the worker mode, they open a session in the repo and start `sk-worker` there. Then:

1. Find the worker with `ListAgents`.
2. Message it the handoff:
   - the plan and the spec;
   - the baseline commit and the gate results at that commit;
   - where to work: a branch in the main checkout, a branch in a worktree, or "in place" when the operator agreed to that;
   - the superpowers skill to run.
3. Answer its scan report in one reply where you can. Keep a table of any expected value a ruling moves, so later tasks' numbers stay right.
4. When the run report arrives, review the whole branch yourself, since a per-task review cannot see a defect at the seam between tasks. Add your review's defects under "Defects by stage" in the run report. Route every defect still open there, and every declined line the worker ruled a finding, as §Route every finding says. Then integrate the branch as the repo's guidance says: a fast-forward, or a pull request whose body carries `Closes #N`. Where the guidance is silent, infer the route from the repo's history. Confirm it with the operator, and record it where the repo keeps its guidance. Run the plan's after-file, if it has one, and close the issues through `sk-track`.

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
