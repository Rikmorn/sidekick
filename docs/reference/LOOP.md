# The loop, skill by skill

What each skill in the loop does when it runs. For each: what it reads, what it produces, and where it stops for you. The skill's own text holds its procedure and the commands it issues. `USAGE.md` says what a session does step by step; this page is the same loop seen from the skills, so the two read together. Issue #122 asked for it.

## Where each skill sits

| USAGE step | Skill | Who invokes it |
|---|---|---|
| Set up once | `sidekick` (rules, bootstrap) | You, or the model when asked to set a repo up |
| 1 Orient | The session-start hook, then `sk-orient` | The hook fires itself; the skill on demand |
| 2 Pick up | `sk-orient` §Picking up | The model, after orienting |
| 3 Shape the work | `sk-design`, before or during brainstorming | The model, when a change is costly to undo, with the Skill-tool hook as a prompt; you, to explore or evaluate |
| 3 Shape the work | `superpowers:brainstorming`, then `superpowers:writing-plans` | The model, before any creative work |
| 4 Execute, choosing how | `sk-execute`; in a worker session, `sk-worker` | The model for `sk-execute`. Once you choose the worker mode, the model dispatches `sk-worker` with `sidekick worker dispatch`; without agent view, you type `/sidekick:sk-worker <brief>` yourself |
| 4 Execute | `superpowers:using-git-worktrees`, then `superpowers:subagent-driven-development` or `superpowers:executing-plans` | The model, in the current session or a worker session. In a worker, the brief says where it works, and its `setup` replaces Project Setup |
| 4 Execute, at the end | `superpowers:requesting-code-review`, `superpowers:finishing-a-development-branch` | The executing skill calls them |
| 5 File what you notice | `sk-track` §Filing | The model, mid-session |
| 6 Close | `sk-track` §Closing | The model, when a piece of work is done |
| 7 Close the milestone | `sk-milestone` | The model or you, at the end of a milestone |
| A pull request exists | `code-review:code-review` | You, on a PR |

`sidekick pm` is not a skill. It is the read side every sidekick skill calls, and `USAGE.md` §The commands says what each of its verbs prints.

## sidekick's skills

### The session-start hook

Fires on `startup` and `clear`, from `plugin/hooks/hooks.json`. It runs `node <plugin>/bin/sidekick pm pickup --brief` from the current directory. In a tracked repo it prints a one-line header, the six-line brief, and the body of `sk-orient`, so the model opens the session already oriented. Anywhere else it prints nothing and exits 0; the same when `node` or `gh` is missing or fails. Cost measured on 2026-09-20: a few seconds in a tracked repo, under a third of a second elsewhere.

### The Skill-tool hook

Fires on `PostToolUse` for the Skill tool, from `plugin/hooks/hooks.json`. It runs `node <plugin>/bin/sidekick hook post-skill` with the hook's event on stdin. When the skill that loaded is `superpowers:brainstorming`, it adds one paragraph to context: check whether the change needs a design pass, followed by `sk-design`'s description. When it is `superpowers:writing-plans`, it adds a lead line and three sections of `sk-execute`: §A plan carries intent, §Before the plan goes out, and §Choose the mode. The plan is written to the first two and handed off by the third. You then review the plan and, unless you already named a method, choose its mode, in one question. Any other skill, and any failure, gets nothing and exit 0, so it never blocks a call. A slash command you type yourself loads without the Skill tool, and the hook does not fire then. ADR-0010 records the mechanism.

### The Read hook

Fires on `PostToolUse` for the Read tool, from `plugin/hooks/hooks.json`. The wrapper checks the input in bash, and a read whose content lacks the review-package tokens ends there. A file that mentions them, such as a plan or a test, starts `node`, and the CLI decides from the path. When the file is a superpowers review package, `review-<base>..<head>.diff` in a plan's workspace under `.superpowers/sdd/`, it runs `node <plugin>/bin/sidekick hook post-read`. That adds sidekick's reviewer lines to the reviewer's context. The reviewer reproduces the checks the implementer claims. It also confirms each fact the diff states at its source, and searches for the stale copies of each fact the diff changes. It also holds the comments the diff adds to `sk-clean-code.md` §Comments, which the hook quotes from the plugin when the package shows files that rule covers. The reviewers that `subagent-driven-development` and `executing-plans` dispatch read a package, whether for a task, a batch, a fix round, or the whole branch. The reviewers of `sk-milestone`'s release check read the package it builds, and get lines of their own. Those lines carry the claims check, worded for a reviewer with a search tool and no shell, and the Comments paragraph under the same condition. They carry no reproduce paragraph. A standalone `requesting-code-review` run, and a reviewer whose diff file is missing, never open one. The hook fires inside subagents, and wherever the plugin is enabled. ADR-0011 records the mechanism.

### The context monitor hook

Fires on `PostToolBatch`, after each batch of tool calls, from `plugin/hooks/hooks.json`. The wrapper `plugin/hooks/post-tool-batch` ends in bash when the input contains `"agent_id":"`, the key a subagent's event carries, since a subagent's window is its own. A tool input or response with an `agent_id` key matches too. That main-thread batch goes unchecked, and the next batch checks. Otherwise the wrapper runs `node <plugin>/bin/sidekick hook post-tool-batch`. That hook also carries the canary: when the gauge's variable is unset, malformed, or another session's, it tells you once per session through `systemMessage`, which Claude Code shows as `PostToolBatch says: <text>` under the tool's row. The hook never speaks for a subagent's batch. The text is `CANARY_TEXT` in `bin/helpers/context-monitor.ts`.

The CLI reads the figure from the transcript: the sum of `input_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` on the newest main-thread assistant entry. It reads the file's last 256 KB, widening to 2 MB. The limit is the first of three that applies. First is the gauge's variable `SIDEKICK_CONTEXT_LIMIT`, only when its session and model are this session's and the transcript's newest main-thread model. Second is `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, read as a compaction window: raised to Claude Code's 100,000 floor, less a 33,000 margin. Third is the `context_window` setting, which reaches the hook as `CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW`, read as the window. Set the setting in `~/.claude/settings.json` as `"pluginConfigs": {"sidekick@rikmorn": {"options": {"context_window": 1000000}}}`. For one session, pass `claude --settings '{"pluginConfigs":{"sidekick@rikmorn":{"options":{"context_window":1000000}}}}'`. A session started with `--plugin-dir` loads the plugin as `sidekick@inline` and reads that key, not `sidekick@rikmorn`.

At 65% the hook adds a warning to context. That is 65% of the way to compaction when the limit is a compaction point, and 65% of the window otherwise. The text says which. At 75% it adds a critical one that asks the model to tell you at the next natural pause. A worker that `sidekick worker dispatch` started has `SIDEKICK_WORKER` set, and no one watches it. Its critical warning tells it to carry on rather than tell you, and to re-read its brief after a compaction. Each level speaks once until usage drops below 65%. A latch file in the temp directory, `sidekick-ctx-<session_id>.json`, records the level last spoken and whether the canary has spoken, and usage below 65% re-arms both levels. The hook deletes the file when both are empty. When no source gives a limit, the hook gives no warning. A figure above the limit, a missing transcript, and any failure get no warning and exit 0, so it never blocks a call. The canary does not need a transcript or a limit, so it can still speak in those cases. GSD's own monitor also runs until #214 removes it.

### The gauge

A Claude Code mod, loaded by `"modules": ["./mods.ts"]` in `plugin/hooks/hooks.json`; it needs Claude Code 2.1.287 or later. `plugin/hooks/mods.ts` registers `plugin/hooks/gauge/`. It draws `profile: <name>` in the footer, as a `SessionMode` label on the terminal and desktop. When no profile settings reached the session, it draws `⚠ sidekick: no profile settings in this session`. At session start and after each tool batch, it sets the process variable `SIDEKICK_CONTEXT_LIMIT`, keyed by session id and model, which the context monitor reads first. It writes nothing when the session gives no usage breakdown, or when auto-compaction is on and the breakdown gives no threshold. Before any value is set, the monitor then falls back, and its canary speaks though the mods run; Claude Code's declared types rule out both cases. The gauge only observes and draws: no hook approves or denies anything, and a failing hook is skipped.

Three gates cover the mod. `bun run typecheck:mods` checks it against Claude Code's declarations, which `bin/mod-types.sh` generates into the ignored `.cache/claude-code-types/`; it makes one headless Haiku call when this build's file is missing. `claude plugin test plugin` runs the mod's tests. `bun run check:mods` also runs one headless Haiku session with `--plugin-dir plugin`, and passes when the gauge's compaction warning appears with no canary. Run it after a Claude Code upgrade, or when the canary speaks. On a full pass it rewrites `.claude-code-version`, the build CI installs for `validate` and `plugin test`.

### `sk-orient`

Reads the brief: board, milestone with its outcome, In Progress with ages, candidates by plan or by tier, drift, and a suggested move. Decides by rule: continue what is In Progress unless pausing it on purpose; pull the next plan when In Progress drops. Picks up by moving the card, or a whole plan's cards, to In Progress, as its §Picking up says. Posts a status update when it picks up a plan. Then states the pickup to you in one line. Runs on demand mid-session for a fresh picture. Pauses for nothing; it reports.

### `sk-track`

**Filing** (§Filing), when a problem outside the task appears:

- A duplicate check across open and closed issues.
- One `area:*` from the repo's labels, and a self-contained brief.
- The entry gate: the active milestone for a small addition tied to its work, with a comment and a line to you. Otherwise `backlog` with a `Revisit when:` line. It refuses to file without one.
- The issue and its card. It tells you the number.

**Closing** (§Closing), when work is done:

- A re-check of the issue's state.
- The learning-record question first; the record goes to the repo's learnings folder when the counterfactual holds.
- The evidence comment.
- The close, as completed, as not planned with a verdict, or as a duplicate.
- Status set to Done explicitly.
- A status update when the close finishes a plan.
- An issue a merge already closed still gets the record decision, the evidence comment, and the Status, and is not closed again. The closer comes from the issue's closing event.

It pauses only at the record question, a judgment the skill states rather than asks.

### `sk-milestone`

**Opening**: agrees the outcome sentence with you, then creates the milestone. It scans `backlog` issues for conditions that now hold, and designs marked `ready for PM`, and proposes them. It groups the issues into plans of one session each, and a sealed reviewer reads that scope. You rule on its review and the grouping together. It then records the plans in the description in run order, posts the first status update, and orients. Pauses on the outcome, on every seed, and on the plans with that review.

**Closing**:

- `sidekick pm gate` and `sidekick pm lint` first, and every open issue dispositioned.
- The audit against the outcome sentence; each gap becomes an issue or a judgment. It also lists the issues added after Opening.
- A check of the release as a whole: three sealed reviewers read everything the release ships. Each confirmed finding is fixed before the release. A finding too large for the session is posted `AT_RISK`, and you choose an added plan or a back-out.
- Local preparation, left uncommitted: the learning record if the bar holds, and the deletions of the design folders whose issues have all closed. Then the repo's own preparation, such as the version bump, with the gates and draft notes.
- A confirmation, carrying the learning-record judgment, the diff, and the check's findings. Nothing outward runs without a yes.
- On yes, the release's publication: one commit of everything prepared, landed by the repo's route, then the tag and the GitHub Release. For sidekick itself, `AGENTS.md` §Releasing holds the preparation and publication steps.
- A `COMPLETE` status update, while the milestone is still open.
- The milestone closed, and a "Resolved in" comment on each `COMPLETED` issue.

Pauses at the confirmation, at an `AT_RISK` finding, and at a decision that leaves work out of the release.

The reviewer is `sk-holistic-reviewer`, a sealed agent in `plugin/agents/` that `sk-milestone` dispatches as `sidekick:sk-holistic-reviewer`. It reviews the scope at Opening and the release at the close, through `references/release-review.md` and `references/scope-review.md` in the skill.

### `sk-design`

Fires when a change would be costly to undo, before or during brainstorming, or when you ask to explore, evaluate, or plan a design. It reads the repo's architecture sources and settles the goals with you. Then it writes its note, from the problem through prior art and options to the decision. A fresh subagent reviews every note with options, unless the note is trivial and says why, and the note answers each finding.

- **Inside a brainstorm**, the note lives under `docs/superpowers/designs/` and takes brainstorming's approaches step.
- **With no build in hand**, it lives under `docs/designs/<topic>/` across sessions, and ends in a breakdown that `sk-milestone` proposes and `sk-track` files. Its research goes to `docs/research/<topic>/`. An exploration written elsewhere is adopted into the same folders.
- **Small debt** goes to an issue through `sk-track`, or to `docs/tech-debt/` in an untracked repo.

Pauses for your goals before the options, unless a brainstorm has already settled them, and for your decision. With no operator to ask, it registers the design as debt.

### `sk-execute`

Fires when a plan is being written or is ready, or when `writing-plans` asks how to run it. It lays out three modes with a recommendation: inline, subagent-driven in the session, and a worker session. In a tracked repo whose active milestone has a plans header, it checks the plan names which of those plans it is. It checks the plan names no branch, since the brief or the chosen mode settles where the work lands. It also checks the plan carries measured expectations and a prose step in each prose task. It checks the plan names the source of each fact it states, and that its scope reaches every copy of a fact it changes. It checks that any steps after the tasks sit in an after-file. Then it runs the repo's `prose` script on the plan. For a worker run it writes a brief beside the plan and dispatches the worker with `sidekick worker dispatch`. It answers the worker's questions through a rulings file. After the run it routes every review finding. Part of the work is fixed in the branch; anything else goes through `sk-pm-conventions.md` §Change control or is dropped with its reason told to you. It then integrates a worker's branch and runs `sidekick worker finish` to clear the worker away. For a plan whose writes go mostly outside the branch, such as a triage or a relabel, it offers draft, verify, apply beside the modes. Subagents draft, sealed verifiers measure, you approve the batch, and the orchestrator writes. Pauses for your choice of mode.

### `sk-worker`

`sk-execute` dispatches it once you choose the worker mode, as a background session in a worktree of its own. When agent view is unavailable, you type `/sidekick:sk-worker <brief>` in a session of your own instead. It checks the brief and the tree, then runs the brief's `setup`. Before Task 1 it scans the plan and sends every question in one report. It reads each ruling from the rulings file the brief names, never from a message. It then runs the superpowers skill the brief names, ruling as superpowers does except on plan decisions and goals. Each task lands as its own commits, and a fix adds a commit rather than amending one. It never pushes, reads GitHub without writing, and ends with a run report at the brief's `report` path. Pauses with `BLOCKED` when a check fails, and after its scan for the rulings.

### `sidekick`

The reference skill. It says what the bundle is, and how each `docs/` folder its rules and skills use works. Its §The rules says how to deliver and audit the rules. Its §Bringing a repo under tracking copies the reference board, links it, creates the labels, and verifies. Pauses on the `area:*` set, which is yours to name.

## Superpowers, as the loop uses it

### `brainstorming`

Classifies the request as a spike, bounded, or architectural, and says so. Reads the repo and recent commits. Writes back its understanding of the goal, separating what you said from what it assumed, and takes your correction. Asks one question at a time, proposes approaches, and presents the design in sections. For architectural work it writes the spec to `docs/superpowers/specs/` and self-reviews it. Pauses for your correction of its understanding, at every section, and at the spec. It never starts implementation without a yes; that gate is the skill's whole point.

### `writing-plans`

Turns the spec into `docs/superpowers/plans/<date>-<name>.md`. The header carries the goal, the architecture, and the spec path. Each task lists its files and interfaces, then bite-sized steps: write a failing test, run it, implement, run it, commit. A Review Focus section names up to five inputs or failure modes the spec implies but no test exercises. Each gets a test in the task that owns the code. Self-reviews for spec coverage, placeholders, type consistency, and that focus. Pauses once: you review the saved plan and, unless you already named a method, choose one. `sk-execute` puts its three modes in that question, with one recommendation in place of the skill's own. When `writing-plans` loads through the Skill tool, sidekick's hook adds `sk-execute`'s plan stance and handoff, which govern how the plan is written and handed off.

### `using-git-worktrees`

Detects whether the session is already isolated. Then it creates `.worktrees/<branch>`, or uses the harness's native isolation, and checks the directory is ignored. It installs dependencies and runs the baseline tests. Reports ready, or reports failures and asks.

### `subagent-driven-development`

Per task:

- Dispatches a fresh implementer subagent with the task's text; the implementer implements, tests, commits, and self-reviews.
- Generates a review package from the task's commit range and dispatches a task reviewer for spec adherence and quality.
- Findings go to fix rounds, up to five, each followed by a scoped re-review.
- Rulings and completions go to a ledger.

After the last task, one final reviewer reads the whole branch. One fix dispatch answers it, one scoped re-review checks the fix, and `finishing-a-development-branch` takes over. It runs task to task without stopping, and rules on conflicts and ambiguities in the ledger. Four things stop it:

- an irreversible or destructive operation;
- a security-sensitive action;
- a side effect outside the worktree that norms say to ask about first, such as a merge, a shared-branch push, or a publish;
- a plan so broken that every path forward is a guess.

### `executing-plans`

Native execution: the session implements every task itself, under the workspace, ledger, and stopping rules of `subagent-driven-development`. Each task runs between the skill's `task-start` and `task-done` scripts, with TDD as its gate and a ledgered ruling for each conflict or deviation. It runs task to task without pausing, and stops for the same four things. After the last task it dispatches one fresh reviewer on the most capable model over the whole branch. Without a subagent tool it reviews the branch itself and says so. It fixes the Critical and Important findings in one pass, each verified by a test that failed first, with no re-review. Then `finishing-a-development-branch` takes over.

### `requesting-code-review`

Dispatches a code reviewer with the diff range and the spec; mandatory after a task and before a merge. Returns findings by severity. Both execution skills use its reviewer template for the whole-branch review. The template judges behaviour the spec is silent on by what a reasonable user would expect. Under "Declined to judge" the template lists each behaviour it set aside, for the executor to rule on. The requester fixes Critical and Important findings, notes Minor ones, and pushes back with reasoning where the reviewer is wrong.

### `finishing-a-development-branch`

Verifies the tests, then detects the environment and base branch. Offers three choices: merge locally, push and open a pull request, or keep the branch. Cleans up the worktree afterwards. Pauses for the choice.

### `code-review:code-review`

The official plugin's command for a pull request. It reads the PR with `gh`, reviews the diff, and posts findings. Used where the work went through a PR rather than a fast-forward.

## How the house uses them together

An orchestrating session runs `sk-design` when a change is costly to undo, brainstorms from its note, writes the plan, and runs `sk-execute`. That skill recommends a mode for you to choose. For a worker run the orchestrator writes a brief and dispatches `sk-worker` with `sidekick worker dispatch`, in a worktree of its own. The worker scans the plan, runs `subagent-driven-development`, commits per task without pushing, and writes a run report. The orchestrator rules on its questions through the rulings file, reviews the whole branch, and fast-forwards `master`. It then runs `sidekick worker finish`, and closes through `sk-track` and `sk-milestone`. #121 recorded what the review layer cost and caught across four runs.
