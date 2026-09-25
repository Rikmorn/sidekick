---
kind: usage
status: living
---

# Using sidekick day to day

How the loop runs, session by session, and how each step lands on GitHub. The `README.md` says what sidekick is and how it installs; this page says how to work with it; `LOOP.md` says what each skill does when it runs. Where a piece has not shipped yet, it says so — the milestone list on `Rikmorn/sidekick` is the roadmap, and each issue there is the brief for its piece.

## The shape

Superpowers is the trunk: brainstorm, plan, execute, review. The official code-review plugin reviews. sidekick adds four things around them, none of which replaces a superpowers skill.

| Layer | What it does | Where it lives |
|---|---|---|
| House guidance | The `sk-*` rules Claude Code reads in every repo: working standards, language, clean code, TypeScript, guidance authoring, PM conventions, agent prompts | `plugin/rules/`, delivered by `sidekick rules install` |
| PM layer | Tracking on GitHub for the repos you own: session-start pickup, filing, closing with a record, milestone to release, a hygiene lint | `sidekick pm`, its session-start hook, and the `sk-orient`, `sk-track`, and `sk-milestone` skills |
| Execution | How a written plan runs: a mode chosen per plan, what the plan carries, and the worker handoff | The `sk-execute` and `sk-worker` skills |
| Extensions | Design-side steps the ecosystem lacks. Shipped: a design pass before or during brainstorming. To come: a sealed review after a spec, a goal-backward verdict after a build | The `sk-design` skill and its Skill-tool hook; later milestones for the rest |

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

`gh` 2.98 or later lets the skills write board Status by name (`gh project item-edit <board number> --field Status --value …`); below that they write by id, which `sidekick pm` also emits. The preflight in `sidekick pm board` says which you have. Once the plugin is enabled, its session-start hook prints the board's pickup into context in every tracked repo and stays silent everywhere else.

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

**1. Orient.** The session-start hook prints `sidekick pm pickup --brief` into context. It names the active milestone with its outcome, what is In Progress with its age, and the candidates in two tiers. Tier 1 is the active milestone's Backlog; tier 2 is unmilestoned work that is not deferred. Drift follows: unpushed commits, In Progress cards untouched for more than seven days, an open PR on the current branch. It ends with a suggested move. `sk-orient` says how to read it. Continue what is In Progress unless you pause it on purpose; pull new work when In Progress drops, not on top of it. Run the command yourself for a fresh picture mid-session.

**2. Pick up.** Move the card: `gh project item-edit <board number> --owner @me --url <issue url> --field Status --value "In Progress"`. The number is the brief's first line, and the issue body is the brief.

**3. Shape the work.** When a wrong choice would be costly to undo, `sk-design` designs the change before or during the brainstorm, and a fresh subagent reviews its note. Brainstorm with superpowers — the issue is the problem statement, the brainstorm settles the forks — and write the spec under `docs/superpowers/specs/`. Plan with `writing-plans`, stating each expected value as a command and what it measures. `sk-execute` lists what else a plan carries before it goes out.

**4. Execute.** `sk-execute` lays out three modes with a recommendation, and you choose. The modes are inline, subagent-driven in the session, and a worker session started with `sk-worker`. The orchestrating session reviews the whole branch and fast-forwards `master`. Each run records its mode, escalations, review rounds, and defects per stage; token totals are summed by hand while #121 is open. The gates are `bun run test`, `bun run typecheck`, `bun run check`, and `bun run prose` on changed Markdown. For anything touching `bin/`, add `bun run build`, with the control that a second build changes nothing.

**5. File what you notice.** A problem outside the task is filed, not fixed: `gh issue create` with one `area:*`, the milestone or `backlog` decision, and `gh project item-add` for the card. The `sk-*` rules are in test mode — when a rule bites or falls short, that is an `area:guidance` issue too. `sk-track` is that one step: duplicate check, one `area:*`, a self-contained brief, the entry gate, the card.

**6. Close.** `sk-track`'s close moment, in order: the record question, the evidence comment, `gh issue close --reason …`, and Status set to Done explicitly. `docs/learnings/README.md` states the bar, a counterfactual, and the shape.

**7. Close the milestone.** `sidekick pm gate --milestone "<title>"` says whether anything is still open and lists it with Status; `sidekick pm lint` should be all zeros. Then: bump the three `version` fields (plugin.json, and both in marketplace.json), `bun run build`, and commit. Release: `claude plugin tag plugin --push -m "sidekick %s"`, then `gh release create sidekick--v<version> --verify-tag --title "sidekick <version>" --notes-file <notes>`. Close: `gh api -X PATCH repos/<owner>/<repo>/milestones/<n> -f state=closed`. `sk-milestone` runs this. It audits against the outcome sentence, dispositions every open issue, asks for confirmation, runs the ceremony, and comments "resolved in" on each closed issue. Its open moment creates the next milestone with its outcome and scans the backlog for seeds whose condition holds.

## The commands

`sidekick pm` reads; the skills write. Every verb prints one JSON object and exits `0` when it ran (the verdict is in the JSON, including `tracked: false`), `1` on usage or an unexpected error, `2` when `gh` is missing or its token lacks `project`.

| Verb | Prints | Used by |
|---|---|---|
| `board [--quiet]` | `tracked`, the reason if not, owner and repo, the project number and id, the Status field with its option ids, preflight (`gh` version, scope, warnings) | Every write, since it carries the ids; the bootstrap verify |
| `pickup [--quiet] [--brief]` | The board block with `item_kinds`, the active milestone, `in_progress` with ages, `candidates` by tier, `drift`; `--brief` renders six lines of text instead, for the hook | Session start |
| `lint` | `findings` and `counts` per predicate: label counts, missing Status, open-in-Done, closed-not-Done, `backlog` without `Revisit when:`, `backlog` in a milestone, position-code titles, unboarded issues, stale In Progress, more than one linked board | Grooming; the milestone gate |
| `gate --milestone <title>` | The milestone with its counts, `ready`, and every open issue in it with Status and `item_id` | Milestone close |

Every issue entry carries `item_id`, the board item's node id, so a write by id needs no lookup. `--quiet` on `board` and `pickup` prints nothing in an untracked repo — the shape a session-start hook needs.

`sidekick rules install --project|--user` and `sidekick rules check --project|--user` deliver and audit the rules; the README covers them.

## Working with a worker session

`sk-execute` holds the handoff and `sk-worker` holds the worker's rules. Both ship in the plugin, so every repo running sidekick has them.

You open a session in the repo and start `sk-worker` there; that is your only step. The orchestrating session finds the worker, sends it the plan, and rules on the questions from its scan. At the end it reviews the whole branch, because a per-task review cannot see a defect at the seam between tasks.

## Where things are recorded

| What | Where | Lifetime |
|---|---|---|
| Work state | Issues, milestones, the board | Live; GitHub is the only status surface |
| Why something was done | The issue and its close comment | Durable; join by issue number |
| Decisions that bind the system | `docs/adr/` | Record |
| What an audit or survey found | `docs/reviews/` | Record, frozen at birth |
| What a closed item taught | `docs/learnings/`; its README states the bar and the shape | Record |
| Designs being explored | `docs/backlog/<topic>/`, written by `sk-design` | Until the issues it became close |
| Specs, plans, run reports, shape-scale design notes | `docs/superpowers/` | Transient, gitignored; the issue is the tombstone |

Session memory is not a record. The pointer to the next piece of work lives on the board, and `sidekick pm pickup` reads it.

## Shipped and arriving

Landed in 0.3.0: the rules delivery, `sidekick pm` with its session-start hook, bootstrap in the `sidekick` skill, `sk-orient`, `sk-track` with `docs/learnings/`, and `sk-milestone`. Landing in R7: `sk-execute` and `sk-worker` (#127), then `sk-design`, the design pass, with its Skill-tool hook (#119). The milestone list on `Rikmorn/sidekick` is authoritative; `sidekick pm pickup` in this repo shows where it stands.
