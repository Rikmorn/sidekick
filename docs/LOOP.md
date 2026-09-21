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
| 3 Shape the work | `superpowers:brainstorming`, then `superpowers:writing-plans` | The model, before any creative work |
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

### `sk-orient`

Reads the brief: board, milestone with its outcome, In Progress with ages, candidates by tier, drift, and a suggested move. Decides by rule: continue what is In Progress unless pausing it on purpose; pull new work when In Progress drops; number order is not priority. Picks up with `gh project item-edit <board number> --owner @me --url <issue url> --field Status --value "In Progress"`. Then states the pickup to you in one line. Runs on demand mid-session for a fresh picture. Pauses for nothing; it reports.

### `sk-track`

**Filing**, when a problem outside the task appears:

- `gh issue list --state all --limit 200 --search` for a duplicate.
- One `area:*` from `gh label list`, and a self-contained brief.
- The entry gate: the active milestone, or `backlog` with a `Revisit when:` line. It refuses to file without one.
- `gh issue create`, then `gh project item-add`. It tells you the number.

**Closing**, when work is done:

- `gh issue view` to re-check the state.
- The learning-record question first; the record goes to the repo's learnings folder when the counterfactual holds.
- The evidence comment.
- `gh issue close --reason completed`, or `not planned` with a verdict, or `--duplicate-of`.
- Status to Done by `item-edit`.

It pauses only at the record question, a judgment the skill states rather than asks.

### `sk-milestone`

**Opening**: agrees the outcome sentence with you, then creates the milestone with `gh api -X POST …/milestones`. It scans `backlog` issues for conditions that now hold, proposes them, then orients. Pauses on the outcome and on every seed.

**Closing**:

- `sidekick pm gate` and `sidekick pm lint` first, and every open issue dispositioned.
- The audit against the outcome sentence; each gap becomes an issue or a judgment.
- A confirmation. Nothing outward runs without a yes.
- On yes: version bump (three fields in sidekick), build, commit, tag, and `gh release create <tag> --verify-tag --title … --notes-file …`.
- The milestone closed by `gh api -X PATCH`, a "Resolved in" comment on each `COMPLETED` issue, and a learning record if the bar holds.

Pauses at the confirmation.

### `sidekick`

The reference skill. It says what the bundle is. It delivers the rules with `sidekick rules install --project|--user` and audits them with `rules check`. It brings a repo under tracking: copy the reference board with `gh project copy`, link it, create the labels, and verify with `sidekick pm board` and `lint`. Pauses on the `area:*` set, which is yours to name.

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

An orchestrating session brainstorms, writes the plan, and hands it to a worker session with `SendMessage`. The worker runs `subagent-driven-development` inside a worktree, raises questions before adapting the plan, commits per task without pushing, and writes a run report. The orchestrator rules on questions, reviews the whole branch, fast-forwards `master`, and closes through `sk-track` and `sk-milestone`. `USAGE.md` §Working with a worker session has the handoff; #121 measures what the review layer costs and catches.
