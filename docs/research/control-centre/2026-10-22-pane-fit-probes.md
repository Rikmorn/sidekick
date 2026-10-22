> Research for the `control-centre` design (R9, #232, #235, #238). A subagent ran it on 2026-10-22 for a session with the operator, on Claude Code 2.1.308. It measures five engine facts that plan 10's spec rests on. They are the `rows` ceiling, the keys with the desk's band drawn, focus redraws, exact names in the typeahead, and `immediate`. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: pane room, keys with the band drawn, focus redraws, and mid-turn commands (2026-10-22)

R9's plan 10 makes sidekick's panes say how to reach their hidden rows, and its commands yield names they did not register. #232 asks that every pane row be reachable. #235 asks that the commands yield a name they do not hold, and #238 that they exist in background sessions. The plan's spec names five probes, P1, P2, P3, P5, and P6. This record answers each.

Provenance grades:

- **Measured:** run on 2026-10-22 on Claude Code 2.1.308, with the run and the screen or log line named.
- **Read:** read on 2026-10-22 in the mod API's declarations for 2.1.308, `.cache/claude-code-types/2.1.308.d.ts`, with the line named.
- **Inferred:** reasoned from measured results, as the text says, and not run.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does a 3-row tree opened with `rows: 1000` draw 3 body rows? | Yes, on the main screen at 100 by 40. `scroll.bodyRows` read 27, and the frame held 3 rows | Measured |
| Does it get room when its tree grows to 20? | Yes. After `$.ui.invalidate('ui.render')` the frame held all 20, and `bodyRows` still read 27 | Measured |
| Does a second pane resize the first's block? | The panes share one block. It shows the newer pane under a tab row and fits that pane: 4 body rows for a 3-row tree | Measured |
| In fullscreen, does `rows: 10` keep the board's line and a band row? | It keeps the line and loses the band row, whose `maxRows` fell to 0. `rows: 9` kept both beside a one-row band | Measured at 100 by 40 |
| Does a pane opened with `rows: 10` still scroll? | Yes, once the keys reach it. `bodyRows` read 10, and each ↓ moved it one row | Measured |
| With the band drawn, does the first ctrl+x Tab reach the pane? | Only when the band's tree fits its room. A band taller than its room, hidden or shown, takes the first press; a second reaches the pane | Inferred from seven measured layouts |
| Does the `Pane` hook run again when `isFocused` changes? | Yes, once per change, reading the new value, on both screens | Measured |
| Attached to a background session, does `/desk` list ahead of `/desktop` once registered? | Yes. An interactive session lists it first too | Measured |
| Does a command registered `immediate` open its pane mid-turn? | Yes, at once, while the model thought and while its text streamed. A command without it waited for the turn to end | Measured |

Not tested:

- sizes other than 100 by 40, and 160 by 40 docked;
- a footer without the profile notice, as a profile launch draws it, or a band of more than two rows beside a pane;
- the first pane's block once its tab is shown again;
- whether a band whose tree fits, but holds a `Button` or an `Input`, joins the ctrl+x Tab cycle;
- where the keys go when the pane gives them up. ↓ then raised no `ui.scroll`, and the composer is the likely holder;
- Enter on `/desk` in a background session, never pressed by design;
- `immediate` while a tool call runs;
- what claimed the extra background session that §Exact names first (P5) describes.

## Method

A scratch plugin, `fitprobe`, sat in the session's scratchpad and held one hooks module. Its hooks:

- `/fit <id> <count> [rows=N]` opened pane `<id>` with a tree of `<count>` rows. The first row named `bodyRows` and `isFocused`. `/fitgrow <id> <count>` changed the count and called `$.ui.invalidate('ui.render')`;
- `/fitnow`, registered with `immediate: true`, and `/fitlater`, registered without it, each opened a 3-row pane and logged the time;
- with `FITPROBE_DESK=1`, or in a background session, it registered `desk` and answered it with fixed text;
- with `FITPROBE_BAND=<n>`, its `AbovePrompt` hook added `<n>` rows to the band;
- the `Pane` hook logged every render of its own panes, with a running count. The `AbovePrompt` and `PromptHint` hooks logged `maxRows`, `scroll`, and the rows they held, on each change;
- `ui.scroll`, `ui.focus`, `ui.close`, `classic.UserPromptSubmit`, and `classic.Stop` each logged the event and passed it on.

Every log went to the debug log through `$.ui.log(…, { to: 'debug' })`, and each session ran with `--debug-file`.

Each run started `claude --model haiku` in a Python pseudo-terminal at 100 by 40, in this repository, unless the run says otherwise. The driver dropped the parent session's `CLAUDE*` and `SIDEKICK*` variables, and answered the terminal's queries. It fed the output to `pyte` under `uv run --with pyte`, and dumped the screen at set times. Fullscreen is the default under the user setting `tui: fullscreen`, and `CLAUDE_CODE_NO_FLICKER=0` forced the main screen. `pyte` drops SGR 2, dim, so the driver kept it in a flag of its own. Each session ended with ctrl+c twice, then the end of its process group.

The driver typed a command's name, read the typeahead, and stopped unless the first entry was that name. It then typed the arguments, read again, and only then sent Enter. The 2026-10-21 runs had sent Enter on `/desktop` by mistake (`2026-10-21-pane-and-command-probes.md` §Background sessions).

A run marked `sidekick` loaded `--plugin-dir ./plugin` after `fitprobe`, so `fitprobe`'s hooks saw sidekick's band and line beneath them. The desk's band then held one row, `1 finished` or `2 finished`, from this repository's dispatch records. In the docked run it held two.

The runs:

- **P1, main screen:** `fitprobe` alone. `/fit fa 3 rows=1000`, `/fitgrow fa 20`, `/fit fb 3 rows=1000`, then `/fitgrow fb 20`.
- **P1, fullscreen:** with `sidekick`. `/fit fc 28 rows=10`, then three rounds of ctrl+x Tab and five ↓. One more run, past the brief, used `rows=9`.
- **P2:** fullscreen with `sidekick`. `/fit fd 28 rows=1000`, then the same three rounds. A second set ran four rounds of ctrl+x Tab, a typed `z`, Backspace, and three ↓. It used fullscreen with `rows=1000` and with `rows=9`, and the main screen with `rows=1000`. A docked run at 160 by 40 opened a 50-row tree. A last run, past the brief, used `fitprobe` alone with `FITPROBE_BAND=7` and `rows=8`.
- **P3:** `fitprobe` alone, on each screen. `/fit fe 28 rows=1000`, then ctrl+x Tab twice, three seconds apart.
- **P5:** `claude --bg` with `fitprobe`, then `claude attach <id>`. The driver typed `/desk`, dumped the screen, and cleared the prompt with ctrl+u. An interactive control with `FITPROBE_DESK=1` did the same.
- **P6:** fullscreen, `fitprobe` alone. Each turn asked for a 1,500-word story with no tools. Mid-turn the driver entered `/fitnow`, and in the next turn `/fitlater`. Two more runs entered `/fitnow` later in the turn, one of them once the thinking phase had ended.

## Findings

### The `rows` ceiling (P1)

**On the main screen the frame fits its tree.** At 100 by 40, a 3-row tree opened with `rows: 1000` read `scroll.bodyRows` 27. Its frame held 3 rows:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ FITHEAD fa bodyRows=27 focused=false n=3                                                         │
│ FITROW fa 02                                                                                     │
│ FITROW fa 03                                                                                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

After `/fitgrow fa 20` and the invalidate, the next render read `bodyRows` 27 again, and the frame held all 20 rows (measured). The request capped at 27, the room the 2026-10-21 runs found for `rows: 30` (that record, §Inline panes and the keyboard). Under that cap the frame fits the tree.

**A second pane shares the block.** `/fit fb 3 rows=1000` left both panes open: `$.ui.panes()` read `fa` with `isShown` false and `fb` with `isShown` true. The block shrank from 20 body rows to 4: a tab row naming both, then `fb`'s 3 rows. `fb` read `bodyRows` 26, a row fewer for the tabs:

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│  fa   fb                                                                                         │
│ FITHEAD fb bodyRows=26 focused=false n=3                                                         │
│ FITROW fb 02                                                                                     │
│ FITROW fb 03                                                                                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

Grown to 20, `fb` drew 21 body rows: the tab row and its tree (measured). The declarations give the shape: "one instance per id …, one shown, the rest tabs" (read `:10844-10845`).

**In fullscreen, `rows: 10` keeps the line and loses the band.** With `sidekick` loaded, the band held `1 finished` and read `maxRows` 12 before the open. A 28-row tree opened with `rows: 10` read `bodyRows` 10. The band's `maxRows` fell to 0, and its row left the screen. The board's line stayed on the last row:

```text
│ FITROW fc 09                                                                                     │
│ FITROW fc 10                                                                                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

────────────────────────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ sidekick: no profile settings in this session
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
  ▣ Rikmorn/sidekick · board #2 · ▲ drift · 2 unpushed · R9 — Control centre · 12:02
```

The bottom slot ran 20 rows: the frame's 12, a gap row, the prompt's 3, and a footer of 4. The declarations cap that slot at half the terminal, the prompt included (read `:10809`). This footer held the profile notice, the model, the mode, and the board's line.

`rows: 9`, a run past the brief, kept both. `bodyRows` read 9, the band's `maxRows` read 1, and its row drew between the frame and the prompt:

```text
│ FITROW fg 09                                                                                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
1 finished                                                                                      [-]

────────────────────────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ sidekick: no profile settings in this session
  Haiku 5.5 │ sidekick
  ⏵⏵ auto mode on (shift+tab to cycle)
  ▣ Rikmorn/sidekick · board #2 · ▲ drift · 2 unpushed · R9 — Control centre · 12:04
```

With `rows: 1000` the body read 11, as the 2026-10-21 runs found. The band's row and the board's line both left the screen (measured, P2's first run).

So in this layout the pane's frame and the band share the 12 rows the band read before the open. A pane takes its rows plus two for its frame, and the band keeps what is left. The board's line goes once the frame alone needs more than 12. That rule is inferred from three opens, at one size with one footer. A profile launch should draw no profile notice, which would leave a row more (inferred from the notice's wording).

### Keys with the band drawn (P2)

**A band taller than its room takes the first ctrl+x Tab.** In fullscreen with `rows: 1000`, the open left the band `maxRows` 0 with a one-row tree. The first ctrl+x Tab gave the band the keys, though it drew nothing. Each of five ↓ then raised a `ui.scroll` on the band, and nothing on screen moved:

```text
ui.scroll e={"component":"AbovePrompt","requestId":"above-prompt","offset":1,"by":1,"bodyRows":0,"contentRows":1,"origin":{"kind":"person"}}
```

The second ctrl+x Tab gave the pane the keys: its next render read `isFocused` true, and five ↓ moved it to offset 5. The third took the keys from the pane, and ↓ then raised no `ui.scroll`. The `rows: 10` run gave the same three steps (measured, both runs).

**A band whose tree fits is skipped.** Where the band showed its tree whole, the first ctrl+x Tab reached the pane (measured):

| Layout | The band's rows in its room | First ctrl+x Tab |
|---|---|---|
| Fullscreen, 100 by 40, `rows: 1000` | 1 in 0 | the band |
| Fullscreen, 100 by 40, `rows: 10` | 1 in 0 | the band |
| Fullscreen, 100 by 40, `rows: 8`, `fitprobe`'s 7 band rows | 7 in 4, with `↓ 4 more` drawn | the band, and ↓ scrolled it |
| Fullscreen, 100 by 40, `rows: 9` | 1 in 1 | the pane |
| Main screen, 100 by 40, `rows: 1000` | 1 in 40 | the pane |
| Fullscreen, 160 by 40, docked | 2 in 12 | the pane |
| Either screen, `fitprobe` alone | no tree | the pane |

Where the band took the first press, a second ctrl+x Tab reached the pane. In the 7-row band, ↓ scrolled the band from `FITBAND 1` to `FITBAND 5` first. So the band joins the cycle ahead of the pane only when its tree overflows its room (inferred from these seven layouts). The declarations say a focused band scrolls "a tree taller than it" (read `:10790-10792`). They do not give the cycle's order.

**The band shows no focus.** In the overflow run, its first row and its `[-]` mark kept their colours, bold, reverse, and dim across the press (measured, `pyte` with dim kept). A hidden band draws nothing at all. So a first ctrl+x Tab that lands on the band changes nothing a person can see.

**A typed letter hands the keys back.** While the pane held the keys, a typed `z` dimmed its frame and landed in the prompt. The pane's next render read `isFocused` false (measured, eight presses across two runs).

So a fullscreen pane that fills its room, beside a band whose room the pane fills, needs two presses. Every other layout measured needs one.

### Focus re-renders (P3)

**The `Pane` hook runs again on each change.** With `fitprobe` alone and a 28-row tree, the hook ran once at the open, reading `isFocused` false. It ran again at the first ctrl+x Tab, reading true, and at the second, reading false. No other render ran between them (measured, both screens). On the main screen:

```text
render fe seq=1 placement=inline bodyColumns=96 bodyRows=27 offset=0 focused=false n=28
render fe seq=2 placement=inline bodyColumns=96 bodyRows=27 offset=0 focused=true n=28
render fe seq=3 placement=inline bodyColumns=96 bodyRows=27 offset=0 focused=false n=28
```

Every P2 run showed the same. Each focus change drew one render with the new value, and each ↓ while focused drew one with the new `scroll.offset`.

### Exact names first (P5)

**A registered `desk` lists first.** In a `claude --bg` session, `fitprobe`'s `session.start` read `CLAUDE_JOB_DIR` set, and its register returned `{"command":"desk"}`. `$.command.list()` then held `desk` from `fitprobe` and the built-in `desktop` (measured). Attached at 100 by 40, typing `/desk` without Enter drew:

```text
  ❯ /desk                                   fitprobe desk
    /desktop                                Continue the current session in Claude Desktop
    /sidekick:sk-design                     (sidekick) Designs a change before it is built, as an
```

An interactive session with `FITPROBE_DESK=1` drew the same three entries in the same order (measured). Both times the driver cleared the prompt and pressed no Enter.

**An extra background session started during the attach.** The daemon's log read `bg claimed-spare f4b00109 (spare)` at 11:13:09 UTC, while the driver typed `/desk`. That session ran Opus 5.5 at xhigh effort in this repository, and its output held only the welcome header. `claude agents --json --all` did not list it. `claude daemon status` named one worker running, which held the transient daemon open. `claude stop` and `claude rm` removed it, and the daemon exited 5 seconds later (measured). The 2026-10-21 runs also saw an empty extra session (that record, §Background sessions). Its cause is not traced here either.

### `immediate` (P6)

**A command registered `immediate` runs at once.** `/fitnow` ran as soon as it was entered, three times, and its pane drew while the turn went on. `/fitlater`, registered without the flag, showed as queued and ran when the turn ended (measured):

| Command | Entered | `command.run` | `classic.Stop` | The turn then |
|---|---|---|---|---|
| `/fitnow` | 7.1 s into the turn | 11:04:44.659 | 11:05:16.735 | thinking |
| `/fitnow` | 16.1 s in | 11:17:56.663 | 11:18:15.414 | thinking |
| `/fitnow` | 22.4 s in | 11:19:29.633 | 11:19:36.359 | streaming the story's text |
| `/fitlater` | while the text streamed | 11:05:58.681 | 11:05:58.341 | streaming the story's text |

The seconds count from `classic.UserPromptSubmit`. The pane opened within 15 ms of each `/fitnow` run. In the first run it drew under the spinner:

```text
✻ Hyperspacing… (8s · thinking)
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│ FITHEAD fitnow bodyRows=11 focused=false n=3                                                     │
│ FITROW fitnow 02                                                                                 │
│ FITROW fitnow 03                                                                                 │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

`/fitlater` waited in the prompt, which read `Press up to edit queued messages`, with `ctrl+enter to send now` under the queued command. It ran 0.34 s after `classic.Stop`. The declarations say such a command, "typed while a turn is in flight runs at once" (read `:1937`).

### The declarations, 2.1.306 to 2.1.308

The 2026-10-21 record read 2.1.306's declarations. A `diff` against 2.1.308's shows no change to `rows`, `Pane`, `AbovePrompt`, `immediate`, or `command.register` (read). The `columns` request gained a ceiling, 45% of the terminal's columns, and a floor of 24 (read `:7647-7649`). A `Markdown` leaf gained `part`, and `tool.check` replaced `decider` with `approver` and `plugin`.

## Commands

```sh
claude plugin validate <fitprobe>
uv run --with pyte python <driver> <spec>
claude --model haiku --debug-file <file> --plugin-dir <fitprobe>
CLAUDE_CODE_NO_FLICKER=0 claude --model haiku --debug-file <file> --plugin-dir <fitprobe>
claude --model haiku --debug-file <file> --plugin-dir <fitprobe> --plugin-dir ./plugin
claude --bg --plugin-dir <fitprobe> --model haiku --debug-file <file>
claude attach <id>
claude agents --json --all
claude logs <id>
claude stop <id>
claude rm <id>
claude daemon status
```

The driver ran each interactive command in its pseudo-terminal, and ended each session when its run ended. After the last removal, `claude daemon status` read `not running`.
