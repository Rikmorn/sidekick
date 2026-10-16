> Research for the `control-centre` design (R9, #233 and #239), and for the usage guide (#240). On Claude Code 2.1.301, Claude ran it on 2026-10-16 in a session with the operator. Three subagents searched the web, the mod API's declarations, and Claude Code's docs. Claude re-read the claims the design leans on. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Glance views in a terminal: practice, prior art, and Claude Code's surface (2026-10-16)

The board's state line (#233) and the desk's summary (#239) are glance views. Each is a line or a few rows that answer "do I need to look?", with the detail one key away. The design weighed where they draw among the places the mod API offers near the prompt, but it had not searched documented practice. This report adds three things:

- published guidance on small status displays in a terminal;
- how about 30 other tools show many agent sessions, and a project's health;
- an inventory of Claude Code's own elements near the prompt, and how a mod's views meet them.

Provenance grades:

- **Read:** read on 2026-10-16 in the mod API's declarations for 2.1.301, `.cache/claude-code-types/current.d.ts`, with the line named.
- **Documented:** an official page under `https://code.claude.com/docs/en/`, fetched on 2026-10-16, named by its path.
- **Measured:** measured in an earlier record in this folder, named.
- **Checked:** run on 2026-10-16 with the tool named.
- **Sourced:** a web source fetched on 2026-10-16 and linked. **Consensus** marks a practice that two or more independent sources state.
- **Inferred:** no source states it; the basis is named.

## Summary

| # | Finding | Bearing on the views | Grade |
|---|---|---|---|
| 1 | Never carry state by colour alone. Use colour, a glyph, and a word together | Every state carries a word, and the line reads in monochrome | Consensus: WCAG 1.4.1, Primer, Carbon, Claude Code's screen-reader mode |
| 2 | Colours named by theme key follow the person's theme, the colour-blind and ANSI presets included. Raw names and hex values do not | Use `success`, `warning`, `error`, and `inactive` | Read `:1716`, `:13224-13229` |
| 3 | At narrow widths, tools drop whole low-priority segments first, then cut free text with a marker. None cuts a state or an identifier | Rank the board line's segments. Never cut the state, an issue number, or a count | Consensus: powerlevel10k, lualine, tmux, Gemini CLI, Carbon |
| 4 | Attention first: waiting sessions sort or group to the top, or are the only ones listed | Matches the design's order | Sourced: Claude Code's agent view, Codex, Nimbalyst, workmux, agent-deck |
| 5 | A needs-you row says why: a permission, a question, a plan to approve | Matches `● <name> · <reason>` | Sourced: opencode, Conductor, agent view. cmux #4506 complains of an alert naming neither session nor reason |
| 6 | Reading an idle session as one that needs input is the most common complaint | Supports `◇ idle since`, never "needs you", for an idle session | Sourced: cmux #14308. Measured: `idle_prompt` fires 60–70 s after every turn (desk probes) |
| 7 | "Finished, not yet seen" is its own state in ten products. Focusing the session clears it | The desk's `✓ done` row has no exit but its time window. Whether "seen" is observable is open | Sourced. Measured: attach raises no event (desk probes) |
| 8 | Counts lead so they survive truncation, and names overflow into `+N more` | Matches the four-row cap. An overflow hiding a needs-you row says so | Sourced: Morony's tmux bar, agent view, Warp, workmux, claude-hud |
| 9 | Keep the channel always present and its content exception-led. A quiet "ok" with its age, and "stale" and "unknown" as states of their own | The board line stays, and says good in a word | Consensus by synthesis: the dark cockpit, SRE dashboards, Prometheus's Watchdog |
| 10 | No health tool folds a declared status and a derived one as worst-of. Linear overlays freshness on the declared status, and downgrades only a stale "On track" | S3 has no direct precedent. Its derived half needs few false positives, or the line flaps | Sourced: Linear, GitHub, Statuspage, Asana |
| 11 | Claude Code already draws a list under the prompt: the subagent panel. No mod slot sits with it or with the task list | Rows under the prompt share that space with a native panel, in an unmeasured order | Documented `sub-agents`. Read `:9771` |
| 12 | The 2026-10-16 "main screen" replay was most likely fullscreen output | Rows under the prompt are unmeasured in the classic layout | Inferred, §The view-placement record's main screen |
| 13 | Most of the design's glyphs are of ambiguous East Asian width, like Claude Code's own `·`, `←`, and borders. `↗`, `✖`, `⚠`, and `✔` can also draw as emoji | The ambiguous-width risk is the host's own. The emoji-capable glyphs are avoidable | Checked: Python's `unicodedata` 14.0. Sourced: UAX #11 |
| 14 | The declarations draw `Link` as an OSC 8 span. The docs gallery draws the URL as text after the label | A one-line board may lose about 45 cells to the URL | Read `:5778`. Documented `plugins/mods/gallery#link` |
| 15 | Status lines that poll in every session multiplied CPU and API cost as sessions multiplied | The desk polls every 10 s in every interactive session | Sourced: ccstatusline #397, claude-hud #333. Read `plugin/hooks/desk/desk.ts:208-213` |

## Claude Code's surface near the prompt

The screen order under the transcript, as measured in a background host in fullscreen. A `?` marks a position no record has measured.

```text
 … transcript …                                         │ docked panes (fullscreen, ≥110 columns)
 spinner line and tips, while a turn runs           ?   │   sidekick's panes, the /diff panel
 task list (ctrl+t), "the status area"              ?   │
 AbovePrompt band: mods, surveys, "You should know"     │
──────────────────────────────────────────────────────  │
❯ prompt  (dialogs and the permission prompt take this area ?)
──────────────────────────────────────────────────────────
  ⚠ <plugin>: <text>                 ($.ui.status, one per plugin)
  <custom statusLine row>                  <SessionMode labels>
  ⏵⏵ <mode> (shift+tab to cycle) · ← for agents   (the engine's PromptHint line)
  <a mod's PromptHint rows>
  subagent and forks panel, "below the prompt input"        ?
  slash and @ menu                                          ?
```

| Element | When it shows | A mod's access | Grade |
|---|---|---|---|
| Task list | Ctrl+T toggles it; up to five tasks; only with the task tools on. The operator's settings turn them on | None | Documented `interactive-mode#task-list`. Read `:9771` |
| Subagent and forks panel | While background subagents or forks run, one row each. A finished one leaves at once, and a failed one stays 30 s. ↑, ↓, Enter, and `x` act on rows | None. The `subagentStatusLine` settings command restyles row bodies | Documented `sub-agents`, `statusline#subagent-status-lines` |
| Band above the prompt | Always there, empty until a mod draws. Ctrl+X Ctrl+A collapses it. A survey takes it over | `AbovePrompt`: a tree with `maxRows`, scrolling, and an `n more` row | Read `:10665-10721`. Measured (view-placement probes) |
| `⚠` status row | From `$.ui.status` until cleared, one per plugin | Text only, behind a fixed `⚠ <plugin>:` | Read `:2500-2510`. Measured (mod-foundation probes) |
| Custom status line | Once its command exits 0. It "temporarily hides during … the help menu and permission prompts" | None: the operator's command | Documented `statusline` |
| Footer labels | Right end of the status line's row, while any label is set | `SessionMode`: rewrite `modes`, or draw a tree | Read `:10609-10623`. Measured (view-placement probes) |
| Engine hint line | Always; its text follows the mode, a draft, and a running turn | `PromptHint`: `tail`, a rewrite, or a tree keeping the engine's line | Read `:10624-10664` |
| `← for agents` | In the hint line. It counts sessions waiting on the operator about every 10 s, and flashes `← N done` | Inside `hint`; the engine's own | Documented `agent-view` |
| Toasts | Fullscreen: a stack over the transcript's top right. Classic: one line on the status line's row. 4 s by default | `$.ui.toast`, text only. A pane opened with `holdToasts` holds them | Read `:2465-2480`, `:7588-7597` |
| Notification row | Fullscreen: a row of its own. Classic: the right of the status line's row, where it "may truncate your status line output" | Through `$.ui.toast` | Documented `statusline#notifications-share-the-status-line-row` |
| Panes | Docked beside the transcript in fullscreen from 110 columns, inline above the prompt otherwise. One shows, the rest are tabs | `Pane` | Read `:10722-10777`. Measured (desk probes) |
| Diff panel | Docks in fullscreen, and opens by itself at 144 columns or wider once Claude edits | Shares the dock | Documented `interactive-mode#diff-panel` |
| Permission prompt | A tool call awaiting approval | `$.ui.notice` adds one line under it | Read `:2368-2379` |
| Agent view | A separate screen, on demand (`←` on an empty prompt) | None: its process loads no mod | Measured (desk probes) |
| Terminal tab status | Interactive sessions in terminals that read OSC 7501 | None | Documented `terminal-config#see-session-status-in-your-terminal` |

### A mod's views in each state

| State | `PromptHint` rows | `AbovePrompt` band | `SessionMode` labels | Pane |
|---|---|---|---|---|
| Model working | Re-run with `isWorking: true`; drawn or not is unmeasured | Re-run with `isWorking`; unmeasured | Unmeasured | No prop |
| Draft typed | Re-run with `isDraft: true`; unmeasured | A `focus` request is refused while text is typed (read `:7567-7573`) | Unmeasured | Opens without the keyboard |
| Permission prompt | Unmeasured; the custom status line hides (documented) | Not drawn (measured, desk probes) | Unmeasured | Not drawn (measured, desk probes) |
| Survey | Unaffected, unverified | The survey holds it; a hook yields (read `:10677`) | Unaffected, unverified | Unaffected, unverified |
| Slash menu open | Unmeasured | Unmeasured | Unmeasured | Unmeasured |

A hook's last answer stays on screen until a new one lands (read `:10632-10633`). A slow hook therefore shows stale rows rather than none.

### Colour, keys, redraws, and notifications

- **Colour.** `Color` is a `ThemeKey` or any string (read `:1716`). A tree naming a key "follows the person's theme" (read `:13226`). The presets include `dark-daltonized`, `light-daltonized`, `dark-ansi`, and `light-ansi` (documented `settings-reference#theme`). Neither `NO_COLOR` nor reduced motion appears in the declarations (checked: `grep`). `NO_COLOR` reaches Claude Code's own interface only when the shell sets it (documented `settings-reference`).
- **Keys.** Only a pane and the band take focus: `UiFocusComponent` is `'Pane' | 'AbovePrompt'` (read `:14538`). A mod cannot add a keybinding. It gets slash commands, a `Button` hotkey live while its band or pane has focus, and `Button.action`, which borrows an engine action's chord (read `:1114-1130`). A bare digit in an empty prompt presses a band `Button`, as surveys and "You should know" notes use 1, 2, and 0 (read `:1114-1121`).
- **Redraws.** A render hook runs on new props, a width change, `$.ui.invalidate`, or a `$.state` write it read (read `:4071-4079`). `$.ui.invalidate('ui.render')` redraws every site the plugin draws (read `:2381-2382`), so a desk refresh re-runs the board's, the gauge's, and the scope mod's hooks too. `PromptHint` re-runs whenever the hint text changes, so its hook draws from held values only.
- **Notifications.** `$.ui.notify` writes through `preferredNotifChannel` and runs the person's `Notification` hooks first, as `plugin_notification` (read `:2482-2498`). Claude Code itself notifies on `permission_prompt` and `idle_prompt` "only when you appear to be away" (documented `hooks#notification`).

## Documented practice

### Content and order

Keep a status line to few, short segments, and put the global and important ones on the left (consensus). VS Code's [status bar guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar) say "Limit the number of items added" and place primary items on the left. powerlevel10k's shipped config fills the left prompt "with the most important segments", and hides the right one when the input reaches it. Eye-tracking backs the left bias: the first words on a line [draw the most fixations](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/).

Keep every segment in its place. Matthews, Forlizzi, and Rohrbach's [design principles](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2006/EECS-2006-113.pdf) warn that moving an element "causes disorientation". [web.dev](https://web.dev/articles/cls) documents the harm of layout shift. Pad a value that changes, such as an age or a count, to a fixed width, as vim's `minwid` and tmux's `p` modifier do.

### State: colour, glyph, and word

Colour may enhance a state but never carry it alone (consensus). WCAG 2.2 [SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) covers monochrome displays and limited colour vision. [Primer's CLI guide](https://primer.style/native/cli) says "Only use color to enhance meaning". [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/) asks for at least two of colour, shape, and symbol, with a label beside each icon. Claude Code's screen-reader mode promises "No color-only cues" (documented `accessibility`). Codex's command centre draws Needs input and Working with the same `●`, told apart by colour alone, and k9s drew a [complaint](https://github.com/derailed/k9s/issues/3955) for the same thing.

Theme colours differ, and some are unreadable on some backgrounds. [Two](https://blog.xoria.org/terminal-colors/) [sources](https://github.com/akinomyoga/ble.sh/issues/478) find bright yellow unreadable on light themes, and dark blue near-invisible on dark ones. For a mod, the theme keys settle this: `success`, `warning`, `error`, and `inactive` follow the person's theme.

Glyph width is the second hazard. [UAX #11](https://www.unicode.org/reports/tr11/) leaves "ambiguous" characters to context, and iTerm2, WezTerm, and GNOME Terminal let the person draw them two cells wide. Emoji-capable code points can draw two cells wide in any terminal that picks the emoji form.

| Glyph | Width class | Emoji-capable | Who uses it |
|---|---|---|---|
| `●` `○` `▲` `◆` `◇` `▣` | Ambiguous | No | The design |
| `·` `←` `│` `─` `…` | Ambiguous | No | Claude Code's own hint line and borders |
| `↗` | Ambiguous | Yes | The design's link mark |
| `✖` `⚠` `✔` | Neutral | Yes | `⚠` is the fixed `$.ui.status` prefix |
| `✓` `✗` `◉` `▸` `❯` `⏵` | Neutral | No | `❯` and `⏵` are Claude Code's |

Checked with Python's `unicodedata` 14.0 for the width class. The emoji column is from the Unicode 18 data the research subagent checked. Inferred: a terminal set to draw ambiguous characters wide breaks Claude Code's own borders first, so the design's ambiguous glyphs add little risk. The emoji-capable ones add a risk the host does not carry.

### Narrow widths

Two mechanisms coexist (consensus). Low-priority segments drop whole: powerlevel10k's right prompt, lualine's per-component `hide_width`, Gemini CLI's footer behind one `…`. Free text shortens with a marker: tmux's `#{=N:…}`, vim's `%<`, starship's `truncation_symbol`. No tool surveyed shortens a state indicator. powerlevel10k cuts a long branch name in the middle, keeping the first and last 12 characters, so a trailing ticket number survives. [Carbon](https://carbondesignsystem.com/patterns/overflow-content/) ties the cut to where strings differ, and never truncates labels or notifications.

### Time and staleness

Show "how long ago" as a relative age, and a record's time as a clock time, with both within reach (consensus, with a disputed default). [Cloudscape](https://cloudscape.design/patterns/general/timestamps/) recommends relative ages "for most use cases". [GitLab](https://design.gitlab.com/content/date-and-time) defaults to absolute times. GitHub's [`relative-time`](https://github.com/github/relative-time-element) switches at 30 days.

A relative age drawn once and never redrawn turns false, while a clock time stays true (inferred). claude-hud chose a clock time for that reason: "the status line doesn't repaint between turns". The board has no redraw tick, and the desk redraws every 10 s.

Give "stale" a state of its own rather than letting an age grow quietly. Cloudscape keeps data [visible during a refresh](https://cloudscape.design/patterns/general/loading-and-refreshing/), stamps it once refreshed, and warns when a refresh fails. No design system found sets a staleness threshold.

Draw no continuous animation in a view that is always on screen. [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) asks for a way to stop content that moves for more than five seconds. Peripheral-display research finds that continuous motion distracts, and that gradual change hides itself.

### A heartbeat, or exceptions only

The sources split the channel from its content. The aircraft "[dark cockpit](https://ntrs.nasa.gov/citations/19910001626)" shows nothing when all is normal, but only inside a panel that is always there. The [SRE book](https://sre.google/sre-book/monitoring-distributed-systems/) keeps a dashboard for minor problems and pages only for urgent ones. Prometheus's [Watchdog](https://runbooks.prometheus-operator.dev/runbooks/general/watchdog/) alert always fires, so a dead pipeline shows as silence. Amber Case's [calm technology](https://calmtech.com/) principles add "work even when it fails".

Inferred from these: keep the glance's place fixed, say "ok" quietly with its age, and make "stale" and "unknown" visible states. Peripheral-display research supports the split of glyph and text. In a [lab study](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2007/EECS-2007-56.pdf), coloured squares were read from the edge of vision in 80% of views and text in 1%. Text still suits open-ended sets, such as session names.

### Interrupting, or passive

Carry state in a passive indicator, and interrupt once, on a transition that needs action (consensus). [VS Code](https://code.visualstudio.com/api/ux-guidelines/notifications), [Apple](https://developer.apple.com/design/human-interface-guidelines/notifications), and [GNOME](https://developer.gnome.org/hig/patterns/feedback/notifications.html) all say never repeat a notification, and withdraw one that no longer applies. A peer-reviewed [study of clinicians](https://pmc.ncbi.nlm.nih.gov/articles/PMC5387195/) found acceptance fell 30% for each extra reminder per encounter.

Claude Code already notifies when a session finishes or needs permission and its person seems away (documented `terminal-config`). Inferred: a sidekick notification for another session's need would repeat that one, unless it adds something.

### Links

OSC 8 links work in iTerm2, Ghostty, WezTerm, kitty, Alacritty, VS Code's terminal, and tmux from 3.4 with its `hyperlinks` feature on ([adoption list](https://github.com/Alhadis/OSC8-Adoption)). macOS Terminal.app support is unconfirmed. No terminal reports support, so the label must make sense without the link ([egmont's spec](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)). Link the board's name itself rather than adding a mark, and show the URL as text in the pane.

## Prior art

### Session views

| Pattern | Products | Bearing |
|---|---|---|
| Attention first | Agent view and Codex group needs-you on top; workmux and tmux-claude-hatch sort it first; agent-deck's tmux bar lists only waiting sessions | The design's order matches. workmux's `window` sort and a cmux commenter keep rows still instead |
| Needs-you with a reason | opencode `!` and `?`; Conductor's icons; agent view puts the question in the row | Matches |
| Done, not yet seen | Crystal, Nimbalyst, Conductor, Sculptor, cmux, workmux, Warp, opencode, Amp, Morony | The desk lacks it |
| Counts lead, names overflow | Morony's `✅+K`; Codex's count chips; agent view's `… N more`; Warp's three lines then `+ N more` | A one-row fold such as `●1 ◆1 ✓1` has precedent |
| Time since the last change | workmux; agent view's `waiting 3m`; Nimbalyst ranks by time waiting | Most products show no time, and cmux users ask for it (#10066) |
| Quiet when nothing needs you | agent-deck; Nimbalyst's menu bar; claude-hud's activity lines | Supports rows that show only while there is something to say |
| Notify only when not looking | Codex `unfocused`; Warp in the background; cmux suppresses alerts while you look | Outside these views, which show and do not act |
| Children roll up into the parent | Codex takes the most urgent state of a root and its subagents; Warp and opencode keep child agents out of alerts | A worker's needs-you earns its own row; its routine finish needs no alert |

Sources: [agent view](https://code.claude.com/docs/en/agent-view), [Codex's view code](https://github.com/openai/codex/blob/HEAD/codex-rs/tui/src/app/agents_overview_view.rs), [opencode's tabs](https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/component/session-tabs.tsx), [Conductor's changelog](https://www.conductor.build/changelog/0.39.0-insta-summarize-command-palette-opus-4-6), [Nimbalyst](https://nimbalyst.com/docs/session-management/agent-window-and-session-management/), [Warp](https://docs.warp.dev/terminal/windows/vertical-tabs), [workmux](https://workmux.raine.dev/guide/sidebar/), [agent-deck](https://github.com/asheshgoplani/agent-deck), [cmux](https://github.com/manaflow-ai/cmux), [Morony's status bar](https://www.joshmorony.com/workflows/handoff-claude-code-tmux-status-indicator.md), [claude-hud](https://github.com/jarrodwatts/claude-hud).

Anti-patterns, each from two or more products or a cited complaint:

- **Idle read as needs-input.** cmux mapped `idle_prompt` to Needs input ([#14308](https://github.com/manaflow-ai/cmux/issues/14308)), and Vibe Kanban defines Idle as "Waiting for input".
- **Stale state shown as live.** cmux ([#20874](https://github.com/manaflow-ai/cmux/issues/20874)) and agent-deck ([#2502](https://github.com/asheshgoplani/agent-deck/issues/2502)). The remedy is a freshness marker, as workmux's "stale" state is.
- **Every session repeating the same work.** ccstatusline ([#397](https://github.com/sirmalloc/ccstatusline/issues/397)), claude-powerline ([#12](https://github.com/Owloops/claude-powerline/issues/12)), and claude-hud ([#333](https://github.com/jarrodwatts/claude-hud/issues/333)) multiplied CPU or API calls per open session.
- **Guessing the width.** claude-hud's fallback width flickered ([#581](https://github.com/jarrodwatts/claude-hud/issues/581)).
- **Chrome crowding content.** Amp [removed its terminal sidebar](https://ampcode.com/news/so-long-tui-sidebar) on 2026-08-27, calling a layer over the terminal "a less-than-optimal user experience".

### Project health

| Product | States | Declared or derived | Freshness shown |
|---|---|---|---|
| GitHub Projects | On track, at risk, off track, complete, inactive | Declared | None documented |
| Linear | On track, at risk, off track; grey "No current update" | Declared, with derived staleness | A dashed outline, then grey, then "Update Missing", only after an "On track" |
| Asana | On track, at risk, off track, on hold, complete, dropped | Declared | "No recent updates", per an unofficial forum report |
| Statuspage | Operational to major outage | Derived components, manual incidents | A "blend", not worst-of |

Sources: [GitHub](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/sharing-project-updates), [Linear](https://linear.app/docs/initiative-and-project-updates), [Asana](https://developers.asana.com/docs/status-update), [Statuspage](https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations).

Each half of S3 has precedent, but the worst-of fold has none. Declared-only health invites "[watermelon](https://barryoreilly.com/why-we-carry-watermelons/)" reporting, green outside and red within. Derived-only health invites "false positives … and flapping", in [Statuspage's words](https://support.atlassian.com/statuspage/docs/know-when-to-automate-your-status-page/). Every tool with a no-data state shows it, which supports `○ unknown`.

## Interaction hazards

1. **The space under the prompt is shared.** The subagent panel appears whenever a background subagent or fork runs, the default in an interactive session. Its order against `PromptHint` rows is unmeasured. Fullscreen caps the bottom slot at half the terminal's rows, the prompt's included (read `:10688`).
2. **Another mod can hide sidekick's rows.** At `PromptHint` and `AbovePrompt`, a tree that omits `next(e)` replaces the mods after it (documented `plugins/mods/interface#pick-where-to-draw`). A research subagent read the bundled `plugin-authoring` skill's band example (`examples/band.tsx:38-59`) as omitting it, so copies of it would too. Claude did not re-read it.
3. **A dialog hides the signal.** The band and panes go undrawn under a permission prompt (measured, desk probes). A row about another session's need vanishes while this session's own dialog is up.
4. **Digit hotkeys collide in the band.** Surveys and "You should know" answer to 1, 2, and 0, and "the later wins" (read `:1114-1121`).
5. **Toasts are lossy.** A `holdToasts` pane holds every toast, and one up as the pane opens may end unseen (read `:7588-7597`). A toast cannot be the only place a finish shows.
6. **The dock is shared.** The diff panel opens by itself at 144 columns or wider once Claude edits. Which tab then shows is unmeasured.
7. **The status line's row is crowded.** `SessionMode` labels share it with the operator's own status line, and in the classic layout with notifications and toasts too.
8. **`⚠` reads as a fault.** `$.ui.status` always draws `⚠ <plugin>:` (read `:2500-2510`), so it suits a fault and never a good state.
9. **Redraws fan out.** Every sidekick invalidate re-runs every sidekick render hook (read `:2381-2382`).
10. **Notifications have side effects.** Every `$.ui.notify` runs the operator's `Notification` hook first (read `:2485-2486`). Two mods that notify on hearing a notification "echo each other without end" (read `:7188-7191`).

## The view-placement record's main screen

The view-placement probes labelled a `claude logs` replay of a background session at 200 columns as the main screen. That replay was most likely the fullscreen layout:

- a background session's host docked a pane (measured, desk probes, its table of where a band and a pane draw);
- a pane docks only in fullscreen, "the terminal in fullscreen from 110 columns" (read `:10752-10753`);
- attached background sessions always render fullscreen (documented `fullscreen#fullscreen-by-default`).

So rows under the prompt are measured in fullscreen only. The operator runs `"tui": "fullscreen"` (checked: `~/.claude/settings.json`), which lowers the stakes for their own use.

## Open questions a probe should measure

1. The order and visibility of the rows under the prompt in an interactive fullscreen session. That is the `PromptHint` rows, the subagent panel with one subagent running, the task list, and the notification row.
2. The same in the classic layout (`"tui": "default"`), at 100 and 160 columns.
3. `PromptHint` rows, `SessionMode` labels, and the `⚠` row while the model works and while a draft is typed. Also under a permission prompt and a question dialog, and with the slash menu open.
4. Whether `PromptHint` rows count against fullscreen's half-height bottom slot, and what goes first in a 24-row terminal.
5. How `Link` draws in iTerm2 in fullscreen, and whether Cmd+click opens it in `PromptHint` and in `SessionMode`.
6. How `SessionMode` cuts a tree wider than the room the status line leaves.
7. How `success`, `warning`, and `error` draw under `dark-daltonized` and `dark-ansi`, and whether a `NO_COLOR` shell strips a mod's colours.
8. Whether a signal the desk can observe exists for "seen", to clear a finished row on focus.

## Sources

Beyond the links inline:

- Claude Code docs, fetched 2026-10-16: `statusline`, `interactive-mode`, `fullscreen`, `terminal-config`, `accessibility`, `keybindings`, `hooks`, `sub-agents`, `agent-view`, `settings-reference`, and `plugins/mods/` (`overview`, `interface`, `api`, `events`, `reference`, `gallery`).
- The mod API's declarations for 2.1.301, `.cache/claude-code-types/current.d.ts`, and the bundled `plugin-authoring` skill's `reference.md` and `examples/`.
- Style guides: [clig.dev](https://clig.dev/), [Primer CLI](https://primer.style/native/cli), [Heroku's CLI style guide](https://devcenter.heroku.com/articles/cli-style-guide).
- Status lines: [powerlevel10k's lean config](https://github.com/romkatv/powerlevel10k/blob/master/config/p10k-lean.zsh), [lualine's snippets](https://github.com/nvim-lualine/lualine.nvim/wiki/Component-snippets), [tmux(1)](https://man7.org/linux/man-pages/man1/tmux.1.html), [starship](https://starship.rs/config/), [Gemini CLI's footer](https://github.com/google-gemini/gemini-cli/blob/HEAD/packages/cli/src/ui/components/Footer.tsx).
- Glanceability: [Weiser and Brown](https://calmtech.com/papers/designing-calm-technology.html); [Matthews et al.'s notification levels](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2003/CSD-03-1258.pdf); [Mankoff et al.'s ambient heuristics](https://cs4760.csl.mtu.edu/resources/HE2.pdf); [Nielsen on visibility of status](https://www.nngroup.com/articles/visibility-system-status/) and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
- Earlier records in this folder: `2026-10-12-claude-code-surface.md`, `2026-10-15-mod-foundation-probes.md`, `2026-10-15-desk-probes.md`, and `2026-10-16-view-placement-probes.md`.
