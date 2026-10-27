> Research for #250, a backgrounded main that ran none of sidekick's mods. It ran on 2026-10-27 for the operator's #250 session, on Claude Code 2.1.311 (`claude --version`), with sidekick at `8eaf240` on `milestone/r9-control-centre`, loaded with `--plugin-dir`. Two subagent runs drove real terminals; the session ran the rest itself. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: a backgrounded main's mods on Claude Code 2.1.311 (2026-10-27)

#250 saw three backgrounded mains run none of sidekick's mods. One ran on 2.1.309 on 2026-10-23, and two on 2.1.310 on 2026-10-26. Each was a fork the daemon spawned fresh. This run tried to reproduce it on 2.1.311, with each fork's debug log, and could not.

Provenance grades:

- **Measured:** run on 2026-10-27 on Claude Code 2.1.311, with the log or screen named.
- **Read:** read on 2026-10-27 in this repository at `8eaf240`, in the strings of the Claude Code binaries under `~/.local/share/claude/versions/`, or in `CHANGELOG.md` of `anthropics/claude-code`, with the place named.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does a backgrounded main's fork run sidekick's mods on 2.1.311? | Yes, in five `←` runs out of five, two of them fresh spawns | Measured |
| And under a daemon a main's Bash started, with a background session running? | Yes: a fresh-spawned fork in that setup drew its identity row and opened `/desk` | Measured |
| Do fresh `claude --bg` spawns run them? | Yes, in nine sessions: six fresh spawns and three claimed spares | Measured |
| Was the 2026-10-22 fresh spawn that ran its mods a like-for-like control? | No. It loaded a probe plugin with no installed copy of its name; every failure loaded sidekick beside an installed 0.5.1 | Read |
| Can Claude Code hold a person's mods in one process? | Yes. 2.1.309 to 2.1.311 can hold them until a rollout flag answers, and no run here hit that | Read |
| Can a 2.1.310 daemon run beside a 2.1.311 install? | No. The daemon started as 2.1.311 from the 2.1.310 binary | Measured |
| What caused the failures on 2.1.309 and 2.1.310? | Unknown. 2.1.311's changelog names no fix for it | Read |

## Method

**Debug logs for a fork.** `--debug-file` on a main does not reach its fork. `DEBUG=1` in a process's environment turns debug logging on at launch (read: the logger's `debugFromLaunch` in the 2.1.311 binary). A fork takes the daemon's environment (`docs/research/control-centre/2026-10-22-main-and-worker-probes.md` §What `←` does to the main (Q1)). So each run started the daemon from an environment holding `DEBUG=1`, and every process it spawned wrote `~/.claude/debug/<session id>.txt`.

**Runs.** The pseudo-terminal driver of the 2026-10-26 runs hosted each main, in a scratch repository, with `--model haiku` and `--plugin-dir`:

- **Runs 1 and 2:** two mains, each given one turn, then `←`. The `←` started the daemon, so it held the driver's environment.
- **Runs 3 to 5:** main A's model ran `claude --bg … -n p14-bg -- '<prompt>'` with its Bash tool, which started the daemon. With `p14-bg` running, `←` in A, then in two new mains.
- **Background spawns:** three batches of three `claude --bg` launched at once from the orchestrating session's Bash. The first took the spare and the other two spawned fresh.
- **`claude -p`:** one run with that Bash's environment, one with Claude Code's session variables removed.

After each `←`, Esc attached the fork. Each fork's screen was saved at about 5 s and 60 s, and `/desk` was typed behind a guard that presses Enter only on `/desk`.

## Findings

### A backgrounded main's fork keeps its mods

**Five `←` runs out of five ran sidekick's mods.** The daemon log, per run (measured, the probes' copies of `~/.claude/daemon.log`):

| Run | Daemon origin | Lines for the `←` | Fork | Kind |
|---|---|---|---|---|
| 1 | the `←` | `claimed-spare 34546241 (spare)`, then `spawned 8a297454 (slash)` | `8a297454` | fresh |
| 2 | the `←` | `claimed-spare 0b91fa51 (slash)` | `0b91fa51` | spare |
| 3 | A's Bash | `claimed-spare 30db66fe (spare)`, then `spawned 405ed2b6 (slash)` | `405ed2b6` | fresh |
| 4 | A's Bash | `claimed-spare dcf90a93 (slash)` | `dcf90a93` | spare |
| 5 | A's Bash | `claimed-spare 61e57eef (slash)` | `61e57eef` | spare |

Runs 1 and 3 have the shape of every failure in #250: agent view's client took the waiting spare, and the fork spawned fresh. Each fork logged `hooks module sidekick@inline loaded (worker, environment 1, tier user)` within a second of its start. Each drew `▣ <name> · your main · no profile` at 5 s and 60 s, and `/desk` opened the desk pane. Runs 3 to 5 logged `sidekick role: main` (measured, each fork's debug log and screens).

**Fresh background spawns load them too.** Nine `claude --bg` sessions ran, six of them fresh. Each logged `hooks module sidekick@inline loaded` within 1.3 s of its spawn line in the daemon log. Each batch started its own daemon from the orchestrating session's Bash (measured).

**A fresh spawn starts its log under another id.** Fork `8a297454` wrote its first 2 s or so to another session's file, then moved to `8a297454-….txt` (measured, matched by timestamps). A check that reads only the fork's own file misses its start.

### The 2026-10-22 control

That record's fresh spawn ran its mods on 2.1.308. It loaded `--plugin-dir <mainprobe>`, a probe plugin (read, `docs/research/control-centre/2026-10-22-main-and-worker-probes.md` §Method). No installed plugin shares its name. Every failure loaded sidekick, and `sidekick@rikmorn` 0.5.1 is installed and enabled at user scope (measured, `claude plugin list`). So that run did not rule out a cause tied to the installed copy (inferred).

### Claude Code's hold on a person's mods

The binaries of 2.1.309 to 2.1.311 can hold a person's hooks modules in each process until a rollout flag answers (read). Their strings include:

```text
hooks modules a person installed wait for the rollout switch in this process:
this wake's flag fetch has not answered the rollout switch; they load at a turn start once it reads on
Mods and hooks you set up aren't running in this session yet … hooks that run when a session starts won't run i…
```

A held module logs `hooks module <name> not loaded: <reason>` (read). No log in this run held sidekick. The hold would fit #250's symptoms: an idle fork with no views, and a role of `other` after `/reload-plugins` (inferred). Without a failing fork's log, it stays a candidate and nothing more.

If a fork's mods ever load after its classic start, the role tracker settles `other`. It marks a backgrounded session `main` only from a classic start that read `fork` (read, `plugin/hooks/role.ts:56-58`).

### The environment a fork carries

A daemon that a main's Bash started holds `DEBUG=1` but none of `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, or `CLAUDE_CODE_SESSION_ID` (measured, `ps eww` on the daemon of runs 3 to 5). The orchestrating session's Bash held all three (measured, `env`), so Claude Code drops them on the way (inferred).

**Every fork inherited `SIDEKICK_CONTEXT_LIMIT` naming main A's session** (measured, runs 3 to 5). The context monitor reads that value only when it names this session (read, `bin/helpers/context-monitor.ts:116-119`). A value naming another makes the mods-not-running notice speak (read, same file, `:275-277`). In a fork whose mods run, the gauge replaces the value with the fork's own (read, `plugin/hooks/gauge/gauge.ts:46`). So the inherited value changes no limit.

The same Bash environment did not hold the mods in `claude -p` either. Both runs logged `hooks module sidekick@inline loaded` and ran its start hooks (measured).

### A 2.1.310 daemon

The 2.1.310 binary, launched with `--bg`, started a daemon that logged `version=2.1.311`. Adding `CLAUDE_CODE_EXECPATH` pointing at 2.1.310 changed nothing, and every spawn ran 2.1.311 (measured). So testing 2.1.310 needs the install itself pointed at it (inferred).

## What stays unknown

- Why the forks on 2.1.309 and 2.1.310 ran no mods. No failing fork left a debug log.
- Whether 2.1.311 fixed it, or whether five runs missed a rarer case.

If it recurs, `/reload-plugins` loads the mods, but the session reads `other` (`docs/research/control-centre/2026-10-26-desk-pane-captures.md`, measured once).

## Cleanup

Every session the runs started was stopped, and the daemon exited. The final `claude agents --json --all` matched the first apart from the runs' completed rows (measured). The debug logs stayed in `~/.claude/debug/`, and copies went outside the repository.

## Commands

```text
claude --model haiku --plugin-dir <plugin> -n <main>
claude --model haiku --plugin-dir <plugin> -n p14-main-a --settings '{"permissions":{"allow":["Bash(claude --bg *)"]}}'
claude --bg --model haiku --plugin-dir <plugin> -n <name> -- 'Reply with the single word ok.'
claude -p --model haiku --plugin-dir <plugin> --debug-file <file> 'Reply with the single word ok.'
DEBUG=1 <launch>
ps eww -p <pid>
claude stop <id>
```
