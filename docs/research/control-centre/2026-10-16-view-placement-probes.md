Amended 2026-10-16: [2026-10-16-terminal-ui-practice.md](./2026-10-16-terminal-ui-practice.md) finds that the "main screen" replay was most likely fullscreen output, since a background host docks panes. Rows under the prompt are measured in fullscreen only.

> Research for the `control-centre` design (R9, #233 and #239, with #232 inheriting its placement). Claude ran it on 2026-10-16 in a session with the operator, on Claude Code 2.1.301. It records where a mod's rows draw in each layout the operator uses. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: where a mod's views draw (2026-10-16)

The operator asked for the board's state as one line, and for the desk's summary under the prompt or in the side panel. The mod API names four places near the prompt. They are the band above it, the hint line under it, the footer's labels, and a plugin's status line. This report measures where each draws, and whether a mod can draw more than one row under the prompt.

Provenance grades:

- **Measured:** run on 2026-10-16, with the command and the screen named.
- **Read:** read on 2026-10-16 in the mod API's declarations for 2.1.301, `.cache/claude-code-types/current.d.ts`, with the line named.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Can a mod draw several rows under the prompt? | Yes. A `ui.render` hook on `PromptHint` that returns a column of the engine's hint line and three rows of its own drew all four, the engine's line first | Measured |
| Do rows under the prompt narrow when a pane docks? | No. With a pane docked at 160 columns, everything under the prompt kept the terminal's full width. That is the status line, the footer label, the hint line, and the mod's rows. The band above the prompt narrowed to the transcript's column | Measured |
| Does the fullscreen layout draw them the same way? | Yes, at 110 and 160 columns, attached | Measured |
| What size is a docked pane at 160 columns? | `placement` `dock`, `bodyColumns` 71, `scroll.bodyRows` 29, in a 40-row terminal | Measured |
| How does a plugin's status line read? | `⚠ <plugin>: <text>`, one per plugin, directly above the custom status line. The 2026-10-15 probe measured the same | Measured; read at `:2500-2510` |
| Where does a `SessionMode` label draw? | At the right end of the custom status line's row | Measured |
| Can the person focus an inline pane? | The declarations say a pane is "keyed by the person (ctrl+x tab, Esc)". While focused, the arrows scroll it | Read at `:10727` and `:10742` |
| Can the hint line hold a tree? | "A hook rewrites `hint` …, sets `tail` …, or draws its own tree". The terminal draws `tail` dim, cut where the row ends | Read at `:10625-10663` |

Not tested:

- the rows while a dialog or a permission prompt holds the prompt, or while the model works;
- terminals narrower than 110 columns;
- the desktop surface.

The declarations cap fullscreen's bottom slot at half the terminal's rows, prompt included (`:10688`). Whether the rows under the prompt count against that cap was not tested.

## Method

A scratch plugin, `hintprobe`, held one hooks module. Its `ui.render` hooks drew:

- on `PromptHint`, a `Box` column of `await next(e)` and three `Text` rows, `HINTROW1` to `HINTROW3`;
- on `SessionMode`, the engine's `modes` with `MODELABEL R9 ● on track` appended;
- on `AbovePrompt`, an `ABOVEROW` line above `await next(e)`.

Its `session.start` hook called `$.ui.status('STATUSROW probe')`. A second run also opened a pane, `deskprobe`, that printed its own `placement`, `bodyColumns`, and `scroll.bodyRows`.

Each run was a background session in this repository: `claude --bg --model haiku --plugin-dir <scratch>/hintprobe -n hintprobe "Reply with the single word ok."`. The scratch folder itself was untrusted, so the session ran from the repository. Its user-level install of sidekick 0.5.1 carries no mods.

- **Main screen, 200 columns:** `claude logs <id>`, replayed through `pyte` at 200 by 60.
- **Fullscreen, attached:** `claude attach <id>` in a Python pseudo-terminal sized 110 by 40, then 160 by 40, read for 8 seconds and replayed through `pyte`.

Both sessions were then stopped and removed with `claude stop` and `claude rm`.

## Screens

Fullscreen, 110 columns, the last rows:

```text
ABOVEROW Rikmorn/sidekick · board sidekick · ● on track                                                   [-]

────────────────────────────────────────────────────────────────────────────────────────────────── hintprobe ─
❯
──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ hintprobe: STATUSROW probe
  Haiku 5.5 │ sidekick ░░░░░░░░░░ 8%                                                 MODELABEL R9 ● on track
  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
  HINTROW1 ✓ p8-band finished · Board band and scope mod · 15:12
  HINTROW2 ◆ p9-view working · The board state line · 2m
  HINTROW3 ● needs you: sidekick-88 · permission prompt
```

Fullscreen, 160 columns, with the pane docked at the right. The pane's column starts after the `│`. The rows under the prompt run the full width:

```text
ABOVEROW Rikmorn/sidekick · board sidekick · ● on track                             [-] │
                                                                                        │
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── hintprobe2 ─
❯
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚠ hintprobe: STATUSROW probe
  Haiku 5.5 │ sidekick ░░░░░░░░░░ 8%                                                                                                   MODELABEL R9 ● on track
  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
  HINTROW1 ✓ p8-band finished · Board band and scope mod · 15:12
  HINTROW2 ◆ p9-view working · The board state line · 2m
  HINTROW3 ● needs you: sidekick-88 · permission prompt
```

The pane drew `PANEROW placement=dock bodyColumns=71 bodyRows=29` at its top. The main screen at 200 columns drew the same rows in the same order as the 110-column screen.
