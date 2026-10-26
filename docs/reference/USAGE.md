# Using sidekick day to day

How the loop runs, session by session, and how each step lands on GitHub. The repo's `README.md` says what sidekick is and how it installs, and `LOOP.md` says what each skill does when it runs. This page says how to work with sidekick. Each step names the skill that holds its procedure, and the skill's text is the source. Where a piece has not shipped yet, this page says so. The milestone list on `Rikmorn/sidekick` is the roadmap, and each issue there is the brief for its piece.

## The shape

Superpowers is the trunk: brainstorm, plan, execute, review. The official code-review plugin reviews. sidekick adds five things around them, none of which replaces a superpowers skill.

| Layer | What it does | Where it lives |
|---|---|---|
| House guidance | The `sk-*` rules Claude Code reads in every repo: working standards, language, clean code, TypeScript, guidance authoring, PM conventions, agent prompts | `plugin/rules/`, delivered by `sidekick rules install` |
| PM layer | Tracking on GitHub for your repos: session-start pickup, filing, closing with a record, a milestone's scope review and release check, a lint. The board, a Claude Code mod, keeps one state line in view under the prompt | `sidekick pm`, its session-start hook, and the `sk-orient`, `sk-track`, and `sk-milestone` skills, and the `sk-holistic-reviewer` agent. The board mod in `plugin/hooks/board/` |
| Execution | How a written plan runs: a mode chosen per plan, what the plan carries, and the worker handoff. The desk, a Claude Code mod, names the sessions waiting on you and shows what each worker does | The `sk-execute` and `sk-worker` skills, and the `sidekick worker` verbs, `dispatch` and `finish`. The desk in `plugin/hooks/desk/`, and `sidekick desk --json`. The Skill-tool hook that gives `writing-plans` the plan stance and the handoff, and the Read hook that gives reviewers sidekick's reviewer lines |
| Context | Tells the model when its main-thread context fills, at 65% and 75% of the way to compaction, or of the window when no compaction point is known. The gauge, a Claude Code mod, draws the identity row under the prompt in every session (§Mains and workers). It also supplies the compaction point | The context monitor hook (`PostToolBatch`), the gauge in `plugin/hooks/gauge/`, and the `context_window` setting |
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

**4. Execute.** `sk-execute` lays out three modes with a recommendation, and you choose. The modes are inline, subagent-driven in the session, and a worker session. For a worker, the orchestrating session dispatches `sk-worker` with `sidekick worker dispatch` once you choose that mode. The orchestrating session reviews the whole branch and fast-forwards `master`. Each run records its mode, escalations, review rounds, and defects per stage. Token totals are not collected; #138 keeps the method, parked. The gates are `bun run test`, `bun run typecheck`, `bun run check`, `bun run check:docs`, and `bun run prose` on changed Markdown. For anything touching `bin/`, add `bun run build`, with the control that a second build changes nothing.

**5. File what you notice.** A problem outside the task is filed, not fixed. `sk-track` §Filing is that one step: duplicate check, one `area:*`, a self-contained brief, the entry gate, the card. The `sk-*` rules are in test mode — when a rule bites or falls short, that is an `area:guidance` issue too.

**6. Close.** `sk-track` §Closing, in order: the record question, the evidence comment, the close with its reason, and Status set to Done explicitly. When the close finishes a plan, a status update follows, as `sk-orient` §Status updates says. The docs layout in the `sidekick` skill states the bar, a counterfactual, and the shape.

**7. Close the milestone.** `sk-milestone` §Closing runs it. It runs `sidekick pm gate` and `sidekick pm lint`, dispositions every open issue, then audits against the outcome sentence. Three sealed reviewers then check the release as a whole, and it fixes what they confirm. Before it asks, it prepares locally and leaves everything uncommitted. It writes the learning record if the bar holds and deletes the design folders whose issues have all closed. Then it runs the repo's own preparation, such as the version bump, with the gates and draft notes. On your yes, the repo's publication runs. The closing status update and the milestone close follow, and `Resolved in <version>.` goes on each issue the milestone completed. For sidekick itself, `AGENTS.md` §Releasing holds the preparation and publication steps. `sk-milestone` §Opening then opens the next milestone with its outcome and its plans, after a sealed review of the scope. It scans the backlog, and the designs marked `ready for PM`, for seeds whose condition holds.

## The commands

`sidekick pm` reads; the skills write. Every verb prints one JSON object and exits `0` when it ran (the verdict is in the JSON, including `tracked: false`), `1` on usage or an unexpected error, `2` when `gh` is missing or its token lacks `project`. Three flags are the exceptions: `pickup --brief` prints text and `pickup --report` Markdown instead of JSON, and `pickup --glance` prints nothing in an untracked repo and exits `0`. `--report` exits `1` with its reason when there is nothing sound to post.

| Verb | Prints | Used by |
|---|---|---|
| `board [--quiet]` | `tracked`, the reason if not, owner and repo, the project number and id, the Status field with its option ids, preflight (`gh` version, scope, warnings) | Every write, since it carries the ids; the bootstrap verify |
| `pickup [--quiet] [--brief\|--report\|--glance] [--milestone <title>]` | The board block, the active milestone and every open one, the active milestone's `issue_counts` from the issue read, `in_progress` with ages, `candidates` by tier, the milestone's `plans`, `drift`. `--milestone` names the milestone instead of deriving it. `--brief` renders six lines of text instead, for the hook. `--report` prints the body of a project status update. `--glance` prints one JSON object for the board mod. It holds the board's number and URL, the milestone, the state line's level, word, and detail, and the six-line brief. Only `--glance` reads the project's status updates | Session start; status updates |
| `lint` | `findings` and `counts` per predicate: label counts, missing Status, open-in-Done, closed-not-Done, `backlog` without `Revisit when:`, `backlog` in a milestone, position-code titles, open issues whose body names `docs/superpowers/`, `unboarded` (open issues, and issues closed as completed after the board was created, with no card; an archived card on an open issue counts as none), stale In Progress, more than one linked board | Grooming; the milestone gate |
| `gate --milestone <title>` | The milestone with its counts, `ready`, and every open issue in it with Status and `item_id` | Milestone close |

Every issue entry carries `item_id`, the board item's node id, so a write by id needs no lookup. `--quiet` on `board` and `pickup` prints nothing in an untracked repo — the shape a session-start hook needs.

`sidekick rules install` and `sidekick rules check` deliver and audit the rules; the repo's `README.md` §The rules covers both.

## Working with a worker session

`sk-execute` holds the handoff and `sk-worker` holds the worker's rules. Both ship in the plugin, so every repo running sidekick has them. The `sidekick` skill's `references/workers.md` says what `sidekick worker dispatch` and `sidekick worker finish` check, and what they leave unguarded.

Choosing the worker mode is your only step. The orchestrating session writes a brief beside the plan and dispatches the worker with `sidekick worker dispatch`. The worker runs in the background, in a worktree made from the orchestrator's `HEAD`, with its pushes blocked. The orchestrating session rules on the questions from its scan through a rulings file. At the end it reviews the whole branch, because a per-task review cannot see a defect at the seam between tasks. It integrates the branch, then runs `sidekick worker finish`. That saves the run report beside the plan and removes the worker's session, desk record, worktree, and branch.

`dispatch` prints the worker's id. Look in with `claude attach <id>`, and stop the worker with `claude stop <id>`. The desk shows the worker without attaching. Its band, above the prompt of each main, names who waits on you and lists the workers with their states, led by `◐`. Its pane is a tree of sessions, and each main lists only the workers it dispatched. The rows run in this order:

1. Sessions elsewhere that need you.
2. This main, headed `▣`.
3. Its workers, waiting first, each with its running subagents under it.
4. The other sessions, after a blank row.

A row gives an icon, the name, the state, one work line, marks, and the context. The work line is what the session needs while it waits, else its latest tool call, else job state's detail, else the plan title. The icons:

| Icon | Means |
|---|---|
| `▣` / `◇` / `◌` | This main / another main / any other session |
| `●` / `◐` / `✓` / `○` | A session that needs you / works / is done / idles |
| `◦` | A subagent running inside a worker |

`⇡N` marks N commits not integrated, and `✎` marks uncommitted changes. The context bar has five cells against the session's limit, then the tokens. It turns `warning` at 65%, `claude` at 75%, and `error` at 85%. A session that publishes no limit shows the tokens alone. A session without sidekick shows `◌` and no bar, since it publishes nothing.

The pane has three width forms. From 80 body columns, each session takes one row. In a narrower pane it takes two: the head, then the work line. At under 40 columns, only the head shows, cut from its end. When the rows exceed the room, the pane's first row names any needs-you row it hides, as `+N rows · M need you`. Docked, the pane asks for `columns: 56`, which gives a body of 56 where no width is kept. A width you dragged or keyed is kept in `pluginPanes.dockColumns` in `~/.claude.json`, and it wins over the request. Widen a focused pane with ctrl+x ←, or delete the key while no session runs ([the desk pane probes, P3](../research/control-centre/2026-10-25-desk-pane-probes.md#p3-the-docks-width)). In the fullscreen layout, on a terminal at least 144 columns wide, the pane opens beside the transcript when workers appear. `/desk` shows or hides it in a main. A pane taller than its room also says so in its first row: press ctrl+x tab to focus it, then ↓ to scroll. Each session publishes the facts the tree shows, as `docs/reference/LOOP.md` §The publisher says. A worker, or a background session that is not a main, draws no desk, attached or not. §Mains and workers says which session is which, and what `/desk` answers there. `dispatch` records each worker it starts for the desk, and `finish` deletes that record. From a terminal, `sidekick desk --json` prints the snapshot the desk draws. The orchestrating session keeps the main checkout while the worker runs. `docs/superpowers/` is gitignored, so a worktree does not contain the spec or the plan; the worker reads them by the main checkout's path.

When agent view is unavailable, you start the worker yourself, typing `/sidekick:sk-worker <brief>` in a session of your own. The brief then names where it works. A branch in the main checkout, `in-place` or `branch <name>`, suits a run where the orchestrating session stays off the tree until the branch is done. A worktree, which suits a run where the orchestrating session needs the checkout meanwhile, needs `worktree.baseRef: "head"` in your session's settings. `finish` does not apply, so the orchestrating session saves the run report beside the plan by hand.

## Mains and workers

[The control centre guide](control-centre-guide.html) shows each view and move in pictures from real sessions. Open it in a browser.

Each session that loads sidekick's mods settles one role at its start, and the role decides what it draws. `plugin/hooks/role.ts` settles it. Each citation in parentheses here, such as Q1, links to a section of [the main and worker probes](../research/control-centre/2026-10-22-main-and-worker-probes.md), which measured it.

| Role | Which session | What it draws |
|---|---|---|
| Main | The session you work in: an interactive one, and the same conversation after `←` moves it to the background | The desk's band and pane, the board's line and pane, and the identity row |
| Worker | A session sidekick launched: one that `sidekick worker dispatch` started, or that `sidekick profile launch --bg` started inside a session | The identity row, which names its main and the way back |
| Other | Any other background session, such as one a bare `claude --bg` started | The identity row, and no desk or board line |

A worker's markers decide first. When its `--settings` `env` block holds a non-empty `SIDEKICK_MAIN` or `SIDEKICK_WORKER`, the session is a worker. Otherwise a session without `CLAUDE_JOB_DIR`, an interactive one, is a main. A background session is a main when Claude Code started it as a fork. `←` does that, and so does reopening a stopped main ([Q1](../research/control-centre/2026-10-22-main-and-worker-probes.md#what--does-to-the-main-q1), [Q3](../research/control-centre/2026-10-22-main-and-worker-probes.md#an-idle-backgrounded-main-q3)). Every other session is `other`.

`dispatch` and `profile launch --bg` record the main in `SIDEKICK_MAIN` when they run inside a session. The value is the main's name as `claude agents --json --all` lists it, or its session id's first 8 characters when the listing gives none. A worker that names a main passes it on to the workers it starts. Once `claude` reports a start, the launch prints `main: <value>`. Outside any session they record no main and print no such line. A dispatched worker is still a worker then, through `SIDEKICK_WORKER`, and a launched session is `other`.

**The identity row.** The gauge draws one row under the prompt in every session, whatever its role or profile. It leads with the role's icon and the session's name, then the role in words, then the profile. `<main>` here is the name the launch recorded.

| Role | Row |
|---|---|
| Main | `▣ <name> · your main · profile <profile>` |
| Worker | `◐ <name> · worker of <main> · back: ←, select <main>, Enter · profile <profile>` |
| Worker without a main | `◐ <name> · worker · ← opens agent view · profile <profile>` |
| Other | `◌ <name> · profile <profile>` |

A session without profile settings reads `no profile` in place of `profile <profile>`. Before the session's name is known, the row shows the role alone, such as `▣ your main` or `◌ session`. The row cuts from its end to fit. It replaces three older marks: the `⚠ sidekick: no profile settings` notice, the footer's `profile: <name>` label, and the worker's signpost. In a worker, `/desk` answers `/desk is off in this worker. Its main is <main>: ←, select it, Enter.`, and `/board` the same with its own name. Without a main, each answers `/<name> is off in this worker.`, with its own name. In `other`, each answers `/<name> is off in background sessions.`

**Going back.** In the main, `←` on an empty prompt opens agent view with the main selected. Enter brings the main back, and every view with it ([Q2](../research/control-centre/2026-10-22-main-and-worker-probes.md#going-back-q2)). From a worker, `←` selects the worker's row: move to the main's row and press Enter. Pin the main with Ctrl+T in agent view, and it heads the list in a `Pinned` group. Then `←` and Alt+1 open it from a worker ([Q5](../research/control-centre/2026-10-22-main-and-worker-probes.md#one-key-return-q5), [R3](../research/control-centre/2026-10-22-main-and-worker-probes.md#keys-back-from-a-worktree-worker-r3)). A pinned main also keeps its process while idle. Claude Code stops an unpinned one after about an hour unattached, and `claude attach <id>` reopens it as a main ([Q3](../research/control-centre/2026-10-22-main-and-worker-probes.md#an-idle-backgrounded-main-q3)).

**Ending a main.** Once `←` has moved the main to the background, quitting the tab leaves it running. To end it, run `/stop` inside it, press Ctrl+X twice in agent view, or run `claude stop <id>` then `claude rm <id>` ([Q6](../research/control-centre/2026-10-22-main-and-worker-probes.md#ending-a-backgrounded-main-q6)).

**Holding the main's name.** The name Claude Code derives for a new main does not survive `←`: the backgrounded conversation takes another ([Q1](../research/control-centre/2026-10-22-main-and-worker-probes.md#what--does-to-the-main-q1)). A worker launched before then would name a main that agent view lists under another name. So the first time a main launches a worker, sidekick holds the name the main shows. Once the main is next idle, the name mod runs `/rename <that name>` in the main ([R1](../research/control-centre/2026-10-22-main-and-worker-probes.md#freezing-a-derived-name-r1)). Until then, the launch warns, but only when an interactive session launches under a name that does not hold yet. The line then reads `main: <name> · sidekick holds this name once this session is idle; ← before then loses it`. A backgrounded main keeps its name when you reattach it, and a main the listing does not show yet prints `main: <id>`, so neither warns. A name you gave, with `-n` or `/rename`, already holds, and sidekick leaves it alone.

**Accepted tradeoffs.** #245's design accepted these:

- A main renamed after a worker started leaves that worker's identity row naming the old name.
- `←` pressed after a worker's launch but before sidekick holds the name loses the name for that worker. The hold waits until the main is idle, so a background command it runs can delay it past the launching turn.
- The roles rest on two undocumented engine behaviours: the classic start's `fork` source, and its firing before `session.start` ([Q1](../research/control-centre/2026-10-22-main-and-worker-probes.md#what--does-to-the-main-q1)).
- The freeze reads an undocumented file, `~/.claude/sessions/<pid>.json`, so a move there stops the freeze and the launch line's warning, and breaks nothing else ([R2](../research/control-centre/2026-10-22-main-and-worker-probes.md#session-files-in-the-background-r2)).
- The freeze writes one `/rename` line into the transcript, and tells the model the operator named the session ([R1](../research/control-centre/2026-10-22-main-and-worker-probes.md#freezing-a-derived-name-r1)).
- Every live main polls the desk once per tick, until #226 shares the snapshot.
- No identity row draws while a permission prompt holds a session's screen. R5 measured it on a worker, and the row draws on the same site, `PromptHint` ([R5](../research/control-centre/2026-10-22-main-and-worker-probes.md#the-row-under-the-prompt-during-a-permission-prompt-r5)).
- A backgrounded main whose turn ends in a question counts as waiting in other mains' desks, as the engine reads its last reply. A reply the engine takes for a question counts too, such as a one-word answer ([side findings](../research/control-centre/2026-10-22-main-and-worker-probes.md#side-findings)). #247 kept this rule, since the one case seen in use was a real question.
- Under a managed Claude Code, a plugin a person installed runs no classic hooks, so a backgrounded main reads `other` and nothing freezes.

## Where things are recorded

Work state lives in the issues, milestones, and board on GitHub, the only status surface. The issue and its close comment say why something was done. The docs layout, `plugin/skills/sidekick/references/docs-layout.md`, says which `docs/` folder takes each record, design, and working file, and how long each lasts. `docs/README.md` lists what sidekick adds to it.

Session memory is not a record. The pointer to the next piece of work lives on the board, and `sidekick pm pickup` reads it.

## Shipped and arriving

The releases on `Rikmorn/sidekick` say what each version shipped, and its milestone list says what is arriving. `sidekick pm pickup` in this repo shows where the open milestone stands.
