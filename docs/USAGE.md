---
kind: usage
status: living
---

# Using sidekick day to day

How the loop runs, session by session, and how each step lands on GitHub. The `README.md` says what sidekick is and how it installs; this page says how to work with it. Where a piece has not shipped yet, it says so — the milestone list on `Rikmorn/sidekick` is the roadmap, and each issue there is the brief for its piece.

## The shape

Superpowers is the trunk: brainstorm, plan, execute, review. The official code-review plugin reviews. sidekick adds three things around them, none of which replaces a superpowers skill.

| Layer | What it does | Where it lives |
|---|---|---|
| House guidance | The `sk-*` rules Claude Code reads in every repo: working standards, language, clean code, TypeScript, guidance authoring, PM conventions, agent prompts | `plugin/rules/`, delivered by `sidekick rules install` |
| PM layer | Tracking on GitHub for the repos you own: session-start pickup, filing, closing with a record, milestone to release, a hygiene lint | `sidekick pm` (shipped) and the R6 skills (arriving) |
| Extensions | Design-side steps the ecosystem lacks: a design pass before brainstorming, a sealed review after a spec, a goal-backward verdict after a build | Later milestones |

The PM layer is on where you own the tracking and silent everywhere else. A repo is tracked when one open Projects v2 board is linked to it, titled after the repo, and owned by you. No config file; the board is the switch.

## Set up once

On the machine:

```bash
claude plugin marketplace add Rikmorn/sidekick
claude plugin install sidekick@rikmorn
claude plugin enable sidekick@rikmorn --scope user
sidekick rules install --user          # the sk-* rules, read in every repo
gh auth refresh -s project             # the board needs the project scope
sidekick pm board                      # preflight: gh version, scope, which board
```

`gh` 2.98 or later lets the skills write board Status by name (`gh project item-edit --field Status --value …`); below that they write by id, which `sidekick pm` also emits. The preflight in `sidekick pm board` says which you have.

For a repo you own and want tracked, ask for the `sidekick` skill by name, or say "bring this repo under tracking". Its bootstrap section copies the reference board, links it, creates `backlog` and `change-request`, agrees the `area:*` set with you, and verifies with `sidekick pm board` and `sidekick pm lint`. The reference board is the sidekick board: it carries the four Status options, the three views including `Focus`, and the workflow set with "Pull request linked to issue" already removed. There is no settings-page step and no auto-add workflow, because filing adds the card. The skill text doubles as the checklist if you would rather run it by hand.

For a repo where someone else owns the tracking, do nothing: `sidekick pm board --quiet` finds no board of yours and stays silent, which is the design.

## The GitHub model

The conventions are in `plugin/rules/sk-pm-conventions.md`; the parts the loop touches every day:

- **Issues are work items.** Titles are content names, never position codes. The body is the brief: the problem, what resolves it, what is out of scope, how it is verified. Exactly one `area:*` label.
- **Milestones are releases.** A milestone opens with an outcome sentence in its description — what will be true when it closes — and closes with a plugin version tag and a GitHub Release. Sized to one or two sessions.
- **One board per repo,** columns Backlog · In Progress · Verify · Done. "What do I pick up" is derived from the board at session start, never stored anywhere else.
- **`backlog` is a deliberate deferral,** and its body carries a line starting `Revisit when:` naming the condition that would re-raise it. `sidekick pm lint` flags the label without the line. A deferred issue sits in no milestone.
- **`change-request`** marks a scope or objective change; it is triaged before any milestone absorbs it.
- **Closure is GitHub-native:** `gh issue close --reason completed`, or `--reason "not planned"` with a one-line reason. The close comment cites its evidence — the commits, the measurement, the PR — and links the record in `docs/` if there is one. Status is set to Done explicitly, because the board's auto-move is eventually consistent.

At filing, an issue goes into the active milestone (it serves the stated outcome) or gets `backlog` with a `Revisit when:` line. Never a future milestone: that is a promise about a release nobody has planned.

## A session, start to finish

**1. Orient.** Run `sidekick pm pickup`. It prints the active milestone with its outcome, what is In Progress with its age, the candidates in two tiers (the active milestone's Backlog first, then unmilestoned work that is not deferred), and drift: unpushed commits, In Progress cards untouched for more than seven days, an open PR on the current branch. Continue what is In Progress unless you pause it on purpose; pull new work when In Progress drops, not on top of it. Issue #111 wraps this in `sk-orient`, possibly as a session-start hook; the command is the same either way.

**2. Pick up.** Move the card: `gh project item-edit --owner @me --url <issue url> --field Status --value "In Progress"`. The issue body is the brief.

**3. Shape the work.** Brainstorm with superpowers — the issue is the problem statement, the brainstorm settles the forks — and write the spec under `docs/superpowers/specs/`. Plan with `writing-plans`. Before handing a plan off, build its end state in a throwaway worktree and run the gates there, so every expected value in the plan is a measurement; that is what made the first R6 plan run with no gate failures.

**4. Execute.** Tiny work runs inline. Everything else goes to a worker session (below) on a branch off the baseline commit, one commit per task, unpushed; the orchestrating session reviews the whole diff and fast-forwards `master`. The gates are `bun run test`, `bun run typecheck`, `bun run check`, and for anything touching `bin/`, `bun run build` with the control that a second build changes nothing.

**5. File what you notice.** A problem outside the task is filed, not fixed: `gh issue create` with one `area:*`, the milestone or `backlog` decision, and `gh project item-add` for the card. The `sk-*` rules are in test mode — when a rule bites or falls short, that is an `area:guidance` issue too. Issue #112's `sk-track` makes this one step the model can take mid-session.

**6. Close.** Comment with the evidence, `gh issue close --reason …`, set Status to Done, and write a learning record under `docs/learnings/` only if the counterfactual holds: without it, would the next person repeat the mistake or redo the investigation? The folder opens with #112.

**7. Close the milestone.** `sidekick pm gate --milestone "<title>"` says whether anything is still open and lists it with Status; `sidekick pm lint` should be all zeros. Then: bump `version` in both manifests, `bun run build`, commit, `claude plugin tag plugin --push -m "sidekick %s"`, `gh release create sidekick--v<version> --verify-tag`, and `gh api -X PATCH repos/<owner>/<repo>/milestones/<n> -f state=closed`. Issue #113's `sk-milestone` runs this ceremony and audits the milestone against its outcome first.

## The commands

`sidekick pm` reads; the skills write. Every verb prints one JSON object and exits `0` when it ran (the verdict is in the JSON, including `tracked: false`), `1` on usage or an unexpected error, `2` when `gh` is missing or its token lacks `project`.

| Verb | Prints | Used by |
|---|---|---|
| `board [--quiet]` | `tracked`, the reason if not, owner and repo, the project number and id, the Status field with its option ids, preflight (`gh` version, scope, warnings) | Every write, since it carries the ids; the bootstrap verify |
| `pickup [--quiet]` | The board block with `item_kinds`, the active milestone, `in_progress` with ages, `candidates` by tier, `drift` | Session start |
| `lint` | `findings` and `counts` per predicate: label counts, missing Status, open-in-Done, closed-not-Done, `backlog` without `Revisit when:`, `backlog` in a milestone, position-code titles, unboarded issues, stale In Progress, more than one linked board | Grooming; the milestone gate |
| `gate --milestone <title>` | The milestone with its counts, `ready`, and every open issue in it with Status and `item_id` | Milestone close |

Every issue entry carries `item_id`, the board item's node id, so a write by id needs no lookup. `--quiet` on `board` and `pickup` prints nothing in an untracked repo — the shape a session-start hook needs.

`sidekick rules install --project|--user` and `sidekick rules check --project|--user` deliver and audit the rules; the README covers them.

## Working with a worker session

The pattern that has run every milestone since R2: one session orchestrates and holds the rulings; a second session executes a locked plan with `superpowers:subagent-driven-development`, one fresh implementer per task and two review stages between tasks. They talk through `SendMessage`; `ListAgents` shows the names.

The handoff names the plan and the spec, the baseline commit and its measured gates, and four standing rules: raise questions before acting rather than adapting a step that does not match; reads only against GitHub; commit per task on the branch, never push; write a run report at the end with every deviation and why. The worker's first message back is the baseline confirmation and any question its own pre-flight raised — the first R6 run found four real plan defects that way before a line changed.

The orchestrator rules on questions as they come, keeps a running table of any expected values it moves (a ruling that adds a test shifts every later gate by one), reviews the whole branch at the end — per-task review cannot see a defect at the seam between tasks — and fast-forwards `master`. A scope change goes in a fresh dispatch, never a mid-flight message; a worker that refuses one is right to.

## Where things are recorded

| What | Where | Lifetime |
|---|---|---|
| Work state | Issues, milestones, the board | Live; GitHub is the only status surface |
| Why something was done | The issue and its close comment | Durable; join by issue number |
| Decisions that bind the system | `docs/adr/` | Record |
| What an audit or survey found | `docs/reviews/` | Record, frozen at birth |
| What a closed item taught | `docs/learnings/` (opens with #112) | Record |
| Specs, plans, run reports | `docs/superpowers/` | Transient, gitignored; the issue is the tombstone |

Session memory is not a record. The pointer to the next piece of work lives on the board, and `sidekick pm pickup` reads it.

## Shipped and arriving

Shipped: the rules delivery, `sidekick pm` (#109), and bootstrap in the `sidekick` skill (#110). Arriving with R6: `sk-orient` (#111), `sk-track` and `docs/learnings/` (#112), `sk-milestone` (#113). After R6: the design-pass extension. The milestone list on `Rikmorn/sidekick` is authoritative; `sidekick pm pickup` in this repo shows where it stands.
