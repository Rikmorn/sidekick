> Research for #240, the usage guide and the board pane's redesign, and for #251, docked panes showing each fact row whole. A subagent ran it on 2026-10-26 for the operator's #240 session, on Claude Code 2.1.310 (`claude --version`). It ran sidekick at `31b5826` on `milestone/r9-control-centre`, loaded with `--plugin-dir`. It captures the rebuilt board pane, the desk, the band, and the identity row in live sessions. It checks each docked row against the mods' own fit. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Captures: the board pane's plan tree, the desk, and the identity row, live (2026-10-26)

`31b5826` rebuilt `/board` as a plan tree, and #240's guide needs pictures of it beside the desk. This run captured 16 screens in two settings. A scratch scenario held a main with two dispatched workers, one running a subagent. Beside them ran a second main, backgrounded on a question, and a bare background session. A main in this repository drew the board, since the scratch repositories are untracked. Each capture was saved as plain text and as styled runs, outside the repository. This record keeps the key screens inline and lists every place the screen and the reference docs part.

Where this record says what a doc says, it quotes `docs/reference/LOOP.md` and `docs/reference/USAGE.md` at `31b5826`.

Provenance grades:

- **Measured:** run on 2026-10-26 on Claude Code 2.1.310, with the capture or log named.
- **Read:** read on 2026-10-26 in this repository's source at `31b5826`, with the line named.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

The mods were last checked on Claude Code 2.1.310 (`.claude-code-version`), the build this run used.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does the board line read as LOOP.md says? | Yes: `▤ Rikmorn/sidekick · board #2 · ▲ drift · 18 unpushed · R9 — Control centre · 19:38`, whole at 100 and at 160 columns | Measured, 09 and 11 |
| What does `/board` draw inline at 100 by 40? | The tree's first 10 of 17 rows, under `+7 rows · ctrl+x tab to focus, then ↓`. Neither the band nor the board line draws | Measured, 10 |
| How wide is the dock at 160 by 40? | 53 columns with its grip, 52 of body, for the board, the desk, and both. That is the kept `pluginPanes.dockColumns`, not the 40 asked | Measured, 06 and 12 to 16 |
| Does each docked board row match `fitPane` at 52? | Yes, 19 of 19. No fact row wraps or loses its right-hand fact | Measured, 12 and 14 |
| Does each docked desk row match the desk's own fit at 52? | Yes, 21 of 21 and 23 of 23. No row wraps; two work lines are cut with no mark | Measured, 06, 13, 15 |
| Does `board #2` draw once, with no URL after it? | Yes, in the pane's rule header. The bytes carry it in an OSC 8 link, and the URL never prints as text | Measured, 12 and the raw output |
| With both panes docked, what do the tabs do? | `Board   Desk` heads the dock. Each ctrl+x Tab moves the keys to the next pane and brings it to the front; the third hands them back | Measured, 13 to 16 |
| Does the desk draw its aligned tree inline at 100 by 40? | Yes, 10 rows. The band shrinks to Claude Code's own `↓ 2 more` row | Measured, 05 |
| Does each role's identity row match USAGE.md? | Yes, for a profiled main, two unprofiled mains, a worker, and an `other` | Measured, 01, 02, 07, 08, 09 |
| Does a backgrounded main keep its views? | Not this one. Its fork was a fresh spawn that published no key, so the inline desk draws it as `–` with no bar | Measured, the daemon log, the store, 05 |

Mismatches with the docs, each detailed in §Findings:

| Part | The doc says | The screen shows | Capture |
|---|---|---|---|
| Another main, inline | USAGE.md's icon table: "`□` / `–` · In the inline form: another main / any other session" | `other-main`, a backgrounded main, draws as `– other-main` with no context bar | 05 |
| This main's row, stacked | USAGE.md: "Each session takes two rows." LOOP.md: "a head row and a detail row for each session" | This main takes one row, `▣ demo-main` and its counts, with no detail row | 06, 13 |

The docs say nothing of these, and each shows on screen:

- An inline desk of 10 rows at 100 by 40 leaves the band no room. Claude Code then draws its own `↓ 2 more` row in place of both band lines (05).
- An inline board pane at 100 by 40 pushes the board line off the screen (10). The 2026-10-23 captures record met the same with the old pane.
- With two panes docked, ctrl+x Tab shows the pane it gives the keys to (14 to 16).
- A stacked work line cut to keep the profile ends bare, while the board's cut titles end in `…` (06, 13).
- One `▰` lights for any part of a quarter: 6% lights one cell (read `plugin/hooks/desk/look.ts:94`).
- The glyph for each board level, `◆` good, `▲` warning, `▼` bad, `○` unknown, and `✓` complete, lives only in code (read `plugin/hooks/board/view.ts:38-43`, `:99`). Only `▲` showed.

Not tested:

- a click on `board #2` or on a tab: the driver sends no mouse events, and the run's rules forbid clicking links;
- a terminal that does not name itself iTerm2: the driver kept `TERM_PROGRAM=iTerm.app`, so whether Claude Code emits OSC 8 without it is open;
- the dock with no kept width. `dockColumns` read 53 throughout, and this run writes no settings, so a request of 40 alone never drew. §Findings gives the rows at a 40-column body as computed, not drawn;
- any board state but `drift`, so neither `▼` nor `◆` showed;
- the board line's shedding, since it fit whole at both widths;
- the `refresh failed` stamp, the `⚠ board:` row, a refresh after a board write, and `/board` mid-turn;
- scrolling either pane, since the board session took only slash commands and ctrl+x Tab;
- the marks `⇡N` and `✎`, the desk's overflow hint, and a name giving way;
- the identity row before a name is known, and a worker without a main;
- terminal sizes other than 100 by 40 and 160 by 40, and the classic screen.

## Method

The pseudo-terminal driver and controller of the 2026-10-26 desk pane captures record ran every interactive session and attach, as that record's §Method describes. They were copied unchanged into the run's scratch folder. The driver dropped the parent's `CLAUDE*` and `SIDEKICK*` variables and set `TERM=xterm-256color` and `COLORTERM=truecolor`. It kept the rest of the parent's environment, `TERM_PROGRAM=iTerm.app` among it. Before Enter on each slash command, it checked that the typeahead's first row was that command. A replay tool re-rendered every capture from the run's raw output, and each re-render matched the live screen's text.

The scenario, on `--model haiku`, in two scratch repositories made with `git init` and one commit, each trusted through its dialog:

- **`demo-main`:** an interactive main in `demo`, with the arguments `sidekick profile argv main` printed for the repository's `main` profile, plus `-n demo-main`. It started at 100 by 40 at 19:31 UTC.
- **Workers:** at 19:33, `demo-main`'s model ran `sidekick worker dispatch <brief> --permission-mode <mode> --plugin-dir <plugin>` twice, in one turn. `wait-perm` ran in `default` mode and `fan-out` in `bypassPermissions`. Each brief named a plan, a spec, and a rulings path. A repository `worker` profile set `"model": "haiku"`.
- **The subagent:** `fan-out`'s plan opened with a setup step that had it start one `general-purpose` subagent, described `count the files`, to sleep for ten minutes.
- **`other-main`:** an interactive main in `other`, with no profile. It was asked `Ask me which colour I prefer, then stop.` Then came `←` on its empty prompt, at 19:35:51, and ctrl+c twice in agent view.
- **`bench`:** `claude --bg --model haiku --plugin-dir <plugin> -n bench -- 'Run sleep 600 in Bash, then say done.'` in `other`, at 19:36:12, with the parent's `CLAUDE*` and `SIDEKICK*` variables dropped.

`demo-main` was captured at 100 by 40, then resized to 160 by 40. `claude attach` reached `fan-out` and `bench` at 100 by 40, and ctrl+z ended each attach.

The board ran in a second setting, with the scenario still running so the desk had rows:

- **`board-cap`:** `claude --plugin-dir <plugin> --model haiku -n board-cap` in this repository's main checkout, at 19:38:49, at 100 by 40. The folder was already trusted. It took `/board` and `/desk`, ctrl+x Tab, and a resize to 160 by 40. No prompt reached its model, and the driver's ctrl+c twice ended it.

For #251's check, a script parsed each docked capture and found the grip as the column where `│` stood on most rows. It took the dock's body as the columns right of the grip. It then drew the same rows through the mods' own code at that body width. For the board, that was `parseGlance` and `fitPane`, fed `sidekick pm pickup --glance` from this checkout at 19:40:16, 16 s after `/board` was entered. For the desk, it was `parseDeskSnapshot`, `readKeys`, `liveKeys`, and `paneEntries`. Those took `sidekick desk --json --self <id>` and a copy of sidekick's store file, each taken within two seconds of its capture. The script compared each drawn row with its fitted row, as text.

`claude agents --json --all` was saved before the first session, at 19:30:17 UTC, and again after cleanup. `~/.claude.json` was read, never written.

## Findings

### The board line

**The line reads as LOOP.md §The board's state line gives it, under the identity row.** It had drawn by 12 s after start. At 100 by 40 in `board-cap` (09):

```text
──────────────────────────────────────────────────────────────────────────────────────── board-cap ─
❯ Try "create a util logging.py that..."
────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
  ▣ board-cap · your main · no profile
  ▤ Rikmorn/sidekick · board #2 · ▲ drift · 18 unpushed · R9 — Control centre · 19:38
```

LOOP.md gives the shape as "`▤ owner/repo · board #N · ▲ drift · 3 unpushed · <milestone> · HH:MM`", and the line keeps every segment. The segments draw in `subtle`, `505050`, and `▲ drift` in `warning`, `ffc107` (measured, 09's styled runs). At 160 by 40 with no pane, the line read the same with `19:39` (11). With the board docked, it stayed whole under the prompt (12).

### The board pane, inline at 100 columns

**The pane shows the tree's first 10 rows and counts the rest.** `/board` at 19:39:10 (10):

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ +7 rows · ctrl+x tab to focus, then ↓                                                            │
│ ─ Rikmorn/sidekick ────────────────────────────────────────────────────────────────── board #2 ─ │
│ ▲ R9 — Control centre                                                                      drift │
│ → continue plan The control centre's usage guide (#240, #251, #236)                              │
│ ▲ 18 unpushed                                                                                    │
│   Outcome: GSD no longer loads, and nothing it provided is lost.                                 │
│   ████████████▓░░░                                                                   12/16 plans │
│ ├ ✓ 12 plans done                                                                                │
│ ├ ◐ The control centre's usage guide                                                             │
│ │ ├ ◐ #240 A usage guide with pictures: what each control-centre view shows, and how to mov… 0 d │
│ │ ├ ◐ #251 Docked sidekick panes open 24 columns wide at 160 columns, so the board's brief … 0 d │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

──────────────────────────────────────────────────────────────────────────────────────── board-cap ─
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
  ▣ board-cap · your main · no profile
```

The order is LOOP.md's: "a rule header that links the board, the milestone and its state, the next move, any drift, and the outcome". Then come the cells and the plans. LOOP.md also says "When the room hides rows, its first row counts them", and the hint does. Each of the 10 rows matched `fitPane` at the inline body of 96 columns (measured, the check's log).

**Neither the band nor the board line draws under the inline pane.** The pane's frame took rows 21 to 33 of 40, and the footer ended at the identity row (measured, 10). No band line drew, and row 34 was blank. The 2026-10-23 captures record found a full board pane pushing the board line off the screen, and the new pane does the same.

### The board pane, docked at 160 columns

**The dock takes the kept width, 53, and the whole tree fits its 52 body columns.** `/board` at 160 by 40, its right side (12):

```text
│                                                  ✕
│─ Rikmorn/sidekick ────────────────────── board #2 ─
│▲ R9 — Control centre                          drift
│→ continue plan The control centre's usage guide
│  (#240, #251, #236)
│▲ 18 unpushed
│  Outcome: GSD no longer loads, and nothing it
│  provided is lost.
│  ████████████▓░░░                       12/16 plans
│├ ✓ 12 plans done
│├ ◐ The control centre's usage guide
││ ├ ◐ #240 A usage guide with pictures: what ea… 0 d
││ ├ ◐ #251 Docked sidekick panes open 24 column… 0 d
││ ├ ◐ #236 The mods' adapters each carry their … 0 d
││ └ ✓ 2 closed
│├ ► A backgrounded main that runs none of side… next
││ └ ○ #250 A backgrounded main can run none of side…
│├ ○ The docs that say what sidekick is        1 open
│└ ○ GSD's status line and monitor replaced a… 1 open
│                                         as of 19:40
```

The grip stood at column 108, so the dock was 53 columns with its grip and 52 of body (measured, 12). The board asks for `columns: DOCK_COLUMNS`, which is 40 (read `plugin/hooks/board/board.ts:361`, `plugin/hooks/commands.ts:8`). `~/.claude.json` kept `"dockColumns": 53` before the run and after it (measured). LOOP.md says "a width you kept wins, as for the desk", and the screen bears it out. #251's title says the old brief wrapped to 28 rows in a 24-column dock; the new pane takes 19 rows at 52.

**The tones, from 12's styled runs (measured):**

| Part | Tone in the capture |
|---|---|
| Rule, `─` and the tree's branches | `subtle`, `505050` |
| `Rikmorn/sidekick` | `inactive`, `999999`, bold |
| `board #2` | `suggestion`, `b1b9f9`, not underlined |
| `▲`, `drift`, and `▲ 18 unpushed` | `warning`, `ffc107` |
| `R9 — Control centre` and the running plan's title | `text`, `ffffff`, bold |
| `→` and the next move | `claude`, `d77757` |
| The outcome | `inactive`, italic |
| Cells: `█` done, `▓` running, `░` the rest | `success` `4eba65`, `suggestion`, `subtle` |
| `✓` | `success` |
| `◐` | `suggestion` |
| `►` and `next` | `claude` |
| `○`, a later plan's title, `1 open`, `0 d`, `#240` | `inactive` |
| An issue's title | `text`, not bold |
| `as of 19:40` | `subtle` |

### #251's check: each docked row against the fit

**Every docked board row is the row `fitPane` gives at 52.** All 19 matched as text, in 12 and again in 14 (measured, the check's log). So the dock's width, not the fit, decides what shows.

**At 52, no board fact row wraps or loses its right-hand fact.** The head row keeps `drift`, and the cells row keeps `12/16 plans`. Each issue row keeps `0 d`, the next plan keeps `next`, and each later plan keeps `1 open`. Six titles are cut with `…`, five of them to make room for their fact. Two prose rows wrap, as `fitPane` wraps prose (read `plugin/hooks/board/pane.ts`, `proseRows`): the next move and the outcome. The next move's issue numbers fall to its second row. `#250`'s row carries no right-hand fact in the glance, and its title is cut.

**Every docked desk row is the row `paneEntries` gives at 52.** All 21 matched in 06, and all 23 in 13 and in 15 (measured, the check's log). No row wraps: each draws as one cut row. Every head row keeps its context at the right, and every detail row with a profile keeps the profile.

**Two desk work lines are cut with no mark.** `approve Read: /private/tmp/claude-501/-Us` and `waiting on orchestrator message pointing` stop mid-path and mid-sentence, then the profile follows (06, 13). The stacked detail row cuts with `cutRow`, which adds no ellipsis (read `plugin/hooks/desk/stacked.ts:185`). LOOP.md says "Every row is cut from its end to the pane's width", so this is as documented. A reader still cannot tell the line was cut.

**At a 40-column body, as computed, every right-hand fact still shows.** No capture drew 40, since the kept width won. The same glance and snapshot, fitted at 40 by the same code, give 19 board rows (inferred from the code's output, not drawn):

```text
│─ Rikmorn/sidekick ────────── board #2 ─│
│▲ R9 — Control centre              drift│
│→ continue plan The control centre's    │
│  usage guide (#240, #251, #236)        │
│▲ 18 unpushed                           │
│  Outcome: GSD no longer loads, and     │
│  nothing it provided is lost.          │
│  ████████████▓░░░           12/16 plans│
│├ ✓ 12 plans done                       │
│├ ◐ The control centre's usage guide    │
││ ├ ◐ #240 A usage guide with pictu… 0 d│
││ ├ ◐ #251 Docked sidekick panes op… 0 d│
││ ├ ◐ #236 The mods' adapters each … 0 d│
││ └ ✓ 2 closed                          │
│├ ► A backgrounded main that runs … next│
││ └ ○ #250 A backgrounded main can run …│
│├ ○ The docs that say what sidek… 1 open│
│└ ○ GSD's status line and monito… 1 open│
│                             as of 19:40│
```

The desk at 40 keeps each context and profile too. Its cut work lines grow shorter, `approve Read: /private/tmp/cl` among them.

### The board link

**`board #2` draws once in the pane, with no URL after it.** The rule header ends `board #2 ─` in the inline pane, the docked pane, and the two-pane dock (10, 12, 14). On a screen with the board line, `board #2` shows twice: once in the pane and once in the line.

**The output bytes carry an OSC 8 link for each `board #2`.** The board session's raw output held six links, all with one id and one target, and the URL never printed as text (measured, `runs/board.raw`). The docked pane's header, at byte 26225, reads:

```text
ESC]8;id=175vncb;https://github.com/users/Rikmorn/projects/2 BEL  ESC[38;2;177;185;249m board #2  ESC]8;; BEL
```

The line's link wraps `board #2` the same way, inside the line's `subtle` colour. The pane's run carries `href: board.url` (read `plugin/hooks/board/pane.ts:139`), and the line's segment is a `Link` (read `plugin/hooks/board/board.ts:93`). The styled-run JSON cannot show a link, since its renderer drops OSC 8, so the raw bytes are the evidence.

A click cannot be tested here. The driver sends no mouse events, and the run's rules forbid clicking links. Claude Code may also decide from the terminal's name whether to emit OSC 8 at all. The driver passed on `TERM_PROGRAM=iTerm.app`, so a terminal that names itself otherwise may draw differently (inferred, not tested).

### Two panes in the dock

**A tab row heads the dock, and the newer pane shows.** `/desk` after `/board`, at 160 by 40 (13):

```text
│ Board   Desk                                     ✕
│─ demo ─────────────────────────────────────────────
│○ demo-main                           ▰▱▱▱    65k/6%
││ idle since 19:35                              main
│├ ● wait-perm                         ▰▱▱▱    62k/6%
││   approve Read: /private/tmp/claude-501/-Us worker
│└ ◐ fan-out                           ▰▱▱▱    78k/8%
│  │ waiting on orchestrator message pointing  worker
│  └ ◐ general-purpose
│      count the files
│─ other ────────────────────────────────────────────
│● other-main
│  Which colour do you prefer?
│◐ bench                               ▰▱▱▱    64k/6%
│  600s sleep running in background (task blirvcrf4)
│─ sidekick ─────────────────────────────────────────
│▣ board-cap
│◐ sidekick-3f                         ▰▰▱▱  481k/49%
││ idle since 19:27
│└ ◐ general-purpose
│    Live capture run for the board pane
│─ odin ─────────────────────────────────────────────
│◐ odin-a9
│  working
```

`sidekick-3f` and `odin-a9` are the operator's own sessions, and the subagent under `sidekick-3f` is this run (measured, the listing). Two panes kept the dock at 53 (measured, 13).

**Each ctrl+x Tab moves the keys to the next pane and shows it.** The active tab draws bold and reversed, and a focused dock draws its grip in `suggestion` rather than dim (measured, the styled runs):

| After | Tab shown | Grip | Capture |
|---|---|---|---|
| `/desk` | Desk | dim | 13 |
| ctrl+x Tab | Board | `suggestion` | 14 |
| ctrl+x Tab again | Desk | `suggestion` | 15 |
| ctrl+x Tab a third time | Desk | dim | 16 |

So the first press gave the board the keys and brought it to the front, and the second moved to the desk. The third handed the keys back to the prompt and left the desk shown. LOOP.md says "Ctrl+x Tab cycles focus through sites", and the screens bear that out. That a press also changes the shown tab goes unsaid in the docs. Claude Code's declarations name another way, "A click on a tab, or Tab onto it and Enter, shows that pane" (read 2.1.310's declarations, `Pane.title`). This run pressed neither.

### The desk, inline at 100 columns

**The desk draws its aligned tree, and the band drops to Claude Code's `n more` row.** `/desk` in `demo-main`, at 19:36:55 UTC (05):

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│    – other-main     needs you  Which colour do you prefer?               other                   │
│ ▣ demo-main         this main                                            2 workers · 1 needs you │
│ ├  ● wait-perm      needs you  approve Read: /private/tmp/claude-50               ▰▱▱▱    62k/6% │
│ └  ◐ fan-out        working    waiting on orchestrator message poin               ▰▱▱▱    78k/8% │
│    └ ◦ general-purpose count the files                                                           │
│                                                                                                  │
│    □ sidekick-3f    working    idle since 19:27                          sidekick ▰▰▱▱  481k/49% │
│    └ ◦ general-purpose Live capture run for the board pane                                       │
│    – odin-a9        idle                                                 odin                    │
│    – bench          working    600s sleep running in background (ta      other    ▰▱▱▱    64k/6% │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
↓ 2 more                                                                                        [-]
```

The band's two lines gave way to `↓ 2 more`, which Claude Code draws itself when the band's tree outgrows its room. Its declarations say the engine draws "a `[-]` beside the tree, an `n more` row under it" (read 2.1.310's declarations, `AbovePrompt`). The 2026-10-26 desk pane captures record drew the band whole under a 9-row pane. This pane had 10 rows, one more for `sidekick-3f`'s subagent. So a guide picture of the inline desk at 100 by 40 may show no band (inferred from two captures).

**Mismatch: a backgrounded main draws as `–`.** USAGE.md's icon table reads "`□` / `–` · In the inline form: another main / any other session". `other-main` is a main moved to the background, yet it draws `–` with no context bar (05). LOOP.md words the rule by the key: "`□` a session whose key says `role: 'main'`". `other-main`'s fork published no key: the store held none for `50da9714` at either check (measured, the store copies). The daemon log reads `[bg] bg spawned 50da9714 (slash)`, a fresh spawn, not a claimed spare. The 2026-10-26 desk pane captures record found that a fresh-spawned fork ran no mods, and #250 tracks that. So LOOP.md matches the screen and USAGE.md's table does not, while #250 stands.

**The work lines follow LOOP.md's order.** `other-main`'s line is its question, `Which colour do you prefer?`. Its snapshot row held `needs` `send a prompt to start`, no `asked`, and `detail` `Which colour do you prefer?` (measured, the snapshot with 06). So the line came from job state's `detail`, and not from `asked`, which LOOP.md would try first. Why `asked` was empty was not traced. `fan-out` and `bench` show their `detail` in place of an `idle since` activity, as LOOP.md says. `sidekick-3f` reads `working` and `idle since 19:27`, since an interactive session has no job state `detail` to give way to.

**The context bar has four cells, and a part cell lights.** `62k/6%` lights one `▰` of four, and `481k/49%` lights two. The code takes the ceiling of the percent over 25 (read `plugin/hooks/desk/look.ts:94`). LOOP.md says "four cells of `▰` and `▱`, 25% each", which leaves the rounding unsaid. The lit cells drew in `success` and the text in `inactive`, as LOOP.md says under 65% (measured, 05's styled runs).

### The desk, docked at 160 columns

**The stacked form groups by repository, waiting repositories first.** In `demo-main`, after the resize (06):

```text
│                                                  ✕
│─ other ────────────────────────────────────────────
│● other-main
│  Which colour do you prefer?
│◐ bench                               ▰▱▱▱    64k/6%
│  600s sleep running in background (task blirvcrf4)
│─ demo ─────────────────────────────────────────────
│▣ demo-main                  2 workers · 1 needs you
│├ ● wait-perm                         ▰▱▱▱    62k/6%
││   approve Read: /private/tmp/claude-501/-Us worker
│└ ◐ fan-out                           ▰▱▱▱    78k/8%
│  │ waiting on orchestrator message pointing  worker
│  └ ◐ general-purpose
│      count the files
│─ sidekick ─────────────────────────────────────────
│◐ sidekick-3f                         ▰▰▱▱  481k/49%
││ idle since 19:27
│└ ◐ general-purpose
│    Live capture run for the board pane
│─ odin ─────────────────────────────────────────────
│○ odin-a9
│  idle
```

USAGE.md says "Each other repository with a session that needs you comes first, then this main's, then the rest". In `demo-main`, `other` led. In `board-cap`, `demo` and `other` both led, each holding a session that needed the operator (13). `demo-main`'s workers nested under it there, waiting first. `other-main`'s question drew in `warning`, as USAGE.md says of "A question waiting for you" (measured, 06's styled runs).

**Mismatch: this main takes one row, not two.** USAGE.md says "Each session takes two rows", and LOOP.md says "a head row and a detail row for each session". `▣ demo-main` and `▣ board-cap` each drew a single row, with the counts at the right when there were any (06, 13). The stacked root entry is one row by design (read `plugin/hooks/desk/stacked.ts:249-263`). Neither doc's sentence makes an exception for this main.

### The band

**The band reads as LOOP.md §The desk says.** In `demo-main`, with the scenario running (04):

```text
● needs you  wait-perm · permission prompt   other-main · blocked                               [-]
◐ workers    wait-perm blocked · fan-out working   1 finished
```

`● needs you` drew in `warning`, and `◐ workers` in `suggestion` (measured, 04's styled runs). Before any dispatch, the band read `1 finished` alone, in `inactive` (01), as LOOP.md says: "with no children, the count stands alone". The workers' own sessions drew no band (07), nor did `bench` (08).

### The identity row

**Each role's row matches USAGE.md's table.** Measured, verbatim:

| Session | Role, profile | Row | Capture |
|---|---|---|---|
| `demo-main` | main, `main` | `▣ demo-main · your main · profile main` | 01, 04 |
| `other-main` | main, none | `▣ other-main · your main · no profile` | 02 |
| `board-cap` | main, none | `▣ board-cap · your main · no profile` | 09 |
| `fan-out` | worker, `worker` | `◐ fan-out · worker of demo-main · back: ←, select demo-main, Enter · profile worker` | 07 |
| `bench` | other, none | `– bench · no profile` | 08 |

The row draws under Claude Code's hint line, and the board's line draws under it (09). The icon and the name take the role's tone, bold: `claude` for a main, `suggestion` for a worker, `inactive` for `other`. The words after them draw `inactive`, except the profile's own name, `main` or `worker`, which draws in `text`, `ffffff` (measured, 01 and 07). The docs give no tones for the row; the 2026-10-26 desk pane captures record found the same against #254's spec.

### Side findings

- **Attached to `fan-out`, Claude Code's own subagent panel draws under the identity row:** `◯ general-purpose  count the files  3m 52s · ↓ 49.0k tokens` (measured, 07).
- **`fan-out`'s message again waited behind a dialog in `demo-main`,** as the 2026-10-26 desk pane captures record found. The dialog's default was **Deny**, and this run chose **Deliver** (measured, 03).
- **The other main's agent view took a spare of its own.** The daemon log reads `bg claimed-spare 00dcb875 (spare)` at the same instant as the fork's spawn, then `bg settled 00dcb875 (killed)` 14 s later, when agent view quit. That fits the 2026-10-23 captures record's reading, that agent view's own spare takes the waiting one and the fork spawns fresh (inferred, one run).

## Cleanup

`claude stop`, then `claude rm`, removed the four background sessions this run started: `27e43c15` (`wait-perm`), `b8b2fbc4` (`fan-out`), `50da9714` (`other-main`'s fork), and `a741f79c` (`bench`). `claude rm` removed both worktrees and their branches, with nothing committed. The three interactive sessions, `demo-main`, `other-main`, and `board-cap`, ended through the driver, and no driver or attach client remained (measured, `pgrep`). The scratch repositories went with their desk records.

The listing after cleanup matched the one taken at 19:30:17 UTC, row for row, on id, name, kind, folder, state, status, and pid. `claude daemon status` read `not running`, as before the first session. Sidekick's store held only `sidekick-3f`'s key, and `~/.claude.json` kept `"dockColumns": 53`. This repository changed only by this record and its index line.

## Commands

```sh
claude --version
claude agents --json --all
uv run --with pyte python -I <driver> <spec>
sidekick profile argv main
claude --add-dir <profile main> --settings '{"model":"haiku","sidekick":{"profile":"main"}}' --model haiku --plugin-dir <plugin> -n demo-main
sidekick worker dispatch <brief> --permission-mode default --plugin-dir <plugin>
sidekick worker dispatch <brief> --permission-mode bypassPermissions --plugin-dir <plugin>
claude --model haiku --plugin-dir <plugin> -n other-main
claude --bg --model haiku --plugin-dir <plugin> -n bench -- 'Run sleep 600 in Bash, then say done.'
claude attach <id>
claude --plugin-dir <plugin> --model haiku -n board-cap
sidekick pm pickup --glance
sidekick desk --json --self <session id>
bun <check script> board <capture> <glance>
bun <check script> desk <capture> <snapshot> <store copy> <time>
claude stop <id>
claude rm <id>
claude daemon status
```

The driver typed each slash command and pressed Enter only once the typeahead's first row matched. `sidekick worker dispatch` ran inside `demo-main`, through its model's Bash tool. Every other command ran from the driver or a shell.
