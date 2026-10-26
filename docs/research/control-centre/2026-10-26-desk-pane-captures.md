> Research for #254, the desk pane. A subagent ran it on 2026-10-26 for the operator's #254 session, on Claude Code 2.1.310 (`claude --version`). It ran sidekick at `293fe52` on `milestone/r9-control-centre`, loaded with `--plugin-dir`. It captures the new desk pane, the band, and the identity row in a live scenario, so the operator can judge them by eye. It compares them with what #254's spec says of the pane and the identity row. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Captures: the desk pane's tree, the band, and the identity row, live (2026-10-26)

#254 makes the desk pane a tree of sessions, has every session publish facts about itself, and adds an identity row under the prompt. This run built one scenario and captured 15 screens of it. The scenario held a main with two dispatched workers, one of them running a subagent. Beside them ran a second main, backgrounded on a question, and a bare background session. Each capture was saved as plain text and as styled runs, outside the repository. This record keeps the key screens inline and lists every place the screen and the spec part.

Where this record says what #254's spec asks, it quotes the spec of 2026-10-25, so the record stands without it.

Provenance grades:

- **Measured:** run on 2026-10-26 on Claude Code 2.1.310, with the capture or log line named.
- **Read:** read on 2026-10-26 in this repository's source at `293fe52`, with the line named.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

The mods were last checked on Claude Code 2.1.310 (`.claude-code-version`), the build this run used.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does the tree nest a main's workers under it? | Yes. `▣ demo-main` heads them, `├` and `└` lead the workers, and the waiting one comes first | Measured, 04 and 05 |
| Does a worker's running subagent show? | Yes, nested under its worker: `└ ◦ general-purpose count the files` | Measured, 04, 05, 09 |
| Does a finished subagent leave at once? | Yes. Its last turn ended at 01:15:53.8 UTC, and its row was gone by 01:16:09 | Measured, 10 |
| Does a session elsewhere that needs the operator head the pane, before the main? | Yes. `◇ other-main`, backgrounded on a question, drew first | Measured, 04, 05, 15 |
| Do context bars draw? | Yes, five cells and the tokens on every row with a published key | Measured, 04 and 05 |
| How wide is the dock at 160 by 40? | 53 columns with its grip, 52 of body, the width `~/.claude.json` keeps | Measured, 05 and 09 |
| Does the identity row match the spec's text in each role? | Yes, for a profiled main, an unprofiled main, a worker, and an `other` | Measured, 01, 06, 07, 08 |
| Does a backgrounded main keep its views? | Only when its fork lands in a claimed spare. A fresh-spawned fork ran no mods, and a reload then settled it as `other` | Measured, one fork each way |
| What does a `bypassPermissions` worker's message to an `auto` main do? | It waits behind a dialog in the main, whose default option is **Deny** | Measured, 02 |

Mismatches with the spec, each detailed in §Findings:

| Part | #254's spec says | The screen shows | Capture |
|---|---|---|---|
| The dock | `$.ui.open` asks for `columns: 56` | A dock of 53 with its grip: the kept `pluginPanes.dockColumns` wins | 05, 09 |
| The pane's names | A name is dim for other sessions | The name draws in `inactive` grey, `999999`, with no SGR 2 | 04 |
| The identity row | Past the icon and name, the rest is `inactive` | The profile's name draws in the `text` tone, `ffffff` | 03, 06 |

Not tested:

- the marks `⇡N` and `✎`, since neither worker committed or edited a file;
- the overflow hint, since every tree fit its pane;
- a pane narrower than 40 body columns, and terminal sizes other than 100 by 40 and 160 by 40;
- context at 75% and 85%, and a session with no published limit;
- the identity row before a name is known, since every session had one from `-n`;
- a session without sidekick, other than the fresh fork before its reload;
- the board line and its new glyphs, since both scratch repositories are untracked;
- the classic screen;
- the on-screen marker, which #254 dropped after the 2026-10-25 probes found no signal.

## Method

The pseudo-terminal driver of the 2026-10-23 usage-guide captures record ran every interactive session and attach, as that record's §Method describes. It carried one change: its typeahead pattern refuses a `│` as a suggestion's first description character, the fix the 2026-10-25 probe record names. Before Enter on each slash command, the driver checked that the typeahead's first row was that command, and the screen was dumped and read too. In agent view, only ctrl+c twice was pressed, to quit it.

The scenario, all on `--model haiku`, in two scratch repositories made with `git init` and one commit, each trusted through its dialog:

- **`demo-main`:** an interactive main in `demo`, with the arguments `sidekick profile argv main` printed for the repository's `main` profile, plus `-n demo-main`. It started at 100 by 40 at 01:03 UTC.
- **Workers:** `demo-main`'s model ran `sidekick worker dispatch <brief> --permission-mode <mode> --plugin-dir <plugin>` twice, in one turn, at 01:05. `wait-perm` ran in `default` mode. `fan-out` ran in `bypassPermissions`. Each brief named a plan, a spec, and a rulings path, and a repository `worker` profile set `"model": "haiku"`.
- **The subagent:** `fan-out`'s plan opened with a setup step, before the scan. It had the worker start one `general-purpose` subagent, described `count the files`, to run `sleep 600` in Bash. Claude Code refuses a foreground `sleep`, so the subagent's prompt named `perl -e "sleep 600"` as the fallback.
- **`other-main`:** an interactive main in `other`, with no profile. It was asked `Ask me which colour I prefer, then stop.` Then came `←` on its empty prompt, at 01:07:47. The agent-view client then quit with ctrl+c twice.
- **`bench`:** `claude --bg --model haiku --plugin-dir <plugin> -n bench -- 'Run sleep 600 in Bash, then say done.'` in `other`, at 01:07:38, with the parent's `CLAUDE*` and `SIDEKICK*` variables dropped.

`demo-main` was captured at 100 by 40, then resized to 160 by 40. `claude attach` reached `fan-out` and `bench` at 100 by 40. Last, `←` backgrounded `demo-main` so the operator could attach to it, and two more attaches followed at 160 by 40. `claude agents --json --all` was saved before the first session and again at the end. `~/.claude.json` was read, never written.

## Findings

### The tree, inline at 100 columns

**The tree draws one row per session, in the spec's order.** `/desk` in `demo-main`, at 01:08:36 UTC (04):

```text
╭────────────────────────────────────────────────────────────────────────────────────────────────✕─╮
│    ◇ other-main     needs you  send a prompt to start                       other    ▱▱▱▱▱   61k │
│ ▣ demo-main         this main                                            2 workers · 1 needs you │
│ ├  ● wait-perm      needs you  approve Read: /private/tmp/claude-501/-               ▱▱▱▱▱   62k │
│ └  ◐ fan-out        working    idle since 01:07                                      ▱▱▱▱▱   79k │
│    └ ◦ general-purpose count the files                                                           │
│                                                                                                  │
│    ◇ sidekick-6f    working    idle since 01:00                             sidekick ▰▰▰▱▱  652k │
│    ◇ sidekick-5a    idle       idle since 00:56                             sidekick ▱▱▱▱▱   71k │
│    ◌ bench          working    idle since 01:07                             other    ▱▱▱▱▱   64k │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
● needs you  wait-perm · permission prompt   other-main · blocked                               [-]
◐ workers    wait-perm blocked · fan-out working   1 finished
```

The session elsewhere that needs the operator heads the pane, then the root, its waiting worker, its working one, and the working one's subagent. A blank row separates the other sessions. `sidekick-6f` and `sidekick-5a` are the operator's own sessions (measured, the listing). `other` in the repo column is the scratch repository's name.

**The tones match the spec, but for one.** From the styled runs of 04 (measured):

| Part | Tone in the capture | The spec |
|---|---|---|
| `▣ demo-main` | `claude`, bold | `claude`, bold |
| `├`, `└` | `subtle` | `subtle` |
| `●` and `needs you` | `warning` | `warning` |
| `◐` and `working` | `suggestion` | `suggestion` |
| A child's name | `ffffff`, bold | bold |
| `◇` or `◌` with another session's name | `inactive`, no SGR 2 | icon `inactive`, name dim |
| The repo | `subtle` | `subtle` |
| `◦ general-purpose` | `suggestion` | `suggestion` |
| `count the files` | `inactive`, italic | italic, `inactive` |
| `▰▰▰` and `652k` at 65% | `warning` | from 65% `warning` |
| Empty cells `▱` | `subtle` | not stated |

**Mismatch: another session's name is not dim.** The code asks for `{ tone: 'text', dim: true }` (read `plugin/hooks/desk/rows.ts:198`). The screen draws the name in `999999` with no SGR 2, the same grey as the icon (measured, 04). Claude Code likely renders a dim `text` as the `inactive` colour (inferred). Either way, a name does not stand apart from its icon.

**A worker's work line can read against its state.** `fan-out` reads `working` and `idle since 01:07`. Its main loop ended its turn at 01:07, while its subagent ran on (measured, its transcript). The spec takes the published activity before job state's `detail`, and the activity is the time the last turn ended. So `detail`, `paused for orchestrator's rulings message before Task 1`, never shows (measured, `~/.claude/jobs/65c54d54/state.json`). `bench` reads the same way: `working`, `idle since 01:07`, while a background shell ran its sleep.

**A backgrounded main's question becomes `send a prompt to start`.** For `other-main`, job state held `detail` `Which colour do you prefer?` and `needs` `send a prompt to start` (measured, `~/.claude/jobs/44495841/state.json`). The spec has `needs` replace the work line while the listing reads `blocked`, so the question itself never shows.

### The dock at 160 columns

**Mismatch: the dock takes the kept width, 53, not the 56 asked.** `~/.claude.json` kept `pluginPanes.dockColumns` at 53 before the run and after it (measured; it read 32 on 2026-10-25). After the resize, and again after `/desk` closed and opened at 160, the grip sat at column 107. That makes a dock of 53 with its grip, and a body of 52 (measured, 05 and 09). The 2026-10-25 probe record found that a kept width wins over `columns`; this run bears it out.

**At 52 body columns, each session takes two rows.** The right side of 05:

```text
│                                                  ✕
│◇ other-main     needs you   other      ▱▱▱▱▱   61k
│      send a prompt to start
│▣ demo-main        2 workers · 1 needs you
│├ ● wait-perm      needs you            ▱▱▱▱▱   62k
││     approve Read: /private/tmp/claude-501/-Users-r
│└ ◐ fan-out        working              ▱▱▱▱▱   79k
│      idle since 01:07
│      └ ◦ general- count the files
│
│◇ sidekick-6f    working     sidekick   ▰▰▰▱▱  652k
│      idle since 01:00
│◇ sidekick-5a    idle        sidekick   ▱▱▱▱▱   71k
│      idle since 00:56
│◌ bench          working     other      ▱▱▱▱▱   64k
│      idle since 01:07
```

The docked root row drops `this main`. The subagent's type cuts to `general-`, while its description keeps its room (measured, 05).

### The subagent row

**The subagent showed for its whole run and left within seconds.** The row showed from the first pane, at 01:08:36. The subagent's foreground `sleep 600` was refused at 01:05:49 with `Blocked: standalone sleep 600`, and it ran `perl -e "sleep 600"` from 01:05:51. Its last turn ended at 01:15:53.8 (measured, the subagent's transcript). The row was present at 01:15:48 and gone at 01:16:09, the next poll (measured, 10). The 2026-10-25 probe record found a finished subagent listed as `completed` for about 30 s; the filter on `running`, `pending`, and `waiting` drops it at once.

**Attached to `fan-out`, Claude Code's own subagent panel draws under the identity row.** It reads `◯ general-purpose  Handling blocked sleep command  3m 56s · ↓ 48.9k tokens` (measured, 06). That text is Claude Code's summary; the desk shows the description the Agent call gave.

### The band

**The band reads as before, with `◐` leading the workers line.** In `demo-main`, with the scenario running (03):

```text
● needs you  wait-perm · permission prompt   other-main · blocked                               [-]
◐ workers    wait-perm blocked · fan-out working   1 finished
```

The workers line led with `◆` on 2026-10-23. The band's `1 finished` showed before any dispatch, too (01). The snapshot counts a fresh idle interactive session as finished (read `bin/helpers/desk-snapshot.ts:163-169`). So the count likely holds the operator's idle `sidekick-5a` (inferred, not traced).

### The identity row

**Each role's row matches the spec's text.** Measured, verbatim:

| Session | Role, profile | Row | Capture |
|---|---|---|---|
| `demo-main` | main, `main` | `▣ demo-main · your main · profile main` | 01, 03 |
| `other-main` | main, none | `▣ other-main · your main · no profile` | 08 |
| `fan-out` | worker, `worker` | `◐ fan-out · worker of demo-main · back: ←, select demo-main, Enter · profile worker` | 06 |
| `bench` | other, none | `◌ bench · no profile` | 07 |

The row draws under Claude Code's hint line in each. The footer carries no `profile:` label, and no `⚠ sidekick: no profile settings in this session` row drew in an unprofiled session (measured, 01 and 08).

**Mismatch: the profile's name is not `inactive`.** The icon and the name take the role's tone, bold: `claude` for a main, `suggestion` for a worker, `inactive` for `other`. The words after them are `inactive`, but the profile's own name, `main` or `worker`, draws in `ffffff` (measured, 03 and 06). The gauge sets that run's tone to `text` (read `plugin/hooks/gauge/logic.ts:116`). `no profile` draws `inactive`, as the spec says.

### Backgrounded mains

**A fresh-spawned fork ran none of sidekick's mods.** `←` at 01:16:36 moved `demo-main` to background session `0125da04`. Its process, pid 63447, ran `--session-id … --fork-session --resume …`, with `--settings`, `--plugin-dir`, and `--model haiku` (measured, `ps`). Attached at 160 by 40, it drew no band, no identity row, and no desk for 37 s (measured, 11). Typing `/desk` listed `/desktop` first and no sidekick command, though sidekick's skills listed (measured, 12). The 2026-10-23 captures record met the same with one fork of three.

**After `/reload-plugins`, the mods loaded, and the role read `other`.** The reload answered `Reloaded: 7 plugins · 42 skills · 7 agents · 6 hooks`, and the identity row became `◌ demo-main · profile main` (measured, 13). The role tracker keeps a fork in `$.state` so a reload keeps a main (read `plugin/hooks/role.ts:1-5`). Here no load ever kept it, so a background session settled as `other` (inferred from `plugin/hooks/role.ts:59-63`). The backgrounded `demo-main` therefore draws no desk.

**A fork in a claimed spare kept its views.** `other-main`'s fork, `44495841`, ran as `claude bg-spare` (measured, `ps`). Attached, it drew its band and `▣ other-main · your main · no profile` (14). Its own desk, docked (15):

```text
│◌ wait-perm      needs you   demo       ▱▱▱▱▱   62k
│      approve Read: /private/tmp/claude-501/-Users-r
│◌ demo-main      needs you   demo       ▱▱▱▱▱   65k
│      send a prompt to start
│▣ other-main
│
│◇ sidekick-6f    working     sidekick   ▰▰▰▱▱  652k
│      idle since 01:00
│◇ sidekick-5a    idle        sidekick   ▱▱▱▱▱   71k
│      idle since 00:56
│◌ fan-out        working     demo       ▱▱▱▱▱   80k
│      idle since 01:16
│◌ bench          done        other      ▱▱▱▱▱   65k
│      idle since 01:17
```

Another main's workers draw as `◌` here, and its waiting ones draw before this main. `demo-main` draws as `◌`, since its published role was `other` by then.

### Messages across permission modes

**A `bypassPermissions` worker's message waits behind a dialog in an `auto` main.** `fan-out` sent `demo-main` its baseline report. `demo-main` showed the body and `The sending session's permission mode class doesn't match this session's, so it wasn't delivered automatically.` Its options were `Deny — drop it and tell the sender it was declined`, selected, and `Deliver this message to Claude` (measured, 02). Meanwhile the listing read `demo-main` as `waiting` on `permission prompt`, and `other-main`'s band named it (measured). The 2026-10-14 dispatched-worker probe record covers messages across permission modes. This run chose **Deliver**.

### Side findings

- **Claude Code blocks a standalone foreground `sleep`.** The subagent's `sleep 600` came back `Blocked: standalone sleep 600` (measured). `bench` ran its `sleep 600` as a background shell instead, and read `done` by 01:20, its last turn having ended at 01:17 (measured, 15 and the listing).
- **The kept dock width changed since 2026-10-25,** from 32 to 53. This run did not trace who changed it.
- **The trust dialog opens with `No, exit` selected.** A driver that presses Enter at once exits the session.

## Cleanup

The scenario was left running for the operator, as the run's brief asked. At 01:20 UTC these background sessions ran: `0125da04` (demo-main's fork), `12f1ba7f` (wait-perm), `65c54d54` (fan-out), `44495841` (other-main's fork), and `f62f89ad` (bench). Both interactive sessions had ended through the driver, and no driver or attach client remained (measured, `pgrep`). The cleanup file beside the captures names each `claude stop` and `claude rm`, the worktrees, the branches, and the scratch repositories. It also checks the listing against the one taken at 01:02 UTC. `~/.claude.json` kept `"dockColumns": 53`. This repository changed only by this record and its index line.

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
sidekick desk --json --self <session id>
ps -o pid,command -p <pid>
```

The driver typed each slash command and pressed Enter only once the typeahead's first row matched. `sidekick worker dispatch` ran inside `demo-main`, through its model's Bash tool. Every other command ran from the driver or a shell.
