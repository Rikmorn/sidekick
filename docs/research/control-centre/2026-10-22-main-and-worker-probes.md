> Research for the `control-centre` design (R9 plan 11, #245). A subagent ran it on 2026-10-22 for the plan's design session, on Claude Code 2.1.308. It measures what `←` does to the main session and how the operator gets back. It also covers an idle backgrounded main, a worker's markers, and whether a mod can return the operator to the main in one key. A second round the same day, R1 to R5, followed the design review. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: the main across `←`, going back, a worker's markers, and one-key return (2026-10-22)

#245 builds the operator's model B from #241's 2026-10-22 comment. One main session runs per terminal tab, and `←` is the switcher. Going back is `←` then Enter on the main, or `claude attach <main's name>`. The design needs six engine facts before it picks options, Q1 to Q6 in its brief. The design review then raised five more, R1 to R5. This record answers each.

Provenance grades:

- **Measured:** run on 2026-10-22 on Claude Code 2.1.308, with the run and the log or screen line named.
- **Read:** read on 2026-10-22, in the mod API's declarations for 2.1.308, `.cache/claude-code-types/2.1.308.d.ts`, with the line named, or in the docs page named.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does `←` keep the main's process? | No. The daemon starts a new process that forks the conversation under a new session id. The tab's process stays, as agent view | Measured |
| Does `session.start` fire again, and where? | Once, in the new process, with `classic.SessionStart` source `fork`. The tab's process fires no second start | Measured |
| What does `$.env` read after `←`? | `CLAUDE_JOB_DIR` set. A `--settings` variable kept its value. A shell variable read the daemon's value, not the main's. `CLAUDE_CODE_SESSION_ATTENDED` and every `SIDEKICK_*` unset | Measured |
| Does `sidekick.profile` from `--settings` survive? | Yes. `$.settings.read({ source: 'flag' })` read the same object in both processes | Measured |
| Does the main's name survive `←`? | A `-n` name does. An auto name such as `main-a-9b` does not: the row took a name generated from the prompt | Measured |
| Does the tab's process keep running the mod? | Yes. Its clock ticked every 5 s with `surfaces` `[]`, and it drew nothing until the tab quit | Measured |
| Where is the selection after `←`? | On the main's row, first in its group, with the footer `enter to return` | Measured |
| How many keys take the operator back from agent view? | One, Enter. The backgrounded process then draws the views | Measured |
| Does `claude attach` take the name, and part of it? | Both reach a running main. A part also matches first prompts, so it can be ambiguous. A stopped session opens by id only | Measured |
| What does an idle backgrounded main do over 90 s? | It keeps its pid and its clock, and the daemon logs nothing about it. The docs stop it after about an hour unless pinned | Measured to 130 s; Read |
| Does attaching a stopped main fire `session.start` again? | Yes, by id. It respawns under the same session id and keeps `--settings`. `claude stop` stood in for a reap | Measured |
| Does a worker's mod see `SIDEKICK_WORKER` and `SIDEKICK_MAIN` at `session.start`? | Yes | Measured |
| Does a worker's Bash see its own id and both markers? | Yes: `CLAUDE_CODE_SESSION_ID` is its own id, `CLAUDE_PID` its process | Measured |
| Can a mod move the terminal to another session? | No call does. `$.command.run` runs a built-in, but `/resume` on a running background session refuses inside a background session | Read; Measured |
| Is there a bindable action for agent view, attach, or switching? | No. The `Agents` context binds grouping, pin, find, rename, and group jumps | Read |
| How many keys take a worker back to the main? | Four in the measured layout: `←`, ↑, ↑, Enter. Two, `←` then Alt+1, while the main is pinned | Measured |
| Could a mod run `claude attach` through `$.process.run`? | No. The child gets pipes, not a terminal, and the mod's process does not hold the operator's terminal | Inferred |
| How does the operator end a backgrounded main? | `/stop` inside it, Ctrl+X twice in agent view, or `claude stop` then `claude rm`. Quitting the tab leaves it running | Read; Measured |
| R1: can a mod freeze a derived name with `/rename <that name>`? | Yes, from a `$.clock.after` callback. `nameSource` moves from `derived` to `user`, and the name survives `←` | Measured |
| R1: from a `classic.PostToolUse` hook? | Refused inside the hook. A timer the hook schedules renames once the turn ends, and the name survives `←` | Measured |
| R1: `/rename` with no argument, or the same name? | No argument refuses before any conversation, and generates a name after one. The same name is a real rename that sets `nameSource` `user` | Measured |
| R2: do background sessions write `~/.claude/sessions/<pid>.json`? | Yes, with `kind` `bg`: a backgrounded main, a `claude --bg` worker, and a claimed spare. A stopped session's file goes | Measured |
| R2: what name does a backgrounded main's file carry? | Unfrozen, the model's name with `nameSource` `auto`. Frozen, the frozen name with no `nameSource`. A `-n` worker reads `peer` | Measured |
| R2: does the model's name change after a second turn? | No, about 55 s after it ended | Measured, once |
| R3: keys from a worktree worker back to its main | Unpinned: `←` then Alt+2, or `←`, ↓, Enter. Pinned: `←` then Alt+1, or `←`, ↑, ↑, Enter | Measured |
| R3: how does agent view group a worktree worker? | By state, as any session; no directory heading in the default view. Alt+N counted the worktree worker with the main | Measured |
| R4: what `source` does a stopped worker's respawn carry? | `resume`, under the same session id, in its worktree. Its `--settings` markers survive | Measured |
| R5: does `PromptHint` draw while a permission prompt holds the screen? | No. It did not render over about 60 s, attached or not, and no row drew | Measured |

Not tested:

- a real idle stop at about an hour; `claude stop` stood in for it;
- `$.command.run` of `/background`, `/bg`, or `/exit` from a mod;
- `/resume` of a running background session from an interactive session, which the docs say attaches to it;
- a `Button` with an `action`, pressed by that action's chord;
- a variable a mod set with `$.env.set` in the main, carried across `←`;
- the backgrounded main's Bash variables while no terminal was attached;
- Alt+1 to Alt+9 with sessions in more than one directory;
- two terminals attached to one session at once;
- surfaces other than the terminal, and terminal sizes other than 100 by 40;
- R1's `/rename` from `turn.complete`, which the host's refusal suggests, or from inside a `session.start` hook;
- R2's model-written name after more than two turns, or later than about 55 s;
- R3's directory grouping. Ctrl+S's choice "persists across runs" (agent-view page), and its store was not found, so it stayed unpressed;
- R3's Alt+3 and beyond, which would have opened the operator's own sessions;
- R5 on the main screen, or with a pane open.

## Method

A scratch plugin, `mainprobe`, sat in the session's scratchpad and held one hooks module. `claude plugin validate --strict` passed it. Its hooks:

- `session.start` logged the event, then found its own process. A child shell printed `$PPID`, and `ps` gave that process's and its parent's rows;
- the same hook logged `$.session.id()`, `$.session.surfaces()`, `$.settings.read({ source: 'flag' })`, and `$.settings.read({ key: 'sidekick' })`;
- it logged `$.env.get` of `CLAUDE_JOB_DIR`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID`, `PROBE_SHELL_ENV`, `PROBE_FLAG_ENV`, and each `SIDEKICK_*` name sidekick's code spells;
- it ran `/usr/bin/env` through `$.process.run` and logged every `CLAUDE*`, `SIDEKICK*`, and `PROBE*` line;
- `$.clock.every(5000)` logged a tick with the process id, the job folder, the session id, the surfaces, and the render counts;
- `ui.render` on `AbovePrompt` added a row naming the process id and job, and counted renders. `PromptHint` counted renders and passed;
- `classic.SessionStart`, `classic.UserPromptSubmit`, `classic.Stop`, `session.attach`, `session.detach`, `session.end`, and `ui.press` each logged the event;
- `/mpinfo` logged the same report again and answered the process id.

For Q5, an edit added `/mpmain [target]` and a band `Button` with hotkey `9`. Each ran `$.command.run({ command: 'resume', args })` on the target or on `SIDEKICK_MAIN`. Running sessions reloaded the module within the 25 seconds the runs waited after each save.

Every process appended to one shared log through `$.process.run`, each line stamped with UTC time and process id. Each line also went to `$.ui.log(…, { to: 'debug' })`. The log records each process's `CLAUDE_CODE_MESSAGING_TOKEN`, which this record redacts.

A Python driver hosted each interactive `claude` in a pseudo-terminal at 100 by 40, under `uv run --with pyte`. It dropped the parent session's `CLAUDE*` and `SIDEKICK*` variables, and answered the terminal's queries. Unlike the 2026-10-22 pane-fit driver, it ran in the background and read commands from a file. So a run could take listings between keys. It wrote the screen twice a second, and dumps on demand. It sent arrows in the cursor mode the program had set. From the Q1 run B on, each dump also named the rows drawn on a highlight colour.

The driver typed a slash command, read the typeahead, and sent Enter only when the first entry was that command.

A helper ran `claude agents --json --all` and printed each row absent from the listing taken before the first run. The daemon was not running then.

The runs, all with `--model haiku`, in a scratch git folder `main-a` whose trust dialog the driver answered:

- **Q1, run A:** `claude --model haiku -n probe-main --settings '{"sidekick":{"profile":"probeprof"},"env":{"PROBE_FLAG_ENV":"1"}}' --plugin-dir <mainprobe> --debug-file <file>`, with `PROBE_SHELL_ENV=1` in its environment. One turn asked for the word `ok`; then `←` on the empty prompt. This run started the daemon.
- **Q1, run B:** the same without `-n`, with `PROBE_SHELL_ENV=2` and `PROBE_FLAG_ENV=2`, while run A's daemon ran. One turn, then `←`.
- **Q2:** in run A's tab, Enter in agent view, `/mpinfo`, then `←`. Two more terminals ran `claude attach probe-main` and `claude attach probe-m`, each left with `←` and ctrl+c twice.
- **Q3:** run A's main left detached and idle from 15:09:10 to 15:11:20 UTC, with agent view open. Run B's tab quit with ctrl+c twice. Then `claude stop` on run B's main, and attaches by part of its name, its full name, and its id.
- **Q4:** `claude --bg --model haiku -n probe-worker --settings '{"env":{"SIDEKICK_WORKER":"/tmp/x/brief.md","SIDEKICK_MAIN":"4c5c78de"},"permissions":{"allow":["Bash(env)","Bash(env *)","Bash(grep *)"]}}' --plugin-dir <mainprobe> -- '<prompt>'`. The prompt asked it to run the brief's `env | grep` and answer the output. The allow rules, past the brief, kept the call off a permission prompt. `SIDEKICK_MAIN` held run A's background id. The launching shell had dropped the parent session's `CLAUDE*` and `SIDEKICK*` variables.
- **Q5:** in run A's tab, the worker opened from agent view, then `←`, arrows, Alt+1 and Alt+2, and Ctrl+T on the main. `/mpmain`, a typed `/resume`, and a bare `9` ran in the attached worker.

## Findings

### What `←` does to the main (Q1)

**A new process forks the conversation.** `←` at 15:09:09 UTC started a transient daemon, pid 64927. Its log read:

```text
[2026-10-22T15:09:10.070Z] [bg] bg claimed-spare 07f32ba9 (spare)
[2026-10-22T15:09:10.074Z] [bg] bg spawned 4c5c78de (slash)
```

The new process, pid 64993, ran under a terminal host of the tab's size. `ps` read (paths shortened):

```text
64948 …/MacOS/claude --bg-pty-host /tmp/cc-daemon-501/61b767c4/pty/4c5c78de.sock 100 40 -- …/versions/2.1.308 --session-id 4c5c78de-…
64993 …/versions/2.1.308 --session-id 4c5c78de-c5a3-4bde-a594-51c8a9d2db1e --fork-session --resume …/98446292-0ebf-41b7-b2a8-420ea2dcabd5.jsonl --settings {…}
```

The interactive session's id was `98446292-…`. The backgrounded one is `4c5c78de-…`, and `$.session.id()` there read the new id. Its hooks fired once, in this order (measured):

```text
15:09:11.680Z pid=?     classic.SessionStart source=fork session_id=4c5c78de-c5a3-4bde-a594-51c8a9d2db1e
15:09:11.702Z pid=64993 session.start e={"cwd":"…/main-a","surface":"terminal","isInteractive":true}
```

The docs say "Backgrounding starts a fresh process that resumes from the saved conversation" (agent-view page, §What carries over when you background) ✓. They do not say the session id changes. Anything keyed on the main's session id loses the main at `←` (inferred). sidekick's dispatch records and a `SIDEKICK_MAIN` set to that id are both keyed this way.

**The tab's process becomes agent view and keeps its mod.** Pid 64004 kept its command line, and `claude daemon status` named it: `` `claude agents` (pid 64004) ``. Its mod fired no second `session.start`. Its clock went on ticking, with no surfaces and no renders:

```text
15:09:13.614Z pid=64004 tick seq=10 job=- sid=98446292-… surfaces=[] renders={"band":4,"hint":5}
15:12:13.747Z pid=64004 tick seq=46 job=- sid=98446292-… surfaces=[] renders={"band":4,"hint":5}
```

It fired `session.end` only when the tab quit at 15:34:20, for the old id: `{"reason":"other","sessionId":"98446292-…"}`.

**The environment, before and after.** From `$.env.get` in each process (measured):

| Variable | Interactive, pid 64004 | Backgrounded, pid 64993 |
|---|---|---|
| `CLAUDE_JOB_DIR` | unset | `~/.claude/jobs/4c5c78de` |
| `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PID` | unset | unset |
| `PROBE_SHELL_ENV` (the shell's) | `1` | `1` |
| `PROBE_FLAG_ENV` (`--settings` `env`) | `1` | `1` |
| Every `SIDEKICK_*` | unset | unset |
| `$.settings.read({ source: 'flag' })` | `{"env":{"PROBE_FLAG_ENV":"1"},"sidekick":{"profile":"probeprof"}}` | the same |

`/usr/bin/env` through `$.process.run` added `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_ENABLE_TODO_TOOLS`, and a messaging socket and token in both. The backgrounded one also held `CLAUDE_JOB_DIR`.

**A shell variable takes the daemon's value.** Run A's shell value matched in both, because run A's tab had started the daemon. Run B's tab held `PROBE_SHELL_ENV=2` and `PROBE_FLAG_ENV=2`. Its backgrounded process, pid 74301, read:

```text
start env CLAUDE_JOB_DIR=/Users/roberto.sousa/.claude/jobs/883327d5 … PROBE_SHELL_ENV=1 PROBE_FLAG_ENV=2 SIDEKICK_WORKER=<unset> …
```

So a `--settings` variable follows the conversation across `←`, and a shell variable does not. The new process takes the environment of the shell that started the daemon (measured, one run each). The docs list `--settings` among the flags that carry through ✓.

**A `-n` name survives; an auto name does not.** Run A's rows (measured):

| When | `name` | `kind` | `id` | `sessionId` | `pid` | `state` | `status` |
|---|---|---|---|---|---|---|---|
| Before `←` | `probe-main` | `interactive` | none | `98446292-…` | 64004 | none | `idle` |
| After `←` | `probe-main` | `background` | `4c5c78de` | `4c5c78de-…` | 64993 | `blocked` | `idle` |

The interactive row left the listing, and the count stayed the same. Run B listed as `main-a-9b`, interactive, before `←`. After it, the background row `883327d5` read the name `Single word reply`. The docs say automatic names "come from a Haiku-class model" (agent-view page) ✓.

### Going back (Q2)

**Agent view selects the main's row.** One second after `←`, the tab drew:

```text
Your conversation moved to the background — enter opens it · esc returns to it · ctrl+c twice quits

Needs input
✻ probe-main                     ok                                                               0s

Completed
∙ bg                             stopped                                                         54m
```

The `probe-main` row drew on background `373737`, the selection, and the footer read `enter to return · space to reply · ctrl+x to delete` (measured). The text cursor sat in the dispatch input on the last rows. Agent view lists background sessions only. The two `bg` rows match `b4b87a5e` and `d89a865c`, the stopped rows the JSON listing names `null` (inferred). Run B's dump named the highlight directly: `HIGHLIGHT row 12 bg=['373737'] '✻ Single word reply …'`.

**Enter is the one key back.** Enter redrew the conversation in the tab. The backgrounded process drew it: its `PromptHint` count rose from 2 to 4, and the tab's process stayed at 5. `/mpinfo` there answered:

```text
  ⎿  mainprobe: MAINPROBE mpinfo pid=64993 job=4c5c78de sid=4c5c78de-c5a3-4bde-a594-51c8a9d2db1e
```

So `←` then Enter takes the main away and back in two keys, and every view returns from the backgrounded process (measured). The band at first read `pid=? job=-`. It was an answer cached from a render before `session.start` set the pid. The mod's later renders read `pid=64993 job=4c5c78de`. No `session.attach` or `session.detach` fired in any run, as the 2026-10-15 record found.

`←` in the reattached main detached again, to the same banner and selection, and started no new process.

**`claude attach` takes the full name and part of it.** From a second terminal, `claude attach probe-main` drew the main, its band reading `MAINPROBE band pid=64993 job=4c5c78de`. `claude attach probe-m` did the same. There, `←` opened agent view without the banner (measured).

A part also matches first prompts. `claude attach "Single word"` exited 1:

```text
3 sessions match 'Single word':
  883327d5  Single word reply
  4c5c78de  probe-main  (task text)
  5fc65fab  gsd-probe-after  (task text)
Use more of the name, or the id.
```

`probe-main`'s first prompt read `Reply with the single word ok.`. `5fc65fab` predates these probes. So a short main name such as `main` could also match a worker whose prompt says "main" (inferred).

**The footer names what is selected.** ↓ from the main's row selected the `Completed` header, not the next session, and Enter there collapsed the group. The footer's first hint told the rows apart (measured):

| Selected | Footer |
|---|---|
| The row the tab came from | `enter to return` |
| Another session's row | `enter to open` |
| A group header | `enter to collapse`, or `enter to expand` |

### An idle backgrounded main (Q3)

**Over 130 seconds idle, nothing changed.** Run A's main sat detached from 15:09:10 to 15:11:20 UTC, with agent view open in the tab. Its row kept pid 64993, `blocked` and `idle`. Its clock kept ticking, `seq=25` at 15:11:16. The daemon logged nothing about it after the spawn. `claude daemon status` read `2 bg workers running (daemon waits for them to settle)` (measured).

**Quitting the tab leaves the main running.** Run B's agent view drew `Press Ctrl-C again to exit · 3 agents will keep running` before it exited. Its process fired `session.end` for the old session id. The daemon killed the agent view's spare: `bg settled 62fad43c (killed)`. The backgrounded main kept pid 74301, and its clock ticked at 15:21:17 (measured).

The docs give the idle stop: a session "unattached for about an hour" is stopped (agent-view page, §Closing the terminal and idle sessions) ✓. It resumes on the next attach or reply. A pinned session keeps its process. Since v2.1.214, a session moved with `←` is stopped like any other idle one (agent-view page, version history).

**A stopped main respawns by id, not by name.** `claude stop 883327d5` cleared the row's pid and set `state` `stopped`, and the mod fired `session.end`. Then (measured):

- `claude attach "Single word reply"` exited 1: `The background service has no process for session 883327d5. A name opens only a running session. Use the id: claude attach 883327d5`;
- `claude attach 883327d5` drew the conversation. A claimed spare, pid 74268, took the same session id. `classic.SessionStart` read source `fork`, and `session.start` fired again;
- the respawned process read `PROBE_FLAG_ENV=2` and the same `sidekick.profile`. The row read pid 74268, `working`.

The docs say `claude attach` opens a session by name "only while its process is running" ✓.

### A worker's markers (Q4)

**The mod sees both markers at start.** `claude --bg` printed `backgrounded · 2b50a9cb · probe-worker`. Its `session.start` read:

```text
15:13:40.256Z pid=68315 start env CLAUDE_JOB_DIR=/Users/roberto.sousa/.claude/jobs/2b50a9cb … PROBE_SHELL_ENV=1 PROBE_FLAG_ENV=<unset> SIDEKICK_WORKER=/tmp/x/brief.md SIDEKICK_MAIN=4c5c78de …
```

**The worker's Bash sees its own id and both markers.** Its answer, verbatim (measured):

```text
SIDEKICK_WORKER=/tmp/x/brief.md
SIDEKICK_MAIN=4c5c78de
CLAUDE_CODE_SESSION_ID=2b50a9cb-3340-48fc-b278-06a5a3202bb9
CLAUDE_PID=68315
```

`CLAUDE_PID` matched the process the mod found, and `CLAUDE_CODE_SESSION_ID` the row's `sessionId`.

**A worker carries the daemon's environment.** The launching shell held no `PROBE_SHELL_ENV`, but the worker read `1`, run A's value. The worker was a pre-warmed `claude bg-spare`, spawned at 15:13:21, before the launch at 15:13:39. The daemon's log read `bg claimed-spare 2b50a9cb (shell)`. So every background session inherits the shell that started the daemon (inferred from this run and Q1's run B). Only the `--settings` `env` block reached the worker as written.

**A background session's Bash reads `CLAUDE_CODE_SESSION_ATTENDED=0`.** Attached to `883327d5`, its Bash printed `CLAUDE_CODE_SESSION_ATTENDED=0`, `CLAUDE_JOB_DIR=…/883327d5`, and `CLAUDE_PID=74268` (measured, one sample). The dispatcher's interactive session read `1`. So the value marks an interactive session, not a terminal attached to a background one.

### One-key return (Q5)

**No call on `$` moves the terminal to another session (read).** The terms searched, case-insensitive, and what each found:

| Term | Matching lines | Relevant |
|---|---|---|
| `agent view`, `agent-view`, `claude agents`, `daemon`, `sendKeys`, `send keys`, `keypress`, `bg ` | 0 | — |
| `attach`, `detach`, outside "attachment" | 72 | `session.attach`, `session.detach` |
| `foreground` | 7 | none: colours, subagents |
| `respawn` | 2 | none |
| `switch` | 23 | `$.ui.view` only |
| `keystroke`, `press`, `hotkey`, `action` | 230 | `Button`'s `hotkey` and `action`, `ui.press` |
| `submit`, `prompt.submit`, `session.send`, `inject`, `typed`, `input:` | 250 | `$.prompt.*`, `$.session.send`, `$.command.run` |
| `terminal`, `tty`, `REPL`, `stdin` | 342 | `$.process.run`, and the terminal's attachment |

Every call on `$` was also listed from `CoreEngineInterface` and its nouns (`:2351-3722`). The candidates:

| Call or event | Line | What it does | Moves the terminal? |
|---|---|---|---|
| `$.ui.view` | `:2623-2639` | Puts an agent's transcript in the main view, "only while the call answers the person's own input" | No: one session's agents |
| `$.ui.focus` | `:2579-2594` | Moves the focus ring inside this plugin's site | No |
| `$.session.send` | `:2935-2948` | Sends a message to another session | No |
| `$.session.append` | `:2949-2960` | Appends a row to this conversation | No |
| `$.prompt.submit`, `fill`, `suggest` | `:3012-3072` | Submits a prompt, sets the draft, or proposes a suggestion, in this session | No |
| `$.command.run` | `:3151-3162` | "Runs a slash command as if the person typed `/command args`" | Only through a built-in that switches; see the measured runs |
| `$.config.set` | `:3196-3208` | Changes a `/config` row | No |
| `$.process.run`, `$.process.spawn` | `:3588-3642` | Runs a command by argument vector, output read by the plugin | No; see (d) |
| `session.attach`, `session.detach` | `:4522-4541`, `:11245-11249` | Observe a remote client joining or leaving; "the terminal's attachment is the REPL's binding and raises nothing" | No |
| `Button` `hotkey` | `:1116-1124`, `:9843-9851` | A digit or letter presses the Button while its site holds the focus, "save a bare digit in an empty one" | No; it reaches a mod handler |
| `Button` `action` | `:1125-1133`, `:9852-9860` | An engine action's chord, "as the person bound it, presses this from the prompt" | No; it reaches a mod handler |

`EventCalls` (`:4866-4925`) lists the engine's events as calls on `$`, `session.attach` among them. That call raises the observation, not a terminal switch (read `:11245-11249`).

**`$.command.run` runs a built-in, and `/resume` refuses from a worker.** The measured runs, in the attached worker:

- inside its own `command.run` hook, unawaited, the call was refused: `command.run: called from a command.run hook, it would wait on the turn this hook is holding; answer { text } instead, or run it from a later event (turn.complete) (host check)`;
- from a `$.clock.after` callback, it ran: the transcript drew `❯ /resume 4c5c78de` and `Session 4c5c78de was not found.` `/resume` takes the full id or a name, not the short id;
- with the full id, it drew `"probe-main" is running in the background (4c5c78de). Run claude attach 4c5c78de to open it, or claude stop 4c5c78de first to resume it here.`;
- `/resume probe-main`, typed by hand, drew the same refusal. So the origin does not cause it;
- a bare `9` on the empty prompt pressed the band's `Button`: `ui.press e={"plugin":"mainprobe","element":"mpmain","component":"AbovePrompt",…}`. Its handler ran `$.command.run` without a refusal.

The commands page says a running background session resumed "by ID or name, opens that session … this terminal attaches to the running one" ✓. The refusal shows that path does not run inside a background session. So one key reaches a mod handler, and no handler measured can move the terminal from a worker to its main.

**No bindable action opens agent view, attaches, or switches (read).** The keybindings page's `Agents` context holds `agents:switchView`, `agents:togglePin`, `agents:find`, `agents:rename`, `agents:previousGroup`, and `agents:nextGroup`. No action names agent view, attach, or a session switch. `←` on an empty prompt is a setting, `leftArrowOpensAgents`, not a bound action (agent-view page). Agent view's own keys, from its table:

| Key | Action |
|---|---|
| Enter, → | Attach to the selected session |
| Alt+1 to Alt+9 | Attach to session 1 to 9 in the focused session's directory |
| ↑, ↓, PgUp, PgDn, Home, End | Move between rows; jump to the first or last |
| Alt+↑, Alt+↓ | Jump to the previous or next group header |
| Ctrl+F | Find sessions by name, the `n:` filter |
| Ctrl+T | Pin or unpin; a pinned session keeps its process while idle |
| Ctrl+X | Stop; again within two seconds, delete |
| Ctrl+R | Rename |
| Space | Peek panel |
| Esc | Close the peek, clear the input, or exit; after `←`, return to that conversation |

**From a worker, `←` selects the worker's row.** Attached to `probe-worker` from agent view, `←` drew the banner with `enter to return`, and Enter reopened the worker. The counts back to the main (measured):

| Layout | Keys | Path |
|---|---|---|
| The main under `Needs input`, the worker first under `Completed` | 4 | `←`, ↑ to the `Completed` header, ↑ to the main, Enter |
| The same, the main first in the directory | 2 | `←`, Alt+1 |
| The worker waiting, listed ahead of the main in `Needs input` | 2, to the worker | `←`, Alt+1 opened the worker |
| The main pinned with Ctrl+T, the worker waiting | 2 | `←`, Alt+1 |

Alt+N follows the list's order, which moves with each session's state. Pinning put the main in a `Pinned` group at the top, and Alt+1 then opened it twice running (measured). The JSON listing showed no pinned field.

**A mod cannot run `claude attach` for the operator (inferred).** `$.process.run` runs "by its argument vector (no shell)" and resolves "once it exits", with its output read (`:3588-3604`). Its `stdin` is "text written to the child's standard input, then closed" (`:8213-8215`). So the child has pipes, not a terminal, and `claude attach` has nothing to draw on. It would also hold the call until its timeout, 30 seconds by default (`:8216-8220`). The mod's own process does not hold the operator's terminal either. A background session runs under `claude bg-pty-host`, and the tab's process relays it (measured, Q1's process tree). `$.process.spawn` has the same rules (`:3605-3642`).

### Ending a backgrounded main (Q6)

The agent-view page and the commands page give these ways (read):

- `/stop` inside the attached session stops it and keeps its transcript and worktree. `/exit` and `←` only detach;
- in agent view, Ctrl+X stops the selected session, and Ctrl+X again within two seconds deletes it from the list;
- from a shell, `claude stop <id>` stops it, and `claude rm <id>` removes it with a worktree Claude made, when that is safe;
- quitting does not stop it: "Detaching never stops a background session". It keeps running until the idle stop at about an hour, unless pinned.

Quitting run B's tab left its main running (measured, Q3). The commands page adds a `Background work is running` dialog on exit, whose `Move to background and exit` backgrounds the session (read). This record did not raise it.

### Side findings

- **Agent view claims a spare when it opens.** Each opening logged `bg claimed-spare <id> (spare)`, and each exit `bg settled <id> (killed)`. The listing never showed one. This explains the unlisted extra sessions the 2026-10-21 and 2026-10-22 pane records saw (inferred, five pairs measured).
- **A main whose turn ended can list as waiting.** Run A's backgrounded main read `state` `blocked` under `Needs input` after a one-word reply (measured). R2's main read `done` after its second turn, a full answer (measured). So the state follows how the engine reads the last reply. The desk may count the operator's own main among those waiting on them (inferred).
- **A mod cannot keep `$`.** `validate` refused `saved = $`: "`$` itself is assigned (bound, passed, spread, returned or read)". A closure over a hook's `$` passed.
- **A `Button` needs the table's constructor.** A literal `{ type: 'Button', props: { …, onPress } }` drew `Button props must be { key, label }, both strings, …`. `$.ui.resolve(e).Button({ … })` drew `[ main 4c5c78de ]` (measured). The element type carries `press: { plugin, handle }`, which the runtime stamps (read `:9900-9909`).

## Follow-up runs (R1 to R5)

The design review of this record raised five more questions, and a second round ran from 16:00 to 16:15 UTC on 2026-10-22. It used the same driver, plugin, scratch folder, and rules. The daemon was not running at its start.

### Method

The plugin gained three hooks. `claude plugin validate --strict` passed it:

- `/rename` through `$.command.run`, set by `PROBE_RENAME` and `PROBE_RENAME_ARG` in the `--settings` `env` block. Only a process with no `CLAUDE_JOB_DIR` renamed, so a backgrounded main did not rename again;
- `PROBE_RENAME=start` scheduled `$.clock.after(15000)` at `session.start`. `PROBE_RENAME=posttool` ran `/rename` inside `classic.PostToolUse` on Bash, then again from a `$.clock.after(500)` it scheduled there;
- `PROBE_RENAME_ARG=derived` passed the name the session's `~/.claude/sessions/<pid>.json` held, read through `$.fs.read`. `empty` passed no argument. The hook logged that file's `name`, `nameSource`, and `nameSince` before and 2 s after;
- `ui.render` on `PromptHint` now drew a row, `MAINPROBE hint pid=<pid> job=<job>`, under what lay beneath.

A script ran each R1 variant: a tab without `-n`, the rename, one turn, then `←`. It read the session files from the shell at each step, beside the listing.

The driver gained a `ctrl-t` key, and now skips a command line that is not JSON. One such line, written by the shell's `echo`, had crashed it and closed a tab. That tab's agent view was reopened with `claude attach <main's id>`, then `←`.

The runs:

- **R1:** four tabs in `main-a`, each a new main: `start` with `empty`, `start` with `derived`, `posttool` with `derived`, and `posttool` with `empty`. The first two turns asked for the word `ok`; the last two ran `echo hi`.
- **R2:** a fifth tab with no rename, one turn, `←`, then Enter and a second turn on another subject. It stayed in agent view as R3's main.
- **R3:** `claude --bg --worktree probe-wt -n probe-wt --model haiku --settings '{"env":{"SIDEKICK_WORKER":"/tmp/x/brief.md","SIDEKICK_MAIN":"4d5e1fb9"}}' --plugin-dir <mainprobe> -- '<ok prompt>'`, from `main-a`. Then attach, `←`, Alt+1 and Alt+2, unpinned and pinned.
- **R4:** `claude stop` on that worker, then `claude attach <id>` in a new terminal.
- **R5:** `claude --bg --permission-mode default --model haiku -n probe-perm --plugin-dir <mainprobe> -- '<prompt>'`. The prompt asked for `touch <scratch>/runs/r5-marker.txt`, which no allow rule in the user settings covered. A new terminal attached while the prompt showed, and the driver ended that terminal without a key.

### Freezing a derived name (R1)

**A timer at start freezes it.** The `start`/`derived` tab began as `main-a-84`, `nameSource` `derived`. At 16:03:49 UTC the timer's call drew `❯ /rename main-a-84` and `Session renamed to: main-a-84` in the transcript. The file then read `nameSource` `user`, and `nameSince` moved by 2 ms. `$.command.run` resolved with a context line for the model:

```text
{"context":["<system-reminder>\nThe user named this session \"main-a-84\". This may indicate the session's focus or intent.\n</system-reminder>"]}
```

After `←`, the background row read `main-a-84`. Its own file read `"name": "main-a-84"` with no `nameSource` (measured).

**`classic.PostToolUse` refuses the call; a timer from it works.** Inside the hook, the call was refused:

```text
command.run: called from a classic.PostToolUse hook, it would wait on the turn this hook is holding; run it from a later event (turn.complete) (host check)
```

The timer the hook scheduled ran half a second later, and its rename drew after the turn's `done` line. `main-a-f5` read `nameSource` `user`, and the background row kept `main-a-f5` (measured).

**No argument depends on the conversation.** At start, `/rename` with no argument drew `Could not generate a name: no conversation context yet. Usage: /rename <name>`. The name stayed `derived`, and after `←` the row took `Single word reply`. After a turn that ran `echo hi`, it drew `Session renamed to: run-echo-command`, `nameSource` `user`. That name survived `←` (measured).

So the same name and a new one behave alike: each records `nameSource` `user`, tells the model, and survives `←`. The rename shows in the transcript the operator reads (measured, four tabs).

### Session files in the background (R2)

**Every background process writes one.** Each read `kind` `bg` (measured):

| Session | `name` | `nameSource` |
|---|---|---|
| A backgrounded main, not renamed | `Single word reply`, then `Ok` in a later tab | `auto` |
| A backgrounded main, frozen by R1 | the frozen name | absent |
| A `claude --bg -n probe-wt` worker, and its respawn | `probe-wt` | `peer` |
| Agent view's claimed spare | its own short id | absent |

The tab's interactive file stayed while its process ran on as agent view, still `kind` `interactive`, with the interactive session's name. A stopped session's file left with its process, and a killed spare's file too.

**The model's name held through a second turn.** R2's main took `Ok` after its first turn. A second turn asked for three primary colours. About 55 s after it ended, the file still read `Ok`, `nameSource` `auto`, with the same `nameSince` (measured, one check).

### Keys back from a worktree worker (R3)

**The worker runs in the worktree, and agent view lists it by state.** Its row, its file, and its `session.start` all read the cwd `main-a/.claude/worktrees/probe-wt`. The default view drew no directory heading:

```text
Completed
✻ probe-wt                       replied ok                                                       5s
✻ Ok                             named red, blue, and yellow as primary colours                  29s
```

**`←` from the worker selects the worker's row.** The dump read `HIGHLIGHT row 9 bg=['373737'] '✻ probe-wt …'`, with the footer `enter to return`.

**Alt+N counted the worktree worker with the main.** The results (measured):

| Main | Alt+1 opens | Alt+2 opens | Keys from the worker to the main |
|---|---|---|---|
| Unpinned, from the worker's row or the main's | the worker | the main | `←`, Alt+2; or `←`, ↓, Enter |
| Pinned, in a `Pinned` group at the top | the main | the worker | `←`, Alt+1; or `←`, ↑ to the `Completed` header, ↑, Enter |

The numbering followed the list's order across the main's folder and its worktree, as in Q5 (inferred from these four presses). The unpinned Alt presses ran in a tab opened with `←`. The pinned ones, and both arrow paths, ran in the reopened tab, opened by `claude attach` then `←`. A ↓ past the worker landed on a baseline `bg stopped` row, with the footer `enter to resume`, and was not pressed further.

### A worker's respawn (R4)

**A stopped worker resumes.** `claude stop` printed `worktree retained at …/.claude/worktrees/probe-wt`. `claude attach 6edf65c3` then started a claimed spare, pid 34374, whose hooks read:

```text
16:12:20.180Z pid=?     classic.SessionStart source=resume session_id=6edf65c3-2d9a-4b16-8dcf-0a4915f87c8c
16:12:20.216Z pid=34374 start env CLAUDE_JOB_DIR=/Users/roberto.sousa/.claude/jobs/6edf65c3 … SIDEKICK_WORKER=/tmp/x/brief.md SIDEKICK_MAIN=4d5e1fb9 …
16:12:20.219Z pid=34374 start settings.flag {"env":{"SIDEKICK_WORKER":"/tmp/x/brief.md","SIDEKICK_MAIN":"4d5e1fb9"}}
```

Its cwd stayed in the worktree, and its row kept the same id. A backgrounded main's respawn read `fork` in Q3, because its launch line holds `--fork-session` (inferred from Q1's process line).

### The row under the prompt during a permission prompt (R5)

**`PromptHint` does not render while the prompt holds the screen.** The worker listed `blocked`, `waitingFor` `permission prompt`, at 16:13:07 UTC. Its mod's `PromptHint` count read 3 at that first tick, and stayed 3 to 16:14:07. That span covered about 15 s unattached and 45 s attached. Attached, the dialog filled the lower screen, and no `MAINPROBE` row drew anywhere:

```text
 Bash command
 Tip: auto mode handles these prompts for you — choose "switch to auto mode" below
 Create empty marker file at the given scratchpad path
 …
 Do you want to proceed?
 ❯ 1. Yes
 …
   4. No

 Esc to cancel · Tab to amend
```

The band did not render either, as the 2026-10-15 record found for a pane and a band (measured). In other attached background sessions, the row drew on the screen's last row: `MAINPROBE hint pid=34374 job=6edf65c3`. The prompt stayed unanswered, and the marker file was never made.

### Cleanup

`claude stop` and `claude rm` removed the seven background sessions this round started, one by one. `claude rm` removed the worktree and its branch. The agent view tabs ended with ctrl+c twice, or with the driver. The listing then matched this round's own baseline, row for row. The daemon exited on idle, and `claude daemon status` read `not running`.

## Commands

```sh
claude plugin validate --strict <mainprobe>
uv run --with pyte python -I <driver> <spec>
claude --model haiku -n probe-main --settings '<json>' --plugin-dir <mainprobe> --debug-file <file>
claude --model haiku --settings '<json>' --plugin-dir <mainprobe> --debug-file <file>
claude --bg --model haiku -n probe-worker --settings '<json>' --plugin-dir <mainprobe> -- '<prompt>'
claude --bg --worktree probe-wt -n probe-wt --model haiku --settings '<json>' --plugin-dir <mainprobe> -- '<prompt>'
claude --bg --permission-mode default --model haiku -n probe-perm --plugin-dir <mainprobe> -- '<prompt>'
claude attach probe-main
claude attach probe-m
claude attach "Single word"
claude attach "Single word reply"
claude attach 883327d5
claude attach <id>
claude agents --json --all
claude logs <id>
claude stop <id>
claude rm <id>
claude daemon status
```

The driver ran each interactive command in its pseudo-terminal and ended each tab with ctrl+c twice. `claude stop` and `claude rm` then removed `4c5c78de`, `2b50a9cb`, and `883327d5`. After that, the listing matched the one taken before the first run, row for row. The daemon logged `idle 5s with no clients — exiting`, and `claude daemon status` read `not running`, as before the first run.
