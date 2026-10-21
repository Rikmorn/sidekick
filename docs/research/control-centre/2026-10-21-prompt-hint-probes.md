> Research for the `control-centre` design (R9, #233). A subagent ran it on 2026-10-21 for a session with the operator, on Claude Code 2.1.306. It records where a mod's `PromptHint` row draws in an interactive session, and the room it costs an inline pane. It also checks the state line's glyphs against Unicode's emoji data. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: a `PromptHint` row in an interactive session (2026-10-21)

#233 replaces the board's band with one state line under the prompt. Every earlier measure of a row under the prompt came from background sessions on Claude Code 2.1.301. This report measures the row in interactive sessions on 2.1.306, in both layouts and beside the subagent panel. It also measures what the row costs an inline pane, and checks two glyphs against Unicode's emoji data.

Provenance grades:

- **Measured:** run on 2026-10-21, with the command and the screen or log line named.
- **Read:** read on 2026-10-21 in the mod API's declarations for 2.1.306, `.cache/claude-code-types/current.d.ts`, or in this repository's source, with the line named.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Do sidekick's mods load and fire on 2.1.306? | Yes. `bun run typecheck:mods` passed, and a full `bun run check:mods` passed and recorded 2.1.306 in `.claude-code-version` | Measured |
| Does a `PromptHint` row draw under the prompt in fullscreen? | Yes, at 110 and 160 columns, on the row after the engine's hint line | Measured |
| Does it draw on the main screen too? | Yes, at 110 and 160 columns, in the same place. `CLAUDE_CODE_NO_FLICKER=0` overrode the user setting `tui: fullscreen` | Measured |
| Where does the row sit beside the subagent panel? | Between the hint line and the panel. Fullscreen draws the hint line, the row, a blank row, then the panel | Measured at 110 and 160 columns |
| Do rows under the prompt count against fullscreen's bottom slot? | Yes. At 100 by 40, the band's `maxRows` read 12 with the row and 13 without | Measured |
| What room does an inline pane get at 100 columns? | `scroll.bodyRows` 11 and `bodyColumns` 96, with the row or without it. The desk's pane drew its 3 body rows inside its border either way | Measured |
| What gives way when an inline pane fills its room? | The row. A 30-row probe pane drew 11 body rows in both runs, and the row was missing from the screen. The band's `maxRows` fell to 0 | Measured |
| Are `✗` (U+2717) and `▣` (U+25A3) emoji-capable? | No. Neither falls in any range of Unicode 18.0.0's `emoji-data.txt`, under any property, so neither needs a replacement | Measured |

Not tested:

- the main screen while the subagent panel shows;
- the row while a dialog, a survey, or a permission prompt holds the prompt;
- terminals other than 40 rows tall, and a docked pane beside the row;
- the desktop surface.

## Method

A scratch plugin, `hintprobe`, sat in a git-ignored folder and held one hooks module. Its hooks:

- `ui.render` on `PromptHint` returned a `Box` column of `await next(e)` and one `Text` row. The row read `HINTPROBE row cols=<columns> fullscreen=<isFullscreen>`, from the render's `viewport`. With `HINTPROBE_ROW=0` set, it returned `next(e)`'s tree alone;
- `ui.render` on `AbovePrompt` and on `Pane` passed what lay beneath and logged their props;
- `/hintpane` opened a pane of its own, 30 rows tall. Its first row printed the pane's `placement`, `bodyColumns`, and `scroll.bodyRows`.

Every log went to the debug log through `$.ui.log(…, { to: 'debug' })`, and each session ran with `--debug-file`.

Each run started `claude` from this repository with Haiku, in a Python pseudo-terminal 40 rows tall. The driver dropped the parent session's `CLAUDE*` and `SIDEKICK*` variables, and answered the terminal's cursor queries. It fed the output to `pyte` under `uv run --with pyte`, and dumped the screen at set times. It then sent ctrl+c twice and ended the process group. The runs:

- **Idle:** fullscreen at 110 and 160 columns, the default under the user setting `tui: fullscreen`. Then the main screen at 110 and 160, under `CLAUDE_CODE_NO_FLICKER=0`.
- **Subagent:** fullscreen at 110 and 160. The prompt asked for one `Agent` call with `run_in_background` true: a subagent writing a 2,500-word story without tools. The driver dumped the screen every 6 to 10 seconds while it ran.
- **Room:** fullscreen at 100 columns, with `--plugin-dir ./plugin` beside the scratch plugin. Two pairs of runs typed `/desk`, one with each plugin listed first. A third pair, with the scratch plugin first, typed `/hintpane`. Each pair ran once with the row and once with `HINTPROBE_ROW=0`.

The emoji check fetched Unicode's latest `emoji-data.txt` into a folder of its own. A script kept elsewhere parsed each `<cp>[..<cp>] ; <Property>` line. It tested each code point against every range, ends included.

## Findings

### The mods on 2.1.306

`bun run typecheck:mods` generated the 2.1.306 declarations and type-checked the mods against them, exiting 0. Against 2.1.301's, the file gained 241 lines and lost 25 (measured, `git diff --no-index --stat`). `bun run check:mods` then passed in full: both manifests, the plugin's tests, the gauge's headless run, and the desk stage. It ended `check:mods: pass on Claude Code 2.1.306, recorded in .claude-code-version` (measured).

### Where the row draws

Fullscreen, 110 columns, idle. The row is the screen's last row:

```text
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ Try "write a test for pm.test.ts"
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
  HINTPROBE row cols=110 fullscreen=true
```

The 160-column screen drew the same rows in the same order. On the main screen, the same rows drew under the transcript's last line rather than at the screen's foot:

```text
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ Try "how do I log an error?"
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
  HINTPROBE row cols=110 fullscreen=false
```

The `Try "…"` text is the engine's placeholder in an empty prompt. Two checks confirm each layout. The row printed `viewport.isFullscreen` (read `:10953`) as `true` and `false`. The fullscreen output held an `ESC[?1049h`, the switch to the alternate screen, and the main-screen output held none (measured).

### Beside the subagent panel

Fullscreen, 110 columns, 6 seconds into the background agent's run:

```text
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ show me the lighthouse story when it's ready
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Haiku 5.5 │ sidekick ░░░░░░░░░░ 8%
  ⏵⏵ auto mode on (shift+tab to cycle)
  HINTPROBE row cols=110 fullscreen=true

  ⏺ main
  ◯ general-purpose  Write lighthouse keeper short story                                   6s · ↑ 650 tokens
```

The prompt's text is the engine's suggestion, not typed. The 160-column run drew the same order (measured). The row stays next to the hint line, and the panel draws after it, past a blank row. At 110 columns the hint sometimes read `(shift+tab to cycle) · /tasks to see subagents`, as the hook logged `e.props.hint`.

### The room the row costs

The band's `maxRows` is "what the bottom slot has left above the prompt". That slot "is capped at half the terminal's rows, the prompt's included" (read `:10799-10803`). At 100 by 40, with sidekick's mods loaded, the band's `maxRows` read:

| State | With the row | Without |
|---|---|---|
| No pane open | 12 | 13 |
| The desk's pane open, 3 body rows | 7 | 8 |
| The probe pane open, 30 rows asked | 0 | 0 |

So the row takes its row from the band (measured). The subagent panel did the same: at 110 columns, `maxRows` fell from 13 to 10 while it showed (measured).

The pane's own room did not move. Both panes read `placement` `inline`, `bodyColumns` 96, and `scroll.bodyRows` 11, with the row or without it (measured). The declarations call `bodyRows` "the room's rows, never the rows showing" (read `:10878`). The desk's pane drew its 3 body rows inside its border in both runs.

The probe pane filled its room. The bottom slot then held the pane's 11 body rows and border, a blank row, the prompt, and the rows under it. That made 20 rows, half the screen. With the row, those 20 rows matched the run without it, and the row was missing from the screen:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ PANEHEAD placement=inline bodyColumns=96 bodyRows=11                                             │
│ PANEROW 02                                                                                       │
│ PANEROW 03                                                                                       │
│ PANEROW 04                                                                                       │
│ PANEROW 05                                                                                       │
│ PANEROW 06                                                                                       │
│ PANEROW 07                                                                                       │
│ PANEROW 08                                                                                       │
│ PANEROW 09                                                                                       │
│ PANEROW 10                                                                                       │
│ PANEROW 11                                                                                       │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

────────────────────────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ sidekick: no profile settings in this session
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
```

The debug log shows the hook returned the row after the pane opened (measured). Whether the engine cut it at the screen's foot or never placed it, the screen does not say. The board's band is also missing from that screen, since `maxRows` 0 left it no room (measured). The `⚠` line is the gauge's status line (read `plugin/hooks/gauge/gauge.ts:54`), another row under the prompt.

### Module order across plugins

The room runs met one more fact. With `./plugin` listed first, the scratch plugin's unmatched `Pane` hook never saw the desk's pane. With the scratch plugin listed first, it did, titled `Desk` (measured). The debug log's `hooks module … loaded (worker, environment N)` lines numbered the modules in `--plugin-dir` order (measured). The desk's `Pane` hook returns its own tree without calling `next(e)` (read `plugin/hooks/desk/desk.ts:278-285`). The declarations say `engine.create`'s fold runs its modules "in list order, first outermost" (read `:4038`). That `ui.render` hooks also nest by `--plugin-dir` order is inferred from these two runs.

### The glyphs

The file reads `Version: 18.0.0` and `Date: 2026-01-30`, and the server gave its last change as 1 September 2026 (measured). It holds 1,243 data lines under six properties. They are `Emoji`, `Emoji_Component`, `Emoji_Modifier`, `Emoji_Modifier_Base`, `Emoji_Presentation`, and `Extended_Pictographic`.

| Code point | Ranges it falls in |
|---|---|
| U+2717 `✗` | none |
| U+25A3 `▣` | none |
| U+25CF `●`, U+2713 `✓`, U+25B2 `▲`, U+25CB `○` | none |
| U+2716 `✖` | `Emoji` and `Extended_Pictographic`, on the line `2716 ; Emoji # E0.6 [1] (✖️) multiply` |

The third row holds the state line's other glyphs, checked beside the two asked about. `✖`, the glyph `✗` replaces, is emoji-capable. As a control, the parser found `✅` (U+2705) and `❌` (U+274C) under `Emoji_Presentation` (measured).

## Commands

```sh
bun run typecheck:mods
bun run check:mods
uv run --with pyte python <driver> <spec>
claude --plugin-dir <hintprobe> --model haiku --debug-file <file>
CLAUDE_CODE_NO_FLICKER=0 claude --plugin-dir <hintprobe> --model haiku --debug-file <file>
HINTPROBE_ROW=0 claude --plugin-dir <hintprobe> --plugin-dir ./plugin --model haiku --debug-file <file>
curl -fL -o <folder>/emoji-data.txt https://www.unicode.org/Public/UCD/latest/ucd/emoji/emoji-data.txt
python3 -I <parser> <folder>/emoji-data.txt 2717 25A3 25CF 2713 25B2 25CB 2716
```

The driver ran each `claude` command in its pseudo-terminal, and ended each session when its run ended.
