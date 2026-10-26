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

Fires on `startup` and `clear`, from `plugin/hooks/hooks.json`. It runs `node <plugin>/bin/sidekick pm pickup --brief` from the current directory. In a tracked repo it prints one `additionalContext` JSON object: a one-line header that names the `sk-orient` skill, then the six-line brief. The model opens the session oriented and loads the skill on demand. The board mod does not read it: it runs `pm pickup --glance` itself. Anywhere else it prints nothing and exits 0; the same when `node` or `gh` is missing or fails. Size measured on 2026-10-16: 750 bytes of stdout by `echo '{"source":"startup"}' | CLAUDE_PLUGIN_ROOT="$PWD/plugin" bash plugin/hooks/session-start | wc -c`, and 653 characters of `additionalContext` by `.length` on its parsed JSON. The plain-text hook it replaced printed 5,414 bytes.

### The Skill-tool hook

Fires on `PostToolUse` for the Skill tool, from `plugin/hooks/hooks.json`. It runs `node <plugin>/bin/sidekick hook post-skill` with the hook's event on stdin. When the skill that loaded is `superpowers:brainstorming`, it adds one paragraph to context: check whether the change needs a design pass, followed by `sk-design`'s description. When it is `superpowers:writing-plans`, it adds a lead line and three sections of `sk-execute`: §A plan carries intent, §Before the plan goes out, and §Choose the mode. The plan is written to the first two and handed off by the third. You then review the plan and, unless you already named a method, choose its mode, in one question. Any other skill, and any failure, gets nothing and exit 0, so it never blocks a call. A slash command you type yourself loads without the Skill tool, and the hook does not fire then. ADR-0010 records the mechanism.

### The Read hook

Fires on `PostToolUse` for the Read tool, from `plugin/hooks/hooks.json`. The wrapper checks the input in bash, and a read whose content lacks the review-package tokens ends there. A file that mentions them, such as a plan or a test, starts `node`, and the CLI decides from the path. When the file is a superpowers review package, `review-<base>..<head>.diff` in a plan's workspace under `.superpowers/sdd/`, it runs `node <plugin>/bin/sidekick hook post-read`. That adds sidekick's reviewer lines to the reviewer's context. The reviewer reproduces the checks the implementer claims. It also confirms each fact the diff states at its source, and searches for the stale copies of each fact the diff changes. It also holds the comments the diff adds to `sk-clean-code.md` §Comments, which the hook quotes from the plugin when the package shows files that rule covers. The reviewers that `subagent-driven-development` and `executing-plans` dispatch read a package, whether for a task, a batch, a fix round, or the whole branch. The reviewers of `sk-milestone`'s release check read the package it builds, and get lines of their own. Those lines carry the claims check, worded for a reviewer with a search tool and no shell, and the Comments paragraph under the same condition. They carry no reproduce paragraph. A standalone `requesting-code-review` run, and a reviewer whose diff file is missing, never open one. The hook fires inside subagents, and wherever the plugin is enabled. ADR-0011 records the mechanism.

### The context monitor hook

Fires on `PostToolBatch`, after each batch of tool calls, from `plugin/hooks/hooks.json`. The wrapper `plugin/hooks/post-tool-batch` ends in bash when the input contains `"agent_id":"`, the key a subagent's event carries, since a subagent's window is its own. A tool input or response with an `agent_id` key matches too. That main-thread batch goes unchecked, and the next batch checks. Otherwise the wrapper runs `node <plugin>/bin/sidekick hook post-tool-batch`. That hook also carries the canary: when the gauge's variable is unset, malformed, or another session's, it tells you once per session through `systemMessage`, which Claude Code shows as `PostToolBatch says: <text>` under the tool's row. The hook never speaks for a subagent's batch. The text is `CANARY_TEXT` in `bin/helpers/context-monitor.ts`.

The CLI reads the figure from the transcript: the sum of `input_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` on the newest main-thread assistant entry. It reads the file's last 256 KB, widening to 2 MB. The limit is the first of three that applies. First is the gauge's variable `SIDEKICK_CONTEXT_LIMIT`, only when its session and model are this session's and the transcript's newest main-thread model. Second is `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, read as a compaction window: raised to Claude Code's 100,000 floor, less a 33,000 margin. Third is the `context_window` setting, which reaches the hook as `CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW`, read as the window. Set the setting in `~/.claude/settings.json` as `"pluginConfigs": {"sidekick@rikmorn": {"options": {"context_window": 1000000}}}`. For one session, pass `claude --settings '{"pluginConfigs":{"sidekick@rikmorn":{"options":{"context_window":1000000}}}}'`. A session started with `--plugin-dir` loads the plugin as `sidekick@inline` and reads that key, not `sidekick@rikmorn`.

At 65% the hook adds a warning to context. That is 65% of the way to compaction when the limit is a compaction point, and 65% of the window otherwise. The text says which. At 75% it adds a critical one that asks the model to tell you at the next natural pause. A worker that `sidekick worker dispatch` started has `SIDEKICK_WORKER` set, and no one watches it. Its critical warning tells it to carry on rather than tell you, and to re-read its brief after a compaction. Each level speaks once until usage drops below 65%. A latch file in the temp directory, `sidekick-ctx-<session_id>.json`, records the level last spoken and whether the canary has spoken, and usage below 65% re-arms both levels. The hook deletes the file when both are empty. When no source gives a limit, the hook gives no warning. A figure above the limit, a missing transcript, and any failure get no warning and exit 0, so it never blocks a call. The canary does not need a transcript or a limit, so it can still speak in those cases. GSD's own monitor also runs until #214 removes it.

### The gauge

`plugin/hooks/mods.ts` registers the role tracker in `plugin/hooks/role.ts` first, so the role settles before the mods' start hooks run. The publisher in `plugin/hooks/publish/` follows, so a session's key and self facts are under way before the board and the desk start. Then come sidekick's other Claude Code mods: the board in `plugin/hooks/board/`, the gauge in `plugin/hooks/gauge/`, the scope mod in `plugin/hooks/scope/`, the desk in `plugin/hooks/desk/`, and the name mod in `plugin/hooks/name/`. `"modules": ["./mods.ts"]` in `plugin/hooks/hooks.json` loads them, and they need Claude Code 2.1.287 or later. In every role it draws the identity row in `PromptHint`, under Claude Code's hint line and over the board's line. The row holds the session's name, its role, and its profile; `docs/reference/USAGE.md` §Mains and workers shows it. It reads the facts the publisher keeps in `$.state`, so a change redraws the row. Until the publisher has written them, it draws the role the tracker settled. The row replaces the footer's `profile: <name>` label, the `⚠ sidekick: no profile settings in this session` notice, and the worker's signpost, so the gauge no longer calls `$.ui.status`. At session start and after each tool batch, it sets the process variable `SIDEKICK_CONTEXT_LIMIT`, keyed by session id and model, which the context monitor reads first. It writes nothing when the session gives no usage breakdown, or when auto-compaction is on and the breakdown gives no threshold. Before any value is set, the monitor then falls back, and its canary speaks though the mods run; Claude Code's declared types rule out both cases. The gauge only observes and draws: no hook approves or denies anything. Where an organisation manages Claude Code, its `classic.PostToolBatch` hook does not run in a plugin a person installed, so the variable is set only at session start.

In Claude Code's testing kit, on 2.1.300, a hook that failed in one mod skipped the module's whole hook for that event. The other mods' parts went with it. The gauge hooks `session.start` with no matcher, and the role tracker, the publisher, the board, the scope mod, the desk, and the name mod hook it on `isInteractive`. The board and the name mod also share `classic.PostToolUse` on Bash. So each of those hooks catches what fails, and calls `next(e)` once whatever happened. Every other hook catches its failures too, except one: the role tracker's `classic.SessionStart` hook, matched on `fork`, which sets a flag, keeps the fork in `$.state`, and catches a failed write itself. The `/board` hook toggles a pane and catches its own failures. The scope mod's `/profile` hooks catch theirs, and its command and pane hooks each carry a matcher. A failed read at session start leaves `SIDEKICK_CONTEXT_LIMIT` unset, which the canary reports; after a tool batch it leaves the last value. Each caught failure goes to the debug log, where the engine names a hook it skips.

Three gates cover the mods. `bun run typecheck:mods` checks them against Claude Code's declarations, which `bin/mod-types.sh` generates into the ignored `.cache/claude-code-types/`; it makes one headless Haiku call when this build's file is missing. `claude plugin test plugin` runs the mods' tests. `bun run check:mods` also runs two live stages. First, a headless Haiku session with `--plugin-dir plugin` must show the gauge's compaction warning and no canary. Then a background Haiku session, in the default permission mode, asks to run one Bash command. Within 90 seconds, `sidekick desk --json` must name it as waiting on a `permission prompt`, with no warnings. Run the check after a Claude Code upgrade, or when the canary speaks. On a full pass it rewrites `.claude-code-version`, the build CI installs for `validate` and `plugin test`.

### Roles and the name mod

Each session settles one role at its start, in `plugin/hooks/role.ts`: a main, a worker, or `other`. The desk, the board, the gauge, the publisher, and the name mod read that one value, and the debug log names it. A hot reload of the plugin's code keeps it: a fork lives in `$.state`, which a reload leaves alone, so a backgrounded main stays a main. The desk and the board run in a main, and `other` draws neither. The gauge's identity row and the publisher run in every role. `USAGE.md` §Mains and workers says which session takes which role. In a main, the name mod acts after a Bash call that runs `sidekick worker dispatch`, or `sidekick profile launch` with `--bg`, whatever the call's outcome. It runs `<plugin>/bin/sidekick session --json --self <session id>`. When the session's name does not hold, it schedules one `/rename` to that same name, which runs once the session is idle. It freezes at most once per process. Its rung is the operator's 2026-10-22 ruling, which ADR-0012's amendment records. Where an organisation manages Claude Code, classic hooks do not run in a plugin a person installed. There no `fork` start records, so a backgrounded main reads `other`, and the freeze never runs.

### The publisher

Every interactive session publishes one `$.store` key about itself. The desk reads the keys to draw what the listing cannot give: a session's activity, running subagents, and context limit. `plugin/hooks/publish/` holds the mod, and `publish/contract.ts` holds the key's shape and its staleness rule. It runs in every role, whatever a profile hides. A `-p` run publishes nothing, and neither does the process that runs on as agent view's tab after `←`.

- **What it publishes:** under `session:<session id>`, the session's name, role, and profile, and a worker's main. It adds one activity line, its running subagents, and its tokens with the gauge's limit. `publishedAt` completes the key.
- **When:** at the interactive start, again once the name is known, and on each event that can change a fact. A heartbeat writes every `HEARTBEAT_MS` (60 s), changed or not, so `publishedAt` stays fresh. An unchanged key is otherwise not rewritten. `session.end` deletes the key.
- **Self facts:** it also keeps the session's name, role, main, and profile in `$.state` as `sidekick.self`, which the identity row reads. The plugin manifest names `hooks/state.d.ts` as its `types` contract for the plugin's `$.state` keys.
- **What a reader ignores:** a key of another `PUBLISH_VERSION`, and a key whose session has no `pid` in the listing. It also ignores a key older than `STALE_MS` (180 s, three heartbeats).
- **Pruning:** after each ok run, the desk deletes the keys whose session left the listing. A key published within a heartbeat stays, since its session may have started after the listing ran.
- **Two stores:** a copy of sidekick loaded with `--plugin-dir` and an installed copy keep separate stores, so a desk does not see the other copy's keys. The probe record infers this from how the store files are named ([the desk pane probes, P1](../research/control-centre/2026-10-25-desk-pane-probes.md)), and nothing has measured it.

### The desk

The desk names the sessions waiting on you and shows what each worker does. Like the gauge, it only observes and draws. It polls in mains only, and stays off in workers and other background sessions. Its `session.start` hook matches `isInteractive`, which keeps a `-p` run out. A background session reads `isInteractive` too, so the role tells them apart. In a worker the desk registers `/desk`, which answers `/desk is off in this worker. Its main is <main>: ←, select it, Enter.`, and does nothing more. Without a main, the answer is `/desk is off in this worker.` In `other`, `/desk` answers `/desk is off in background sessions.` In a main the desk registers `/desk`, then runs `<plugin>/bin/sidekick desk --json --self <session id>` every 10 seconds, with an 8-second timeout. It skips a tick while a run is in flight. It also skips one while the process has no surface, as agent view's tab process has after `←` ([the main and worker probes, Q1](../research/control-centre/2026-10-22-main-and-worker-probes.md#what--does-to-the-main-q1)). It redraws only when the snapshot or the live session keys changed.

The band above the prompt has at most three lines, each cut to the band's width, with `+N more` for the entries that do not fit. `● needs you` names each waiting session with its reason. `◐ workers` lists each child with its state, then the count of other sessions that finished; with no children, the count stands alone. A failed run draws `⚠ desk: <reason>` instead, and a warning adds `⚠ desk: <first warning>`. The pane, titled `Desk`, is the tree that `docs/reference/USAGE.md` §Working with a worker session describes. `plugin/hooks/desk/tree.ts` merges each snapshot row with its session's live published key, and orders it: sessions elsewhere that need you, this main, its children, then the other sessions, after a blank row in the inline form. A worker whose key names another listed main, by its listing name, nests under that main, waiting first. A waiting worker lifts its main's block to the top of the pane. Every row but this main's lists its subagents that run, wait, or are pending. `plugin/hooks/desk/rows.ts` draws the rows at the pane's width: one aligned row per session from 80 columns, else the stacked form in `stacked.ts`, which groups sessions by repository. `look.ts` holds what both forms draw alike. A key counts only while `isLive` passes it (§The publisher). A row without a live key still draws, from the snapshot alone: it loses its published activity, subagents, and context limit.

- **Icons:** `▣` this main, `●` needs you, `◐` working, `✓` done, and `○` idle. Inline, a row elsewhere leads with its kind instead: `□` a session whose key says `role: 'main'`, `–` any other session; and `◦` marks a subagent. Stacked, every session's icon is its state, and a subagent's is its own: `◐` running, `●` waiting, `○` pending. A state word the listing gives that the desk does not know draws as `○` with the word; stacked, the word leads the detail row.
- **Work line:** while the session waits, its `needs`. When `needs` is absent or Claude Code's `send a prompt to start`, the snapshot's `asked`, else a reason other than `waiting` or `blocked`. Otherwise the activity, else job state's `detail`, else the plan. An `idle since` activity gives way to `detail`.
- **Subagents:** three at most for each session, then a row that counts the rest: `◦ +N more` inline, `+N more` stacked. Stacked, each takes a head row, its icon and type, and a row with its description.
- **Context:** four cells of `▰` and `▱`, 25% each, against the published limit, then `tokens/percent`. The lit cells take `success` under 65%, `warning` from 65%, `claude` from 75%, and `error` from 85%; the text takes `inactive` under 65%, then the same tones. With no room for the whole bar, the text alone shows when it fits; with no limit, the tokens alone. A child with no live key takes its tokens from the snapshot.
- **Marks:** `⇡N` for commits not integrated and `✎` for uncommitted changes, on a child's row.
- **Widths:** one row per session from 80 body columns. Narrower, the stacked form: a `─ <repo> ───` header per repository, then a head row and a detail row for each session. The profile stands at the detail row's right while the detail keeps 12 columns. A name gives way first, down to 8 columns, then the bar, then the text. Every row is cut from its end to the pane's width.
- **Hint:** when the rows exceed the room, the first row reads `+N rows · ctrl+x tab to focus, then ↓` or `+N rows · ↓ to scroll`, as before. If the window hides a needs-you row, it reads `+N rows · M need you`, with the keys when they fit.
- **Dock:** `$.ui.open` asks for `columns: 40`, the request `DOCK_COLUMNS` holds, the width the stacked form was ruled for on 2026-10-26 (#254). Where no width was kept, a request of 56 docked at 57 columns with a body of 56. So 40 should dock at 41, which is inferred, not measured. A width the operator dragged or keyed is kept in `pluginPanes.dockColumns` in `~/.claude.json` and wins over the request. The key is one width for every plugin's pane. Widen a focused pane with ctrl+x ←, or delete the key while no session runs ([the desk pane probes, P3](../research/control-centre/2026-10-25-desk-pane-probes.md#p3-the-docks-width)).

`/desk` shows or hides the pane. In the fullscreen layout it also opens by itself when children appear after a run that had none. Claude Code places a pane opened unasked only at 144 columns or wider ([the desk probes, §Drawing](../research/control-centre/2026-10-15-desk-probes.md#drawing)). On the main screen it opens only through `/desk`. Ctrl+x Tab cycles focus through sites, and a band taller than its room can take the first press ([the pane-fit probes, §P2 and §P3](../research/control-centre/2026-10-22-pane-fit-probes.md)).

`sidekick desk --json [--self <session id>]` computes the snapshot, and runs from a terminal without the mod. It reads `claude agents --json --all`, git, and transcript tails. It also reads the worker records in `<common git dir>/sidekick/workers/` of the repository holding the current folder; `references/workers.md` in the `sidekick` skill describes them. It prints one JSON object, whose shape `plugin/hooks/desk/contract.ts` holds, at version 2. It carries `waiting`, `children`, `finished`, `others`, and `warnings`. With `--self` it adds `self`, the caller's own row. It also carries `paneWarnings`, from job state, and `sessionIds`, every id in the listing, which the mod uses to prune published keys. Inside a repository it adds `repo`, the main checkout's folder name.

- **Current:** a row carrying a `pid`, or a background row in `state: working` or `blocked` after its process exited. `claude agents --json` uses the same rule without `--all`. A row that is not current shows only as a child.
- **Waiting:** a current background session in `state: blocked`, with or without a `pid`, or a session with a `pid` in `status: waiting`. Its reason is the row's `waitingFor` when it has one, else `blocked` or `waiting`. Each waiting row but the caller's carries `asked`: the first line of text in its newest main-thread assistant entry. An entry that is a tool call gives none, and a transcript that cannot be read gives none, without a warning.
- **Others:** every current session that is not a child. One in `state: working` without a `pid`, such as a `/loop` between steps, never waits and is never counted.
- **Finished:** counts sessions that are not children. That is a background session with a `pid` in `state: done`, or an interactive one in `status: idle` whose transcript changed in the last 30 minutes.
- **Children:** the repository's workers, each joined to its session by job id, else by name. A worker record names its main. With `--self`, a main's children are the workers that name it, and those that name none. A child whose session is gone reads `gone` and keeps its git marks.
- **Warnings:** a listing value the desk does not know is kept, with a warning naming it. So is a row with a `pid` but no `status`, or a background row without `state`. A failed git call or transcript read leaves its field out and adds a warning too.

The command deletes a record whose session has left the listing and whose worktree is gone. It exits 0, with `ok: false` when the listing fails, and 1 on a usage error. The desk's `session.start` turns a failed setup into a failure snapshot, so the band names the failure rather than going blank. It calls `next(e)` once whatever happened. Its render hooks fall back to what lies beneath when their own drawing fails.

### The board's state line

The board mod draws one line under the prompt, so where the milestone stands stays in view. Like the gauge and the desk, it only observes and draws. It draws in `PromptHint`, beneath the hint line. The desk's band still sits above the prompt.

The line reads `▤ owner/repo · board #N · ▲ drift · 3 unpushed · <milestone> · HH:MM`. `board #N` links to the board, and the time is when the last pickup ended. The row sheds to fit the hint area, which sits `HINT_INSET` columns inside the width the hook is given (`plugin/hooks/lines.ts`). With a pane docked, that width was the transcript column's, though the row spans the terminal, so the layout cuts the milestone at the row's real width. The milestone stays while six of its cells and an ellipsis fit, and then drops. Then the board link, the detail, the owner, and the repo go in that order. The state and the time stay, and a row that still overflows is cut.

The state comes from `sidekick pm pickup --glance` (`bin/helpers/pm-glance.ts`). It starts from the milestone's newest status update whose start date is the milestone's creation day, in UTC: `on track`, `complete`, `at risk`, `off track`, or `inactive`. Without such an update it reads `no update`, and `status unread` when the read of the updates fails. With no active milestone it reads `no milestone`, or `pick a milestone` when several are open. Any drift the brief reports lifts an `on track`, `complete`, `inactive`, or unknown state to `drift`, with the first kind in short form and `+N` for the rest. A state of `at risk` or `off track` keeps its word and gains that detail. Only `--glance` reads the status updates, and `--brief` is unchanged.

The pickup runs at a live start, resume, fork, or `/clear`, and never on a compact. It reruns when `/board` opens the pane, and after a Bash call that writes what it reads. `isBoardWrite` in `plugin/hooks/board/logic.ts` decides from the command text: `gh project item-edit` or `item-add`, `gh issue close`, `reopen`, `create`, or `edit`, and a `gh api` PATCH on a `milestones` path. A `git commit`, a `git push`, and a `gh api graphql` call that posts a status update count too. No clock reruns it. One run goes at a time. Requests during a run rerun it once when that run ends, and that rerun counts as a `/board` when any of them was one.

`/board` shows or hides a `board` pane, and runs at once when typed mid-turn. It holds the milestone as a plan tree. From the top: a rule header that links the board, the milestone and its state, the next move, any drift, and the outcome. Then come a cell per plan with `N/M plans`, the plans with their issues, and a stamp: `as of HH:MM`, or `refresh failed HH:MM`. The CLI words the rows with no width, and the mod fits them to the pane. `/board` opens the pane asking for 40 columns, and a width you kept wins, as for the desk. When the room hides rows, its first row counts them, as the desk's does. A failed run keeps the last good row and stamps it `refresh failed HH:MM`, and the debug log gets the reason. With no good row yet, only a failed `/board` draws a line, `⚠ board: <reason>`, which stays until a run succeeds or `/board` closes the pane. A failed run the board starts itself leaves an empty row empty. If `gh` is missing, its token lacks the `project` scope, or the network fails, the pickup exits non-zero before it knows whether the repo is tracked. A line from those runs would break the silence in an untracked repo. In an untracked repo the pickup prints nothing, and the row stays empty.

The start pickup, the row under the prompt, and the pane run only in a main, and stay off in workers and other background sessions. Both still register `/board`. A worker's answers `/board is off in this worker. Its main is <main>: ←, select it, Enter.`, or `/board is off in this worker.` without a main. An `other` session's answers `/board is off in background sessions.` A profile whose `hide.mods` holds `board` switches the mod off, and a settings read that fails leaves it on. Under `-p` it does nothing. Where an organisation manages Claude Code, the board's `classic.SessionStart` and `classic.PostToolUse` hooks do not run in a plugin a person installed. `claude plugin validate --strict plugin` warns of that on 2.1.301. There no start pickup runs and the board sees no board writes, so the row stays empty until `/board`.

### The scope mod

The scope mod rewrites what the model is offered, the third rung of ADR-0012's ladder. It reads the session's flag settings, where `sidekick profile` puts the profile's `sidekick.hide` key, and fails open: a missing, malformed, or unreadable key hides nothing. It never approves a call or answers a permission, in ADR-0012's words. Withholding a hidden agent, from the listing and from dispatch, is the filter itself.

- **Agent filter.** Its `agent.offer` hook withholds each agent type that `hide.agents` names, by exact name. The model's listing leaves it out, and a dispatch of it is refused. Claude Code's declarations for `agent.offer` say so on 2.1.301, and no live probe has checked the dispatch. Name each agent as the agent listing names it, such as `Explore`. The declarations do not say how the listing names a plugin's agent, and no probe has checked.
- **Part switches.** `hide.mods` names mod parts that stay off, `board` and `desk`. Those mods read the same key at session start and do nothing when it names them.
- **`/profile`.** `/profile` toggles a pane, in a background session too. It runs at once when typed mid-turn, and when the engine refuses the name because another owner holds it, the hook passes the run on. The pane opens holding the keys, so ↓ scrolls it and Esc closes it. Its first row counts the rows the room hides, as the desk's does. It shows the profile's name, or that the session has none, then the agents and mod parts it hides. Below those sit the used rows of the context breakdown, and the largest agents, skills, and memory files, up to five of each. Each row keeps its token figure, and a name too long for the pane is cut. The auto-memory file prints as `auto memory: MEMORY.md`. Any other memory file's path prints relative to the session's folder, or as `~/…` under `HOME`, and one still too long keeps its end. The pane reads the usage once per open, with `$.session.usage({ breakdown: 'summary' })`, and a failed read draws one failure line. Its output goes to the screen and stays out of the model's context.

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
