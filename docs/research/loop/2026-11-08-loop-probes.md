> Research for the `loop` design (`docs/designs/loop/`), which PM has not planned yet. Run 2026-11-08 and 2026-11-09 by Claude for the operator, on Claude Code 2.1.319, from session b24da16e in the sidekick main checkout. Written up here on 2026-11-11 from that session's scratch notes, which git ignores. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Native loop mechanics on Claude Code 2.1.319 (2026-11-08)

The loop design rests on Claude Code's own scheduling: `/loop` over `CronCreate`, background sessions, and `--agent`. These probes measured how those behave before the design opened. Local time in the probes was UTC.

## Sources

- Four background sessions, in the table in §Sessions. Each ran in the sidekick main checkout. They were removed on 2026-11-09, so their transcripts are gone.
- Their job records under `~/.claude/jobs/<id>/state.json`, read during the probes.
- `strings` on the 2.1.319 executable.
- Code read in the repo at the time: `bin/helpers/worker-overlay.ts:18-25,62-96` and `bin/helpers/profile-launch.ts:123-132`.

## Sessions

| Name | Id | Launch | Tests |
|---|---|---|---|
| `lp-cron2h` | `2734365a` | `claude --bg --model haiku --permission-mode bypassPermissions "/loop 2h Reply with the single word tick."` | Does the idle supervisor stop an unattached session between cron fires? The job was `7 */2 * * *`, first fire 00:37 after the offset |
| `lp-idle` | `9f97ee9a` | `claude --bg --model haiku "Reply with the single word ok."` | The control: is an idle unattached session with no loop stopped after about an hour? |
| `lp-agent` | `d03eb080` | `claude --bg --permission-mode bypassPermissions --plugin-dir <probe plugin> --agent probe-loop:ticker "/loop 5m /probe-loop:tick"` | An agent from a local plugin as the main session, with the plugin's skill as the tick. Its `SessionStart` hook and its cron, across a stop and respawn |
| `lp-persist` | `b095a57b` | `CLAUDE_CODE_LOOP_PERSISTENT=1` in the shell and in the `--settings` env, then `/loop 5m Reply with the single word tick.` | The undocumented persistent-loop variable, and a plain 5-minute cron as the respawn control |

The probe plugin, `probe-loop`, held three things:

- the agent `ticker`, on haiku, with its tools limited to the cron tools, Skill, and Read, `skills: tick`, and an `initialPrompt`;
- the skill `tick`, which replies with one fixed line;
- a `SessionStart` hook that appends its input to a log and returns an `additionalContext` marker.

## Results

### From the binary

- **`CronCreate` has a durable mode,** described as "true = persist to .claude/scheduled_tasks.json and survive restarts". A server flag, `tengu_kairos_cron_durable`, gates it. The flag defaults on and was off for this account, since the session's tool schema said `durable` "Has no effect". This matches the scheduled-tasks docs' "with feature-flag fetching off".
- **Two more undocumented switches.** `CLAUDE_CODE_LOOP_KEEPALIVE` overrides the flag `tengu_kairos_loop_keepalive`, which defaults off. `CLAUDE_CODE_LOOP_PERSISTENT` overrides `tengu_kairos_loop_persistent`, which defaults off. Other flag names include `tengu_loops_command` and `tengu_kairos_loop_persistent_activated`.
- **A durable file copied from another checkout is detected:** "other session(s) named in scheduled_tasks.json … this session will not run their tasks".

### Measured

- **`--agent` from `--plugin-dir` loads as the main session.** The `SessionStart` input carried `agent_type: probe-loop:ticker` and `model: claude-haiku-5-5`, the agent's model. The plugin's `SessionStart` hook ran at `startup`.
- **`initialPrompt` did not auto-submit.** With no launch prompt, the session sat at an empty prompt in state `blocked`. So the launch prompt carries the `/loop`.
- **`/loop 2h` and `/loop 5m` each made one session-only `CronCreate` job.** Each result said "Session-only (not written to disk, dies when Claude exits). Auto-expires after 7 days". The model picked `7 */2 * * *` for 2h.
- **`CLAUDE_CODE_LOOP_PERSISTENT=1` changed nothing visible for a fixed-interval `/loop`.** The job was still session-only.
- **The agent's stance and the plugin's skill work as a loop.** `lp-agent`'s cron job held the prompt `/probe-loop:tick`. Each fire ran the skill as a slash command, and every reply began with the agent prompt's token.
- **A cron job survives `claude stop` then `claude respawn`.** Both 5-minute probes were stopped at 23:24:12 and respawned at 23:24:20. Each fired again at 23:29:05, with a `scheduled_task_fire` entry in its transcript.
- **`SessionStart` fires on a respawn, as `resume`, and the agent persists.** The hook's log holds `23:24:20Z d03eb080 resume probe-loop:ticker`.
- **The resume hook's `additionalContext` was not seen in the transcript.** At startup, a `hook_additional_context` attachment arrived with the first prompt. After the respawn, the transcript held the hook's `hook_success` but no `hook_additional_context`, including at the 23:29 fire. So a re-arm that depends on the hook's text reaching the model after a respawn is unproven.
- **No `.claude/scheduled_tasks.json` appeared** in the checkout after any of the launches.
- **The idle supervisor does not stop a session whose cron job is pending.** `lp-cron2h` sat idle and unattached from 23:14:01 to 00:37:00, 83 minutes. It then fired on time, with `scheduled_task_fire` at 00:37:00 and the reply `tick`, from the same process, pid 31960. At 00:48 its job record read `state: working`, `inFlight.kinds: ["session_cron"]`, and `selfWake: true`. So the job counts as work in flight.
- **A session with nothing pending was stopped.** `lp-idle` replied at 23:13:55 and had pid 31971 at 23:24. By 00:48 it read `state: done` with no pid. The record does not say when it stopped, only that it was some time in between. This fits the docs' stop after about an hour idle.

### Answered by reading the code, not probed

- **The push block through a profile.** Dispatch's block is a settings overlay: the deny rule `Bash(git push:*)` plus one more `GIT_CONFIG_*` entry setting `url.sidekick-push-blocked::.pushInsteadOf`. `workerOverlay` merges it onto the profile's `settings`, and both reach `claude` through the `--settings` argument `profile-launch.ts` builds. So a profile holding the same two keys gets the same block through `profile launch`. The 2026-10-14 worker bench measured both under `bypassPermissions`.
- **`worktree.bgIsolation` through a profile:** not probed.

### Not tested

- A reboot followed by an attach.
- MCP scoping to the plugin's `.mcp.json`.
- Whether the agent's `skills` field works in a main session.

## Later readings

[2026-11-11-native-facts-recheck.md](./2026-11-11-native-facts-recheck.md) re-reads the docs and the binary on Claude Code 2.1.322. It explains the `initialPrompt` result: the sub-agents docs say the field is ignored for plugin subagents. This record keeps what was known on 2026-11-08.
