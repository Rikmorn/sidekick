> Research for the `control-centre` design (R9, #211 and #209). Claude ran it on 2026-10-16 in a session with the operator, on Claude Code 2.1.301. A subagent ran the probes in a scratch plugin, and Claude read its recorded values. It records what the board band's start path rests on. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: the board band's start path (2026-10-16)

#211's band draws the brief the session-start hook already computes, rather than running a second pickup. That rests on a mod reading a settings hook's SessionStart text. A review of the band's design measured it once on 2026-10-16. This report measures it again, with three neighbouring facts the band's adapter relies on.

Provenance grades:

- **Measured:** run on 2026-10-16, with the command and the recorded values named. Each mod hook wrote what it saw to its own file with `$.fs.write`.
- **Read:** read on 2026-10-16 in the mod API's declarations for 2.1.301 (`claude-code.d.ts`), with the line named.
- **Inferred:** a reading of what was measured or read. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does a mod on `classic.SessionStart` see a settings hook's text in `next(e)`'s result? | Yes when the hook prints `hookSpecificOutput.additionalContext` JSON. No when it prints plain stdout, though the model still receives plain stdout | Measured |
| Is sidekick's entry the only one? | No. `additionalContext` holds one entry per hook, other plugins' included, in the order the hooks finish | Measured; the order inferred from two runs |
| Which fires first under `-p`, `session.start` or `classic.SessionStart`? | `classic.SessionStart`. `session.start` fires once every settings hook has finished | Measured under `-p` only |
| Does a module with two `session.start` hooks on the same matcher load? | Yes. Whether both fire in an interactive session is unmeasured | Measured (loading) |
| Does `classic.PostToolUse` with a `tool_name: 'Bash'` matcher see the command? | Yes, in `e.tool_input.command` | Measured |

## Setup

A scratch plugin, outside any repository, held one SessionStart command hook (matcher `startup|clear`) and a mod. Two environment variables chose the hook's output, JSON or plain stdout, and a sleep before it printed. The mod registered:

- `classic.SessionStart`, which recorded its entry time, then awaited `next(e)` and recorded the result;
- an unmatched `session.start`, and two `session.start` hooks on `{ isInteractive: true }`;
- `classic.PostToolUse` on `{ tool_name: 'Bash' }`.

Every hook called `next(e)` once and returned its result. `claude plugin validate --strict` passed on the plugin, and did not flag the two identical matchers. Each run:

```
cd <scratch>/work && PROBE_MODE=<json|plain> PROBE_SLEEP=<0|3> claude -p --model haiku --plugin-dir <scratch>/plugin --permission-mode bypassPermissions "Run the bash command: echo probe-bash. Then reply with the single word ok."
```

Each run printed `ok` and exited 0. No run was refused as untrusted.

## The hook's text in the mod

**JSON reaches the mod.** With `PROBE_MODE=json` and no sleep, the result's only key was `additionalContext`. Its first entry was `"PROBE-HEADER\n\nbrief line one\nbrief line two"`. Its second was superpowers' SessionStart text, 3,405 characters, so other installed plugins' hooks fold into the same list (measured).

**Plain stdout does not.** With `PROBE_MODE=plain`, `additionalContext` held one entry, superpowers'. The probe text was absent from the mod's result (measured). The model still received it: the session's transcript held a `hook_success` attachment carrying the probe text (measured, read from the transcript).

**The entries' order varies.** With no sleep, the probe's entry came first. With a 3-second sleep, it came after superpowers'. So the entries follow the order the hooks finish, not the order they are registered (inferred from the two runs). A reader that wants one hook's entry has to find it by its content.

## The order of the two start events

With `PROBE_MODE=json` and `PROBE_SLEEP=3`, the hooks recorded these times, in epoch milliseconds (measured):

| Event | Time |
|---|---|
| `classic.SessionStart` entered | 1792148653931 |
| The settings hook started | 1792148653981 |
| The settings hook printed | 1792148657033 |
| `classic.SessionStart`'s `next(e)` resolved | 1792148657043 |
| `session.start` entered | 1792148657075 |

Under `-p`, `session.start` fired about 3.1 seconds in, after the settings hook finished. The run without a sleep showed the same order (measured). An interactive session was not measured, since `-p` cannot start one.

## Identical matchers

The two `session.start` hooks on `{ isInteractive: true }` were registered before the `classic.*` hooks, and those fired in every run. So the module's `register` ran to its end without throwing (measured). Neither identical hook fired, because `-p` reports `isInteractive: false`; the recorded event was `{"surface":null,"isInteractive":false}` (measured).

The declarations say registrations nest in order and "a repeat throws" (`claude-code.d.ts:6910-6911`, read). A repeat, then, is not the same event on the same matcher. Whether it means the same event without a matcher, as `plugin/hooks/desk/desk.ts` says of a second unmatched `session.start`, was not tested here.

## `classic.PostToolUse` on Bash

It fired once per run, recording `{"toolName":"Bash","toolInput":{"command":"echo probe-bash","description":"Echo probe-bash string"},"resultKeys":[],"result":{}}` (measured). `next(e)` resolved to an empty object.

## Not measured

- An interactive session: whether two `session.start` hooks on `{ isInteractive: true }` both fire, and the order of the two start events there.
- `validate` warned that `classic.*` hooks do not run in a user-installed plugin where an organisation manages Claude Code. No managed install was tried.
