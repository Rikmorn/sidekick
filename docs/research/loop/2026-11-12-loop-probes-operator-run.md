> Research for the `loop` design (`docs/designs/loop/`), measured for issue #360, R11 plan 1. Run on the evening of 2026-11-12 by Claude for the operator, on Claude Code 2.1.322. It ran from the main session `sidekick-23` (session 5d261ecf) in the sidekick main checkout. It covers the rows [2026-11-12-loop-probes.md](./2026-11-12-loop-probes.md) deferred to an operator-present run. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Operator-present loop probes on Claude Code 2.1.322 (2026-11-12)

The day's probe record left four rows for a run with the operator at the Mac. This run measured three of them. Each result quotes the tool result, log line, or job record field it rests on. Times are UTC, which matched the Mac's clock.

## Summary

| Row | Answer | Kind |
|---|---|---|
| U2, automatic | A recurring cron job kept firing through 40 automatic compactions in 17 minutes | Measured |
| U2, typed | A cron job survived a typed `/compact` and a typed `/clear`. `/clear` started a new conversation with a new session id, and the job carried over. `claude rm` then took the job id, not the new session id | Measured |
| U14 | `PushNotification` from a background session returned "Terminal notification sent", twice. Nothing carrying its text reached the operator, and no phone push went, with Remote Control inactive | Measured |
| U24 | With the deny rules in a managed settings file the operator wrote, Claude Code seated its built-in guard, and a mod's `allow` no longer overrode a deny rule | Measured |
| U1 | Whether a respawn after a reboot restores a loop's cron jobs | Deferred to later in R11, by the operator's ruling |
| U19, through `--worktree` | Which answer `claude rm` gives for a worktree Claude Code made, after a push | Not run: by the code, either answer ends with the worktree gone (the day's record, §U19) |

## Sources

- Six background probe sessions, listed in §Sessions. Each launched as the day's probes did: under `dontAsk`, on haiku at low effort, with the probe plugin `probe-r11`. Their `--settings` env set `DISABLE_AUTOUPDATER=1`.
- Their transcripts, debug logs, and job records, read during the run. The raw files were kept uncommitted, as the day's record's were. The quotes here carry what a reader needs.
- The operator's own report, for U14 and for what the U2 and U24 steps did on their side.

## Sessions

| Name | Job id | Tests |
|---|---|---|
| `r11p-u2-auto` | `5ee889e7` | A recurring tick, with a file read that grows the context until it compacts |
| `r11p-u14` | `b3f242bc` | One push at 19:34, with the operator not watching |
| `r11p-u14b` | `eab979ff` | One push at 20:24, with the operator watching |
| `r11p-u2-typed` | `eb2f7574` | A recurring tick, with `/compact` then `/clear` typed by the operator through `claude attach` |
| `r11p-u24-managed` | `3f6d2b7d` | The day's U24 control, with its deny rules in managed settings instead of `--settings` |
| `r11p-u1-reboot` | `0d09ee04` | A tick for U1, removed unused when the reboot was deferred |

The first launch of the run, `r11p-u2-auto`'s, printed "warning: no agent named 'probe-r11:role' — spawning with default template", then "Starting background service…". Its tick skill still loaded from the plugin, and the tick log filled. Whether the role agent's prompt applied in that session was not checked.

## Results by row

### U2, automatic: a cron job across automatic compactions

**Measured.** A recurring cron job survives automatic compaction. Its session compacted 40 times between 19:28:15 and 19:44:37, each entry reading `"trigger": "auto"`. The tick log holds 17 ticks from 19:29:32 to 19:43:45, about one a minute, before and after every compaction.

- **The setup.** One job, `* * * * *`, fired `/probe-r11:tick r11p-u2-auto`. A second, `*/2 * * * *`, read 500 lines of a copy of the loop design, to grow the context. The `--settings` env set `CLAUDE_CODE_AUTO_COMPACT_WINDOW` to `60000`.
- **The window has a floor.** The debug log warned: "CLAUDE_CODE_AUTO_COMPACT_WINDOW="60000" reads as 60,000 tokens, so Claude Code treats it as the 100k minimum." It then logged "effectiveWindow=80000".
- **A context-heavy tick compacts almost every turn.** Each compaction took the context from about 78,000 to 99,000 tokens down to about 19,000. The next read pushed it past the window again. The run was stopped after 17 minutes for that cost.
- **One early compaction failed.** At 19:28:03 the log read "Reactive compact: no assistant messages in summarize set, bailing". The next compaction, at 19:28:15, succeeded.

### U2, typed: a cron job across a typed `/compact` and `/clear`

**Measured.** A cron job survives both commands, typed by the operator into the attached session.

| Time | Event |
|---|---|
| 20:30:33 | The operator typed `/compact` |
| 20:30:41 | A compaction entry with `"trigger": "manual"` |
| 20:31:04, 20:32:03, 20:33:03 | Ticks |
| 20:33:10 | The operator typed `/clear`, which opened a new transcript under the session id `3e2ee161`, where it had been `eb2f7574` |
| 20:34:01 | The cron job fired in the new conversation, as a scheduled task |
| 20:34:05 | A tick |

- **The session's name stayed, and its session id moved.** After `/clear`, the agents listing showed `r11p-u2-typed` with the session id `3e2ee161`.
- **The job id stayed.** `claude rm 3e2ee161` answered "No job matching '3e2ee161'". `claude rm eb2f7574` answered "removed eb2f7574".
- **Detaching** left the session running, with its next ticks in the log.

### U14: a push from a background session

**Measured.** With Remote Control inactive, a background session's push does not reach the operator as a message of its own.

- **What the tool said.** Both pushes returned "Terminal notification sent. Mobile push not sent (Remote Control inactive)." The calls were at 19:34:03 and 20:24:02, from one-shot cron jobs, with the messages "R11 probe U14 at 19:34 UTC. Did this reach you?" and "R11 probe U14, second try. Did this reach you?".
- **What the operator saw.** At 20:24, watching, they saw one notification, "the same one i always get when claude idles". Notification Center held no entry carrying either message's text, at 19:34 or 20:24, "apart from the usual notifications".
- **Not measured:** a push with Remote Control connected, and which terminal a background session's "terminal notification" goes to.

### U24: a deny rule in managed settings against a mod's approval

**Measured.** A managed settings file the operator writes binds a deny rule over a mod, on a personal subscription.

- **The file.** The operator wrote `/Library/Application Support/ClaudeCode/managed-settings.json` with `sudo`, holding only the control's two deny rules, `Bash(echo r11-denied)` and `Bash(echo r11-mod-denied)`. The probe's `--settings` held no deny rule. The debug log read "Adding 2 deny rule(s) to destination 'policySettings'".
- **The built-in guard seated.** "cc-plugin-sec-default@builtin seated outermost: this machine has managed settings". The day's control, without the file, logged it "not seated: no managed settings and not a Team or Enterprise organization (max)".
- **The mod ran and was overruled.** The probe mod's `tool.check` settled at 20:37:00.766, and the built-in guard's at 20:37:00.767.

| Call | What approves it | In the day's control | With managed settings |
|---|---|---|---|
| `echo r11-denied` | The `PreToolUse` hook | Denied | Denied: "Permission to use Bash with command echo r11-denied has been denied." |
| `echo r11-mod-denied` | The mod | Ran | Denied: "Permission to use Bash with command echo r11-mod-denied has been denied." |
| `echo r11-control` | Nothing | Ran | Ran |

- **Removed afterwards.** The operator removed the folder with `sudo`, and `ls` then read "No such file or directory".
- **Not measured:** whether other built-in plugins change behaviour once the guard seats, and its effect on the operator's other sessions.

## What breaks

Each stance is cited by its line in the loop design at commit `866b746`, and ADR-0015 by its section.

| Stance | Answer | Effect | Issue |
|---|---|---|---|
| `design.md:654,673`: a push from a background session reaches the operator, else the desk carries everything | U14: it does not, with Remote Control inactive | Breaks the first half: the desk carries everything, as the stance's fallback says. A push may still help with Remote Control connected, not measured | #365 |
| ADR-0015 §Revisit when: "A managed settings file of the operator's own keeps a deny rule binding over a mod (probe U24)" | U24: it does | The revisit condition is met. A managed file holding the loops' `never` rules is an option, set up by the operator with `sudo`, since sidekick cannot write it | ADR-0015, #363's listing, #366's advice |
| `design.md:570` and #364: whether a cron job survives compaction stays open | U2: it survives automatic compaction, a typed `/compact`, and a typed `/clear` | Holds | #364 |
| #364 and #365: a loop is tracked by its session | U2: `/clear` moves the session id and keeps the job id and name | Narrows: track a loop by its job id or name, never its session id | #364's state file, #365's desk |
| #364: after a reboot `start` launches fresh, until U1 shows a respawn keeps a loop's cron jobs | U1 is deferred to later in R11 | Holds as written | #364 |
