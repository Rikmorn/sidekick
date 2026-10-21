> Research for the `control-centre` design (R9, #232, #234, #235, #238). A subagent ran it on 2026-10-21 for a session with the operator, on Claude Code 2.1.306. It records how an inline pane scrolls, and what a full one costs the board's line. It also covers the auto-memory file's type, slash-command name clashes, and mods in a background session. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: pane scrolling, command clashes, and background sessions (2026-10-21)

R9's plan 10 takes four issues. #232 says inline panes clip rows the operator cannot reach. #234 asks how to name the auto-memory file in `/profile`. #235 says sidekick's three commands answer in place of any other command of the same name. #238 says those commands do not exist in a background session. This report measures what each design rests on.

Provenance grades:

- **Measured:** run on 2026-10-21, with the command and the screen or log line named.
- **Read:** read on 2026-10-21 in the mod API's declarations for 2.1.306, `.cache/claude-code-types/2.1.306.d.ts`, or in this repository's source, with the line named. The declarations file matched `current.d.ts` byte for byte.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does an inline pane mark the rows out of view? | No. Neither a glyph nor a colour on the frame marks them, inline or docked | Measured |
| How tall is an inline pane's body? | A third of the terminal less the border: 11 rows at 40, 6 at 24. On the main screen `rows: 30` gave 27 and 11. In fullscreen at 100 columns it changed nothing | Measured |
| Can the keyboard scroll an inline pane? | Yes, on both screens: ctrl+x Tab gives the pane the keys, and each Down moves the window one row. Plain Tab does not reach the pane | Measured |
| And a pane opened with `focus: true`? | Down alone scrolls it. ctrl+x Tab then hands the keys back. With `closeOnEscape`, Escape closes it | Measured |
| Can the keys reach `/profile`'s `SKILLS` and `MEMORY FILES` rows? | Yes, at 100 by 40 and at 80 by 24 on the main screen, to the tree's last row | Measured |
| Does a full inline pane hide the board's line? | In fullscreen, yes: a pane of exactly `scroll.bodyRows` rows did, and one row fewer kept the line. The main screen showed the line at every count | Measured at 100 by 40 |
| Is the auto-memory file typed `AutoMem`? | Yes. The other types seen were `User` and `Project` | Measured |
| Does `$.command.register` take a name that is already held? | No. It refuses a project skill's or command's name, and a name another plugin registered | Measured |
| Which answers a clashing name? | The first-listed plugin's `command.run` hook, registered or not. sidekick's pane opened for `/profile` and `/desk`, and neither project file ran | Measured |
| Does a hook that passes `next(e)` let the other command run? | Yes. The project skill ran | Measured |
| What does `$.command.list()` hold at `session.start`? | Project skills and commands, with `source` `user` and no `plugin`. A plugin's commands appear once it registers them, sidekick's with `plugin` `sidekick` | Measured |
| Does `/clear` fire `session.start` again? | No. `classic.SessionStart` fires, with `source` `clear` | Measured |
| In a `claude --bg` session, do the env, the start hook, a command, and a pane work? | Yes. `CLAUDE_JOB_DIR` is set, and `session.start` fires at launch with `isInteractive` true. A command's `{ text }` and a pane both draw while attached | Measured |
| What does typing `/desk` do in a background session? | The typeahead puts `/desktop` first, and Enter handed the session to Claude Desktop | Measured |

Not tested:

- ← on an empty prompt, the move #238 describes. These runs started the session with `claude --bg` and opened it with `claude attach`;
- a mouse click or wheel on a pane;
- `/board` and `/profile` submitted in an attached background session, after the `/desktop` hand-off described in §Background sessions;
- ctrl+z as a detach under the driver, which typed into the prompt instead;
- terminals other than 24 and 40 rows tall, the board's line at 80 by 24, and the desktop surface.

## Method

A scratch plugin, `paneprobe`, sat in the session's scratchpad and held one hooks module. Its hooks:

- `/tallpane <variant> <count>` opened the pane `tall`. Its variants set no `rows`, `rows: 30`, `rows: 15`, `focus: true`, or `focus: true` with `closeOnEscape: true`. The count drew 40 rows, `scroll.bodyRows` rows, or one or two fewer. The first row printed `placement`, `bodyColumns`, `scroll.bodyRows`, `scroll.offset`, and `isFocused`;
- `ui.scroll`, `ui.focus`, and `ui.close` logged each event and passed it on;
- `ui.render` on `Pane`, `PromptHint`, and `AbovePrompt` passed what lay beneath and logged its props and the rows it held;
- `/memprobe` logged each `memoryFiles` entry of `$.session.usage({ breakdown: 'summary' })`;
- `/listprobe`, and `session.start` before and after `next(e)`, logged `$.command.list()`'s entries for the names under test;
- `/bgprobe` logged `$.env`, opened the pane, and answered one line of text;
- with `PANEPROBE_BOARD=1` it registered `board` and answered it with fixed text. With `PANEPROBE_SWALLOW=1` it answered `/probecmd` without `next(e)` and without registering it.

Every log went to the debug log through `$.ui.log(…, { to: 'debug' })`, and each session ran with `--debug-file`. A log line holding `tokens=<n>` printed its value as `[REDACTED]` (measured).

Each run started `claude --model haiku` in a Python pseudo-terminal. The driver dropped the parent session's `CLAUDE*` and `SIDEKICK*` variables, and answered the terminal's cursor and colour queries. It fed the output to `pyte` under `uv run --with pyte`, and dumped the screen at set times. It then sent ctrl+c twice and ended the process group. Fullscreen is the default under the user setting `tui: fullscreen`, and `CLAUDE_CODE_NO_FLICKER=0` forced the main screen. `pyte` does not track the dim attribute, so the frame's styling came from the raw output.

The runs:

- **Scroll:** each variant opened a 40-row tree. It ran on the main screen at 100 by 40 and 80 by 24, then in fullscreen at 100 by 40 and 160 by 40. After the open, the driver sent ctrl+x Tab and Down five times. After a `focus: true` open it sent Down five times first.
- **Profile:** the real `/profile`, from `--plugin-dir ./plugin` beside `paneprobe`, on the main screen at 100 by 40 and 80 by 24. The driver sent ctrl+x Tab, then Down 70 times. `/memprobe` ran first in the same sessions.
- **Room:** fullscreen and the main screen at 100 by 40, with `paneprobe` listed first. One session per screen opened every count of `plain`, `rows30`, and `rows15` in turn.
- **Clash:** a fresh folder in the scratchpad with `git init`, its trust dialog answered by the driver. It held a project skill `profile`, a project command `desk`, a skill `probeskill`, and a command `probecmd`, each replying with one fixed word. Two sessions ran on the main screen at 120 by 50, one with each plugin listed first.
- **Background:** with the two clashing files moved out of that folder, `claude --bg` started a session with both plugins. The driver then ran `claude attach <id>` at 100 by 40.

## Findings

### Inline panes and the keyboard

On the main screen at 80 by 24, a 40-row tree opened with no `rows` drew 5 of its rows. The head row wrapped at 76 columns, so the body's 6 rows held head and 4 more:

```text
╭────────────────────────────────────────────────────────────────────────────✕─╮
│ PANEHEAD placement=inline bodyColumns=76 bodyRows=6 offset=0 focused=false   │
│ n=40                                                                         │
│ PANEROW 02                                                                   │
│ PANEROW 03                                                                   │
│ PANEROW 04                                                                   │
│ PANEROW 05                                                                   │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Nothing on the frame says 35 rows are out of view. Each frame row's right edge drew in the terminal's default colour, before and after a scroll (measured, `pyte`'s cell colours). The docked pane at 160 columns drew no marker either.

After ctrl+x Tab and five Downs, the same pane showed rows 5 to 10:

```text
╭────────────────────────────────────────────────────────────────────────────✕─╮
│ PANEROW 05                                                                   │
│ PANEROW 06                                                                   │
│ PANEROW 07                                                                   │
│ PANEROW 08                                                                   │
│ PANEROW 09                                                                   │
│ PANEROW 10                                                                   │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Each Down raised one `ui.scroll` with `by` 1 and `origin` `{ kind: 'person' }`. Each `next(e)` resolved to `{}`, and the next render's `scroll.offset` read the new row (measured). A typical event read:

```text
ui.scroll e={"component":"Pane","requestId":"tall","offset":1,"by":1,"bodyRows":6,"contentRows":41,"origin":{"kind":"person"}}
```

Every one of the 16 scroll runs raised five such events, on both screens and both placements (measured). The declarations name the key. A pane is "keyed by the person (ctrl+x tab, Esc)", and while it holds the keys, "the arrows scroll" (read `:10842`, `:10858`).

Plain Tab did not reach the pane. It showed the hint `Use opt+t to toggle thinking`, and five Downs then moved nothing (measured, main screen at 100 by 40). That fits #232's report that the operator could not Tab into the pane.

Focus shows on the frame. The inline frame drew with SGR 2, dim, at the open. After ctrl+x Tab it was drawn again without that code (measured, the raw output at 80 by 24).

The four variants differed in these ways (measured):

| Variant | Opens with the keys | Down alone after the open | ctrl+x Tab after that | Escape |
|---|---|---|---|---|
| no `rows` | no | moves nothing, at 100 by 40 on the main screen | gives the keys | — |
| `rows: 30` | no | not sent | gives the keys | — |
| `focus: true` | yes | scrolls | hands the keys back | — |
| `focus: true`, `closeOnEscape: true` | yes | scrolls | hands the keys back | closes it, `ui.close` origin `person` |

The body's room, in rows by columns (measured):

| Layout | Size | `placement` | No `rows` | `rows: 30` |
|---|---|---|---|---|
| Main screen | 100 by 40 | `inline` | 11 by 96 | 27 by 96 |
| Main screen | 80 by 24 | `inline` | 6 by 76 | 11 by 76 |
| Fullscreen | 100 by 40 | `inline` | 11 by 96 | 11 by 96 |
| Fullscreen | 160 by 40 | `dock` | 33 by 56 | 33 by 56 |

The declarations say `rows` is wanted "up to what the layout spares", and "left out, a third" (read `:7643`). In fullscreen the bottom slot is capped at half the terminal (read `:10803`), which leaves an inline pane 11 rows at 40. The docked body read 34 rows by its last render, once the hint line had shortened (measured; the cause is inferred).

### `/profile` on the main screen

#232 reproduces as a reachable pane on 2.1.306. At 100 by 40, `/profile`'s tree held 28 rows and its body 11. At 80 by 24 the body held 6 (measured, `paneprobe`'s `Pane` hook, listed first, counting the rows sidekick returned). With the pane opened, the screen ended at `Skills  10.0k`, inside the `CONTEXT` list.

At both sizes, ctrl+x Tab and ten Downs brought `SKILLS` into view, and thirty brought the memory files' rows. At 80 by 24 the window's end starts one row past the `MEMORY FILES` heading, which shows on the way there. At 100 by 40, after 70 Downs:

```text
│ MEMORY FILES                                                                                     │
│ ~/.claude/projects/-Users-roberto-sousa-Documents-Projects-sidekick/memory/MEMORY.md  4.7k       │
│ AGENTS.md  3.0k                                                                                  │
│ ~/.claude/rules/sk-pm-conventions.md  2.8k                                                       │
│ ~/.claude/rules/sk-working-standards.md  2.5k                                                    │
│ ~/.claude/CLAUDE.md  1.3k                                                                        │
│ +3 more                                                                                          │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The window stopped at offsets 17 and 22, the tree's 28 rows less the body's (measured). Every Down past that still raised `ui.scroll`, with the offset clamped. At 80 by 24, the auto-memory row printed as `…cts/-Users-roberto-sousa-Documents-Projects-sidekick/memory/MEMORY.md  4.7k`, the tail #234 describes.

### A full pane and the board's line

In fullscreen at 100 by 40, with the board's line under the prompt, the probe pane drew three counts in turn (measured):

| Pane rows | `scroll.bodyRows` | The board's line | The band's `maxRows` |
|---|---|---|---|
| 11, all of `bodyRows` | 11 | missing | 0 |
| 10 | 11 | on the last row | 1 |
| 9 | 11 | on the last row | 1 |

`rows: 30` and `rows: 15` left `bodyRows` at 11 and gave the same three results. The full pane moved the prompt down a row, and the board's line fell off the screen's foot:

```text
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

────────────────────────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ sidekick: no profile settings in this session
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
```

One row fewer kept it:

```text
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

────────────────────────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ sidekick: no profile settings in this session
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
  ▣ Rikmorn/sidekick · board #2 · ● on track · R9 — Control centre · 18:58
```

So `bodyRows` counts no room for the board's line (measured). Plan 9's record found the same at 30 rows asked (`2026-10-21-prompt-hint-probes.md` §The room the row costs). This run shows the line returns at `bodyRows - 1`.

On the main screen the line showed under every count. That covered `rows: 30`, whose body held 27 rows, and `rows: 15`, whose body held 15 (measured). The engine re-ran the probe's `Pane` hook for a new count only after `$.ui.invalidate('ui.render')`. Without it, a reopened pane with the same props kept its last tree (measured).

### The auto-memory file's type

In an interactive session in this repository, with `--plugin-dir ./plugin`, the breakdown held eight memory files. It typed six under `~/.claude` as `User`, and `AGENTS.md` as `Project` (measured). It typed the auto-memory file as `AutoMem`:

```text
memfile type=AutoMem tokens=[REDACTED] path=/Users/roberto.sousa/.claude/projects/-Users-roberto-sousa-Documents-Projects-sidekick/memory/MEMORY.md
```

The declarations list `Project`, `User`, `Local`, `Managed`, and `AutoMem` as display labels (read `:2261`). This machine loaded no file of the other two.

### Name clashes

**A register refuses a held name.** In the clash folder, sidekick's registers logged (measured):

```text
sidekick scope: session.start failed: sidekick: $.command.register: "/profile" refused: it is the user's /profile
sidekick desk: could not start: sidekick: $.command.register: "/desk" refused: it is the user's /desk
sidekick board: session.start failed: sidekick: $.command.register: "/board" refused: the plugin paneprobe registered it already
```

The third came with `paneprobe` listed first. With sidekick first, `paneprobe`'s register of `board` failed the same way, naming sidekick. `paneprobe`'s register of `probeskill`, a project skill's name, was refused as "the user's /probeskill". `$.command.list()` kept each project entry as it was. The declarations say "Registering a name again replaces it; a built-in's name is refused" (read `:3169`). They name only built-ins, but the engine refuses a user's, a project's, and another plugin's name too.

**A hook answers whether or not its plugin registered.** `/profile` opened sidekick's pane in both orders, and the skill's word never appeared in the output. `/desk` opened the desk's pane, and the command's word never appeared. sidekick's `command.run` hooks answer `{}` without `next(e)` (read `plugin/hooks/scope/scope.ts:140-155`, `plugin/hooks/desk/desk.ts:257-262`). They do so though the register failed. `paneprobe` answered `/probecmd`, a name it never registered, and the project command did not run:

```text
⎿ paneprobe: PANEPROBE swallowed probecmd
```

**The first-listed plugin's hook decides.** With `paneprobe` first, `/board` answered `⎿ paneprobe+sidekick: PANEPROBE board answer`, and sidekick's hook never ran. With sidekick first, `/board` opened the board's pane, and `paneprobe`'s hook never saw the run. Both lines are from the output with its escape codes stripped (measured). The answer's heading names every plugin hooking the command, as the declarations say (read `:1866`). The plugin listed first also registers first, so these two runs alone cannot say which of the two decides. The `/probecmd` run can: a hook decides with no register at all.

**A hook that passes `next(e)` lets the other command run.** `paneprobe` passed `/probeskill` on, and the project skill's model reply, `PROBESKILLWORD`, showed (measured). `next(e)` resolved to `{"ref":1}`.

**A refused register stops the desk.** The desk registers `/desk` before it starts its clock (read `plugin/hooks/desk/desk.ts:205-209`). So the refusal left it without polling, and its band showed its failure over the prompt:

```text
⚠ desk: could not start: sidekick: $.command.register: "/desk" refused: it is the user's /desk
```

The board sets `isLive` before it registers (read `plugin/hooks/board/board.ts:313-317`), so its line still drew after its refusal (measured).

**The list at `session.start`.** `paneprobe`'s first list, before `next(e)`, already held the four project entries. Each read `source` `user`, with no `plugin`, beside the user's own skills (measured). With `paneprobe` listed first, that list held none of sidekick's commands. With sidekick first, it held `board|plugin|sidekick`, registered by sidekick's `session.start` before it passed the event on. So `session.start` hooks also nest by `--plugin-dir` order (measured). `command.describe` named the project's provider `{"plugin":"project","tier":"user"}`, and sidekick's `{"plugin":"sidekick@inline","tier":"user"}`.

A register resolves before the list shows its name. A list taken straight after five registers held only three of them, and the next list held all five (measured).

**`/clear`.** Each session logged one `session.start` across `/clear`. `classic.SessionStart` fired twice, with `source` `startup`, then `clear` (measured). The registered commands and the open panes stayed.

### Background sessions

`claude --bg` started a transient daemon and printed the session's id. Before any attach, the session's `session.start` fired with `isInteractive` true and surface `terminal` (measured). `$.env` read:

```text
env start CLAUDE_JOB_DIR=/Users/roberto.sousa/.claude/jobs/41952cd3 SIDEKICK_WORKER=<unset> CLAUDE_CODE_SESSION_ATTENDED=<unset> CLAUDE_CODE_NO_FLICKER=<unset>
```

`paneprobe`'s registers succeeded, and `$.command.list()` held no `desk`, `board`, or `profile`, as sidekick's code intends (read `plugin/hooks/desk/desk.ts:206`). Attached at 100 by 40, the command ran with `presentation.isFullscreen` true. Its answer showed in the transcript, and its pane drew inline, `isPlaced` true:

```text
❯ /bgprobe
  ⎿  paneprobe: PANEPROBE bgprobe one line
```

The attach raised no `session.attach` (measured). The declarations say "the terminal's attachment is the REPL's binding and raises nothing" (read `:11243`).

Typing `/desk` there offers a built-in first:

```text
❯ /bgprobe
  ⎿  paneprobe: PANEPROBE bgprobe one line
  ❯ /desktop                                Continue the current session in Claude Desktop
    /sidekick:sk-design                     (sidekick) Designs a change before it is built, as an
```

The first attach pressed Enter on it. The output read `Checking for Claude Desktop… Opening Claude Desktop…`, and the attach fell back to agent view. The daemon's log then marked the session `settled … (done)` (measured). The run's next keys landed in agent view's prompt. There `/board` completed to `/team-onboarding`. The next Enter started a background session on Opus with the prompt `/team-onboarding /profile`. That session drafted a guide inside its own job folder, `~/.claude/jobs/<id>/tmp/`, and wrote nothing to the project folder. A third, empty session also started; its cause was not traced. `claude stop` and `claude rm` removed all three. The second attach typed `/desk`, `/board`, and `/profile` without Enter, and stopped if agent view appeared. In that typeahead, `/board` listed `/team-onboarding` first, and `/profile` listed `/sidekick:sidekick`.

## Commands

```sh
claude plugin validate --strict <paneprobe>
uv run --with pyte python <driver> <spec>
claude --model haiku --debug-file <file> --plugin-dir <paneprobe>
CLAUDE_CODE_NO_FLICKER=0 claude --model haiku --debug-file <file> --plugin-dir <paneprobe> --plugin-dir ./plugin
claude --bg --plugin-dir <paneprobe> --plugin-dir ./plugin --model haiku --debug-file <file>
claude attach <id>
claude agents --json --all
claude logs <id>
claude stop <id>
claude rm <id>
claude daemon status
```

The driver ran each interactive command in its pseudo-terminal, and ended each session when its run ended. The transient daemon exited by itself once its last session was removed, and `claude daemon status` then read `not running`.
