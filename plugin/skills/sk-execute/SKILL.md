---
name: sk-execute
description: How a written plan runs. Lays out the execution modes with a recommendation, prepares the plan so the run is checked, and hands it to a worker session when that mode is chosen. Use when a plan is being written or is ready, when writing-plans asks which approach to take, or when asked how to run a plan.
---

# sk-execute

A written plan runs under superpowers: `subagent-driven-development`, or `executing-plans` for superpowers' native mode. §Outward writes and a plan's after-file run outside superpowers. This skill chooses how, prepares the plan, and hands it off. It adds to superpowers and replaces none of it, except the rules this paragraph names, each overridden where it applies. `writing-plans` asks for complete code with no placeholders. Superpowers also tells its executors to carry out the plan exactly, in the implementer's prompt and in `executing-plans`. §A plan carries intent overrides both. Superpowers' task reviewers run a check only on a specific doubt; §Before the plan goes out describes the hook that has them reproduce claimed checks. Minor findings never enter superpowers' fix pass; §Route every finding overrides that. `writing-plans`' handoff question offers two modes with a recommendation. It says, as `executing-plans` does, that native execution runs well on a mid-tier model because the plan carries the design. §Choose the mode replaces the question, and §A plan carries intent replaces the premise. The worker side is `sk-worker`, which a session dispatches after the operator chooses the worker mode.

## Choose the mode

Before laying out the modes, run `sidekick worker dispatch --check --permission-mode <mode>`. It needs no brief. Pass this session's own mode, as its context states, and ask the operator when unsure. Add `--plugin-dir <dir>` when this session tests unreleased plugin content. The check tells you whether a worker can run from this checkout at all. When it refuses, the worker row says the worker cannot run here and quotes each refusal line, and the recommendation leaves the worker out. When `--check` names uncommitted tracked changes, name them before the choice, with their fix: commit them, since the worker's worktree is made from `HEAD`. A pass leaves the brief's own checks to `dispatch`. When the operator has already named a method other than the worker, skip the check. The worker is not on offer, and the call costs a `claude doctor`.

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
- **The plan names no branch.** It is written before the mode is chosen, so where the work lands is settled later. For a worker the brief settles it, and for a run in this session the chosen mode does.
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

When the operator chooses the worker mode, this session dispatches the worker as a background session. The worker runs in a worktree of its own, made from the `HEAD` of this session's checkout. Its pushes are blocked unless the operator allows them. The `sidekick` skill's `references/workers.md` says what the block does not stop. Then:

1. **Write the brief** in this checkout, as `<plan>-brief.md`, with the fields `sk-worker` §On start lists.
   - `place` is `worktree`, the only place `dispatch` starts a worker.
   - `orchestrator` is this session's name, as `ListAgents` prints it.
   - `rulings` names a file in this checkout, which need not exist yet. `report` is the run report's path in the repo; `finish` copies the report to that path in this checkout.
   - `target` is the branch this checkout holds, where the work lands. Leave it out on a detached `HEAD`; `dispatch` refuses a `target` there.
   - Set `workstream` to the memory workstream whenever the work belongs to one, so the worker starts from its state. Leave it out otherwise.
   - `setup` prepares the fresh worktree, such as installing dependencies. Without it, the worker prepares nothing.
   - `baseline` is this checkout's `HEAD`, with no uncommitted changes to tracked files, or `dispatch` refuses.

   Run the gates at the baseline, and put each command and its result in the brief's body.
2. **Dispatch** with `sidekick worker dispatch <brief> --permission-mode <mode>`, where `<mode>` is this session's own mode, as its context states; when unsure, ask the operator. A session in another mode holds this session's messages for approval, and they expire. Add `--allow-push` only on the operator's word for this dispatch. Add `--plugin-dir <dir>` when this session tests unreleased plugin content, so the worker runs the same skills. `dispatch` refuses with every reason it finds; fix them and run it again. Give it a Bash timeout of 300000 ms. Its launch and its worktree check can together pass the default 120 s. When it prints "the worktree check did not run", the worker is running, and its own start check of `HEAD` and the branch is the backstop. Once the worker starts, `dispatch` prints its id. When `dispatch` prints the `main:` line with its `←` warning, tell the operator not to press `←` until this session is idle.
3. **Subscribe** with `SendMessage`'s `notify_when_idle`, as a backstop for a worker that goes quiet. The worker's own messages, its questions and its run report, are the signal.
   - Pass it with each message you send the worker, since a subscription fires once.
   - A notice fires whenever the worker's turn ends with nothing queued. That includes a wait on a background command. It also includes the turn before your message, whose notice can reach you late, after you reply to the worker. Read the notice's text: a wait or an earlier turn is not a finish. Ignore a late one, since the subscription your message made still fires.
   - Subscribe again with no message only when `ListAgents` shows the worker `busy`. Under `idle` or `shell`, such a subscription fires at once for its last turn. The `claude agents` listing cannot tell `shell` from `busy`.
4. **Answer the scan in one round** where you can. Append the rulings to the rulings file, then message the worker to point at them. The worker acts on the file, not on the message's text. Keep a table of any expected value a ruling moves, so later tasks' numbers stay right.
5. **When the run report arrives,** take these in order.
   - **Review and route.** Review the whole branch yourself, since a per-task review cannot see a defect at the seam between tasks. Add your review's defects under "Defects by stage" in the run report, in the worktree, since `finish` saves that copy. Route every defect still open there, and every declined line the worker ruled a finding, as §Route every finding says.
   - **Integrate** the branch as the repo's guidance says: a fast-forward, or a pull request whose body carries `Closes #N`. Where the guidance is silent, infer the route from the repo's history. Confirm it with the operator, and record it where the repo keeps its guidance.
   - **Finish** with `sidekick worker finish <brief>`, once the work has landed in the brief's `target`. A merged pull request counts once this checkout pulls it, or once a fetch makes it visible and `--into origin/<default branch>` names it. To name another target, pass `--into <rev>`. `finish` runs from any checkout. A rebase or squash landing counts, since `finish` checks the content, not only the commit ids. A landing that changed the worker's content refuses, and `--discard` is then the operator's call. Run `finish` with the Bash tool's `run_in_background`, since `claude rm` may run for minutes. The Bash tool stops a foreground call at 120 seconds by default and 600 at most.
   - **Fold the record.** Once the work has landed, run `sk-save` to fold the worker's record into its workstream. A worker writes only its own record, so this is the one place the workstream learns what the run did. This session's hook ran before the worker wrote. Find the record at the path the worker's run report names, or in the repo folder's `sessions/`. Its `metadata.workstream` is the brief's `workstream`.
   - **Close out.** Run the plan's after-file, if it has one, and close the issues through `sk-track`.

`finish` saves the run report to the brief's `report` path in the checkout that holds the brief, then removes the worker's session, desk record, worktree, and branch. It refuses unless the worktree has the branch it started on checked out, that branch has landed, the worktree is clean, and the report exists. A new or changed ignored file outside skipped paths such as `node_modules` folders and `.DS_Store` files also counts as unclean. It also refuses when no job or several carry the brief's name, or when a different report already sits at that path. When `finish` cannot find the worktree, or nothing shows the branch it found is the worker's, it names `--worktree <path>`. `--name <name>` stands in for a brief that is gone; it needs `--no-report` or `--discard`, and `--into <rev>` in landed mode. Each refusal says what to do. Once that is done, run `finish` again. A re-run works until `claude rm` succeeds, and it also completes a removal that an earlier `claude rm` cut short. A worktree off Claude Code's own folder or branch is the exception: `finish` names the hook's own removal, then `finish --discard`. After `claude rm` succeeds, run `sidekick worktree list`, then `sidekick worktree remove <name>`, for a worktree left. `remove` takes no lone branch. A branch left with no worktree holds the worker's commits, and blocks only a new dispatch of that name. `finish` keeps every branch it deletes in a backup ref under `refs/sidekick/`. `--no-report` drops the report's condition, for a worker stopped before writing one, on the operator's word. `--discard` clears a worker that did not land, on the operator's word, and still keeps the branch in a backup ref.

- **To steer** mid-run, write the ruling to the rulings file and message the worker to point at it, as in step 4.
- **To stop** the worker, run `claude stop <id>`. The operator looks in with `claude attach <id>`.
- **To clear** a worker's context, replace the worker. Dispatch refuses a brief whose name, branch, or worktree still exists, or whose baseline is not this checkout's `HEAD`, so the old brief cannot run again.
  1. Stop the worker.
  2. Review and land the commits it finished.
  3. Run `finish`.
  4. Dispatch a new brief with a new name, this checkout's `HEAD` as `baseline`, the same plan, and the same `workstream`.

  The memory hook lists the earlier worker's record, which says which task comes next. If its commits cannot land, `finish --discard` on the operator's word keeps them in a backup ref. A message cannot clear a worker: a `/clear` sent by message reaches its model as text, and the session keeps its id.

Finish or discard each worker before you remove the checkout that dispatched it, since `finish` reads the brief there.

A change of scope goes in a fresh handoff, a new brief and a new dispatch, never in a message to a running worker.

**When agent view is unavailable,** the operator starts the worker instead, typing `/sidekick:sk-worker <brief>` in a session of their own. Write the brief as step 1 says, and skip step 2. Choose `place` for that session:

- `worktree` only when that session's settings set `worktree.baseRef` to `"head"`. `EnterWorktree` branches from that setting. Its default, `"fresh"`, branches from the remote's default branch, off the baseline, so the worker blocks.
- Otherwise `in-place`, or `branch <name>`.

Steps 3 to 5 hold, except `finish`: it finds a worker by its background job, so it does not apply here. Before any worktree that worker used is removed, save its run report to the brief's `report` path by hand.

## After an in-session run

At `finishing-a-development-branch`, take the option that matches the repo's route, as §Hand off to a worker step 5 describes. Then run the plan's after-file, if it has one.

The closing summary records these fields beside superpowers' "Rulings I made":

- the mode;
- the escalations, each marked as exposing a plan defect or not;
- the review rounds per task;
- the defects per stage: plan scan, implementer, task review, whole-branch review, and this session's review;
- the deviations from the plan;
- the gates at the end;
- what was not covered.
