> Research for the `control-centre` design (R9, #206). Claude ran it on 2026-10-14 in a session with the operator, on Claude Code 2.1.300 and git 2.50.1. It records the end-to-end run of `sidekick worker dispatch` and `finish` from the branch that built them. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Bench: a dispatched worker from brief to finish (2026-10-14)

`2026-10-14-dispatched-worker-probes.md` measured what a dispatched worker rests on, with hand-made settings. This bench ran the shipped verbs instead, with two background sessions on Sonnet. It also measured what the probes left open, and found one defect in `finish`, fixed in `c059403`.

Provenance grades follow the probes report:

- **Measured:** run on 2026-10-14, with the command and the observed output named. Tool calls and results were read from each session's transcript under `~/.claude/projects/`, and job state from `claude agents --json --all`. The model's own report is corroboration only.
- **Inferred:** a reading of measured output. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does `dispatch` start the worker in its worktree, at the baseline? | Yes. Its first command ran in `.claude/worktrees/bench-worker`, on `worktree-bench-worker`, at the brief's baseline | Measured |
| Can a worktree session read git-ignored files in the main checkout? | Yes. The worker read the brief, the plan, and the spec there | Measured |
| Does the worktree guard refuse more than `git -C` and `sh -c`? | Yes. It refused one chained line that mixed git with a shell variable. A chained `git add … && git commit …` ran | Measured |
| Which push spellings does the deny rule `Bash(git push:*)` catch? | `git push` and `env git push`. Not `git -c <key>=<value> push`, which the rewrite then failed | Measured |
| Does `--settings` outrank the project settings layer? | Yes, for `env`. The overlay's `SIDEKICK_WORKER` won over the value in `.claude/settings.json` | Measured |
| How does a worker whose turn has ended list? | `state: done` and `status: idle`, with a live `pid` that the worktree's lock names | Measured |
| Does `claude stop` work on a `done` job? | Yes, exit 0, both while its process idles and after the process has exited | Measured |
| Does `finish` clear an integrated worker with two commits? | Yes, exit 0, with the report saved and the session, worktree, and branch gone | Measured |
| Which `sk-worker` runs under `--plugin-dir` beside an installed `sidekick@rikmorn`? | The `--plugin-dir` copy | Measured |
| Can the orchestrator edit the report inside the worktree? | Yes, with no prompt, from a session that bypasses permissions | Measured |

## Setup

A scratch repository held a bare remote `origin` with `master` pushed. Its `.gitignore` ignored `docs/superpowers/`. Its tracked `.claude/settings.json` set `env.SIDEKICK_WORKER` to `from-project-layer`, to test the layer order. The toy plan had two tasks, each adding a file and committing it. The plan, its spec, the brief, and the rulings file sat under the ignored `docs/superpowers/plans/`.

The repository was trusted through `hasTrustDialogAccepted` in `~/.claude.json`, as in the probes, and the entry was removed when the bench ended. A scratch profile store, named by `SIDEKICK_PROFILES_DIR`, held two profiles:

| Profile | Settings | Dispatch |
|---|---|---|
| `worker` | `{"model": "sonnet", "enabledPlugins": {"sidekick@rikmorn": false}}` | `bench-worker`, `place: worktree`, `skill: executing-plans` |
| `shadow` | `{"model": "sonnet"}`, so the user layer and its `sidekick@rikmorn` stay on | `bench-shadow`, stopped after its scan |

Both dispatches ran from the main checkout:

```
node <sidekick>/plugin/bin/sidekick worker dispatch <brief> --permission-mode bypassPermissions --plugin-dir <sidekick>/plugin [--profile shadow]
```

`dispatch` added `.claude/worktrees/` to `.git/info/exclude`, relayed `claude`'s output with the job's id, and printed its summary. The orchestrating session ran with permissions bypassed.

## The worker's start

The first transcript entry gave the worktree as the session's `cwd`. The worker's own checks printed the baseline sha and `worktree-bench-worker` (measured). The model was Sonnet throughout.

The transcript held `sk-worker`'s new opening text, "The brief's path is this skill's argument", so the branch's skill expanded (measured). The worker then read the brief, the plan, and the spec by their main-checkout paths with the Read tool, and listed their folder with `ls` (measured).

Its first Bash call was refused before it ran. The call chained `pwd`, three git commands, a shell variable assignment, `ls` on that variable, and `test`. The refusal read, in part (measured):

> This session is isolated in the worktree …, but this command names git in a form too complex to verify that it stays inside the worktree. … Split it into plain, separate commands

The worker split the call and went on. Later, `git add one.txt && git commit -m "feat: one.txt"` ran unrefused in both tasks (measured). Inferred: the guard objects to the variable or to the mix, not to chaining as such.

## The push block

The rulings file asked for three push attempts, one Bash call each. The worker recorded each output word for word (measured in its transcript):

| Command | Result |
|---|---|
| `git push origin HEAD` | "Permission to use Bash with command git push origin HEAD has been denied." |
| `env git push origin HEAD` | "Permission to use Bash with command env git push origin HEAD has been denied." |
| `git -c core.quotepath=false push origin HEAD` | Exit 128: "fatal: remote helper 'sidekick-push-blocked' aborted session" |

So the deny rule sees through an `env` prefix but not a `git -c` option. The rewrite stopped the third push. The remote held only `master` at its first commit afterwards (measured, `git for-each-ref` on the bare remote).

`echo "$SIDEKICK_WORKER"` printed the brief's path, not `from-project-layer` (measured). So `--settings` outranked the project layer's `env`. The user and local layers were not tested.

## Stopping a worker whose turn has ended

After the worker sent its run report, `claude agents --json --all` listed it with `pid` 48422, `status: idle`, and `state: done`. The worktree's lock read `claude session bench-worker (pid 48422 …)` (measured). So `done` means the turn ended, not the process.

`claude stop <id>` printed `stopped <id>`, said the worktree was retained, and exited 0. The process then exited, but the lock file stayed, still naming its pid. A second `claude stop` on the exited session printed the same text and exited 0 (measured). After the stop the row still said `state: done`, with no `pid` or `status`. The probes, on Claude Code 2.1.299, saw `stopped` after a stop.

`finish` skipped `claude stop` for a job listed as `done`. It then waited for the lock's process, which idles and never exits on its own. So every normal `finish` would have waited 15 seconds and refused (inferred from the code and the measured listing). `c059403` makes `finish` skip the stop only when the job lists as ended and the lock's process has exited. Run on the second dispatch, which listed `done` with its process alive, the fixed `finish` stopped it and exited 0 in 2 seconds (measured).

## Finish

The orchestrating session added a line to the run report inside the worktree with its Edit tool, and nothing prompted (measured, under `bypassPermissions` only). It fast-forwarded `master` onto `worktree-bench-worker` and ran `finish`, which printed its four lines and exited 0 (measured):

```
report saved to <repo>/docs/superpowers/plans/toy-run-report.md
session 98e3a1e7 removed
worktree <repo>/.claude/worktrees/bench-worker removed
branch worktree-bench-worker removed
```

`claude agents --json --all` then listed no bench job, and `git worktree list` showed the main checkout alone (measured). `finish` prints no `claude rm` text on success, so which path it took is unrecorded. The two commits were on no remote, so the probes' finding says `claude rm` kept the worktree and offered a discard. `finish` runs that line only when its sha equals the verified head. Inferred: the discard sha was the branch head on this two-commit run.

## A second sidekick beside `--plugin-dir`

The user settings enable `sidekick@rikmorn` 0.5.1. The `shadow` profile kept that layer, and the dispatch added `--plugin-dir` for the branch's plugin. The expanded skill's base directory was the branch's `plugin/skills/sk-worker` (measured). The transcript named no path in the installed plugin's cache (measured, by search). Inferred: the `--plugin-dir` copy takes the plugin's name, and the installed copy does not load beside it.

## Not measured

- The user and local settings layers against `--settings`.
- `claude rm`'s text on Claude Code 2.1.300 for a multi-commit worktree.
- A worker under any mode but `bypassPermissions`, and an orchestrator editing the worktree's report without bypass.
- A worker running `subagent-driven-development`; the bench used `executing-plans`.
- `claude stop` on a job that is still working.
- The context monitor's worker text, which needs 75% of a window.
