> Research for #254, the desk pane. A subagent ran it on 2026-10-25 for the first task of #254's plan, on Claude Code 2.1.310 (`claude --version`). It loaded a scratch probe plugin, `deskpaneprobe`, with `--plugin-dir`, and turned sidekick's installed plugin off in every probe session. It answers the five questions the desk pane's design leans on. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: the store under concurrent writers, subagents in a background session, the dock's width, and on-screen detection (2026-10-25)

#254 has every session publish one `$.store` key, which the desk reads to draw a tree of sessions and their subagents. It also asks the dock for a usable width, and marks a session that a terminal shows elsewhere. This run measured what each of those rests on, in background and interactive sessions on Haiku in a scratch folder.

Provenance grades:

- **Measured:** run on 2026-10-25 on Claude Code 2.1.310, with the log line or capture named.
- **Read:** read on 2026-10-25 in the 2.1.310 declarations, `.cache/claude-code-types/2.1.310.d.ts`, which `bin/mod-types.sh` writes. Or read in the JavaScript bundled in the 2.1.310 binary, with the function named. Minified names hold for that build only.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

## Summary

| Probe | Question | Answer | Grade |
|---|---|---|---|
| P1 | Did any key go missing under 2 and 3 concurrent writers, each setting its own key every second for 60 s? | No. The rounds made 120 and 180 sets, and none failed. Every key was in all 808 and 809 reads of the file, no counter went back, and every read-back matched | Measured |
| P1 | Where is the store file for a `--plugin-dir` plugin? | `~/.claude/plugins/store/deskpaneprobe_inline-4ed08dc79ecc.json`. The `store` folder did not exist before the run; the first set made it | Measured |
| P1 | How is the file named per plugin? | From the store's name, `<plugin>@inline` for a `--plugin-dir` plugin: each character outside `[A-Za-z0-9_-]` becomes `_`, then `-` and the first 12 hex digits of the name's SHA-256 follow. The plugin's folder plays no part | Read; the hash measured |
| P1 | How does a set reach the file? | Under a lock file beside it: read the whole file, write the whole file. Keys outlive the session that set them | Read; outliving measured |
| P2 | Does `$.agent.list()` in a background session list its running subagents? | Yes, with `id`, `type`, `description`, and `status` `running` | Measured |
| P2 | Do they drop out after? | Each stayed listed as `completed` for about 30 s after its last turn, then left the list | Measured |
| P2 | Which of the four events fire in a background session? | All four. `turn.start`, `turn.complete`, and `tool.call` fire for the main loop and for each subagent, a subagent's carrying its `agentId`. `session.measure` fired at the start and after each main-loop turn only | Measured |
| P2 | What does `tool.call` carry for `<Tool>: <target>`? | `tool`, `tool_use_id`, the tool's arguments spread beside them, and `agentId` inside a subagent: `command` for Bash, `description` and `subagent_type` for Agent | Measured; other tools read |
| P3 | How wide is the dock at 160 columns, with no width kept? | 72 columns, grip included, when `columns` is left out. 57 with `columns: 56`, a body of 56 | Measured |
| P3 | And on the operator's machine, where `~/.claude.json` keeps `pluginPanes.dockColumns: 32`? | 32 either way: the kept width wins over `columns` | Measured |
| P3 | Does a dragged width persist? | Yes, across a close and an open, a second session, and a restart. A drag or a keyed resize writes it to `pluginPanes.dockColumns` at once. It is one width for every plugin's pane | Measured; one width read |
| P3 | How is a kept width reset? | Delete `pluginPanes.dockColumns` from the config file while no session runs. Claude Code offers no reset of its own | Measured in a scratch config; no reset read |
| P4 | Does any signal differ between attached and detached? | No signal found inside the session. `surfaces()` and the events stay the same. The viewport takes a client's size at attach and keeps it after detach | Measured |
| P4 | Anything outside the session? | Only for `claude attach`: the client process's command line, `claude attach <id>`. Agent view's open leaves nothing that names the session | Measured |
| P5 | Does a status-line command see a variable a mod set with `$.env.set`, and the session id? | Yes, from the run after the set: `SIDEKICK_PROBE=1`, the id on stdin as `session_id`, and `CLAUDE_CODE_SESSION_ID` | Measured |

For #254's later tasks:

- **The published key:** `$.store` held one set a second from each of three writers, more often than #254 plans to publish. Keys outlive their sessions, so whoever reads them has to prune them.
- **Two stores for one sidekick:** a session with sidekick from `--plugin-dir` writes `sidekick_inline-3e4419753454.json`, and an installed one writes `sidekick_rikmorn-0e87d52a3e49.json`. A desk reads only the store its own load writes, so it cannot see the other's sessions (inferred from the naming read for P1).
- **Subagents:** a finished subagent stays listed as `completed` for about 30 s, so a filter on `running`, `pending`, and `waiting` drops it at once. For the activity line, take `tool.call` from the main loop, or from an `agentId` the list holds. The engine's own forks carry ids the list never shows (P2's findings).
- **The dock:** `columns: 56` docks at 57 only where no width is kept, and the operator's machine keeps 32. Widening a focused pane with ctrl+x ←, or deleting the kept width, changes the dock for every plugin's pane. So where a width is kept, the desk pane's narrow form is its docked form, and #254's guide says how to widen a dock.
- **On-screen marker:** no signal tells a session that a terminal shows it, so #254 skips its marker for a session on a screen elsewhere. P4's findings say why.

Not tested:

- more than three writers, or writers faster than one set a second;
- the store of an installed plugin, and two copies of one plugin at different paths;
- an Agent call that blocks the main turn, a teammate, and a subagent's own subagents;
- `tool.call` for tools other than Agent, Bash, and the engine's `SubagentHandback`;
- the dock at terminal widths other than 160, and the inline block's `rows`;
- deleting the kept width while sessions run;
- two clients attached to one session at once, and the desktop or mobile apps, whose joins raise `session.attach` by the declarations (`:4522-4533`);
- a status line in a background session.

## Method

A scratch plugin, `deskpaneprobe`, held one hooks module. `claude plugin validate --strict` passed it, and `tsc` checked it against the 2.1.310 declarations. Every process appended to one log per probe through `$.process.run`, each line stamped with UTC time, process id, and session id. Variables in each session's `--settings` `env` block switched its parts on:

- **`PROBE_P1=<round>`:** every second for 60 s, `$.store.set('p1:<round>:<session id>', { n, at, pid })`, then a `get` of that key and `keys()`;
- **`PROBE_EVENTS=1`:** a log line for each `turn.start`, `turn.complete`, `session.measure`, and `tool.call`, and `$.agent.list()` every second, logged when it changed;
- **`PROBE_TICK=1`:** every 2 s, `$.session.surfaces()`, `$.ui.panes()`, the count of `ui.render` calls for `AbovePrompt`, `PromptHint`, and the probe pane, and each component's last `viewport`;
- **`PROBE_ENVSET=1`:** `$.env.set('SIDEKICK_PROBE', '1')` at `session.start`.

Four commands, `/dpopen`, `/dpwide56`, `/dpclose`, and `/dpinfo`, opened the pane without `columns`, opened it with `columns: 56`, closed it, and logged it. The pane drew its `bodyColumns`, its placement, and a digit ruler. The module also logged `session.attach`, `session.detach`, and `session.end`.

The background sessions started from a Python launcher with `claude --bg --model haiku -n <name> --settings <json> --plugin-dir <probe>`. The launcher dropped the parent's `CLAUDE*`, `SIDEKICK*`, and `ANTHROPIC*` variables. Each `--settings` carried `{"enabledPlugins":{"sidekick@rikmorn":false}}`, and the debug log confirmed it: `Read hooks.json for plugin sidekick (enabled=false; will NOT register, plugin is disabled)`.

Interactive sessions and attaches ran under the pseudo-terminal driver of the 2026-10-23 usage-guide captures record, §Method. It gained a mouse drag, three SGR mouse reports from a press to a release. Before Enter on a slash command, it checked that the typeahead's first row was that command. In agent view it refused every key but Esc, Enter, the arrows, and ctrl+c. It pressed Enter only on a highlighted row that named a session this run started.

A watcher read the store file every 0.1 s during each P1 round. It flagged a key that had been present and was absent, and a counter that went back. A snapshot helper read four sources for P4: the session's listing row, its daemon roster entry in `~/.claude/daemon/roster.json`, its job's `state.json`, and `~/.claude/daemon/attach-journal`. It also listed `claude attach` processes.

The runs, all with `--model haiku` in a scratch folder `work`:

- **P1:** two background sessions, `b8ee43d1` and `f657e1d2`, from 22:00:36 UTC, then three, `8cd0d25b`, `f0a2b428`, and `45833bb6`, from 22:04:35.
- **P2:** one background session, `c59b602a`, asked to start two `general-purpose` subagents in one message. One ran `perl -e "sleep 45"`, the other `perl -e "sleep 60"`, allowed by `Bash(perl -e *)` in its `--settings`.
- **P3, in the operator's config:** an interactive session at 160 by 40 in fullscreen, which `"tui": "fullscreen"` in the operator's user settings turns on. Only opens and closes ran there, no resize.
- **P3, in a scratch config:** `CLAUDE_CONFIG_DIR` pointed at a scratch folder, with a dummy `ANTHROPIC_API_KEY` and `"tui": "fullscreen"` in `--settings`. No prompt was sent, since no pane command needs the model. Five sessions ran there: the resizes, a second session, a restart, and a session after the reset. This kept every resize out of the operator's `~/.claude.json`.
- **P4:** one background session, `1a733324`. It sat detached from 22:09:49 to 22:10:43. `claude attach` at 120 by 40 held it until 22:11:54, and it sat detached again until 22:12:42. Then agent view opened at 140 by 40, and Enter on its row opened it from 22:13:19 to 22:13:53.
- **P5:** an interactive session at 120 by 40 with `"statusLine": {"type": "command", "command": <script>}` in `--settings`. The script logged its `SIDEKICK*` and `CLAUDE*` names, `SIDEKICK_PROBE`, `CLAUDE_CODE_SESSION_ID`, and stdin's `session_id`. One prompt, `Reply with the single word ok.`, made it run again.

`claude agents --json --all` was taken at 21:59:09 UTC, before the first probe, and again after cleanup.

## Findings

### P1: the store under concurrent writers

**No key went missing in either round.** The probe log and the watcher agree:

| Round | Writers | Sets | Failed sets | Watcher reads | A key absent, or a counter back | Read-back mismatches | Slowest set |
|---|---|---|---|---|---|---|---|
| r2 | 2 | 120 | 0 | 808 | 0 | 0 | 27 ms |
| r3 | 3 | 180 | 0 | 809 | 0 | 0 | 26 ms |

Each session's `keys()` listed all its round's keys after every set, but for four early sets made before the other writers had started. Each round's last writer read every key at `n` 60 (measured, the `p1 final` lines). The round-2 keys were still in the file after their sessions were removed, so keys outlive their sessions (measured).

**The file lives under `~/.claude/plugins/store`.** The debug log names the store `deskpaneprobe@inline`: `$.store.set (deskpaneprobe@inline): p1:r2:b8ee43d1-…`. The file was `deskpaneprobe_inline-4ed08dc79ecc.json` (measured). The 2026-10-15 desk record found the same folder, which no longer existed when this run began.

**The name comes from the store's name, not from the plugin's folder.** The binary's `ce(e)` keeps a name that matches `/^[a-z0-9._-]+$/` and is at most 64 characters, as `<name>.json` (read). Any other name has each character outside `[a-zA-Z0-9_-]` turned to `_` and is cut to 64. Then `-` follows, with the first 12 hex digits of the name's SHA-256 (read). The SHA-256 of `deskpaneprobe@inline` begins `4ed08dc79ecc`, as the file's name does (measured). The same rule gives `sidekick_inline-3e4419753454.json` for sidekick under `--plugin-dir`, and `sidekick_rikmorn-0e87d52a3e49.json` installed (inferred).

**A set locks, reads, and rewrites the whole file.** The binary's store operation takes a lock at `<file>.lock` for `set` and `delete`, with 10 retries between 5 and 100 ms (read). It then reads the whole file, adds the key, and writes the whole file back. Calls within one process queue per store (read). So a writer cannot drop another's key while every writer takes the lock, which this run bears out. Under heavier contention a set could fail once its retries run out (inferred; not seen).

### P2: subagents and events in a background session

**`$.agent.list()` listed both subagents while they ran.** At 22:09:17.584, 0.7 s after their first turns began:

```json
[{"id":"a4df41dd86aa41487","type":"general-purpose","description":"probe alpha","status":"running"},
 {"id":"a762d022bbafa8ef1","type":"general-purpose","description":"probe beta","status":"running"}]
```

`name`, `parentId`, and `spawnedBy` were absent, which the declarations allow for subagents the model started (read `:125-184`).

**The main turn ended while they ran, and each finish woke it.** The main turn ended at 22:09:18.957, 8.4 s after it began. Each subagent ended with a `SubagentHandback` call, then the main loop began a turn whose text opened `<agent-message from="a4df41dd86aa41487">`.

**A finished subagent stays listed for about 30 s:**

| Subagent | Last turn ended | Listed `completed` | Left the list |
|---|---|---|---|
| alpha | 22:10:09.332 | 22:10:09.857 | 22:10:41.018 |
| beta | 22:10:24.835 | 22:10:24.953 | 22:10:55.080 |

The declarations say a subagent's entry stays until "the engine drops its task", without a time (read `:3268-3276`).

**All four events fired.** `turn.start` and `turn.complete` fired for the main loop and for each subagent, with `agentId` on a subagent's. `turn.complete` carried `reason` and `durationMs`. `session.measure` fired four times: at the start, with `changed` naming `context`, `rateLimits`, and `cost`, then within 20 ms of each main-loop `turn.complete`. It never followed a subagent's. Its `context` read `{"tokens":64347,"window":1000000,"percent":6}`.

**`tool.call` carries what `<Tool>: <target>` needs.** Three of the calls logged, cut at the prompt:

```text
{"description":"probe alpha","subagent_type":"general-purpose","prompt":"Run exactly this …","tool":"Agent","tool_use_id":"toolu_01Brh…"}
{"command":"perl -e \"sleep 60\"","description":"Run perl sleep 60 command","tool":"Bash","tool_use_id":"toolu_011P…","agentId":"a762d022bbafa8ef1"}
{"message":"Ran `perl -e \"sleep 45\"` exactly as specified. …","tool":"SubagentHandback","tool_use_id":"toolu_01Qe…","agentId":"a4df41dd86aa41487"}
```

So Bash gives `command` and Agent gives `description`. The declarations put each tool's arguments beside `tool` (read `:13521-13530`), and give Read and Edit a `file_path` (read `:17528-17539`, `:17277-17286`).

**The engine's own forks raise `tool.call` too, under ids the list never shows.** At 22:09:50.916 a Bash call came with `agentId` `a0d1b43fd4d1048a5`, which no `$.agent.list()` had held. The debug log shows `[AgentSummary] Forking for summary`, a request with `source=agent_summary`, and `Bash tool permission denied`. The engine's summary of a running subagent made that call, and it was refused (measured).

### P3: the dock's width

**With no width kept, `columns` sets the dock.** In the scratch config at 160 by 40, the dock's grip was at column 89 without `columns`, and at column 104 with `columns: 56`:

| Open | Grip column | Dock, grip included | Pane body | Transcript |
|---|---|---|---|---|
| `/dpopen` | 89 | 72 | 71 | 88 |
| `/dpwide56` | 104 | 57 | 56 | 103 |

An open with `columns` wrote nothing to `pluginPanes` (measured).

**The binary's `pO` sets the width.** It takes the chosen width, else the requested one, else a share. It clamps the result between 24 and the smaller of 45% of the terminal and the terminal less 60 (read). The share is the smallest of 45% of the terminal, 90, and the terminal less 70. The request is `columns` plus the grip's one column. At 160 columns both the ceiling and the share are 72. The chosen width is this session's own resize, else the kept `pluginPanes.dockColumns` from `~/.claude.json`, which each process reads once (read).

**The kept width wins, and the operator's machine keeps 32.** In the operator's config the grip sat at column 129, a dock of 32 with a body of 31. That held without `columns`, after `/dpwide56` on the open pane, and after a close and a fresh `/dpwide56`. `~/.claude.json` read `"dockColumns": 32` before and after (measured). The 2026-10-23 captures record measured a 24-column dock at 160 and did not trace why. A kept width of 24 or less then would explain it (inferred).

**A resize persists at once, and everywhere.** In the scratch config:

1. ctrl+x Tab gave the pane the keys, and ctrl+x ← grew the dock from 57 to 61. The config then read `"dockColumns": 61`.
2. A drag of the grip from column 100 to column 110 shrank it to 51, and the config read `"dockColumns": 51`.
3. `/dpclose`, then `/dpwide56`, docked at 51.
4. A second session, started after the drag, docked at 51 on `/dpwide56`.
5. A restarted session docked at 51 on `/dpwide56`.

The keys are the binary's `Pane` bindings: ctrl+x ← or ↑ grows the dock, and ctrl+x → or ↓ shrinks it, 4 columns a press (read). The one kept width serves every plugin's pane, since `pluginPanes` holds a single `dockColumns` (read).

**Deleting the key resets it.** With no session running in the scratch config, `pluginPanes.dockColumns` was deleted from its `.claude.json`. The next session docked at 57 on `/dpwide56` (measured). Claude Code itself never deletes the key: its one writer stores this session's width, else the kept one (read, the binary's `XH`). A running session keeps the width it first read (read; not measured).

### P4: telling attached from detached

**Inside the session, no signal tells the two apart.** The tick log of `1a733324`:

| Phase | `surfaces()` | Viewport | `AbovePrompt` renders | `PromptHint` renders |
|---|---|---|---|---|
| Detached, at 22:10:41 | `["terminal"]` | 200x50 | 4 | 5 |
| `claude attach` at 120 by 40, at 22:11:49 | `["terminal"]` | 120x40 | 6 | 8 |
| Detached again, at 22:12:41 | `["terminal"]` | 120x40 | 6 | 10 |
| Opened from agent view at 140 by 40, at 22:13:57 | `["terminal"]` | 140x40 | 7 | 13 |

The `claude attach` drew each site twice at 22:10:44, with the client's size. `AbovePrompt` drew again only when agent view's 140 columns arrived. Each attach and each detach drew `PromptHint`, then drew it once more about 10 s later. It also drew at 22:10:39, with nothing attached. Detaching left the viewport at the last client's size. No `session.attach` or `session.detach` fired in any phase (measured).

So a burst of draws marks an attach or a detach only among other draws. The viewport marks an attach only when the client's size differs. Neither holds a state that says a terminal shows the session now.

**Outside the session, only `claude attach` names it.** The listing row, the roster entry, and the job's `state.json` were the same in every phase (measured). While `claude attach` ran, `ps` showed `claude attach 1a733324`, and the attach journal held one entry:

```json
{"gestureId":"c1f01673-…","surface":"bg_cli","startedAtEpochMs":1792966244079,"attempt":1,"pid":94497,"procStart":"Sun Oct 25 22:10:43 2026","marksExpected":false,"daemonBooted":false,"attachCold":false,"via":"spare"}
```

Pid 94497 was the `claude attach` client. The entry names no session, and it left the folder at detach. Agent view's open wrote one with `"surface":"fleet"` and the `claude agents` pid, removed after `←`. Before the attach, an entry from 2026-10-23 15:11 UTC had sat in the folder until this run's attach replaced it (measured).

### P5: a status line's environment

**A status-line run after the set sees the variable and the session id.** The run at 22:14:53 logged:

```text
session_id=a7efcb28-6428-42b7-bbce-559cf0ac82ed SIDEKICK_PROBE=1 CLAUDE_CODE_SESSION_ID=a7efcb28-6428-42b7-bbce-559cf0ac82ed
```

Its `SIDEKICK*` and `CLAUDE*` names were `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENABLE_TODO_TOOLS`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `CLAUDE_PID`, `CLAUDE_PROJECT_DIR`, `CLAUDECODE`, and `SIDEKICK_PROBE`. The first run, which ended 0.57 s after the set, saw no `SIDEKICK_PROBE`. When it started was not logged.

### Side findings

- **`enabledPlugins` in `--settings` turns an installed plugin off for one session.** Each probe session's debug log read `sidekick (enabled=false; will NOT register, plugin is disabled)`.
- **An open the person asks for adds the pane to `pluginPanes.asked` in `~/.claude.json`.** A plugin's own `$.ui.close` leaves it there (measured).
- **A first run under a fresh `CLAUDE_CONFIG_DIR` shows onboarding.** It asked for a theme, whether to use the environment's API key, and the folder's trust. Without `"tui": "fullscreen"` the session drew on the main screen (measured).
- **The driver's typeahead check matched a transcript row.** `❯ /dpopen`, followed by spaces and a dock's `│`, read as a suggestion, so the driver refused Enter on `/dpwide56` twice. The pattern now refuses a `│` as the description's first character, and the typeahead was checked by eye for that one run.

## Cleanup

`claude stop`, then `claude rm`, removed the seven background sessions this run started. They were `b8ee43d1` and `f657e1d2` (P1, two writers), `8cd0d25b`, `f0a2b428`, and `45833bb6` (P1, three writers), `c59b602a` (P2), and `1a733324` (P4). `claude rm` removed each job's folder. Every interactive session and agent view ended through the driver, with ctrl+c twice. The `claude attach` client exited on ctrl+z, as the 2026-10-23 captures record found. The listing at 22:15:29 UTC matched the one at 21:59:09 row for row. Both held 9 rows, compared on id, name, kind, folder, state, status, and pid. The daemon kept its baseline pid, 67583, which another session had started before this run.

The store file this run made was copied into the scratch folder and deleted, with the `~/.claude/plugins/store` folder it created. `~/.claude.json` kept `"dockColumns": 32`. It gained a `pluginPanes.asked` entry for `deskpaneprobe`'s pane, like earlier probes' entries, left in place rather than edited while other sessions write that file. The transcripts under `~/.claude/projects/` for the scratch folder stay. This repository's `git status` was clean apart from this record and its index line.

## Commands

```sh
claude --version
claude plugin validate --strict <probe>
claude agents --json --all
claude --bg --model haiku -n <name> --settings '<json>' --plugin-dir <probe> --debug-file <file> -- '<prompt>'
claude --model haiku --settings '<json>' --plugin-dir <probe> --debug-file <file>
CLAUDE_CONFIG_DIR=<scratch> ANTHROPIC_API_KEY=<dummy> claude --model haiku --settings '{"tui":"fullscreen",…}' --plugin-dir <probe>
claude attach <id>
claude agents
claude stop <id>
claude rm <id>
claude daemon status
uv run --with pyte python -I <driver> <spec>
strings -n 6 ~/.local/share/claude/versions/2.1.310
```

The driver typed each slash command and pressed Enter only once the typeahead's first row matched. The P3 resizes ran from the driver as ctrl+x Tab, ctrl+x ←, and a mouse drag. Every other command ran from a shell.
