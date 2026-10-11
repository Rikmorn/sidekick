# Using sidekick day to day

How the loop runs, session by session, and how each step lands on GitHub. The repo's `README.md` says what sidekick is and how it installs, and `LOOP.md` says what each skill does when it runs. This page says how to work with sidekick. Each step names the skill that holds its procedure, and the skill's text is the source. Where a piece has not shipped yet, this page says so. The milestone list on `Rikmorn/sidekick` is the roadmap, and each issue there is the brief for its piece.

## The shape

Superpowers is the trunk: brainstorm, plan, execute, review. The official code-review plugin reviews. sidekick adds four things around them, none of which replaces a superpowers skill.

| Layer | What it does | Where it lives |
|---|---|---|
| House guidance | The `sk-*` rules Claude Code reads in every repo: working standards, language, clean code, TypeScript, guidance authoring, PM conventions, agent prompts | `plugin/rules/`, delivered by `sidekick rules install` |
| PM layer | Tracking on GitHub for the repos you own: session-start pickup, filing, closing with a record, milestone to release, a hygiene lint | `sidekick pm`, its session-start hook, and the `sk-orient`, `sk-track`, and `sk-milestone` skills |
| Execution | How a written plan runs: a mode chosen per plan, what the plan carries, and the worker handoff | The `sk-execute` and `sk-worker` skills, the Skill-tool hook that gives `writing-plans` the plan stance and the handoff, and the Read hook that gives reviewers sidekick's reviewer lines |
| Extensions | Design-side steps the ecosystem lacks. Shipped: a design pass before or during brainstorming. To come: a sealed review after a spec, a goal-backward verdict after a build | The `sk-design` skill and the Skill-tool hook's brainstorming nudge; later milestones for the rest |

The PM layer is on where you own the tracking and silent everywhere else. A repo is tracked when one open Projects v2 board is linked to it, titled after the repo, and owned by you. No config file; the board is the switch.

## Set up once

On the machine, install and enable the plugin at user scope, as the repo's `README.md` §Install says. Deliver the rules with `--user`, as its §The rules says. Then give `gh` the scope the board needs, and run the preflight:

```bash
gh auth refresh -s project   # the board needs the project scope
sidekick pm board            # preflight: gh version, scope, which board
```

The `gh` version decides whether the skills write a card's Status by name or by id, as `sk-orient` §Picking up says. Once the plugin is enabled, its session-start hook prints the board's pickup into context in every tracked repo and stays silent everywhere else.

For a repo you own and want tracked, ask for the `sidekick` skill by name, or say "bring this repo under tracking". The skill's §Bringing a repo under tracking copies the reference board and links it. It creates the labels once you agree the `area:*` set, then verifies. The skill text doubles as the checklist if you would rather run it by hand.

For a repo where someone else owns the tracking, do nothing: `sidekick pm board --quiet` finds no board of yours and stays silent, which is the design.

## The GitHub model

`plugin/rules/sk-pm-conventions.md` holds the conventions the loop follows on GitHub. Issues are work items, milestones are releases, and one board per repo is the status surface. The `backlog` label marks a deliberate deferral, and `change-request` an objective change. `sk-track` and `sk-milestone` are the procedures that follow those conventions.

## A session, start to finish

**1. Orient.** The session-start hook prints `sidekick pm pickup --brief` into context. It names the active milestone with its outcome, what is In Progress with its age, the candidates, drift, and a suggested move. Drift covers unpushed commits, cards stale past seven days, and an open PR on the current branch. It also names In Progress cards split across milestones and a malformed plans header. `sk-orient` §Reading it says how to read each line and what to pick up. Continue what is In Progress unless you pause it on purpose; pull new work when In Progress drops, not on top of it. Run the command yourself for a fresh picture mid-session.

**2. Pick up.** `sk-orient` §Picking up moves the card, or a whole plan's cards, to In Progress, and posts a status update. The issue body is the brief.

**3. Shape the work.** When a wrong choice would be costly to undo, `sk-design` designs the change before or during the brainstorm, and a fresh subagent reviews its note. Brainstorm with superpowers — the issue is the problem statement, the brainstorm settles the forks — and write the spec under `docs/superpowers/specs/`. Plan with `writing-plans`, stating each gate value as a command that measures it and the rest as intent. `sk-execute` lists what else a plan carries before it goes out.

**4. Execute.** `sk-execute` lays out three modes with a recommendation, and you choose. The modes are inline, subagent-driven in the session, and a worker session started with `sk-worker`. The orchestrating session reviews the whole branch and fast-forwards `master`. Each run records its mode, escalations, review rounds, and defects per stage. Token totals are not collected; #138 keeps the method, parked. The gates are `bun run test`, `bun run typecheck`, `bun run check`, `bun run check:docs`, and `bun run prose` on changed Markdown. For anything touching `bin/`, add `bun run build`, with the control that a second build changes nothing.

**5. File what you notice.** A problem outside the task is filed, not fixed. `sk-track` §Filing is that one step: duplicate check, one `area:*`, a self-contained brief, the entry gate, the card. The `sk-*` rules are in test mode — when a rule bites or falls short, that is an `area:guidance` issue too.

**6. Close.** `sk-track` §Closing, in order: the record question, the evidence comment, the close with its reason, and Status set to Done explicitly. When the close finishes a plan, a status update follows, as `sk-orient` §Status updates says. The docs layout in the `sidekick` skill states the bar, a counterfactual, and the shape.

**7. Close the milestone.** `sk-milestone` §Closing runs it. It runs `sidekick pm gate` and `sidekick pm lint`, dispositions every open issue, then audits against the outcome sentence. Before it asks, it prepares locally and leaves everything uncommitted. It writes the learning record if the bar holds and deletes the design folders whose issues have all closed. Then it runs the repo's own preparation, such as the version bump, with the gates and draft notes. On your yes, the repo's publication runs. The closing status update and the milestone close follow, and `Resolved in <version>.` goes on each issue the milestone completed. For sidekick itself, `AGENTS.md` §Releasing holds the preparation and publication steps. `sk-milestone` §Opening then opens the next milestone with its outcome and its plans. It scans the backlog, and the designs marked `ready for PM`, for seeds whose condition holds.

## The commands

`sidekick pm` reads; the skills write. Every verb prints one JSON object and exits `0` when it ran (the verdict is in the JSON, including `tracked: false`), `1` on usage or an unexpected error, `2` when `gh` is missing or its token lacks `project`. Two flags are the exceptions: `pickup --brief` prints text and `pickup --report` Markdown instead of JSON. `--report` exits `1` with its reason when there is nothing sound to post.

| Verb | Prints | Used by |
|---|---|---|
| `board [--quiet]` | `tracked`, the reason if not, owner and repo, the project number and id, the Status field with its option ids, preflight (`gh` version, scope, warnings) | Every write, since it carries the ids; the bootstrap verify |
| `pickup [--quiet] [--brief\|--report] [--milestone <title>]` | The board block, the active milestone and every open one, the active milestone's `issue_counts` from the issue read, `in_progress` with ages, `candidates` by tier, the milestone's `plans`, `drift`. `--milestone` names the milestone instead of deriving it. `--brief` renders six lines of text instead, for the hook. `--report` prints the body of a project status update | Session start; status updates |
| `lint` | `findings` and `counts` per predicate: label counts, missing Status, open-in-Done, closed-not-Done, `backlog` without `Revisit when:`, `backlog` in a milestone, position-code titles, `unboarded` (open issues, and issues closed as completed after the board was created, with no card; an archived card on an open issue counts as none), stale In Progress, more than one linked board | Grooming; the milestone gate |
| `gate --milestone <title>` | The milestone with its counts, `ready`, and every open issue in it with Status and `item_id` | Milestone close |

Every issue entry carries `item_id`, the board item's node id, so a write by id needs no lookup. `--quiet` on `board` and `pickup` prints nothing in an untracked repo — the shape a session-start hook needs.

`sidekick rules install` and `sidekick rules check` deliver and audit the rules; the repo's `README.md` §The rules covers both.

## Working with a worker session

`sk-execute` holds the handoff and `sk-worker` holds the worker's rules. Both ship in the plugin, so every repo running sidekick has them.

You open a session in the repo and start `sk-worker` there; that is your only step. The orchestrating session finds the worker, sends it the plan, and rules on the questions from its scan. At the end it reviews the whole branch, because a per-task review cannot see a defect at the seam between tasks.

The handoff names where the worker works. A plain branch in the main checkout suits a run where the orchestrating session stays off the tree until the branch is done. A worktree suits a run where that session needs the checkout meanwhile. `docs/superpowers/` is gitignored, so a worktree does not contain the spec or the plan; the worker reads them by the main checkout's path.

## Where things are recorded

Work state lives in the issues, milestones, and board on GitHub, the only status surface. The issue and its close comment say why something was done. The docs layout, `plugin/skills/sidekick/references/docs-layout.md`, says which `docs/` folder takes each record, design, and working file, and how long each lasts. `docs/README.md` lists what sidekick adds to it.

Session memory is not a record. The pointer to the next piece of work lives on the board, and `sidekick pm pickup` reads it.

## Shipped and arriving

The releases on `Rikmorn/sidekick` say what each version shipped, and its milestone list says what is arriving. `sidekick pm pickup` in this repo shows where the open milestone stands.
