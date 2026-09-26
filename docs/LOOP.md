---
kind: reference
status: living
---

# The loop, skill by skill

What each skill in the loop does when it runs. For each: what it reads, the commands it issues or is likely to, what it produces, and where it stops for you. `USAGE.md` says what a session does step by step; this page is the same loop seen from the skills, so the two read together. Issue #122 asked for it.

## Where each skill sits

| USAGE step | Skill | Who invokes it |
|---|---|---|
| Set up once | `sidekick` (rules, bootstrap) | You, or the model when asked to set a repo up |
| 1 Orient | The session-start hook, then `sk-orient` | The hook fires itself; the skill on demand |
| 2 Pick up | `sk-orient` §Picking up | The model, after orienting |
| 3 Shape the work | `sk-design`, before or during brainstorming | The model, when a change is costly to undo, with the Skill-tool hook as a prompt; you, to explore or evaluate |
| 3 Shape the work | `superpowers:brainstorming`, then `superpowers:writing-plans` | The model, before any creative work |
| 4 Execute, choosing how | `sk-execute`; in a worker session, `sk-worker` | The model for `sk-execute`; you start `sk-worker` |
| 4 Execute | `superpowers:using-git-worktrees`, then `superpowers:subagent-driven-development` or `superpowers:executing-plans` | The model, in the current session or a worker session |
| 4 Execute, at the end | `superpowers:requesting-code-review`, `superpowers:finishing-a-development-branch` | The executing skill calls them |
| 5 File what you notice | `sk-track` §Filing | The model, mid-session |
| 6 Close | `sk-track` §Closing | The model, when a piece of work is done |
| 7 Close the milestone | `sk-milestone` | The model or you, at the end of a milestone |
| A pull request exists | `code-review:code-review` | You, on a PR |

`sidekick pm` is not a skill. It is the read side every sidekick skill calls. Its verbs are `board`, `pickup`, `lint`, and `gate`, each printing one JSON object; `pickup --brief` prints six lines of text instead.

## sidekick's skills

### The session-start hook

Fires on `startup` and `clear`, from `plugin/hooks/hooks.json`. It runs `node <plugin>/bin/sidekick pm pickup --brief` from the current directory. In a tracked repo it prints a one-line header, the six-line brief, and the body of `sk-orient`, so the model opens the session already oriented. Anywhere else it prints nothing and exits 0; the same when `node` or `gh` is missing or fails. Cost measured on 2026-09-20: a few seconds in a tracked repo, under a third of a second elsewhere.

### The Skill-tool hook

Fires on `PostToolUse` for the Skill tool, from `plugin/hooks/hooks.json`. It runs `node <plugin>/bin/sidekick hook post-skill` with the hook's event on stdin. When the skill that loaded is `superpowers:brainstorming`, it adds one paragraph to context: check whether the change needs a design pass, followed by `sk-design`'s description. Any other skill, and any failure, gets nothing and exit 0, so it never blocks a call. A slash command you type yourself loads without the Skill tool, and the hook does not fire then. ADR-0010 records the mechanism.

### `sk-orient`

Reads the brief: board, milestone with its outcome, In Progress with ages, candidates by tier, drift, and a suggested move. Decides by rule: continue what is In Progress unless pausing it on purpose; pull new work when In Progress drops; number order is not priority. Picks up with `gh project item-edit <board number> --owner @me --url <issue url> --field Status --value "In Progress"`. Then states the pickup to you in one line. Runs on demand mid-session for a fresh picture. Pauses for nothing; it reports.

### `sk-track`

**Filing**, when a problem outside the task appears:

- `gh issue list --state all --limit 200 --search` for a duplicate.
- One `area:*` from `gh label list`, and a self-contained brief.
- The entry gate: the active milestone for a small addition tied to its work, with a comment and a line to you. Otherwise `backlog` with a `Revisit when:` line. It refuses to file without one.
- `gh issue create`, then `gh project item-add`. It tells you the number.

**Closing**, when work is done:

- `gh issue view` to re-check the state.
- The learning-record question first; the record goes to the repo's learnings folder when the counterfactual holds.
- The evidence comment.
- `gh issue close --reason completed`, or `not planned` with a verdict, or `--duplicate-of`.
- Status to Done by `item-edit`.

It pauses only at the record question, a judgment the skill states rather than asks.

### `sk-milestone`

**Opening**: agrees the outcome sentence with you, then creates the milestone with `gh api -X POST …/milestones`. It scans `backlog` issues for conditions that now hold, and designs marked `ready for PM`, and proposes them. It groups the issues into plans of one session each, records them in the description, then orients. Pauses on the outcome, on every seed, and on the plans.

**Closing**:

- `sidekick pm gate` and `sidekick pm lint` first, and every open issue dispositioned.
- The audit against the outcome sentence; each gap becomes an issue or a judgment. It also lists the issues added after Opening.
- A confirmation, carrying the learning-record judgment. Nothing outward runs without a yes.
- On yes: the learning record if the bar holds, and the version bump (three fields in sidekick). Then deletion of the design folders whose issues have all closed, build, and one commit. Then tag, and `gh release create <tag> --verify-tag --title … --notes-file …`.
- The milestone closed by `gh api -X PATCH`, and a "Resolved in" comment on each `COMPLETED` issue.

Pauses at the confirmation.

### `sk-design`

Fires when a change would be costly to undo, before or during brainstorming, or when you ask to explore, evaluate, or plan a design. It reads the repo's architecture sources, then writes its note, from the problem through prior art and options to the decision. A fresh subagent reviews every note with options, unless the note is trivial and says why, and the note answers each finding.

- **Inside a brainstorm**, the note lives under `docs/superpowers/designs/` and takes brainstorming's approaches step.
- **With no build in hand**, it lives under `docs/designs/<topic>/` across sessions, and ends in a breakdown that `sk-milestone` proposes and `sk-track` files.
- **Small debt** goes to an issue through `sk-track`, or to `docs/tech-debt/` in an untracked repo.

Pauses for your decision. With no operator to ask, it registers the design as debt.

### `sk-execute`

Fires when a plan is ready, or when `writing-plans` asks how to run it. It lays out three modes with a recommendation: inline, subagent-driven in the session, and a worker session. It checks the plan names which of the active milestone's plans it is. It also checks the plan carries measured expectations, a prose step in each prose task, and the reviewer line in Global Constraints. Then it runs the repo's `prose` script on the plan. For a worker run it finds the worker with `ListAgents` and sends the handoff. Pauses for your choice of mode.

### `sk-worker`

Only you start it, in a second session. It reports its name, checks the tree, and waits for the handoff. Before Task 1 it scans the plan and sends every question in one report. It then runs the superpowers skill the handoff names, ruling as superpowers does except on plan decisions and goals. It commits per task, never pushes, reads GitHub without writing, and ends with a run report.

### `sidekick`

The reference skill. It says what the bundle is. It delivers the rules with `sidekick rules install --project|--user` and audits them with `rules check`. It brings a repo under tracking: copy the reference board with `gh project copy`, link it, and create the labels. Then verify with `sidekick pm board` and `lint`. Pauses on the `area:*` set, which is yours to name.

## Superpowers, as the loop uses it

### `brainstorming`

Classifies the request as a spike, bounded, or architectural, and says so. Reads the repo and recent commits. Asks one question at a time, proposes approaches, and presents the design in sections. For architectural work it writes the spec to `docs/superpowers/specs/` and self-reviews it. Pauses at every section and at the spec. It never starts implementation without a yes; that gate is the skill's whole point.

### `writing-plans`

Turns the spec into `docs/superpowers/plans/<date>-<name>.md`. The header carries the goal, the architecture, and the spec path. Each task lists its files and interfaces, then bite-sized steps: write a failing test, run it, implement, run it, commit. Self-reviews for spec coverage, placeholders, and type consistency. Pauses once, to ask which execution mode to use.

### `using-git-worktrees`

Detects whether the session is already isolated. Then it creates `.worktrees/<branch>`, or uses the harness's native isolation, and checks the directory is ignored. It installs dependencies and runs the baseline tests. Reports ready, or reports failures and asks.

### `subagent-driven-development`

Per task:

- Dispatches a fresh implementer subagent with the task's text; the implementer implements, tests, commits, and self-reviews.
- Generates a review package from the task's commit range and dispatches a task reviewer for spec adherence and quality.
- Findings go to fix rounds, up to five, each followed by a scoped re-review.
- Rulings and completions go to a ledger.

After the last task, one final reviewer reads the whole branch, one fix dispatch answers it, and `finishing-a-development-branch` takes over. It runs task to task without stopping. It stops on a blocker, missing context, or a load-bearing conflict with the plan.

### `executing-plans`

The same plan without subagents. It takes an isolated workspace and a critical read of the plan, with concerns raised before starting. Then each task's steps and verifications run in order, and `finishing-a-development-branch` takes over. Stops on a blocker, an unclear instruction, or repeated verification failure.

### `requesting-code-review`

Dispatches a code reviewer with the diff range and the spec; mandatory after a task and before a merge. Returns findings by severity. The requester verifies them before acting rather than applying them blind.

### `finishing-a-development-branch`

Verifies the tests, then detects the environment and base branch. Offers three choices: merge locally, push and open a pull request, or keep the branch. Cleans up the worktree afterwards. Pauses for the choice.

### `code-review:code-review`

The official plugin's command for a pull request. It reads the PR with `gh`, reviews the diff, and posts findings. Used where the work went through a PR rather than a fast-forward.

## How the house uses them together

An orchestrating session runs `sk-design` when a change is costly to undo, brainstorms from its note, writes the plan, and runs `sk-execute`. That skill recommends a mode for you to choose. For a worker run you start `sk-worker` in a second session, and the orchestrator sends it the plan. The worker scans the plan, runs `subagent-driven-development`, commits per task without pushing, and writes a run report. The orchestrator rules on its questions, reviews the whole branch, fast-forwards `master`, and closes through `sk-track` and `sk-milestone`. #121 recorded what the review layer cost and caught across four runs.
