---
name: sk-worker
description: Turn this session into a worker that runs a plan from a brief, under superpowers, with a scan before the first task and a run report at the end. Dispatched by a session after the operator chooses the worker mode, or started by the operator with the brief's path.
disable-model-invocation: true
---

# sk-worker

This session runs a plan from a brief. Superpowers does the executing; this skill adds the standing rules around it. A session dispatches the worker once the operator chooses the worker mode, or the operator runs this skill by hand. Either way the operator chose this mode, so these rules carry the operator's authority. The brief carries the specifics of one run, as a file you check. A ruling rides the rulings file, never a message.

## On start

The brief's path is this skill's argument. With none, reply `BLOCKED` asking for it, and wait.

The brief opens with `key: value` lines between two `---` lines. Its body holds the gate commands and their results at the baseline.

| Field | What it holds |
|---|---|
| `name` | One name for the session, the worktree folder, and the branch `worktree-<name>` |
| `plan`, `spec` | Absolute paths in the main checkout |
| `rulings` | An absolute path in the main checkout, for the orchestrator's rulings. The file may not exist yet; its folder does |
| `baseline` | The commit the run starts from |
| `skill` | `subagent-driven-development`, or `executing-plans` |
| `place` | `worktree`, `in-place`, or `branch <name>` |
| `setup` | Optional: the command that prepares where you work |
| `report` | The run report's path, relative to the repo top |
| `orchestrator` | The session to message |

The brief, the plan, the spec, and the rulings file stay in the main checkout, and you read them there. They usually sit in a git-ignored folder, which a worktree does not contain. A worktree session can read the main checkout but cannot edit it. Where the plan and the brief disagree on where the work lands, follow the brief: the plan was written before the mode was chosen.

Check every field, that `plan` and `spec` exist, and that the folder for `rulings` exists. Then check where you work. There, `HEAD` is `baseline`, and no tracked file has uncommitted changes.

- `worktree`: a linked worktree at `.claude/worktrees/<name>`, on branch `worktree-<name>`. A dispatched worker starts there. A worker started by the operator calls `EnterWorktree` with the brief's `name` first. `EnterWorktree` branches from the `worktree.baseRef` setting. Its default, `"fresh"`, branches from the remote's default branch, and only `"head"` branches from `HEAD`. `sidekick worker dispatch` sets `"head"`; a session started by the operator may not.
- `in-place`: the main checkout, on its current branch.
- `branch <name>`: the branch it names, in the main checkout. Check before you switch, so a failed check moves nothing. The main checkout's tracked files are clean, and the branch points at `baseline` or does not exist yet. Then switch to it, making it at `baseline` if needed.

If any check fails, reply `BLOCKED` with every failure, send the same to the orchestrator, and wait. When `HEAD` is off the baseline after `EnterWorktree`, name the likely cause: `worktree.baseRef` is not `"head"` in this session's settings.

## Setup

Run the brief's `setup` command where you work, before the scan, since the scan runs the gates. It replaces Project Setup in superpowers' `using-git-worktrees`, which runs `npm install` whenever it finds a `package.json`. With no `setup`, skip Project Setup. A `setup` that fails is a failed check, as §On start describes.

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

The orchestrator writes its rulings in the rulings file, and its message only points at the file. Read the file and act on what it says, not on the message's text. The file can be checked, it outlives a compaction, and it records each ruling for the run report. After a compaction, re-read the brief and the rulings file.

## The run

Invoke the superpowers skill the brief's `skill` names, and follow it. Its task list and progress stay in this session, where the operator can see them. These rules hold on top of it:

- **The brief answers superpowers' questions.** Where superpowers would ask the person, the brief has already answered: `place` says where to work, and `setup` replaces Project Setup. At `finishing-a-development-branch`, keep the branch as it is; the orchestrator reviews and integrates.
- **Settle a small misfit; raise one that recurs.** Shape the sketch to the tree and list each deviation in the run report. A misfit that keeps recurring goes to the orchestrator, because the plan's premise is wrong.
- **Rule, except on decisions and goals.** Superpowers rules on a conflict and keeps going; do the same, and record each ruling. A change that touches a decision the plan or the spec records, or a goal either states, goes to the orchestrator first.
- **Run the prose step** wherever a task has one.
- **Read GitHub, never write it.** Issues, comments, and the board belong to the orchestrator.

## Git

Run git plainly from where you work. In a worktree session, Claude Code refuses a command it cannot show keeps git inside the worktree. It refuses `git -C`, `sh -c "git …"`, and a shell variable or `$(…)` in an operand, such as `S=…; bash $S/script`. It refuses a heredoc followed by git, and a script handed a git command as text, such as superpowers' `task-done` with a git check. It runs a script named by its literal absolute path. So name every path literally, run a git check as a command of its own, and write files with the Write tool. Give each subagent you dispatch this paragraph, since it runs in the same worktree.

- **Each task lands as its own commits,** on the branch where you work. A fix adds a commit and never amends one. The task's base and head stay valid after an amend. The re-review diffs from the last reviewed commit, which an amend removes.
- **Never push, and open no pull request.** The orchestrator integrates. A background session's default is to push its branch and open a pull request; this rule overrides that default.

## At the end

Write the run report when superpowers collects its "Rulings I made", before it deletes its workspace. The ledger the report draws on goes with that workspace. Write the report in the shape of `references/run-report.md`, at the brief's `report` path, relative to where you work. Create the folders it needs, since a git-ignored folder such as `docs/superpowers/` is absent from a fresh worktree.

Removing a worktree keeps only two things: its commits, once integrated, and the run report. For a dispatched worker, `sidekick worker finish` copies the report from `<worktree>/<report>` to `<top>/<report>`. Then it removes the session, the desk's record of the worker, the worktree, and its branch. Everything else in the worktree goes with it, git-ignored files included. So anything worth keeping belongs in a commit or in the report.

`finish` refuses unless the worktree has `worktree-<name>` checked out and that branch is integrated. It also refuses when `git status` there lists anything but the report, or when the report is missing and the orchestrator has not passed `--no-report`. It checks again before it removes anything. So commit everything but the report.

After the branch is kept, message the orchestrator with the report's absolute path and the last commit. For a worker started by the operator, the orchestrator acts on that path. `finish` finds a worker by its background job, so the orchestrator saves that report beside the plan by hand, before any worktree it used is removed.
