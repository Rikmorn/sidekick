> Research for #240, the control centre's usage guide. A subagent ran it on 2026-10-23 for the operator's #240 session, on Claude Code 2.1.309 (`claude --version`). It ran sidekick at `66ed52e` on `milestone/r9-control-centre`, loaded with `--plugin-dir`. It captures what the control centre looks like on screen, so the guide can show real pictures, and measures the moves the guide teaches. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Captures: the control centre on screen, and the moves around it (2026-10-23)

#240 asks for a usage guide with pictures of sidekick's views and of the moves between sessions. This run captured 52 screens of real sessions: a main with two dispatched workers, the board in this repository, agent view, and attached workers. Each capture was saved as plain text and as styled runs, outside the repository, for the guide's author. This record keeps the key screens inline and answers the questions the guide rests on.

Provenance grades:

- **Measured:** run on 2026-10-23 on Claude Code 2.1.309, with the capture or log line named.
- **Read:** read on 2026-10-23 in this repository's source at `66ed52e`, with the line named.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

The mods were last checked on Claude Code 2.1.308 (`.claude-code-version`). This run used 2.1.309, and every mod loaded and drew.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does `sidekick worker dispatch` run in a repo with no remote? | Yes. It started both workers and wrote both desk records | Measured |
| Do sidekick's mods load once beside the installed 0.5.1? | Yes. The debug log reads `Plugin "sidekick" from --plugin-dir overrides installed version`, then one `hooks module sidekick@inline loaded`, and one sidekick start hook ran | Measured |
| What does the band show with one worker working and one on a permission prompt? | `● needs you  fix-readme · permission prompt`, then `◆ workers    fix-readme blocked · add-greeting working` | Measured |
| Does the desk pane open by itself at 160 columns when a worker first appears? | Yes, docked right, about 12 s after the dispatch was submitted | Measured |
| How wide is a docked sidekick pane at 160 by 40? | 24 columns with its border, 23 for text, so every board line wraps | Measured |
| Does a lone pane show its title? | No, only `✕`. Two panes draw a tab row, `Board   Desk`, with the active tab bold and reversed | Measured |
| How does a worker answer `/desk` and `/board`? | `⎿  sidekick: /desk is off in this worker. Its main is todo-app-ce: ←, select it, Enter.`, and the same for `/board` | Measured |
| Where does the signpost draw, and when not? | On the row after the hint line, in grey. A permission dialog hides it, with the footer | Measured |
| How does the desk pane close? | `/desk` again closes it. ctrl+x Tab gives it the keys and Esc hands them back; the pane stays open | Measured |
| What does Ctrl+X Ctrl+A do to the band? | It collapses the band to `▸ plugin panel hidden · ctrl+x ctrl+a or click to show`. Pressed again, it restores the band | Measured |
| When does the hint line read `← for agents`? | In the first seconds of a session with nothing in the background, then it drops. With a worker on a dialog it read `← 1 agent`. A typed draft drops the `←` text | Measured |
| What does agent view show with a main and two workers? | Groups `Needs input`, `Working`, `Completed`. A worker on a dialog reads `approve Read: <path>`. The main's row is selected after `←` | Measured |
| Where does Esc right after `←` land? | In the forked background session, under a new id and name. The tab's process stays, as the relay. The interactive row leaves the listing | Measured, twice |
| Do the main's views follow the fork? | When the daemon put the fork in a spare, yes (two runs). When it spawned a fresh process, sidekick's commands never registered and no view drew (one run) | Measured; cause inferred |
| What does the classic screen show? | The band on the rows over the prompt, cut with `+1 more`, and an inline desk pane that fits all its rows | Measured |
| Where does Ctrl+Z suspend, and where does it detach? | A plain session under a shell with job control stops (`T`), and `fg` brings it back with its views. In an attached session the attach client exits, leaving no stopped job, and the session runs on | Measured |
| Does attaching post a recap? | Not after about 3 minutes idle. After about 12 minutes idle, one `※ recap:` line | Measured, two samples |
| What do sidekick's rows do while a turn runs or a draft is typed? | The band stays; the spinner draws in the transcript, over the band. A slash menu draws in the transcript on fullscreen, and replaces the footer rows on the classic screen | Measured |
| Where does the prompt show the session's name? | On the prompt's top border, at its right, once the name is set or the session runs in the background | Measured |
| What blocks a `default`-mode worker first? | Reading its own brief, which lives in the main checkout outside its worktree | Measured, one worker |

Not tested:

- a mouse click on `✕`, on the band's `[-]`, or on the board's link;
- agent view's Space peek, Ctrl+X, Ctrl+T, and Alt+N, which this run's safety rules left unpressed;
- Ctrl+Z inside agent view;
- the hint's `← <n> done` flash, which no capture caught;
- a question dialog, and the subagent panel beside sidekick's rows;
- a session with no custom status line; every capture had the operator's;
- themes, `NO_COLOR`, iTerm2's own rendering, and the desktop app;
- terminal sizes other than 100 by 40 and 160 by 40;
- the debug log of a forked process, which takes no `--debug-file`.

## Method

A Python driver hosted each `claude` in a pseudo-terminal under `uv run --with pyte`. It dropped the parent session's `CLAUDE*` and `SIDEKICK*` variables, set `COLORTERM=truecolor`, and answered the cursor and colour queries. It ran in the background and read commands from a file, one JSON object per line. It stripped the kitty keyboard, `modifyOtherKeys`, and `XTVERSION` sequences, which pyte otherwise prints as text. It mapped SGR 2 onto pyte's unused blink attribute, so each capture records dim.

pyte lacks `CSI S` and `CSI T`, the scroll codes Claude Code uses inside scroll margins. The first main's live screen garbled as its transcript scrolled. The driver gained both codes, and a replay tool re-rendered every capture from the run's raw output at the byte offset each save recorded. The capture files are those re-renders.

Before Enter on any slash command, the driver checked that the typeahead's first row was that command. While agent view showed, it refused every key but Esc, Enter, the arrows, and ctrl+c, and refused typed text. Enter in agent view went only to a highlighted row matching a session this run started.

The runs, all with `--model haiku`:

- **Scratch repo:** `todo-app`, made with `git init` and one commit. Its trust dialog was answered. Two profiles sat in its repo store, `main` and `worker`, each setting `"model": "haiku"`. The repo's `worker` shadowed the operator's own.
- **The main:** `claude --add-dir <profile main> --settings '{"model":"haiku","sidekick":{"profile":"main"}}' --model haiku --plugin-dir <plugin>`, the arguments `sidekick profile argv main` printed. It started at 160 by 40 and was resized to 100 by 40.
- **The workers:** the main's model ran `sidekick worker dispatch <brief> --permission-mode <mode> --plugin-dir <plugin>`, once per worker. `fix-readme` ran in `default` mode. `add-greeting` ran in `auto` mode, and its brief's `setup` was `sleep 100`, to keep it working. Each plan asked for one small commit; neither worker got that far.
- **Attaches:** `claude attach <id>` to each worker at 100 by 40.
- **Esc after `←`:** two more mains in the scratch repo with `--debug-file`, each given one turn. In one, Esc 0.3 s after `←`; in the other, 8 s after.
- **Classic screen:** a main under `CLAUDE_CODE_NO_FLICKER=0` at 100 by 40.
- **Ctrl+Z:** the classic main under the driver, then `/bin/bash --norc --noprofile -i` with the pseudo-terminal as its controlling terminal. In that shell, a plain `claude`, then `claude attach` to a worker.
- **The board:** a plain main in this repository at 100 by 40, then resized to 160 by 40. It received only `/board`, `/desk`, and `/exit`.

`claude agents --json --all` was taken before the first run and after cleanup, and the daemon log was read for each `←`.

## Findings

### A main with dispatched workers

**Dispatch runs without a remote, and the desk picks the worker up within a tick.** The first dispatch was submitted at 15:05:33.7 UTC. By 15:05:45, the band read `◆ workers    fix-readme working`, and the desk pane had opened docked at 160 columns. About ten seconds later the worker sat on a permission prompt. The screen then read, its long paths cut here with `…`:

```text
  main: todo-app-ce · sidekick holds this name once this ses…   │
  worker fix-readme dispatched · permission mode default · p…   │
  steer: rulings in /private/tmp/…/fix-readme-rulings.md, then message "fix-readme" to point at them
  finish: sidekick worker finish /private/tmp/…/fix-readme-brief.md
✻ Brewed for 11s · done 16:05                                   │
❯ /rename todo-app-ce                                           │
  ⎿  Session renamed to: todo-app-ce                            │
● needs you  fix-readme · permission prompt                 [-] │
◆ workers    fix-readme blocked                                 │
──────────────────────────────────────────────────────────────────────────── todo-app-ce ─
❯ check on the fix-readme worker
──────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ todo-app ░░░░░░░░░░ 7%                                       profile: main
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
```

The name mod's `/rename` drew once the dispatching turn ended. The second dispatch's `main:` line then had no suffix, since the name now held (measured). The prompt's suggestion, `check on the fix-readme worker`, drew dim; it is Claude Code's, not sidekick's.

**The docked pane is 23 columns of text at 160 by 40.** Its left border sat at column 137, for both the desk and the board (measured). Neither mod asks for a width: each opens with `{ ...PANE, rows: PANE_ROWS }` (read `plugin/hooks/desk/desk.ts:162`, `plugin/hooks/board/board.ts:368`). The 2026-10-21 pane record measured a probe pane docked at 56 columns on 2.1.306. Why this dock took its floor was not traced. The desk pane's right side, two workers in:

```text
│                     ✕
│CHILDREN · todo-app
│fix-readme blocked · pe
│62k tokens · fix-readme
│Initial commit
│add-greeting working
│62k tokens · add-greeti
│Initial commit
│OTHER SESSIONS
│sidekick-6f · sidekick
```

**At 100 columns the band keeps both lines and the pane opens inline.** After the resize and `/desk`:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ CHILDREN · todo-app                                                                              │
│ fix-readme blocked · permission prompt                                                           │
│ 62k tokens · fix-readme plan                                                                     │
│ Initial commit                                                                                   │
│ add-greeting working                                                                             │
│ 77k tokens · add-greeting plan                                                                   │
│ Initial commit                                                                                   │
│ OTHER SESSIONS                                                                                   │
│ sidekick-6f · sidekick · busy                                                                    │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
● needs you  fix-readme · permission prompt                                                     [-]
◆ workers    fix-readme blocked · add-greeting working

────────────────────────────────────────────────────────────────────────────────────── todo-app-ce ─
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ todo-app ░░░░░░░░░░ 8%                                                 profile: main
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
```

The pane's 9 rows fit its 11-row body, so it drew no scroll hint. The colours, from the styled runs: the needs-you line `ffc107`, the workers line `b1b9f9`, the `[-]` mark `999999`, the pane's headings `d77757`, a waiting child's first line `ffc107` (measured).

**`OTHER SESSIONS` lists every current session on the machine.** The operator's own interactive session showed there, and so did each scratch fork. A waiting session with no `waitingFor` printed its state twice, as `todo-app-ce · todo-app · blocked · blocked` (measured, the classic capture). The snapshot sets the reason to `blocked` when the listing gives none (read `bin/helpers/desk-snapshot.ts:152`, `:281`), and the row appends it after the state (read `plugin/hooks/desk/logic.ts:202-207`).

**A backgrounded main whose turn ended on a question counts as waiting.** The main ended its turn asking for rulings. Once backgrounded, it showed in other mains' bands as `todo-app-ce · blocked` (measured), as #247 kept.

**A `default`-mode worker first blocks on its own brief.** `fix-readme`'s first dialog asked to read the brief, which lives in the main checkout, outside the worker's worktree (measured, one worker). The `auto`-mode worker ran its `sleep 100` setup as a background job, saying a foreground sleep was blocked. It then messaged the main, and waited for a rulings pointer while listed `working`.

### The worker's own screen

**The signpost names the main and the way back.** Attached to `add-greeting`:

```text
───────────────────────────────────────────────────────────────────────────────────── add-greeting ─
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ add-greeting █░░░░░░░░░ 10%                                          profile: worker
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
  worker of todo-app-ce · to go back: ←, select todo-app-ce, Enter
```

The signpost drew in `999999` (measured). The footer label read `profile: worker`.

**`/desk` and `/board` answer in the transcript.** The typeahead listed `/desk` first and `/desktop` second. The answers, verbatim:

```text
❯ /desk
  ⎿  sidekick: /desk is off in this worker. Its main is todo-app-ce: ←, select it, Enter.

❯ /board
  ⎿  sidekick: /board is off in this worker. Its main is todo-app-ce: ←, select it, Enter.
```

**A permission dialog hides the signpost and the footer.** Attached to `fix-readme`, the lower screen held only the dialog:

```text
 Read file
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Read(/private/tmp/…/todo-app/docs/superpowers/plans/fix-readme-brief.md)
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Do you want to proceed?
 ❯ 1. Yes
   2. No

 Esc to cancel · Tab to amend
```

**The recap depends on idle time.** The first attach, about 3 minutes after the worker's last turn, posted no recap. A second, about 12 minutes after, posted one line before the prompt (measured, two samples):

```text
※ recap: Goal: run the add-greeting plan in this worktree, which adds a greet(name) module. Setup is
  done and the baseline is confirmed, but I'm waiting for the orchestrator's rulings message before
  starting Task 1. (disable recaps in /config)
```

### Panes: titles, focus, and closing

**A lone pane shows no title; two panes show tabs.** With `/board` and `/desk` both open at 160 columns, the dock's top row read `Board   Desk        ✕`. `Desk`, the active tab, drew bold and reversed (measured).

**Esc returns the keys but keeps the desk pane open.** The pane opened with its frame dim. After ctrl+x Tab the frame drew without dim. After Esc it was dim again, with every row still drawn. `/desk` typed again closed it (measured, the dim attribute in the styled runs).

**A full board pane pushes the board line off the screen at 100 columns.** The brief filled all 11 body rows, and the screen ended at the hint line, with no board line. Docked at 160, the line returned under the prompt (measured). That repeats the 2026-10-21 pane record on 2.1.309.

### The band's `[-]` mark

**Ctrl+X Ctrl+A collapses the band.** The band's two lines became one:

```text
✻ Sautéed for 5s · done 16:07
▸ plugin panel hidden · ctrl+x ctrl+a or click to show

────────────────────────────────────────────────────────────────────────────────────── todo-app-ce ─
```

The same keys restored it (measured). The row names a click as well; no click was sent.

### The hint line and the agent count

**`← for agents` shows only at first.** In two sessions with nothing in the background, the hint read `⏵⏵ auto mode on (shift+tab to cycle) · ← for agents` for its first four frames. The fifth frame erased the text after `cycle)` with `CSI K` (measured, replayed frame by frame). In the board main that came between 6.6 s and 14.4 s after start, before the board line first drew. With the worker on its dialog, every session's hint read `· ← 1 agent` (measured). It still read `1` while agent view's header counted `3 awaiting input`. So the count is not the needs-input group's size; what it counts was not traced. A typed draft dropped the `←` text.

### Agent view

**`←` from the main selects the main's row.** With the main and two workers:

```text
Your conversation moved to the background — enter opens it · esc returns to it · ctrl+c twice quits

Needs input
✻ todo-app-ce                    The `add-greeting` worker reports it is ready and waiting for…   2s
✻ fix-readme                     approve Read: /private/tmp/claude-501/-Users-roberto-sousa-Do…   4m

Working
✻ add-greeting                   setup done; waiting on orchestrator's rulings pointer            3m

Completed
∙ sidekick-39                    stopped                                                         10s
…
❯ describe a task for a new session
  ⏵⏵ auto mode · enter to return · space to reply · ctrl+x to delete · ? for shortcuts
```

The middle column is each session's latest status text. `Completed` also listed the operator's older sessions on this machine. `←` from the attached main opened the same view, banner included, and started no process (measured).

**Enter on the main's row brings the main back with its views.** The backgrounded main, `1bbe8b16`, ran in a claimed spare, pid 63565. Attached, it drew the band and the footer within 4 s (measured). The desk starts only in a main (read `plugin/hooks/desk/desk.ts:226`), so that process settled as one.

### Esc right after `←`

**Esc attaches the fork, not the original session.** In the second main, Esc 0.3 s after `←` landed in a session named `Single word reply`, the fork's derived name, on its prompt's border. The listing then held the fork as background row `1c60b2fc`, pid 73188. The interactive row `todo-app-e4`, pid 71475, had left it, and pid 71475 lived on as the relay. The third main gave the same with Esc 8 s after `←`: the fork `8975bac8`, named `Single word reply (2)` (measured, two runs).

**Whether the main's views follow depends on how the daemon started the fork.** The daemon log, for each `←`:

```text
[2026-10-23T15:09:48.918Z] [bg] bg claimed-spare 1bbe8b16 (slash)
[2026-10-23T15:12:50.149Z] [bg] bg claimed-spare 3b07edec (spare)
[2026-10-23T15:12:50.150Z] [bg] bg spawned 1c60b2fc (slash)
[2026-10-23T15:15:07.411Z] [bg] bg claimed-spare 8975bac8 (slash)
```

The forks in claimed spares, `1bbe8b16` and `8975bac8`, drew the band and the footer. `8975bac8`, unprofiled, also drew the notice. The fresh spawn, `1c60b2fc`, drew none of sidekick's rows in the 90 s it was watched. Typing `/desk` there listed `/desktop` first, and no sidekick command:

```text
  ❯ /desktop                                Continue the current session in Claude Desktop
    /sidekick:sk-design                     (sidekick) Designs a change before it is built, as an
…
──────────────────────────────────────────────────────────────────────────────── Single word reply ─
❯ /desk
```

So sidekick's start hooks never ran in that process, though its skills loaded (measured once; Enter was not pressed). The process carried `--plugin-dir`, read from `ps`. Why a fresh spawn ran no mod was not traced. In that run, agent view's own spare took the waiting spare, and the fork spawned fresh (inferred from the log's order). Enter would have opened Claude Desktop, the trap the 2026-10-21 pane record met.

**No mods-not-running notice drew in that fork either.** After a Bash call there, no `PostToolBatch says` row drew (measured). The daemon was started from the main's Bash, so it likely inherited the main's `SIDEKICK_CONTEXT_LIMIT`, which the monitor reads first (inferred, not checked).

### The classic screen

**The band keeps its rows over the prompt, and the inline pane fits whole.** Under `CLAUDE_CODE_NO_FLICKER=0` at 100 by 40:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ CHILDREN · todo-app                                                                              │
│ fix-readme blocked · permission prompt                                                           │
│ 62k tokens · fix-readme plan                                                                     │
│ Initial commit                                                                                   │
│ add-greeting working                                                                             │
│ 79k tokens · add-greeting plan                                                                   │
│ Initial commit                                                                                   │
│ OTHER SESSIONS                                                                                   │
│ sidekick-6f · sidekick · busy                                                                    │
│ todo-app-ce · todo-app · blocked · blocked                                                       │
│ Single word reply · todo-app · done                                                              │
│ Single word reply (2) · todo-app · blocked · blocked                                             │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
● needs you  fix-readme · permission prompt   todo-app-ce · blocked +1 more                     [-]
◆ workers    fix-readme blocked · add-greeting working   1 finished
```

The slash menu drew under the prompt in place of the footer rows, and the band kept its place (measured).

### Busy states

**The band stays through a turn.** On both screens the spinner drew in the transcript, over the band, and the band kept its lines:

```text
❯ Describe src/todo.js in three sentences.
✽ Cogitating… (2s · thinking)
● needs you  fix-readme · permission prompt   Single word reply (2) · blocked                   [-]
◆ workers    fix-readme blocked · add-greeting working   2 finished
────────────────────────────────────────────────────────────────────────────────────── todo-app-ce ─
❯
```

In fullscreen the slash menu drew in the transcript area, over the band, and the footer rows stayed (measured).

### Ctrl+Z

**Under a shell with job control, Ctrl+Z stops a plain session.** Claude Code printed its notice, and bash reported the job:

```text
Claude Code has been suspended. Run `fg` to bring Claude Code back.
Note: ctrl + z now suspends Claude Code, ctrl + _ undoes input.
[1]+  Stopped                 claude --model haiku --plugin-dir /Users/roberto.sousa/Documents/Proje
cts/sidekick/plugin
$
```

`ps` read the process as `T`. `fg` brought it back, and the band, the notice, and the footer redrew (measured). Under the driver with no job control, the same notice printed, but the process stayed `Ss`. SIGCONT then redrew it.

**In an attached session, Ctrl+Z ends the attach client.** `claude attach` exited 0 at once, printed nothing, and left no stopped job. The worker kept its pid and its state in the listing (measured, with and without job control).

### The board

**The board's state line, at 100 by 40 in this repository:**

```text
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ sidekick: no profile settings in this session
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
  ▣ Rikmorn/sidekick · board #2 · ● on track · R9 — Control centre · 16:22
```

The segments drew in `505050` and `● on track` in `4eba65` (measured). The line drew about 12 s after start.

**The board pane, inline at 100 by 40:**

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ sidekick · Rikmorn/sidekick · board #2                                                           │
│ milestone: R9 — Control centre (3 open, 21 closed) · Outcome: GSD no longer loads, and nothing   │
│ it provided is lost.                                                                             │
│ in progress: plan The control centre's usage guide: #240 (0 d)                                   │
│ candidates: next plan The docs that say what sidekick is (#215) · then GSD's status line and     │
│ monitor replaced after the release in… (1) · 12 plans done · unplanned: none · tier 2: none      │
│ drift: none                                                                                      │
│ next: continue plan The control centre's usage guide (#240)                                      │
│                                                                                                  │
│ https://github.com/users/Rikmorn/projects/2                                                      │
│ as of 16:22                                                                                      │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

Docked at 160, the same brief took 28 rows at 23 columns, ending `https://github.com/use…` (measured).

### Side findings

- **The prompt's border carries the session's name.** It showed `todo-app-ce` once the name mod froze it, a worker's `-n` name, and each fork's name. It showed none for the main's derived name before the freeze (measured). That bears on whether a main needs a marker of its own.
- **sidekick's footer notice shows in every unprofiled session,** the scratch mains and the board main alike (measured). Its `⚠` is the glyph the 2026-10-16 practice record reserves for faults.
- **Debug mode prints a banner into the transcript's head,** `Debug mode enabled · logging to <file>`. The pictures came from sessions without `--debug-file`. Neither `CLAUDE_CODE_DEBUG_LOGS_DIR` nor `CLAUDE_DEBUG` alone wrote a log (measured).

## Cleanup

`claude stop`, then `claude rm`, removed the five background sessions this run started: `0e2e8ebe` and `f81d5c9c`, the workers, and `1bbe8b16`, `1c60b2fc`, and `8975bac8`, the forks. `claude rm` removed both worktrees, each with nothing committed. The two `worktree-*` branches and the two desk records went by hand. Each interactive session ended with ctrl+c twice, `/exit`, or the driver. The listing after cleanup matched the one taken before the first run, row for row, on id, name, kind, folder, state, status, and pid. `claude daemon status` read `not running`, as before the first run. This repository's `git status` stayed clean.

## Commands

```sh
claude --version
claude agents --json --all
uv run --with pyte python -I <driver> <spec>
sidekick profile new <name> --description <text> --repo
sidekick profile argv main
claude --add-dir <profile> --settings '<json>' --model haiku --plugin-dir <plugin>
claude --model haiku --plugin-dir <plugin> --debug-file <file>
CLAUDE_CODE_NO_FLICKER=0 claude --add-dir <profile> --settings '<json>' --model haiku --plugin-dir <plugin>
sidekick worker dispatch <brief> --permission-mode default --plugin-dir <plugin>
sidekick worker dispatch <brief> --permission-mode auto --plugin-dir <plugin>
claude attach <id>
/bin/bash --norc --noprofile -i
claude stop <id>
claude rm <id>
claude daemon status
ps -o pid,ppid,pgid,stat,command
```

The driver typed each slash command and pressed Enter only once the typeahead's first row matched. `sidekick worker dispatch` ran inside the main, through its model's Bash tool. Every other command ran from the driver or a shell.
