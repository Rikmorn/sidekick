> Research for the `control-centre` design (R9, #210). Claude ran it on 2026-10-15 in a session with the operator, on Claude Code 2.1.300. Subagents ran most probes and surveyed prior art. Claude re-read the evidence the design rests on. It records what the desk, a mod showing which sessions need the operator, rests on. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes and survey: the desk (2026-10-15)

#210 asks for six things. They are a band naming the sessions that need the operator, a workers pane, and a summary on attach. They also include the `Notification` hook weighed against polling, a warning before deleting unintegrated work, and the mod's rung. This report measures what each rests on, with background and interactive sessions on Haiku in a scratch repository. It also surveys the mods and platform features that already do part of the job.

Provenance grades:

- **Measured:** run on 2026-10-15, with the command and the observed output named. Session state came from `claude agents --json --all`, polled every three seconds. Interactive sessions ran in a Python pseudo-terminal, and screens were read through `pyte`. Hook output was read from files the probe hooks wrote.
- **Read:** read on 2026-10-15 in the Claude Code docs, or in the mod API's declarations for 2.1.300, with the place named. Claude re-read the docs lines marked ✓.
- **Inferred:** a reading of what was measured or read. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does the listing tell a background session waiting on the operator from one working or finished? | Yes: `state` reads `blocked`, `working`, or `done` | Measured |
| Does it for an interactive session? | For a dialog, yes: `status: waiting` with a `waitingFor`. A question asked in plain text reads `status: idle`, the same as a finished turn | Measured |
| Does the listing carry the question's text? | No. Only `~/.claude/jobs/<id>/state.json` does, which the docs call unstable | Measured; read ✓ |
| What does one `claude agents --json` call cost? | About 210 ms wall and 200 ms CPU, flat from 6 to 14 rows. From a mod, 190 to 307 ms | Measured |
| Does `claude` resolve on a mod's `PATH`? | Yes, in background, interactive, and pre-warmed sessions | Measured |
| Does a session's `Notification` hook reach another session? | No. `permission_prompt` and `idle_prompt` fire in the session itself. `agent_needs_input` and `agent_completed` fire only in agent view's own process | Measured |
| Does `claude attach` raise `session.attach`? | No, nor `session.detach`, across three attaches | Measured |
| Is `$.store` shared between sessions? | Yes, and it outlives them. It is one file per plugin name and install source | Measured |
| Where do a band and a pane draw? | The band above the prompt, everywhere. A pane docks beside the transcript only in the fullscreen layout, and sits inline on the main screen | Measured |
| What does deleting a session with unpushed commits do? | `claude rm` and agent view both stop it, then refuse and keep it. Discarding takes another explicit delete | Measured |
| Does any mod event fire in another session on a delete? | No | Measured |
| Does a group delete in agent view refuse unpushed work? | Yes, on the `Needs input` group. The `Completed` group was not pressed | Measured |
| What happens to uncommitted changes on a delete? | Agent view removes the worktree with them. `claude rm` keeps a worktree that has them | Read ✓ |
| How does a mod tell it runs in a background session? | `$.env.get("CLAUDE_JOB_DIR")` is set in every background session, pre-warmed spares included, and unset in interactive ones. `isInteractive` reads `true` in both | Measured |
| Does the platform already show waiting sessions, or recap on attach? | The footer counts waiting background sessions in every session. Attaching posts a recap | Read ✓ |

## The listing, state by state

Five background sessions ran under `claude --bg --model haiku`, one per state, and `claude agents --json --all` was polled every three seconds. Tally by name, state, status, and `waitingFor`, from the probe's series file (measured):

| Situation | `state` | `status` | `waitingFor` |
|---|---|---|---|
| Starting, before the first turn | `working` | `idle` | none |
| Mid-work, in a 240-second Bash call | `working` | `busy` | none |
| A permission prompt, default mode | `blocked` | `waiting` | `permission prompt` |
| An `AskUserQuestion` dialog | `blocked` | `waiting` | `input needed` |
| A question asked in text, turn ended | `blocked` | `idle` | none |
| Turn finished | `done` | `idle` | none |
| Stopped while blocked | `stopped`, under `--all` only | none | none |
| Stopped after a finished turn | still `done`, under `--all` only | none | none |
| Failed at launch, on a bad flag | `failed` | none | none |

The starting window ran 10 to 16 seconds, but a probe bug added about ten seconds of it, so its true length is unknown. A stopped session that had finished its turn stayed `done`, as the 2026-10-14 bench found; the docs say stopped.

An interactive session in a pseudo-terminal carried `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, and `status`, and no `id` or `state` (measured). Its rows:

| Situation | `status` | `waitingFor` |
|---|---|---|
| Idle at start | `idle` | none |
| Busy | `busy` | none |
| A permission prompt | `waiting` | `permission prompt` |
| An `AskUserQuestion` dialog | `waiting` | `input needed` |
| A question asked in text | `idle` | none |
| Turn finished | `idle` | none |

The docs agree on every value seen ✓. They list three more `waitingFor` values that no probe raised: `sandbox request`, `worker request`, and `dialog open` (agent-view page, §List sessions as JSON). They say `claude agents --json` is "the supported way to read session state from outside Claude Code", and that the files under `~/.claude/jobs/<id>/` are not a stable interface ✓.

`state.json` held what the listing lacks: a `needs` line such as `approve Bash: touch …` or the question's text (measured). For a dialog it read `state: working` with `tempo: blocked`, disagreeing with the listing's `blocked`.

## Polling cost

Ten timed runs each, recording wall time and the child's CPU time (measured):

| Live rows | Wall, median | CPU, median |
|---|---|---|
| 6 | 210 ms | 187 ms |
| 8 | 219 ms | 199 ms |
| 14 | 217 ms | 211 ms |
| `claude --version`, for scale | 15 ms | 12 ms |

From a mod, `$.process.run(["claude", "agents", "--json"])` in `session.start` took 190 to 307 ms and exited 0 in every session (measured). `claude` resolved to the launching shell's install, `~/.local/bin/claude`. The docs say a background session gets the dispatching shell's `PATH` (read).

`$.tool.call({ tool: "ListAgents" })` took 609 ms in one run. It returns a name, a messaging reference, a type, and a status, with no `state` and no `waitingFor` (measured).

## The `Notification` hook

A settings `Notification` hook and a mod's `classic.Notification` hook logged identical sets in every session (measured):

| Type | Fired for |
|---|---|
| `permission_prompt` | A Bash permission prompt and an `AskUserQuestion` dialog, background and interactive |
| `idle_prompt` | 60 to 70 seconds after a turn ended, for a finished turn and a text question alike, background and interactive |
| none | A busy session, and a session held on a dialog for about twenty minutes after its first notice |

Agent view's own process fired `agent_needs_input` and `agent_completed` when its hook came through `claude agents --settings`. Its `session_id` was agent view's own, and the background session appeared only in the message text (measured). No interactive session received either type when a background session blocked or finished. The docs say agent view sends these only while it is open (read ✓).

## Attach

Three `claude attach <id>` runs, one held for about 45 seconds, logged no `session.attach` or `session.detach` in the background session's mod (measured). `$.session.surfaces()` stayed `["terminal"]`, and the listing row gained no attached field. A background session already runs in its own 200 by 50 terminal host, `claude bg-pty-host`, seen with `ps` (measured). The declarations say the terminal's attachment "raises nothing" (read).

The docs say attaching posts "a short recap of what happened while you were away" (agent-view page, §Attach) ✓. The probe's one attach replay, of a session mid-work after one turn, shows no recap (measured), so that recap was not seen.

`$.model.fork` from a slash command took 1,627 ms in an attached background session (measured). It took 1,744 ms in an interactive one, each served mostly from cache.

## `$.store`

Two headless runs under `--plugin-dir` loaded a scratch mod whose `session.start` wrote `desk:<session id>` and listed the keys (measured). The second run listed the first run's key. The store lived at `~/.claude/plugins/store/<plugin>_inline-<hash>.json` and kept both keys after both sessions ended (measured). The docs say every session on the machine running the mod shares one `$.store`, and that a `get` followed by a `set` is not atomic (mods interface page) ✓.

Inferred: an installed plugin keeps a different file from the same plugin loaded inline, so a `--plugin-dir` session and an installed one do not share keys.

## Drawing

A scratch mod drew a one-line band through `ui.render` on `AbovePrompt`, and opened a pane with `$.ui.open` (measured):

| Session | Width | Pane | Band |
|---|---|---|---|
| Interactive, main screen | 200 and 100 | inline, over the band | drawn |
| Interactive, fullscreen (`CLAUDE_CODE_NO_FLICKER=1`) | 200 and 120 | docked beside the transcript | drawn |
| Interactive, fullscreen | 100 | inline | drawn |
| Background, and the same session attached | its 200-column host | docked | drawn |

- A pane opened without the operator asking was not placed below 144 columns. The subagent reported the reason the engine gave:

  ```text
  unasked below 144 columns (100 now): placed when the person opens it, or when the terminal is widened to 144 columns
  ```

  Opened from a slash command, it was placed inline at 100 columns.
- A pane already placed stayed when the terminal narrowed.
- While a permission dialog was up, neither the band nor the pane drew.
- The band's `maxRows` was 50 on the main screen, and 19 beside a docked pane.

The docs say a band's tree replaces what later mods draw there, unless it includes `await next(e)` (mods interface page) ✓.

## Deleting

A background session committed twice in its worktree, in a repository with no remote (measured):

- `claude rm <id>` stopped the process, and its mod saw `session.end`. It kept the worktree and the row, exited 0, and printed `kept <id> — … 2 unpushed commits on "worktree-dk-wt1" … claude rm <id> --discard-unpushed <sha>@<worktree id>`.
- In agent view, a first Ctrl+X armed the delete. The second stopped the session and refused: `not deleted · 2 unpushed commits on "worktree-dk-wt2" — ctrl+x again discards them`. A further double press removed the row, the worktree, and the branch.

No mod event fired in any other session for either delete (measured). With agent view's `Completed` header selected, the footer offered `ctrl+x to delete all`, which was not pressed.

A second round tried a group delete. Two sessions each committed in their own worktree, then waited on an `AskUserQuestion`. With the `Needs input` header selected, the footer read `enter to collapse · ctrl+x to delete all` (measured):

1. The first press marked both rows `ctrl+x again to delete`.
2. The second stopped both and refused both, as `not deleted · 2 unpushed commits on "worktree-dk-grp1" — ctrl+x again discards them`, and likewise for `dk-grp2`. Both worktrees and branches stayed.

The `Completed` group was not pressed, since the operator's own finished jobs sat in it. Inferred: a delete there refuses the same way, since each session's refusal looks the same.

The docs list what a delete removes (agent-view page, §What deleting a session removes) ✓:

- Agent view removes a worktree Claude Code made, "including uncommitted changes". `claude rm` keeps one that has uncommitted changes.
- Commits on a remote do not block a delete. Neither do commits on the local copy of `origin`'s default branch, while that branch is checked out in the main checkout.

A session stuck at startup, in a configuration that was not signed in, was deleted without the unpushed check, leaving its worktree behind (measured).

## Agent view and plugins

`claude agents --plugin-dir <probe>` loaded no mod in agent view's own process (measured). It loaded the mod in pre-warmed `claude bg-spare` workers. Each fired `session.start` as soon as agent view opened, under a session id no listing showed, and drew a band and a pane no one saw. A later dispatch took one over.

## Telling a background session apart

A scratch mod logged `$.env.get` of three variables beside `$.session.id()`, on `session.start`, `turn.start`, `classic.PostToolBatch`, and `session.end` (measured):

| Where | `CLAUDE_JOB_DIR` | `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID` |
|---|---|---|
| A background session | its `~/.claude/jobs/<id>` folder | unset |
| An interactive session | unset | unset |
| A pre-warmed spare, before its dispatch | the folder of the job id the dispatch later took | unset |

The two `CLAUDE_CODE_SESSION_*` variables reach only the Bash tool's child processes. Every probe session's `session.start` input read `isInteractive: true`, background ones included (measured, in the first round's mod logs).

A spare fired `session.start` when agent view opened, under an id no listing showed. The dispatch took that same id, and no second `session.start` followed: the next events were `turn.start` and `classic.PostToolBatch` (measured).

## Side findings

- A mod hook on a `session.*` glob also sees the module's own `$.session.*` calls. A probe that called `$.session.id()` inside such a hook re-entered itself, and Claude Code skipped the hook with `session.id hook skipped: ran past its 10s budget` (measured).
- An edited mod reloaded in idle sessions about 13 seconds after the save, and in a busy session only once its turn ended. Each reload fired `session.start` again (measured).

## Prior art

A subagent surveyed the built-in mods, Anthropic's sample mods, and the community scan at `karanb192/awesome-claude-code-mods`, on 2026-10-15. Each verdict below rests on the source it names.

| Candidate | What it does | Verdict |
|---|---|---|
| The footer's `←` hint (built in) | Counts background sessions waiting on the operator, about every ten seconds while the terminal has focus. No names, no reasons, no interactive sessions (agent-view page) ✓ | The band adds what it lacks |
| The attach recap and `/recap` (built in) | A recap on attach; an automatic recap after three turns and three minutes unfocused, capped at 400 characters (agent-view and interactive-mode pages) | Covers "since you left" unless a worker needs more |
| tower, `alaturqua/tower-mods`, Apache-2.0 | "The engine's live list is who exists; beacon's file … says what each is doing." A status file per session holds state and context | The idea: the listing for who exists, a record per session for the rest |
| fleet, `YuvalSarel1/claude-plugins`, MIT or Apache-2.0 | Polls `claude agents --json --all` only while its pane shows, every 30 seconds at most | The visibility gate. Its reads of `~/.claude/jobs/*/state.json` are rejected as unstable |
| session-fleet, `bennewton999/claude-code-mods`, MIT | A `$.store` key per session with a three-minute liveness window | One key per writer |
| sidebar, `llkhacquan/claude-mods`, MIT | Pushes changes through a signal file each session follows with `tail -F` | Rejected for now: a long-lived process per session |
| catchup, `Yanir-R/catchup`, MIT; catch-me-up, `oliverow/catch-me-up`, MIT | A structured summary since the operator last looked | Only if the built-in recap falls short |
| Mods reading `~/.claude/sessions/<pid>.json` | Session presence from an undocumented file | Rejected |

## Open questions

- How reliably a background session reads `blocked`, rather than `done`, after a question asked in text. One sample each.
- Whether a blocked session stays listed after its process exits, as the docs say, and what an hour's idle stop does to its row.
- Whether attaching from agent view's list, or from a remote surface, raises `session.attach`.
- Whether agent view's "delete all" on the `Completed` header refuses unpushed work, as it did on `Needs input`.
