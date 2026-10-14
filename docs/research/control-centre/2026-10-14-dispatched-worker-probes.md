Amended 2026-10-14: [2026-10-14-dispatched-worker-bench.md](./2026-10-14-dispatched-worker-bench.md) ran the shipped verbs on Claude Code 2.1.300. There, a job stopped after its turn had ended listed as `done`, not `stopped`.

> Research for the `control-centre` design (R9, #206). Claude ran it on 2026-10-14 in a session with the operator, on Claude Code 2.1.299. A subagent read the docs. It records what a worker dispatched with `claude --bg` rests on. That covers the push block, the worktree, messages, cleanup, and `sk-worker` as a first prompt. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: a worker dispatched in the background (2026-10-14)

`docs/designs/control-centre/workers.md` decided how a session dispatches a worker, and left six facts inferred or untried. This report measures them in a scratch repository, with four background sessions on Haiku. The earlier probes, in `2026-10-12-probes.md` and `2026-10-13-profile-launch-probes.md`, are not repeated.

Provenance grades:

- **Measured:** run on 2026-10-14, with the command and the observed output named. Tool calls and results were read from each session's transcript under `~/.claude/projects/`, and job state from `~/.claude/jobs/<id>/state.json`. The model's own report is corroboration only.
- **Docs:** read in the official Claude Code docs on 2026-10-14 by a subagent, with the page named. Not re-read by Claude.
- **Inferred:** a reading of measured output or docs. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does the push block reach Bash in a background session? | Yes. Settings `env` reached the Bash tool, and `git push origin HEAD` failed, naming the block | Measured |
| Does every spelling of a push fail? | In a plain shell, yes: plain, `git -C`, `sh -c`, and a push to a path. In a worktree-isolated session, Claude Code refused `git -C .` and `sh -c "git …"` before they ran | Measured |
| Does a background session follow `worktree.baseRef: "head"`? | Yes, in both ways of entering a worktree | Measured |
| How does a background session enter its worktree? | By calling `EnterWorktree`. Unprompted, the model calls it before its first edit; prompted, it calls it first | Measured |
| Does `.worktreeinclude` apply to a background session's worktree? | Yes. A gitignored file it names was copied | Measured |
| Do messages from a session that bypasses permissions reach a worker? | Only a worker that also bypasses. A worker in the default mode held the message, which expired undelivered | Measured |
| What does `claude rm` do once a worker's branch is integrated locally? | It keeps the worktree, because the commits are on no remote. `--discard-unpushed <sha>@<worktree-id>` removes the worktree, the branch, and the job | Measured |
| Does `/sidekick:sk-worker <path>` run as a first prompt, despite `disable-model-invocation`? | Yes. The skill expanded and received the path as its arguments | Measured |
| Does the push block hold in a repository whose remote sets `pushurl`? | No. Git ignores `pushInsteadOf` for such a remote, and the push landed. A deny rule `Bash(git push:*)` refused the plain spelling under bypass | Measured |
| Does `claude --bg --worktree <name>` start the session in its worktree? | Yes, from its first command, branched from `HEAD` at dispatch | Measured |
| What does a respawn keep? | The permission mode, the worktree, and the isolation guard | Measured |
| Can a stopped session be found and removed? | `claude agents --json --all` lists it as `stopped`. `claude rm` takes its id, not its name | Measured |

## Setup

Git was 2.50.1. A scratch repository held a bare remote `origin` with `master` pushed. The main checkout stood on a local branch `feature`, two commits ahead of `origin/master`. One of the two commits added `.worktreeinclude` naming `secret.txt`, a gitignored file present in the main checkout.

`claude --bg` refused the folder until it was trusted: `Workspace not trusted. Run claude in <folder> once and accept the trust prompt, then retry.` The same refusal came inside a subfolder of a trusted repository. So trust does not pass to a nested repository (measured). Trust was given by setting `hasTrustDialogAccepted` on the folder's entry in `~/.claude.json`, and the entry was removed when the probes ended.

Every session was dispatched from the main checkout with these settings:

```json
{"worktree":{"baseRef":"head"},
 "env":{"GIT_CONFIG_COUNT":"1",
        "GIT_CONFIG_KEY_0":"url.sidekick-push-blocked::.pushInsteadOf",
        "GIT_CONFIG_VALUE_0":"",
        "SIDEKICK_WORKER":"<probe>"}}
```

The rewrite turns every push URL into `sidekick-push-blocked::<url>`. Git reads the `::` as a request for a remote helper of that name, finds none, and fails.

| Session | Mode | First prompt |
|---|---|---|
| A, `p206-a` | `--permission-mode bypassPermissions` | Call `EnterWorktree`, report state, commit `a.txt`, try three push spellings, then wait |
| B, `p206-b` | No flag, so the default | Report state, create `b.txt`, report state, commit, then wait |
| C, `p206-c` | `--permission-mode bypassPermissions` | `/sidekick:sk-worker <path to a placeholder brief>` |

The orchestrating session ran with permissions bypassed.

## The push block

In a plain shell with the three variables exported, all four spellings failed the same way, and fetch still worked (measured):

```
git: 'remote-sidekick-push-blocked' is not a git command. See 'git --help'.
fatal: remote helper 'sidekick-push-blocked' aborted session
```

In session A, `env | grep -E "GIT_CONFIG|SIDEKICK"` printed all four settings values, the empty `GIT_CONFIG_VALUE_0` included. `git push origin HEAD` then exited 128 with the error in the code block, and no branch reached the remote (measured). Until this run, only a hook had been shown to see settings `env` under `--bg` (`2026-10-13-profile-launch-probes.md`).

Session A's other two spellings never reached git. Claude Code refused each before it ran (measured, the tool results):

- `git -C . push origin HEAD`: "this command points git at a directory computed at runtime (-C .), which can't be verified before it runs. Refusing to run it — a worktree-isolated session's git operations must target its own worktree."
- `sh -c "git push origin HEAD"`: "this command hands sh text naming git in a plain command, which cannot be shown to stay inside the worktree. Refusing to run it".

So a worktree-isolated session's git runs plainly, from its worktree. Inferred: any skill or script a worker runs that uses `git -C` or wraps git in `sh -c` is refused there.

The block is visible to the model. Session B ran `git remote -v` and printed the push URL as `sidekick-push-blocked::<path>/remote.git` (measured).

## The worktree

**`EnterWorktree` is how a background session isolates itself.** Session B ran `pwd` in the main checkout first, as W13 in `workers.md` expects. It then said "I'm entering an isolated worktree, as the background-session rules require for any edit", and called `EnterWorktree` with `{"name": "probe-b"}` (measured). Session A called it first because its prompt asked, with no arguments, and got a generated name (measured). The tool result in both read: "Created worktree at `<repo>/.claude/worktrees/<name>` on branch `worktree-<name>`. The session is now working in the worktree."

**`worktree.baseRef: "head"` held.** In both worktrees, `git log --oneline -3` listed the `feature` commits, and `feature.txt` was present (measured). With the default `"fresh"`, the worktree would branch from `origin/master` instead (docs, `worktrees`).

**`.worktreeinclude` held.** Both worktrees held `secret.txt`, which is gitignored and was never committed (measured). The docs list `--worktree` worktrees, subagent worktrees, and the desktop app's parallel sessions, and do not name background sessions (docs, `worktrees`).

**The job records its worktree.** `state.json` held `worktreePath` and `worktreeBranch`, and `claude agents --json` gave the worktree as the session's `cwd` (measured).

## Steering by message

The orchestrator sent both sessions the same message: create `steer.txt`, commit it, and reply with the hash.

- **Session A, which bypasses as the orchestrator does,** received it, committed `steer`, and replied (measured). A Haiku session following a plain prompt is not an `sk-worker` run on a reasoning model. Whether such a worker refuses a mid-run message as injection, as a subagent did on 2026-09-20 (`workers.md`, W7), is still untested.
- **Session B, in the default mode,** held it. The sender got this notice: "Your message to another session was held by that session … NOT delivered: its Claude has not seen it." A second notice, after B was stopped, reported that the message "was not approved before expiry" (measured).

That matches the docs. A session that prompts for permissions holds a message from a sender that bypasses. A bypassing session holds one from a sender that does not (docs, `cross-session-messaging`). A background session with no flag starts as a new `claude` session in that folder would, which is `auto` on 2.1.283 and later (docs, `agent-view` and `permission-modes`). `claude --bg --permission-mode bypassPermissions` is refused unless the acceptance is recorded in user or managed settings (docs, `permission-modes`). Here `skipDangerousModePermissionPrompt` is set in `~/.claude/settings.json`, and the flag worked (measured).

A subscription with `notify_when_idle` returned one notice each time a session went idle, carrying a line of its last reply (measured).

## The push default

Session B's prompt said nothing about pushing. After committing, it ran `git remote -v`, saw the rewritten URL, and stopped. Its job state then read `state: "blocked"` and `needs: "fix origin push URL (sidekick-push-blocked) or approve pushing another way"` (measured). Its reply asked for "your go-ahead to push a different way".

So without an instruction, the default to push still drives the session, and the block turns it into a session waiting on the operator. The docs give the default: a background session in its own worktree "commits without asking, and pushes the branch when the repository has a remote". "Your git instructions take precedence" when the task, `CLAUDE.md`, or memory says otherwise (docs, `agent-view`). An entry in the docs' version history says such a session also opens a draft pull request when it finishes (docs, `agent-view`, v2.1.198).

## Stopping and cleanup

Session A's branch was fast-forwarded into `feature` in the main checkout. Then (measured):

1. `claude stop <id>` printed `stopped <id>` and "worktree retained at `<path>`".
2. `claude rm <id>`, run at once, kept everything: "A Claude Code lock on the worktree names a process that is still running". The process had gone by the next command.
3. `claude rm <id>` again kept everything: "4 unpushed commits on "worktree-…": … They exist on no remote, so deleting the worktree would lose them." It printed the command that discards them: `claude rm <id> --discard-unpushed <full sha>@<32-hex worktree id>`.
4. That command printed `removed <id>`. The worktree, the branch `worktree-<name>`, and `~/.claude/jobs/<id>/` were gone, and `feature` still held the commits.

Session B, never integrated, was stopped and removed the same way. Its `claude rm` kept everything too, and offered the same discard line (measured).

What a cleanup must know:

- **`claude rm` exits 0 whether it removes or keeps** (measured, every run). Only its output, or `git worktree list` afterwards, tells the two apart.
- **The unpushed count counts the base branch too.** Session A's four commits included the two `feature` commits it started from, which exist on no remote (measured). A branch clears without the flag only when its commits are all on a remote. Commits on the remote default branch, checked out in the main checkout, also count (docs, `agent-view`).
- **The worktree id is found only in `claude rm`'s message.** It is not in `state.json`, and not in git's lock file, which reads `claude session <name> (pid <n> start <date>)` (measured).
- **`claude agents --json` drops a stopped session.** Neither A nor B was listed after its stop, and `--all` listed none of them after their removal (measured).

## `sk-worker` as a first prompt

Session C's transcript opens with `<command-name>/sidekick:sk-worker</command-name>` and `<command-args><brief path></command-args>`. Next comes the skill's text, from the installed 0.5.1, as a meta message (measured). The skill sets `disable-model-invocation: true`, so that flag does not stop a session's own first prompt. `workers.md` W1 inferred this from a probe of a different skill (`2026-10-12-probes.md`).

The worker checked the tree and read the brief. The brief named no plan, spec, baseline, place, or skill, so the worker replied `BLOCKED` with the missing fields (measured). It also said it could not report its own session name: "I don't have it in this context" (measured). It entered no worktree, since it made no edit.

## Second round, after the design review

A review of the design note raised four questions the first round left open. A fourth session, D (`p206-d`), answered them on the same scratch repository, with the same trust entry given and removed.

**An explicit `pushurl` defeats the rewrite.** `git help config` says of `pushInsteadOf`: "If a remote has an explicit pushurl, Git will ignore this setting for that remote." In a plain shell with the three variables exported, `git config remote.origin.pushurl <remote path>` was set. `git push origin HEAD:refs/heads/f1-probe` then printed `* [new branch] HEAD -> f1-probe`, and the branch reached the remote (measured). The probe branch was deleted afterwards.

**A deny rule catches the plain spelling.** Session D ran with the `pushurl` still set, under `--permission-mode bypassPermissions`, with `"permissions":{"deny":["Bash(git push:*)"]}` added to its settings. Its `git push origin HEAD` returned "Permission to use Bash with command git push origin HEAD has been denied." (measured). `workers.md` W4 measured the same rule under `-p`, with two gaps: `git -C` and `sh -c`. Claude Code's worktree guard refuses both in a worktree.

**`--worktree <name>` isolates the session at launch.** Session D was dispatched with `claude --bg --worktree p206-d -n p206-d …`. Its first command, before any edit, printed `<repo>/.claude/worktrees/p206-d` and `worktree-p206-d`. `git log` showed the main checkout's `HEAD`, and `secret.txt` was present (measured). So `worktree.baseRef: "head"` and `.worktreeinclude` apply to it as they do to `EnterWorktree`. The job's `state.json` recorded `worktreePath` and `worktreeBranch` (measured).

**A respawn keeps what matters.** The job's `respawnFlags` held `-n`, `--permission-mode bypassPermissions`, `--settings`, and `--model`, but not `--worktree` (measured). After `claude respawn <id>`, a message from the orchestrating session was delivered: it arrived marked `from-mode="bypass"`, and the worker acted on it. The worker printed its worktree path for `pwd`. It tried to write a file in the main checkout, and Claude Code refused (measured). The refusal began "This session is isolated in the worktree". After the respawn, though, `claude agents --json` gave the main checkout as the session's `cwd` (measured). So that field names the worktree only until a respawn.

Inferred, not measured: an idle background session that stops after about an hour and resumes on reply (`2026-10-12-claude-code-surface.md`) resumes the same way.

**A stopped session stays findable.** After `claude stop`, `claude agents --json` no longer listed session D. `claude agents --json --all` listed it with `state: "stopped"`, its id, and its name (measured). `claude rm p206-d` printed "No job matching 'p206-d'". `claude rm <id>` worked, offering the discard line, which removed the session (measured).

**"Unpushed" means unreachable from a remote-tracking ref.** Session D's worktree started from four commits the remote never received. Yet `claude rm` counted one unpushed commit, the worker's own. The round's first push had left the local ref `refs/remotes/origin/f1-probe` at the main checkout's `HEAD`. Deleting the branch on the remote did not remove that ref (measured, `git for-each-ref refs/remotes`). Inferred: the count is the commits no `refs/remotes/*` ref reaches.

## Not measured

- An `sk-worker` run on a reasoning model, and how it treats a message mid-run.
- Two workers dispatched at once from one checkout.
- A worker that reaches the context monitor's warnings.
- Where `EnterWorktree` or `--worktree` puts a worktree when the session starts in a subfolder of the repository.
- An idle background session's stop after about an hour, and its resume.
