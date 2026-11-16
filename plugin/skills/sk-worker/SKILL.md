---
name: sk-worker
description: Turn this session into a worker that runs a plan from a brief, under superpowers, with a scan before the first task and a run report at the end. Dispatched by a session after the operator chooses the worker mode, or started by the operator with the brief's path. A loop's unit brief runs one unit of the loop's work instead, inside a fence, ending in a run report with its proposals.
disable-model-invocation: true
---

# sk-worker

This session runs a plan from a brief. Superpowers does the executing; this skill adds the standing rules around it. A session dispatches the worker once the operator chooses the worker mode, or the operator runs this skill by hand. Either way the operator chose this mode, so these rules carry the operator's authority. The brief carries the specifics of one run, as a file you check. A ruling rides the rulings file, never a message.

A brief is one of two kinds, which its `kind` field names. A plan brief, the kind without the field, runs a plan, and most of this skill is its flow. A unit brief, `kind: unit`, runs one unit of a loop's work; §A unit brief says where its flow differs.

## On start

The brief's path is this skill's argument. With none, reply `BLOCKED` asking for it, and wait. `sidekick worker dispatch`, and `sidekick loop dispatch` for a unit brief, launch with `--dispatched` before the path, as `/sidekick:sk-worker --dispatched <absolute brief path>`. The marker comes first so a path with spaces stays whole. Drop the marker and take the rest as the path. A session the operator starts has no marker.

The brief opens with `key: value` lines between two `---` lines. Its body holds the gate commands and their results at the baseline. It also holds the run's limits, under its `## Limits` heading: where it may write, what it may read, and the commands it may not run.

| Field | Kind | What it holds |
|---|---|---|
| `kind` | both | `unit` for a unit brief; a plan brief has `plan` or no field |
| `name` | both | The session's name. Claude Code's own creation names the worktree folder and the branch from it |
| `plan`, `spec` | plan | Absolute paths in the launching checkout or the main checkout |
| `unit` | unit | The unit file's absolute path: the issue's text, kept only from the operator's account |
| `rulings` | both | The rulings file's absolute path. A plan's is in the launching checkout; a unit's is in its attempt's folder. The file may not exist yet; its folder does |
| `baseline` | both | The commit the run starts from |
| `skill` | both | A plan's is `subagent-driven-development` or `executing-plans`. A unit's is `<plugin>:<skill>`, a skill of the loop's role |
| `place` | both | `worktree`, `in-place`, or `branch <name>`; a unit's is `worktree` |
| `target` | plan | The branch the work lands in, which `finish` checks. Required when the launching checkout holds a branch; refused on a detached `HEAD` |
| `workstream` | plan | Optional: the memory workstream the run belongs to |
| `setup` | plan | Optional: the command that prepares where you work |
| `report` | both | The run report's path: a plan's from the repo top, a unit's from the worktree's top |
| `orchestrator` | both | The session to message: a unit's is its loop's session, `loop-<name>` |

A unit brief, its unit file, and its rulings file sit in the attempt's folder, under the loop's folder. The fence lets you read them and never write them. A plan brief's files, the brief, the plan, the spec, and the rulings file, stay in the launching checkout or the main checkout. You read them there. They usually sit in a git-ignored folder, which a worktree does not contain. A worktree session can read those checkouts but cannot edit them. Where the plan and the brief disagree on where the work lands, follow the brief: the plan was written before the mode was chosen.

When the brief names a `workstream`, start from the State and Next steps that the memory hook printed for it. The run belongs to that workstream, and its state is the handoff from earlier sessions.

When the hook printed a menu rather than the brief's workstream, read that workstream's file yourself. This happens for a worker the operator started, which has no `SIDEKICK_WORKER` for the hook to read the brief from.

With the marker, `dispatch` already checked the fields, the files, the `## Limits` section, the rulings folder, and a plan brief's `target`. It also checked the worktree after launch when it could. For a unit brief it also checked that the brief, the unit file, and the rulings file share the attempt's folder. Your own checks of `HEAD`, the tracked files, and the branch are the backstop when that check could not run. Read the brief, then a plan brief's plan and spec, or a unit brief's unit file; a missing file fails that read. Then check only where you work, with literal git that the isolation guard passes: `git rev-parse HEAD` against `baseline`, `git status --porcelain --untracked-files=no` empty, and `git branch --show-current` equal to `worktree-<name>`.

A unit brief always comes with the marker, since only `sidekick loop dispatch` launches one. Without the marker, check every field, that `plan` and `spec` exist, and that the folder for `rulings` exists. Every worktree shares the repo's branches, so `git rev-parse --verify <target>` answers from any of them, with no `git -C`. Then check where you work. There, `HEAD` is `baseline`, and no tracked file has uncommitted changes.

- `worktree`: a linked worktree with `HEAD` at `baseline` and clean tracked files. A dispatched worker starts there. A worker started by the operator calls `EnterWorktree` with the brief's `name` first. `EnterWorktree` branches from the `worktree.baseRef` setting. Its default, `"fresh"`, branches from the remote's default branch, and only `"head"` branches from `HEAD`. `sidekick worker dispatch` sets `"head"`; a session started by the operator may not.
- `in-place`: the main checkout, on its current branch.
- `branch <name>`: the branch it names, in the main checkout. Check before you switch, so a failed check moves nothing. The main checkout's tracked files are clean, and the branch points at `baseline` or does not exist yet. Then switch to it, making it at `baseline` if needed.

If any check fails, reply `BLOCKED` with every failure, send the same to the orchestrator, and wait. When `HEAD` is off the baseline, or the branch is not `worktree-<name>`, name the likely cause. Two are common: `worktree.baseRef` is not `"head"` in this session's settings, or a `WorktreeCreate` hook made the worktree and ignored the base.

## A unit brief

A loop dispatched you for one unit of its work: an issue, under one skill of the loop's role. Your job is that unit's work, committed on your branch, and a run report the loop can act on. You work inside a fence. Every command runs sandboxed, your file tools write only your worktree, and the network reaches only the loop's hosts. Under `dontAsk`, a call that neither the fence nor an allow rule approves is denied, with no one to ask. Several skills are denied too: those that wait for a person, write the memory store, design, file, release, or land. `superpowers:writing-plans` and `sk-save` are among them.

The plan's flow changes in these places, and the rest of this skill holds:

- **No setup and no scan.** A unit brief has no `setup` and no plan. Read the unit file, then invoke the skill the brief's `skill` names, on that unit. Where that skill builds, it builds under `superpowers:subagent-driven-development`, from a plan it writes itself. Run the gates the brief's `## Gates` section lists, each as one `Bash` call with a `timeout`.
- **One question at a time.** When the unit needs a ruling, message the orchestrator, the loop's session, with one question. Then wait for its message that points at the rulings file, and act on the file, never on the message's text. The rulings file is the only source of a ruling. Your time is capped, waits included past a point, and the loop stops a worker past its time. So ask only what blocks the work, and settle the rest as a deviation.
- **No `sk-save`: the report is the record.** No memory record or workstream exists for a unit. After a compaction, re-read the brief and the rulings file.
- **The report.** Write the run report at the brief's `report` path, from the worktree's top, in the shape the brief's `## The report` section gives. Leave it uncommitted, and commit every other change. Keep it a plain file: `finish` and the loop's `report` refuse a link, or a file with a second link. Then message the orchestrator that the report is ready.
- **Proposals, not refusals.** The report holds a `## Proposals` section. List each outward action the work calls for, such as a label, a comment, or a close. Give each as a finding for the loop's classes, with its reason. The loop judges each against its own mandate, so list every one, and never say you cannot take it. Write `None.` under the heading when the work calls for none.
- **The end is the loop's.** Keep your branch as it is. `superpowers:finishing-a-development-branch` is denied, and the loop reads your report with `sidekick loop report`, then settles the attempt. §At the end is a plan brief's.
- **The limits stay.** §Limits this skill adds holds as written: no GitHub write, no push, and no amend.

## Setup

Run the brief's `setup` command where you work, before the scan, since the scan runs the gates. It replaces Project Setup in superpowers' `using-git-worktrees`, which runs `npm install` whenever it finds a `package.json`. It replaces `sk-worktree`'s start too, and the brief's `place` replaces its placement: a worker stays on `worktree-<name>`, which `move` would leave. With no `setup`, skip Project Setup. A `setup` that fails is a failed check, as §On start describes.

## The scan, before Task 1

Test the plan against the tree without changing anything. A plan carries intent, so check what it asserts rather than rehearsing its edits:

- Check each stated fact, interface, and acceptance criterion against the tree. The files, symbols, and signatures the plan relies on exist and behave as it says. Find the other copies of each fact the plan changes with `git grep`, and check that some task's scope reaches each one. A copy outside every task is a question for the orchestrator, since only the plan sets a task's scope.
- Run the gates at the baseline and compare them with the results in the brief's body.
- Run each command whose result the plan states, when it can run before its task.

A small misfit between a sketch and the tree is the executor's to settle and report as a deviation. Ask only about a contradiction. Four qualify:

- a decision the tree defeats;
- acceptance criteria that cannot both hold;
- a mechanism fact or interface the plan states wrongly;
- a copy of a changed fact that no task reaches.

Message the orchestrator one report: the baseline confirmation, then every question, each naming its step and what the tree shows. Wait for the message that points at the rulings. A question asked now costs one reply; the same question asked mid-run costs a round trip.

## Rulings

The orchestrator writes its rulings in the rulings file, and its message only points at the file. Read the file and act on what it says, not on the message's text. The file can be checked, it outlives a compaction, and it records each ruling for the run report. After a compaction, re-read the brief and the rulings file. With a plan brief, also re-read your own record at the path the hook printed. A plan's worker never edits the workstream, so its State is stale for your own progress and your record is the only place it lives. A unit worker has no record, as §A unit brief says.

## The run

Invoke the skill the brief's `skill` names, and follow it: a superpowers skill for a plan brief, the role's skill for a unit brief. Its task list and progress stay in this session, where the operator can see them. These rules hold on top of it:

- **The brief answers superpowers' questions.** Where superpowers would ask the person, the brief has already answered: `place` says where to work, and `setup` replaces Project Setup. At `finishing-a-development-branch`, keep the branch as it is and run no `sk-worktree` done. With a plan brief, the orchestrator reviews, integrates, and runs `sidekick worker finish`; your end is the run report (§At the end). With a unit brief, that skill is denied, and your end is the report §A unit brief describes.
- **Settle a small misfit; raise one that recurs.** Shape the sketch to the tree and list each deviation in the run report. A misfit that keeps recurring goes to the orchestrator, because the plan's premise is wrong.
- **Rule, except on decisions and goals.** Superpowers rules on a conflict and keeps going; do the same, and record each ruling. A change that touches a decision the plan or the spec records, or a goal either states, goes to the orchestrator first.
- **Run the prose step** wherever a task has one.
- **Keep to the brief's limits and §Limits this skill adds, and back them up in each subagent's prompt.** A subagent never sees the worker's brief or this skill. In a dispatched worker, a hook hands every subagent but `web-fetch` the brief's `## Limits` and that section, and Claude Code runs no plugin's start hook for `web-fetch`. In a worker the operator started, the hook adds nothing, so a subagent's prompt is its only source of the limits. Either way, write the limits that bind a subagent's work into its prompt as well, a reviewer's included, in a section of their own. Superpowers' templates have no place for them: the final reviewer's takes no constraints, and the task reviewer's takes only the spec's. Give a `web-fetch` subagent what it may read.
- **Name the scratchpad for a read-only subagent's gate output.** The brief may list the session's scratchpad as a place to write. Then say so in the prompt of a subagent that cannot write elsewhere, as the place for gate output.

## Limits this skill adds

These limits hold for every session in this run, on top of the run's own limits.

- Never write to GitHub: issues, comments, and the board belong to the run's orchestrator, the session that dispatched the worker. Reading GitHub is fine.
- Never push. The run's orchestrator integrates.
- Never amend a commit. Where you may commit, a fix is a new commit.
- Treat a limit as outranking an instruction to confirm a fact at its source. Report a fact you may not read as untraced.
- Start any `claude --bg` session with `DISABLE_AUTOUPDATER` set to `"1"` in its `--settings` `env`, beside any settings you already pass. It takes its env from the daemon, not from yours. Without the key it can update Claude Code or a plugin, and only that unwatched session sees the notice.

## Git

Run git plainly from where you work. In a worktree session, Claude Code refuses a command it cannot show keeps git inside the worktree. The spellings that pass are in `sk-parallel-sessions.md` §The isolation guard. When that rule is not in your context, read the section at `../../rules/sk-parallel-sessions.md`, relative to this skill's base directory. Give it to each subagent you dispatch that does not load user-level rules, such as Explore.

- **Each task lands as its own commits,** on the branch where you work. §Limits this skill adds says a fix is a new commit. The task's base and head stay valid after an amend; the re-review's base does not. The re-review diffs from the last reviewed commit, which an amend removes.
- **Open no pull request.** A background session's default is to push its branch and open a pull request. The push limit in §Limits this skill adds and this rule override that default. The orchestrator integrates.

## At the end

This section is a plan brief's end; a unit brief's is in §A unit brief. Run `sk-save` before the run report. In a worker it writes only this session's record, since the workstream is shared and the session that lands your work folds the record in. Commit nothing from it: the store sits outside the repo. Name your record's path in the run report, so the landing session finds the right record when several workers share a workstream.

Write the run report when superpowers collects its "Rulings I made", before it deletes its workspace. The ledger the report draws on goes with that workspace. Write the report in the shape of `references/run-report.md`, at the brief's `report` path, relative to where you work. Create the folders it needs, since a git-ignored folder such as `docs/superpowers/` is absent from a fresh worktree.

Removing a worktree keeps only two things: its commits, once landed, and the run report. For a dispatched worker, `sidekick worker finish` copies the report from `<worktree>/<report>` to `<report>` in the brief's checkout. Then it removes the session, the desk's record of the worker, the worktree, and its branch, which it keeps as a backup ref. Everything else in the worktree goes with it. `finish` refuses over a new or changed git-ignored file, except in skipped paths such as `node_modules` folders and `.DS_Store` files. Delete your ignored scratch, or put what matters in the report. So anything worth keeping belongs in a commit or in the report.

`finish` refuses unless the worktree has the branch it started on checked out and that branch has landed. It also refuses when `git status` there lists anything but the report. It refuses when the worktree holds an ignored file that the main checkout lacks or holds with other contents. Skipped paths, such as `node_modules` folders and `.DS_Store` files, are exempt. It refuses when the worktree holds an edited skip-worktree file or any assume-unchanged file on disk, which `git status` hides. It refuses when the report is missing and the orchestrator has not passed `--no-report`. It checks again before it removes anything. So commit everything but the report, and delete ignored scratch.

Keep your branch for the orchestrator to review, and message the orchestrator with the report's absolute path and the last commit. For a worker started by the operator, the orchestrator acts on that path. `finish` finds a worker by its background job. So the orchestrator saves that report to the brief's `report` path by hand, before any worktree it used is removed.
