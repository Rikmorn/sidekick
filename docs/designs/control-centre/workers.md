# Workers: `sk-worker` dispatched from a session

Status: decided · Gate 2, decision 3 of the [control-centre design](design.md) · 2026-10-12

## Problem

G11 asks for workers dispatched, steered, and stopped from inside Claude Code. The operator ruled at gate 1 that every worker runs from a session, with no process started by hand. Today `sk-worker` rests on the opposite premise. Its description says "Only the operator starts it", and its text says "The operator started this skill, so these rules carry the operator's authority" (`plugin/skills/sk-worker/SKILL.md:3`, `:10`). `sk-execute` §Hand off to a worker has the operator open the worker's session.

A worker dispatched through `claude --bg` also meets a default that `sk-worker` forbids. A background session that edits in its own worktree commits and pushes its branch.

Decided here, because `sk-worker`, `sk-execute`, the launcher, and the desk mod all read the answer:

1. Who may start a worker, and what carries the operator's authority.
2. What stops a dispatched worker from pushing.
3. Where a dispatched worker works.

Routed to the workers issue: the model per worker, the brief's exact fields, and the cleanup after integration.

## Constraints

Grades as in [mods.md](mods.md). The push probes on 2026-10-12 ran `claude -p --model haiku --permission-mode bypassPermissions` on Claude Code 2.1.296. They used a scratch repository whose remote was a local bare repository, with git 2.50.1.

| # | Constraint | Grade |
|---|---|---|
| W1 | A background session takes a plugin slash command as its first prompt, and the skill expands. `disable-model-invocation` does not stop this path, since the command is that session's own prompt | measured, in the probes report; the second sentence is inferred |
| W2 | A background session that edits in a worktree it entered "commits without asking, and pushes the branch when the repository has a remote". It never pushes to `main` or `master`. "Your git instructions take precedence" when the task, `CLAUDE.md`, or memory says the operator handles git | read in the agent view docs, in the extension-fit report |
| W3 | A session editing a checkout it did not isolate itself asks before committing. `worktree.bgIsolation: "none"` turns isolation off | read, same source |
| W4 | A deny rule `Bash(git push:*)` refused `git push origin …`. `git -C . push …` and `sh -c 'git push …'` ran, and both created branches on the remote | measured |
| W5 | Git configuration set through the environment, `url.<x>.pushInsteadOf` with an empty value, failed every push tried: plain, `git -C`, `sh -c`, and a push to an explicit path. Fetch still worked. Passed through `--settings`' `env` key, it reached the session's Bash tool, and neither push landed | measured. The model diagnosed the block and stopped, once; a background session was not tried |
| W6 | Messages reach background sessions between tool calls, or start a turn when they are idle. A message cannot approve a permission prompt. A session bypassing permissions holds messages from a sender that does not | read, in the surface report |
| W7 | A mid-task message to a running subagent was refused as likely injection. The same content was accepted from a file the subagent could check | measured on 2026-09-20, in the R6 run; recorded in session memory |
| W8 | Every worker runs from a session; none is started by hand. The operator chooses the execution mode at `sk-execute`'s handoff | stated by the operator, gate 1; `sk-execute` §Choose the mode, read |

## Options

### Part 1: who starts a worker

**A. The operator, as today.** The operator opens a tab and starts `sk-worker` there.

1. No pattern.
2. Authority comes from who typed the command.
3. `sk-worker` and `sk-execute` today.
4. Cost: contradicts W8, since every worker is a process started by hand.
5. Next change: none; the desk mod could only watch workers, never dispatch them.

**B. A session dispatches it, after the operator chooses the worker mode.** The orchestrating session runs `claude --bg` with the worker's profile and `/sidekick:sk-worker <brief>` as the first prompt (W1). The brief is a file on disk naming the plan, the spec, the baseline, and the skill to run. The worker checks each one, as it does today, and replies `BLOCKED` when one fails.

1. Capability handed over through a verifiable artefact rather than an asserted message (W7).
2. The operator's authority comes from their choice of the mode, which `sk-execute` already asks for. The brief carries the specifics, and the worker can check every one.
3. `sk-worker`'s scan and `BLOCKED` reply already work this way for the plan and the spec.
4. Cost: `sk-worker`'s premise and description change, and so does `sk-execute`'s handoff. `disable-model-invocation` stays, so no session loads `sk-worker` into itself.
5. Next change: a dispatch is one command, or one tool call once the desk mod serves it.

**C. A session dispatches at its own judgement.** An orchestrator fans out workers without asking.

Rejected for R9. The mode choice is a handoff pause, and #140, which the loop design takes up, owns relaxing it.

### Part 2: what stops a push

| Option | Catches | Against |
|---|---|---|
| Instruction only: the brief says the orchestrator integrates and the worker never pushes | the model following W2's precedence rule | a model following the default instead |
| Plus a deny rule on `git push` | the plain spelling (W4) | `git -C` and `sh -c` get through (W4) |
| Plus git's push URLs rewritten through the environment | every spelling git runs (W5) | Code that unsets the variable, or pushes without git. Untried in a background session. It takes the `GIT_CONFIG_COUNT` variables, which a repo's own environment might also use |
| Plus a mod holding push commands | any spelling a pattern matches | Needs the mod's plugin in the worker's profile, and rides the early-access API |
| Isolation off | the push default, which applies only in a worktree the session entered (W2) | Commits then ask (W3), so the worker waits on every task. Workers share one checkout |

### Part 3: where a dispatched worker works

A dispatched worker works in the worktree its background session makes (W2). The brief names the base commit, and the orchestrator integrates from the worker's branch. The handoff's other places, a branch in the main checkout or in place, would need isolation off (W3). They stay for a worker the operator starts in their own session.

## Recommendation

B, with the instruction and the environment rewrite added by the launcher to every worker, in the session's own worktree.

Assumptions, and what changes if each is wrong:

- The rewrite holds in a background session as it did headless (W5). If not, the deny rule is the fallback, with its gap (W4) written down.
- A dispatched worker is a session the operator can attach to, so steering by message plus attach replaces the tab. If attach proves too costly, operator-started workers stay as a second path.
- Deleting a background session in agent view deletes its worktree. Whether the branch survives has not been checked. If it does not, the orchestrator integrates before the session is deleted, and the desk says so.
- Rulings still travel by message (W6). If the worker refuses them as injection, as W7's subagent did, they go into a reply file the worker reads.

## Routed elsewhere

- The model per worker, the brief's exact fields, the cleanup after integration, and the permission mode orchestrator and worker share (W6): the workers issue.
- Dispatch as a model tool: the desk mod's issue.
- Relaxing the mode choice itself: the loop design, with #140.

## Decision

The operator agreed to all three parts on 2026-10-12, in a session with Claude:

- **Part 1: B.** A session dispatches a worker after the operator chooses the worker mode, with the handoff as a brief file.
- **Part 2:** the instruction plus the environment rewrite, with the deny rule as the fallback.
- **Part 3:** a dispatched worker works in its own worktree. The other places stay for a worker the operator starts.

The operator added two points. Workers run in other processes have never pushed unasked, so the instruction has held in use. The rewrite is the backstop for when guidance is ignored. And a run that needs something different is varied by prompting. A prompt cannot lift the rewrite, though, since git enforces it. A worker that must push needs the launcher to leave the rewrite out, on the operator's word for that dispatch. The workers issue designs that switch.
