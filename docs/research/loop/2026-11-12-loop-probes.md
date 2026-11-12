> Research for the `loop` design (`docs/designs/loop/`), measured for issue #360, R11 plan 1. Run 2026-11-12 by Claude for the operator, on Claude Code 2.1.322, from the worker `r11-probes` (session b9315799) in its worktree. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Loop probes on Claude Code 2.1.322 (2026-11-12)

These probes answer the rows of #360 that the loop design left unmeasured. Each result names the build, the command, and the evidence file. Local time in the probes is GMT.

## Sources

The probe folder is `docs/superpowers/probes/2026-11-12-r11/` in the main checkout, written `<P>` here. Git ignores it, so this record names its files without linking them. Its `evidence/` folder holds every excerpt cited here.

- The probe sessions, listed in §Sessions. For each one, `evidence/` holds the transcript printed by `bin/tx.py`, the raw transcript (`.jsonl`), and the subagent transcripts (`.subagents/`). It also holds the job record (`-job.json`) and the debug log (`r11p-<name>-debug.log`).
- `evidence/u9-decisions.txt`, one line per tool call in the U9, U20, and U24 sessions, with the call's permission decision and result. `bin/decisions.py` writes it from the raw transcripts.
- `evidence/u9-layers.txt`, the settings layers read before the runs, and `evidence/u9-disk.txt`, the files and commits the calls left.
- `evidence/pollfull-r11p-u12-busy.jsonl`, U12's poll of one session's agents row and job record, written by `bin/pollfull.sh`. `bin/u12-fields.py` compares its samples into `evidence/u12-fields.txt`.
- The Claude Code docs, fetched on 2026-11-12 into `evidence/docs/` from `https://code.claude.com/docs/en/`. This record cites `permissions.md`, `tools-reference.md`, `skills.md`, `settings-reference.md`, `agent-view.md`, `scheduled-tasks.md`, and `plugins-loading.md` (the page `plugins/loading.md`).

## Sessions

Each Task 2 session launched through `bin/launch.sh`, from `<P>/wd` unless its row says otherwise, as:

```sh
env -u SIDEKICK_WORKER -u SIDEKICK_MAIN claude --bg <other flags> --name <name> --model haiku --effort low \
  --permission-mode dontAsk --plugin-dir <P>/probe-r11 --agent probe-r11:role \
  --debug-file <P>/evidence/<name>-debug.log "<prompt>"
```

The table gives each session's other flags. `sessions.tsv` holds every full command, and `prompts/` every prompt.

**Probes from 14:32 on launch with an auto-update guard.** Each `--settings` file under `<P>/settings/` sets `"env": {"DISABLE_AUTOUPDATER": "1"}`, and `bin/launch.sh` adds `settings/guard-env.json` to a launch that names none. The guard exists because an unguarded probe updated a user-scope plugin, as §Found on the way: a probe's plugin auto-update says. The plugin docs say that variable turns the whole auto-update pass off (`plugins-loading.md:394`). `r11p-guard-env` checked it on this build.

The plugin state column gives the user-scope superpowers each session launched with. It was 6.4.1 until 13:53:28. From then until the orchestrator's restore at 14:42:56, it was 7.0.0, and sidekick failed its `^6.4.1` pin. §Found on the way: a probe's plugin auto-update gives both times. Only `r11p-u9-control` loads the user layer's plugins, so the state changes what that session alone loaded.

| Name | Id | Launched | Plugin state | Other flags | Tests |
|---|---|---|---|---|---|
| `r11p-u9-target` | `8dc9b397` | 13:50:22 | 6.4.1; its own pass made the update at 13:53:28 | `--setting-sources project,local` | The target of every `SendMessage`, itself in `dontAsk` |
| `r11p-u9-bare-tick` | `217e0c65` | 13:50:58 | 6.4.1 | `--setting-sources project,local`, prompt `/probe-r11:tick r11p-u9-bare-tick` | A typed slash command with no allow rules |
| `r11p-u9-bare` | `6b42e54a` | 13:50:59 | 6.4.1 | `--setting-sources project,local --add-dir <P>/fake-store` | The call list with no allow rules, its edit targets in the shared checkout |
| `r11p-u9-bare-wt` | `1aaa127d` | 13:57:52 | 7.0.0 | As `r11p-u9-bare` | The call list with no allow rules, its edit targets in a linked worktree |
| `r11p-u9-allowed` | `15182095` | 13:57:52 | 7.0.0 | As `r11p-u9-bare`, plus `--settings <P>/settings/u9-allowed.json` | The call list under the narrowest allow rules |
| `r11p-u24-control` | `36e79ddf` | 13:58:15 | 7.0.0 | `--setting-sources project,local --settings <P>/settings/u24.json --plugin-dir <P>/probe-approve` | Deny rules against a `PreToolUse` hook's approval and a mod's |
| `r11p-u9-allowed2` | `b5139ffd` | 13:59:03 | 7.0.0 | `--setting-sources project,local --settings <P>/settings/u9-allowed2.json` | A `Write` under an `Edit` rule |
| `r11p-u9-control` | `ff63b655` | 13:59:04 | 7.0.0, so sidekick did not load | `--add-dir <P>/fake-store`, with every setting layer | The `r11p-u9-bare-wt` call list with the user layer loaded |
| `r11p-u21-idle` | `79b5809e` | 13:59:48 | 7.0.0 | From `<P>`, `--setting-sources project,local --settings <P>/settings/u21.json` | U21's idle subject, codeword `HERON-41`, left running for Task 6 |
| `r11p-u21-stop` | `9aba110f` | 13:59:48 | 7.0.0 | As `r11p-u21-idle` | U21's subject that Task 6 stops by hand, codeword `OTTER-72`, left running |
| `r11p-guard-env` | `5aa55c99` | 14:32:50 | 7.0.0 | `--setting-sources project,local --settings <P>/settings/guard-env.json`, prompt `Reply ok` | Whether `DISABLE_AUTOUPDATER=1` in `--settings` stops the plugin auto-update pass |

The two U21 subjects launched before the guard existed. `u21.json` gained it afterwards, so Task 6's restarts from that path carry it.

Every session but the two U21 subjects was stopped and removed: the matrix at about 14:08, `r11p-guard-env` after its check. `claude rm` removed each job record but left its transcript under `~/.claude/projects/`. That contradicts `2026-11-08-loop-probes.md` §Sources, which found on 2.1.319 that `claude rm` deletes the transcript.

**Task 3's sessions** launched the same way, from `<P>/wd` with `--setting-sources project,local`. Each ran under user-scope superpowers 6.4.1, as restored at 14:42:56 (`evidence/t3-plugin-state.txt`). None loads the user layer, so none loaded superpowers or sidekick. Each loaded `probe-r11` and Claude Code's built-in mods (`r11p-u5-list-debug.log:50-78`), and no debug log holds a `Plugin loading errors` line. Each logged "Plugin autoupdate: skipped (auto-updater disabled)" within two seconds of its launch.

| Name | Id | Launched | Plugin state | Other flags | Tests |
|---|---|---|---|---|---|
| `r11p-u5-list` | `982752ac` | 14:57:33 | 6.4.1 | `--settings <P>/settings/guard-env.json`, which `launch.sh` adds | U5: two recurring jobs and a one-shot, then `CronList`, and `CronList` at each fire |
| `r11p-u11-respawn` | `26d5b3f0` | 14:57:31 | 6.4.1 | `--settings <P>/settings/u11.json` | U11: a one-shot due at 15:11 and a one-minute control, across a stop and respawn at 14:59 |
| `r11p-u2-clear` | `70988425` | 14:57:32 | 6.4.1 | `--settings <P>/settings/u2.json` | U2: a two-minute tick, with a cron-fired `/compact` at 15:07 and `/clear` at 15:13 |
| `r11p-u12-busy` | `f96cbb90` | 14:57:32 | 6.4.1 | `--settings <P>/settings/u12.json` | U12: a two-minute tick that runs `bin/busy75.sh`, polled every 10 seconds |

`u11.json` and `u2.json` allow the tick's write, `Edit(//<P>/ticks/**)`. `u12.json` adds `Bash(sleep 75)` and `Bash(<P>/bin/busy75.sh)`. Each sets the guard. The debug logs show the local layer's `WebFetch` rule and these `--settings` rules loading, and no other (`r11p-u11-respawn-debug.log:42-43`). This task stopped the four between 15:01 and 15:15, which ended their jobs, and removed them at 15:15. `claude agents --json --all` then listed none of them (`evidence/t3-end-agents.json`).

## Results by row

### U9: what `dontAsk` denies a background loop, and the rule that allows each

**Measured** on Claude Code 2.1.322, in `r11p-u9-bare`, `r11p-u9-bare-wt`, `r11p-u9-allowed`, and `r11p-u9-allowed2`. Each ran the role agent under `dontAsk` with `--setting-sources project,local`. The working folder `<P>/wd` sits inside the sidekick checkout and has no `.claude/` of its own. `r11p-u9-bare` put its edit targets in `wd/` itself. The later runs put them, and the commit, in `wd/matrix-wt`, a linked worktree of the toy repo `wd/matrix-repo`. The fake memory store `<P>/fake-store` sits outside the working folder and joins by `--add-dir`. `<P>/allow-rules.json` holds the spellings for later tasks.

Plugin state: `r11p-u9-bare` launched under superpowers `6.4.1`, and the other three under `7.0.0`. None of the four loads the user layer's plugins, so the state changed nothing they loaded.

| Call | With no allow rule | Narrowest rule that let it run | `u9-decisions.txt` lines |
|---|---|---|---|
| `/probe-r11:tick`, typed or fired by cron | Expands with no tool call | None needed | None: `u9-bare-tick.txt`, and `u9-bare.txt` at 13:55:00 |
| `Skill` for `probe-r11:tick` | Runs | None needed | 4, 57 |
| The tick's `date -u … >> <P>/ticks/<name>.log` | Denied | `Edit(//<P>/ticks/**)`, inferred | 5, 58, 78 |
| `CronCreate` a day out, `CronList`, `CronDelete` | Run | None needed | 7–10 |
| `Agent` with `general-purpose` | Runs | None needed | 11, 64 |
| The subagent's `Edit` and `Bash` | Denied | The parent's rules | 54–55, 81–82 |
| `Edit` in the linked worktree | Denied | `Edit(//<folder>/**)` | 39, 66 |
| `Write` of a new file in the linked worktree | Denied | `Edit(//<folder>/**)`, after `Write(//<folder>/**)` failed | 40, 67, 84 |
| `Write` in the `--add-dir` store | Denied | `Edit(//<P>/fake-store/**)` | 41, 68 |
| `Read` in the working folder | Runs | None needed | 42 |
| `Bash(bun run test)` | Denied | `Bash(bun run test)` | 47, 74 |
| `Bash(git commit …)` | Denied | `Bash(git commit *)`, inferred | 48–50, 75–77 |
| `Bash(sidekick --version)` | Denied | `Bash(sidekick --version)` | 45, 72 |
| `Bash(cd <folder>)` | Runs, as a read-only command | None needed | 46 |
| `ListAgents`, then `SendMessage` to `r11p-u9-target` | Run, and the message arrived | None needed | 43–44 |
| `PushNotification` | Runs, but sends nothing | None needed | 19 |

Two cells say "inferred". There the allowed call's entry records `reasonType: "subcommandResults"`, not `"rule"`. The rule's part comes by difference: the same command was rejected in `r11p-u9-bare-wt`, which lacked the rule.

What the measurements show:

- **The calls that need a rule are the ones that would prompt in Manual mode:** file writes, and `Bash` past the read-only set. The tools reference's "Permission required" column predicted each tool but `Skill`. The skills docs cover `Skill`: "By default, Claude can invoke any skill that doesn't have `disable-model-invocation: true` set" (`skills.md:862`).
- **A `Write(path)` rule never matches, and `Edit(path)` covers `Write`.** The permissions docs say so under "`Write(path)`, `Glob(path)`, and `Grep(path)` rules don't match". The `//` form of an absolute path, `Edit(//Users/…/**)`, worked. The docs say a single leading slash anchors at the settings file instead (`permissions.md:372,379`); no run tried that form.
- **A redirect outside the working folders needs an `Edit` rule.** `date` is read-only, so the tick's `Bash` ran once `Edit(//<P>/ticks/**)` covered its target. The bare denial's suggested fix was to add `ticks/` as a directory (`r11p-u9-bare-tick-debug.log:352`).
- **A cron-fired tick and the model's `Skill` call are different events.** A cron fire writes a `scheduled_task_fire` entry, and the tick arrives as a slash command with no `Skill` call. The tick's own `Bash` is still checked. It was denied in `r11p-u9-bare` at 13:55:02, and ran in `r11p-u9-allowed` at 14:02:02 (`u9-disk.txt`).
- **A background session refuses edits in the shared checkout before any permission check.** In `r11p-u9-bare`, `Edit` and `Write` in `wd/` returned "This background session hasn't isolated its changes yet. Call EnterWorktree first…". The key is `worktree.bgIsolation`, default `"worktree"` (`settings-reference.md:4846`). A file in a linked worktree, or outside the working folder, passes the guard (`agent-view.md:584-592`). So `r11p-u9-bare-wt` moved the targets into a linked worktree, where the mode's denial showed.
- **`cd` persisted across calls.** `bun run test` printed `$ echo r11-test-ok`, the worktree's script, not the `wd/` script's `r11-test-ok-wd`.
- **`Bash(git commit *)` matched a message the model extended** with a `Co-Authored-By` trailer on a new line. The commit landed as `3608aac` on the branch `probe-wt` (`u9-disk.txt`).
- **`PushNotification` passed the permission check and sent nothing.** Its result read "Not sent — this terminal is active, so your output here already reaches the user". It ran once, in `r11p-u9-bare`. Delivery is U14's, for the operator-present run.
- **A plugin's MCP tool is denied with no rule.** `r11p-u9-control` called `mcp__plugin_probe-r11_ping__ping` unasked, and the mode denied it (`u9-decisions.txt:89`). This task tried no allow spelling for it; the ping server's own probe can.

The layers each session loaded, from its debug log:

- **`--setting-sources project,local` read the project layer from `wd/.claude/` alone, which is absent.** The main checkout's `.claude/settings.json` was not read. The docs say project settings load "from the current working directory's `.claude/` folder with no parent-directory fallback" (`permissions.md:727`).
- **The local layer came from the git root,** the main checkout's `.claude/settings.local.json`. Its one allow rule, `WebFetch(domain:raw.githubusercontent.com)`, loaded (`r11p-u9-target-debug.log:42,200`). No call here was a fetch.
- **These sessions loaded `probe-r11`, Claude Code's built-in mods, and no installed plugin** (`r11p-u9-target-debug.log:59-84`). The built-ins loaded varied: four in some sessions, and six in others, which added `cc-plugin-diff` and `cc-plugin-easel` (`r11p-u9-bare-debug.log:83-84`). Every session loaded `cc-plugin-plugin-authoring` and `cc-plugin-privacy`, which handle `tool.check`.
- **`r11p-u9-control` loaded every layer, and matched `r11p-u9-bare-wt` call for call.** The user layer's `~/.claude/settings.json` holds no allow rule. `~/.claude/settings.local.json` holds seven, and none loaded. The docs say Claude Code "reads it only in sessions you start in your home directory itself" (`permissions.md:802`).
- **In the control, sidekick 0.7.2 failed to load:** "Requires "superpowers@claude-plugins-official" ^6.4.1, installed 7.0.0" (`r11p-u9-control-debug.log:24`). The control launched at 13:59:04, in the 7.0.0 window that this run's own probe `r11p-u9-target` opened at 13:53:28. §Found on the way: a probe's plugin auto-update has the details.
- **So the control's answer on what the user layer adds lacks sidekick.** It measured the user layer's rules and its other plugins, not sidekick's hooks and mods. sidekick 0.7.2's mods have no `tool.check` handler (`u9-layers.txt`), so by reading they would change no permission result. No run measured it.
- **The sessions launched before 13:53 never enabled sidekick,** so its dependency could not fail there. At 13:50:22, `r11p-u9-target` found two plugins with none enabled, then eight with five enabled: `probe-r11` and the built-ins (`r11p-u9-target-debug.log:16,59`).

### U20: what a unit worker under `dontAsk` needs allowed

**Measured** on Claude Code 2.1.322, in the U9 sessions. `evidence/u20-subagent.txt` holds the subagent's calls in each run, with their permission decisions. The other evidence is U9's. Plugin state is U9's: the bare run under superpowers 6.4.1, the rest under 7.0.0, the control without sidekick. A unit worker needs a rule for each call U9 found denied, and nothing for its subagents:

- **`Skill` and `Agent` need no rule.**
- **A subagent runs under the parent's mode and allow list.** In `r11p-u9-bare-wt`, the subagent's `Edit` and `Bash` were denied with `reasonCode: "mode:dontAsk"`. In `r11p-u9-allowed`, both passed on the parent's `--settings` rules, recorded as `reasonType: "rule"` and `ruleSource: "flagSettings"` (`u20-subagent.txt:17-22,27-32`). The worker's own mandate must therefore cover its subagents' calls.
- **A subagent meets the edit guard too.** In `r11p-u9-bare`, its `Edit` returned "This subagent's parent bg session hasn't isolated yet, so writes to the shared checkout are blocked" (`u20-subagent.txt:10`).
- **Edits in its worktree need `Edit(//<worktree>/**)`,** which covers `Write`.
- **The gates and the commit need `Bash(bun run test)` and `Bash(git commit *)`.** The toy repo's `bun run test` runs a one-line script in place of sidekick's suite, since a `Bash` rule matches the command's text, not what it runs.
- **`SendMessage` needs no rule.** Each message from a `dontAsk` sender reached the `dontAsk` target, marked `from-mode="prompting"` (`u9-target.txt`).
- **`sk-save`'s writes to the memory store need `Edit(//<store>/**)`.** Adding the store by `--add-dir` let no write through (`u9-decisions.txt:41`).

### U13: how a call `dontAsk` denies shows in a transcript

**Measured** on Claude Code 2.1.322, from the raw transcripts of `r11p-u9-bare`, `r11p-u9-bare-wt`, `r11p-u9-allowed`, and `r11p-u24-control`. `bin/denials.py` and `bin/decisions.py` read them, into `evidence/u13-denials.txt` and `evidence/u9-decisions.txt`. Plugin state: `r11p-u9-bare` launched under superpowers 6.4.1, and the other three under 7.0.0. None loads the user layer's plugins.

- **The tool result has `is_error: true`,** and its text names the cause. The mode's denial starts "Permission to use Bash has been denied because Claude Code is running in don't ask mode." A deny rule's reads "Permission to use Bash with command echo r11-denied has been denied."
- **The result's entry carries two fields of its own.** `permissionDecision` reads `{"decision": "reject", "source": "config", "reasonType": "mode", "reasonCode": "mode:dontAsk"}` for the mode. For a `--settings` deny rule, it reads `"reasonType": "rule", "ruleSource": "flagSettings", "reasonCode": "rule:flagSettings"`. Both set `toolDenialKind: "permission-rule"`.
- **An allowed call's entry carries `"decision": "accept"`,** with a `reasonType` of `mode`, `rule`, `hook`, or `subcommandResults`, or none.
- **So a reader can count denials from the transcript alone.** Count the `user` entries whose `permissionDecision.decision` is `reject`. Skip the `api-request-blob` entries, which copy each result without these fields. Read a subagent's transcript too, under `<session id>/subagents/`.
- **Two refusals escape that count.** The edit guard's refusal is a `tool_use_error` with no `permissionDecision` (`u9-decisions.txt:13-14`). A mod's approval past a deny rule records as `"decision": "accept", "reasonType": "hook"`, with no trace of the rule (`u9-decisions.txt:113`). The override shows only in the debug log: "tool.check Bash …: deny -> allow by plugins probe-approve, cc-plugin-privacy" (`r11p-u24-control-debug.log:398`).
- **The job record holds no denial field.** Its `state`, `detail`, and `needs` come from a classifier that reads the turn's end (`r11p-u9-bare-tick-debug.log:381`). After denied ticks, `r11p-u9-bare-tick` and `r11p-u9-bare-wt` read `state: blocked`, while `r11p-u9-bare` and `r11p-u9-control` read `state: done` (their `-job.json` files). The record cannot count denials.

### U24's control: a deny rule against a hook's approval and a mod's

**Measured** on Claude Code 2.1.322, in `r11p-u24-control`. Its `--settings` denies `Bash(echo r11-denied)` and `Bash(echo r11-mod-denied)`. Its plugin `probe-approve` holds a `PreToolUse` hook that approves `echo r11-denied`, and a mod whose `tool.check` approves `echo r11-mod-denied`. Each logs what it sees, to `evidence/u24-hook.log` and `evidence/u24-mod.log`.

The session loaded three layers, by its debug log. The project layer, `wd/.claude/settings.json`, is absent (line 3). The local layer, the main checkout's `.claude/settings.local.json`, holds one allow rule, `WebFetch(domain:raw.githubusercontent.com)` (line 42). `--settings` holds the two deny rules and no allow rule (line 43). It loaded `probe-r11`, `probe-approve`, and six built-in mods (lines 63, 151-158). It launched at 13:58:15, under superpowers 7.0.0, and loaded neither superpowers nor sidekick.

| Call | What approves it | Result | Evidence |
|---|---|---|---|
| `echo r11-denied` | The `PreToolUse` hook, which answered `allow` | Denied: "Permission to use Bash with command echo r11-denied has been denied." | `u24-hook.log`, `u9-decisions.txt:112` |
| `echo r11-mod-denied` | The mod, which answered `allow` | Ran, and printed `r11-mod-denied` | `u24-mod.log`, `u9-decisions.txt:113` |
| `echo r11-control` | Nothing, and no rule names it | Ran, as a read-only command | `u9-decisions.txt:114` |

- **A deny rule holds against a `PreToolUse` hook,** as the docs say.
- **A mod's `allow` overrides a deny rule on this account.** The mod's log shows Claude Code's own decision before it answered: `"decision":"deny"` with `"rule":"Bash(echo r11-mod-denied)"`. The mod returned `allow`, and the command ran. The debug log records "deny -> allow by plugins probe-approve, cc-plugin-privacy" (`r11p-u24-control-debug.log:398`). Why it names the built-in `cc-plugin-privacy` beside the probe's mod is not known.
- **The built-in guard did not load:** "cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (max)" (`r11p-u24-control-debug.log:78`). This is the setup U23's answer names: a personal subscription, with no managed settings.
- **The operator-present run repeats this** with the deny rules in a managed settings file. It shows whether the guard then loads, and the mod's `allow` stops working.

The permissions docs on a hook's approval against a deny rule (`permissions.md:635`):

> PreToolUse hook decisions don't bypass permission rules. Claude Code evaluates deny and ask rules regardless of what a PreToolUse hook returns: a matching deny rule blocks the call, and a matching ask rule still prompts even when the hook returned `"allow"` or `"ask"`.

And on a mod's (`permissions.md:645`):

> Your setup might lack managed settings, a `managed-mcp.json` file, and a Team or Enterprise `/login` as the session's credential. In that setup, the mod can approve a call that a deny rule refuses or a `PreToolUse` hook blocked.

### Found on the way: a probe's plugin auto-update

**Measured** on Claude Code 2.1.322: this run's probe `r11p-u9-target` updated a user-scope plugin. Sessions load an updated plugin from their next launch (`plugins-loading.md:384`). So every session launched on this Mac from 13:53:28 to the orchestrator's restore at 14:42:56 had `7.0.0`. The probe's debug log reads "Plugin autoupdate: checking installed plugins" at 13:53:26. Then, at 13:53:28, it reads "Plugin autoupdate: updated superpowers@claude-plugins-official from 6.4.1 to 7.0.0" (`r11p-u9-target-debug.log:376,411`). sidekick 0.7.2 pins superpowers at `^6.4.1`, so sidekick failed to load in the control, launched at 13:59.

- **Every unguarded probe ran the pass,** 1.1 to 8.6 minutes after its launch (each `r11p-*-launch.txt` against its debug log). That includes the two U21 subjects, at 14:07 and 14:08. Only `r11p-u9-target`'s pass found a version to install. The plugin docs give the delay: "Claude Code waits a random delay of up to ten minutes" (`plugins-loading.md:382`).
- **The all-layer control's pass kept to the pin.** It logged "superpowers@claude-plugins-official Skipped — sidekick@rikmorn requires superpowers at a version range that 7.0.0 does not satisfy" (`r11p-u9-control-debug.log:1126,1133`).
- **The mechanism, inferred from those two logs:** a session that loads no layer enabling sidekick never sees sidekick's pin. Its pass then moves user-scope superpowers past that pin. The probes left the user layer out, and their working folder has no `.claude/` of its own.
- **During the run, only `claude-plugins-official` auto-updated on this Mac,** by the docs' default (`plugins-loading.md:392`). The orchestrator read the machine's marketplace records, and none set `autoUpdate`.
- **The orchestrator restored superpowers 6.4.1 at 14:42:56,** at user scope and in this repo's project scope. `~/.claude/plugins/installed_plugins.json` records that time, by the controller's reading. A new session loaded sidekick again at 14:43, by the orchestrator's check. The orchestrator also turned auto-update off for the official marketplace. This run touched nothing under `~/.claude/plugins/`.

**The guard is the probes' lock.** Every probe launch carries `"env": {"DISABLE_AUTOUPDATER": "1"}` in its `--settings` file. `bin/launch.sh` adds `settings/guard-env.json` to a launch that names none, and refuses a settings file without the variable.

- **Evidence:** `r11p-guard-env` logged "Plugin autoupdate: skipped (auto-updater disabled)" one second after launch (`r11p-guard-env-debug.log:196`). It logged no check in the 12 minutes after its first turn (`guard-env.txt`).
- **Docs:** `https://code.claude.com/docs/en/plugins/loading.md` §When auto-update runs says the variable turns the whole pass off (`plugins-loading.md:394`).

### U5: what `CronList` shows of a job

**Measured** on Claude Code 2.1.322, in `r11p-u5-list`, with the other Task 3 sessions as further samples. **`CronList` shows no job's age.** The session made two recurring jobs, one every two minutes and one daily at 09:07. It made a one-shot job for 13:00 the next day, then called `CronList` (`u5-list.txt:34-45`). The two-minute job's prompt called `CronList` again at each fire (`u5-list.txt:55-57,65-67`).

The listing at creation (`u5-list.txt:43-45`):

```text
d1ee4f10 — Every 2 minutes (recurring) [session-only], next run Nov 12 2:59pm: Call CronList once, then reply with the single word listed.
c03e0cad — Every day at 9:07 AM (recurring) [session-only], next run Nov 13 9:37am: Reply with the single word daily.
30908c8f — 0 13 13 11 * (one-shot) [session-only], next run Nov 13 1:00pm: Reply with the single word later.
```

| Field | What `CronList` shows | Evidence |
|---|---|---|
| Id | The 8-character id that `CronCreate` returned | `u5-list.txt:34,43` |
| Schedule | Words for a recurring job, such as `Every 2 minutes`; the cron expression for a one-shot | `u5-list.txt:43-45` |
| Kind | `(recurring)` or `(one-shot)` | `u5-list.txt:43-45` |
| Scope | `[session-only]` on every job | `u5-list.txt:43-45` |
| Next run | The next fire's time, jitter included, to the minute | `u5-list.txt:43`; `r11p-u5-list-debug.log:439-441` |
| Prompt | Whole for the prompts of 59 characters or fewer. The two of 141 and 535 characters were cut to their first 79, then `…` | `u5-list.txt:43`, `u11-respawn.txt:36`, `u12-busy.txt:40` |
| Creation time, age, expiry, last run | None | `u5-list.txt:43-45,55-57,65-67` |

What the measurements show:

- **Nothing in the listing ages.** Across two fires, only the two-minute job's next run moved, from 2:59pm to 3:01pm, then to 3:03pm (`u5-list.txt:43,55,65`). `CronCreate`'s result says "Auto-expires after 7 days", with no date (`u5-list.txt:34`).
- **The next run includes the jitter.** The debug log gives each due time. The two-minute job was due at 14:58:49.202, 49 seconds late. The daily job was due at 09:37:00, 30 minutes late. The 13:00 one-shot was due at 12:59:42.926, 17 seconds early (`r11p-u5-list-debug.log:439-441`).
- **That matches the docs.** A recurring job runs "late by up to half the gap to the next run, and by at most 30 minutes". A one-shot at `:00` or `:30` "runs up to 90 seconds early" (`scheduled-tasks.md:188,207`).
- **The listed time is the due time rounded to the nearest minute,** in every job this task listed. `r11p-u12-busy`'s job, due at 14:58:23.629, listed as 2:58pm (`r11p-u12-busy-debug.log:431`, `u12-busy.txt:40`).
- **A fire's label names the scheduled minute.** The two-minute job fired at 14:58:50 as "Running scheduled task (Nov 12 2:58pm)" (`u5-list.txt:51`).
- **The job record counts a session's pending jobs, and names none.** `r11p-u5-list`'s record read `"tasks": 3` with `"kinds": ["session_cron"]` under `inFlight` (`u5-list-job.json`). `r11p-u2-clear`'s read `"tasks": 1` once its two one-shots had fired (`u2-clear-job.json`). The record's `timeline.jsonl` holds the ids only inside the model's reply text (`u5-list-timeline.jsonl`).
- **Sessions in one working folder share a scheduler lock.** The scheduler wrote `<P>/wd/.claude/scheduled_tasks.lock`, naming one session (`t3-scheduled_tasks.lock`). The other sessions logged "scheduler lock held by session …" and fired their jobs anyway (`r11p-u2-clear-debug.log:373,429`). Why a session takes the lock is not known. The file was gone by 15:15, leaving `wd/.claude/` empty.

So, for the arm skill (`design.md:560`):

- **It can tell its own jobs by id, or by prompt.** `CronCreate` returns each id, and the state file can keep it. A match by prompt holds only while each prompt differs from the others within its first 79 characters.
- **A match by schedule needs the listing's wording.** It shows `Every 2 minutes` for `*/2 * * * *`, not the expression. This task saw three such wordings only.
- **It cannot learn from `CronList` when to renew.** The listing shows no creation time, age, or expiry. The time the state file records at arming (`design.md:561`) is the only clock.
- **A renewal due off the hour and half hour fires on time.** U11's one-shot for 15:11 fired at 15:11:00.952, as the docs say for any minute but `:00` and `:30` (`scheduled-tasks.md:207`).

### U11: a one-shot job across `claude stop` then `claude respawn`

**Measured** on Claude Code 2.1.322, in `r11p-u11-respawn`. **The one-shot survived the respawn and fired on time.** The session made a one-shot for 15:11, and a recurring control every minute. The control's prompt calls `CronList`, then the tick (`u11-respawn.txt:30-36`). This task stopped the session at 14:59:31 and respawned it at 14:59:38, by its own id (`u11-stop-respawn.txt`).

| Time | Event | Evidence |
|---|---|---|
| 14:57:39 | Both jobs scheduled, the one-shot for 15:11:00.000 | `r11p-u11-respawn-debug.log:390-391` |
| 14:58:12, 14:59:13 | The control fires twice | `r11p-u11-respawn-debug.log:400,503`; `u11-control-ticks.log` |
| 14:59:14 | The last `CronList` before the stop lists both jobs | `u11-respawn.txt:70` |
| 14:59:31 | `claude stop 26d5b3f0`; the session releases the scheduler lock | `u11-stop-respawn.txt`; `r11p-u11-respawn-debug.log:608` |
| 14:59:38 | `claude respawn 26d5b3f0`: a new pid, the same session id | `u11-stop-respawn.txt` |
| 14:59:39 | "resume: resurrected 2 session cron task(s)", and the one-shot is due again at 15:11:00.000 | `r11p-u11-respawn-debug.log:810,860` |
| 15:00:14 | The first `CronList` after the respawn lists both jobs | `u11-respawn.txt:90` |
| 15:11:00.952 | The one-shot fires, and its tick writes its line | `r11p-u11-respawn-debug.log:2166`; `u11-respawn.txt:308,320`; `u11-oneshot-ticks.log` |
| 15:11:13 | `CronList` lists only the control | `u11-respawn.txt:331` |

- **The control fired every minute across the respawn,** 14 times from 14:58:17 to 15:11:15, with no gap at the stop (`u11-control-ticks.log`). The stop spanned no scheduled run, so no missed run was tested.
- **The one-shot deleted itself after its fire,** as `CronCreate`'s result said: "It will fire once then auto-delete" (`u11-respawn.txt:30`).
- **Between the stop and the respawn,** `claude agents --json --all` listed the session with no `pid` and no `status`, and with `state: working` (`u11-stop-respawn.txt`).
- **This matches the docs' rule for a resume.** It restores every job but an expired recurring one and a one-shot whose time has passed (`scheduled-tasks.md:241`). No run here let a one-shot's time pass during the stop.
- **The design's stance holds:** a one-shot renewal survives a respawn (`design.md:577`). `2026-11-08-loop-probes.md` measured the same of a recurring job on 2.1.319.

### U2: a cron job across a cron-fired `/compact` and `/clear`

**Measured** on Claude Code 2.1.322, in `r11p-u2-clear`. **A cron-fired `/compact` or `/clear` does not run as a command:** each reaches the model as plain text. So this run could not test whether a cron job survives a compaction or a clear. **U2's typed variant is deferred to the operator-present run.**

The session ticked every two minutes with `/probe-r11:tick r11p-u2-clear`. It held a one-shot whose prompt is `/compact` at 15:07, and one whose prompt is `/clear` at 15:13 (`u2-clear.txt:34-38`).

- **The tick arrives as a command, and `/compact` and `/clear` as text.** Each tick fire wrote a `user` entry wrapping the skill in `<command-name>/probe-r11:tick</command-name>`. The `/compact` fire wrote a `user` entry whose content is the bare string `/compact`, marked `isMeta: true`. The `/clear` fire did the same (`u2-compact-entries.txt`, raw lines 169, 194, and 261).
- **Neither command ran.** The model answered each in prose (`u2-clear.txt:144-147,208-211`). The transcript holds no `compact_boundary` entry. Every entry that names a session names the same one, and the transcript went on in the same file after the clear (`u2-clear.jsonl`).
- **The tick kept firing,** every two minutes from 14:58:51 to 15:14:49 (`u2-ticks.log`). That includes 15:08:50, after the `/compact`, and 15:14:49, after the `/clear`.
- **The docs say a scheduled fire runs no built-in command.** Such commands "reach Claude as plain text instead of executing", and `/clear` is one they name (`scheduled-tasks.md:50-52`).

What follows:

- **A loop cannot clear or compact its own context on a schedule.** A tick that wants a fresh context per unit runs the unit in a subagent or a worker, as the design's stance already says (`design.md:564`).
- **Two questions stay open.** One is whether a cron job survives a `/compact` or `/clear` typed into an attached session. The other is whether it survives auto-compaction, which this run did not try. The operator-present run can type both commands into an attached probe that holds a tick.

### U12: what tells a loop mid-tick from one between ticks

**Measured** on Claude Code 2.1.322, in `r11p-u12-busy`. **The row's `status` in `claude agents --json` tells them apart, and its `state` does not.** The job record tells them apart by `state`, `tempo`, and `lastTerminalAt`.

The session ran a tick every two minutes: a timestamp, then `bin/busy75.sh`, then a timestamp. `bin/pollfull.sh` read its agents row and whole job record every 10 seconds, from 14:57:41 to 15:06:42. That spans four full ticks (`pollfull-r11p-u12-busy.jsonl`). `bin/u12-fields.py` took each tick's window from the transcript, from its `scheduled_task_fire` entry to its `turn_duration` entry. It compared 32 samples taken mid-tick with 13 taken between ticks. It left out 4 samples within 2 seconds of a window's edge (`u12-fields.txt`).

| Field | Mid-tick | Between ticks |
|---|---|---|
| `status`, in the agents row | `busy` | `idle` |
| `state`, in the agents row | `working` | `working` |
| `state`, in the job record | `working` | `done` |
| `tempo` | `active` | `idle` |
| `lastTerminalAt` | Absent | The last turn's end |
| `output.result` | Absent, with `output` set to `null` | A one-line summary of the turn |
| `fan` | The running shell call: its id, `"kind": "shell"`, the command, and its start | Absent |
| `detail` | The classifier's line on the current step | Its line on the finished turn |
| `inFlight` | `"tasks": 1`, `"kinds": ["session_cron"]` | The same |

- **Read `status`, never the row's `state`.** The row's `state` read `working` in every sample, while the record's read `done` between ticks. The pending job likely holds the row there, since a row with no job pending read `state: done` (`guard-env-agents.json`). That reading was not checked further.
- **The record's `state` lags at a tick's start.** At 15:00:24, within a second of the fire, `status` read `busy` and `tempo` read `active`. The record's `state` still read `done` (`pollfull-r11p-u12-busy.jsonl:17`).
- **`fan` shows only while a tool runs,** so a tick spent in the model would show none. Here the script ran for 75 of each tick's 82 or so seconds.
- **`tokens` and `linkScanOffset` differ too, but only because they grow.** Neither marks a phase.
- **A standalone `sleep 75` is refused before it runs.** The probe's `Bash` call `sleep 75` returned "Blocked: standalone sleep 75…", a `tool_use_error` with no permission decision (`u12-busy.txt:25`). This task's own session met the same refusal (`t3-controller-sleep-block.txt`). So the tick ran `bin/busy75.sh`, which sleeps inside a script, under the rule `Bash(<P>/bin/busy75.sh)`.
- **This task stopped the session mid-tick** at 15:07:25, so the fifth tick has no closing timestamp (`u12-ticks.log`).

So `start`'s idle wait holds if it reads `status` (`design.md:617,622`).

## What breaks

Each stance is cited by its line in `docs/designs/loop/design.md`.

| Stance | Answer | Effect | Issue |
|---|---|---|---|
| `design.md:479,571`: launch allows the tick skill and the cron tools, since `dontAsk` needs `Skill`, `CronList`, `CronCreate`, and `CronDelete` allowed | U9: none of those needs a rule. The tick's own `Bash` and file writes do | Narrows: launch adds `Bash` and `Edit` rules only | #364 |
| `design.md:496`: the fix class allows `Edit(<its worktree>/**)` | U9: `Edit(//<path>/**)` worked, and a `Write(…)` rule never matched. By the docs, a single leading slash anchors at the settings file (`permissions.md:372,379`); no run tried it | Narrows: the mandate compiler writes every file allow as `Edit(//…)` | #363 |
| `design.md:1129`: G4b holds for the plugins a loop session loads that approve nothing, and `start` lists them | U9: two built-in mods that handle `tool.check`, `cc-plugin-plugin-authoring` and `cc-plugin-privacy`, loaded in all 11 of this task's sessions. The debug log names `cc-plugin-privacy` in a deny-to-allow override (`r11p-u24-control-debug.log:398`) | Breaks: G4b's set includes built-ins that no profile leaves out | #364 |
| `design.md:1129`: a profile that leaves the user layer out loads only the role's plugins and sidekick | U9: with the user layer out and a working folder with no `.claude/`, sidekick did not load (`r11p-u9-target-debug.log:16,59`). By the docs, a working folder whose project settings enable sidekick loads it (`permissions.md:727`), as every sidekick worktree's do (`u9-layers.txt:46`); not measured | Narrows: in a repo whose project settings omit sidekick, launch passes sidekick itself | #362 |
| `design.md:422,1065,1129` and ADR-0015 line 42: a profile that leaves the user layer out makes a loop a clean room | A session that loads no layer enabling sidekick ran plugin auto-update without sidekick's superpowers pin. It moved user-scope superpowers from `6.4.1` to `7.0.0` under every session on this Mac (`r11p-u9-target-debug.log:376-426`). The orchestrator restored `6.4.1` at 14:42:56. Mechanism inferred from the logs | Breaks: a clean-room loop or worker must turn auto-update off, as `DISABLE_AUTOUPDATER=1` does, or load a layer that declares the pins | #366 |
| `design.md:560`: the arm skill reads `CronList`, deletes what does not match, and creates what is missing | U5: `CronList` shows each job's id, schedule, kind, next run, and the first 79 characters of its prompt. It shows no creation time, age, or expiry, and words a recurring schedule as `Every 2 minutes`, not its cron expression | Narrows: the arm skill matches its jobs by id, or by prompts that differ within 79 characters. It times the renewal from the state file's arm time | #364 |
| `design.md:564`: a tick that wants a fresh context per unit runs the unit in a subagent | U2: a cron-fired `/compact` or `/clear` reaches the model as text and runs nothing. Whether a cron job survives a typed one is deferred to the operator-present run | Narrows: a tick never schedules `/clear` or `/compact`, so the subagent or worker is the only route to a fresh context | #366 |
| `design.md:617,622`: `start` relaunches a loop only while `claude agents --json` reports it idle | U12: the row's `status` reads `busy` mid-tick and `idle` between ticks. Its `state` reads `working` in both | Narrows: `start` reads `status`, never the row's `state` | #364 |
