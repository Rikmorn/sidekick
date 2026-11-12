> Research for the `loop` design (`docs/designs/loop/`), measured for issue #360, R11 plan 1. Run 2026-11-12 by Claude for the operator, on Claude Code 2.1.322, from the worker `r11-probes` (session b9315799) in its worktree. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Loop probes on Claude Code 2.1.322 (2026-11-12)

These probes answer the rows of #360 that the loop design left unmeasured. Each result names the build, the command, and the evidence file. Local time in the probes is GMT.

## Sources

The probe folder is `docs/superpowers/probes/2026-11-12-r11/` in the main checkout, written `<P>` here. Git ignores it, so this record names its files without linking them. Its `evidence/` folder holds every excerpt cited here.

- The probe sessions, listed in §Sessions. For each one, `evidence/` holds the transcript printed by `bin/tx.py`, the raw transcript (`.jsonl`), and the subagent transcripts (`.subagents/`). It also holds the job record (`-job.json`) and the debug log (`r11p-<name>-debug.log`).
- `evidence/u9-decisions.txt`, one line per tool call in the U9, U20, and U24 sessions, with the call's permission decision and result. `bin/decisions.py` writes it from the raw transcripts.
- `evidence/u9-layers.txt`, the settings layers read before the runs, and `evidence/u9-disk.txt`, the files and commits the calls left.
- The Claude Code docs, fetched on 2026-11-12 into `evidence/docs/` from `https://code.claude.com/docs/en/`. This record cites `permissions.md`, `tools-reference.md`, `skills.md`, `settings-reference.md`, `agent-view.md`, and `plugins-loading.md` (the page `plugins/loading.md`).

## Sessions

Each Task 2 session launched through `bin/launch.sh`, from `<P>/wd` unless its row says otherwise, as:

```sh
env -u SIDEKICK_WORKER -u SIDEKICK_MAIN claude --bg <other flags> --name <name> --model haiku --effort low \
  --permission-mode dontAsk --plugin-dir <P>/probe-r11 --agent probe-r11:role \
  --debug-file <P>/evidence/<name>-debug.log "<prompt>"
```

The table gives each session's other flags. `sessions.tsv` holds every full command, and `prompts/` every prompt.

**Probes from 14:32 on launch with an auto-update guard.** Each `--settings` file under `<P>/settings/` sets `"env": {"DISABLE_AUTOUPDATER": "1"}`, and `bin/launch.sh` adds `settings/guard-env.json` to a launch that names none. The guard exists because an unguarded probe updated a user-scope plugin, as §Found on the way: a probe's plugin auto-update says. The plugin docs say that variable turns the whole auto-update pass off (`plugins-loading.md:394`). `r11p-guard-env` checked it on this build.

| Name | Id | Other flags | Tests |
|---|---|---|---|
| `r11p-u9-target` | `8dc9b397` | `--setting-sources project,local` | The target of every `SendMessage`, itself in `dontAsk` |
| `r11p-u9-bare-tick` | `217e0c65` | `--setting-sources project,local`, prompt `/probe-r11:tick r11p-u9-bare-tick` | A typed slash command with no allow rules |
| `r11p-u9-bare` | `6b42e54a` | `--setting-sources project,local --add-dir <P>/fake-store` | The call list with no allow rules, its edit targets in the shared checkout |
| `r11p-u9-bare-wt` | `1aaa127d` | As `r11p-u9-bare` | The call list with no allow rules, its edit targets in a linked worktree |
| `r11p-u9-allowed` | `15182095` | As `r11p-u9-bare`, plus `--settings <P>/settings/u9-allowed.json` | The call list under the narrowest allow rules |
| `r11p-u9-allowed2` | `b5139ffd` | `--setting-sources project,local --settings <P>/settings/u9-allowed2.json` | A `Write` under an `Edit` rule |
| `r11p-u9-control` | `ff63b655` | `--add-dir <P>/fake-store`, with every setting layer | The `r11p-u9-bare-wt` call list with the user layer loaded |
| `r11p-u24-control` | `36e79ddf` | `--setting-sources project,local --settings <P>/settings/u24.json --plugin-dir <P>/probe-approve` | Deny rules against a `PreToolUse` hook's approval and a mod's |
| `r11p-u21-idle` | `79b5809e` | From `<P>`, `--setting-sources project,local --settings <P>/settings/u21.json` | U21's idle subject, codeword `HERON-41`, launched at 13:59:48 and left running for Task 6 |
| `r11p-u21-stop` | `9aba110f` | As `r11p-u21-idle` | U21's subject that Task 6 stops by hand, codeword `OTTER-72`, launched at 13:59:48 and left running |
| `r11p-guard-env` | `5aa55c99` | `--setting-sources project,local --settings <P>/settings/guard-env.json`, prompt `Reply ok` | Whether `DISABLE_AUTOUPDATER=1` in `--settings` stops the plugin auto-update pass |

The two U21 subjects launched before the guard existed. `u21.json` gained it afterwards, so Task 6's restarts from that path carry it.

Every session but the two U21 subjects was stopped and removed: the matrix at about 14:08, `r11p-guard-env` after its check. `claude rm` removed each job record but left its transcript under `~/.claude/projects/`. That contradicts `2026-11-08-loop-probes.md` §Sources, which found on 2.1.319 that `claude rm` deletes the transcript.

## Results by row

### U9: what `dontAsk` denies a background loop, and the rule that allows each

**Measured** on Claude Code 2.1.322, in `r11p-u9-bare`, `r11p-u9-bare-wt`, `r11p-u9-allowed`, and `r11p-u9-allowed2`. Each ran the role agent under `dontAsk` with `--setting-sources project,local`. The working folder `<P>/wd` sits inside the sidekick checkout and has no `.claude/` of its own. `r11p-u9-bare` put its edit targets in `wd/` itself. The later runs put them, and the commit, in `wd/matrix-wt`, a linked worktree of the toy repo `wd/matrix-repo`. The fake memory store `<P>/fake-store` sits outside the working folder and joins by `--add-dir`. `<P>/allow-rules.json` holds the spellings for later tasks.

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
- **In the control, sidekick 0.7.2 failed to load:** "Requires "superpowers@claude-plugins-official" ^6.4.1, installed 7.0.0" (`r11p-u9-control-debug.log:24`). This run's own probe `r11p-u9-target` had moved superpowers to 7.0.0 at 13:53:28, as §Found on the way: a probe's plugin auto-update says. sidekick's mods approve no call, so the control's permission results stand.
- **The sessions launched before 13:53 never enabled sidekick,** so its dependency could not fail there. At 13:50:22, `r11p-u9-target` found two plugins with none enabled, then eight with five enabled: `probe-r11` and the built-ins (`r11p-u9-target-debug.log:16,59`).

### U20: what a unit worker under `dontAsk` needs allowed

**Measured** on Claude Code 2.1.322, in the U9 sessions. `evidence/u20-subagent.txt` holds the subagent's calls in each run, with their permission decisions. The other evidence is U9's. A unit worker needs a rule for each call U9 found denied, and nothing for its subagents:

- **`Skill` and `Agent` need no rule.**
- **A subagent runs under the parent's mode and allow list.** In `r11p-u9-bare-wt`, the subagent's `Edit` and `Bash` were denied with `reasonCode: "mode:dontAsk"`. In `r11p-u9-allowed`, both passed on the parent's `--settings` rules, recorded as `reasonType: "rule"` and `ruleSource: "flagSettings"` (`u20-subagent.txt:17-22,27-32`). The worker's own mandate must therefore cover its subagents' calls.
- **A subagent meets the edit guard too.** In `r11p-u9-bare`, its `Edit` returned "This subagent's parent bg session hasn't isolated yet, so writes to the shared checkout are blocked" (`u20-subagent.txt:10`).
- **Edits in its worktree need `Edit(//<worktree>/**)`,** which covers `Write`.
- **The gates and the commit need `Bash(bun run test)` and `Bash(git commit *)`.** The toy repo's `bun run test` runs a one-line script in place of sidekick's suite, since a `Bash` rule matches the command's text, not what it runs.
- **`SendMessage` needs no rule.** Each message from a `dontAsk` sender reached the `dontAsk` target, marked `from-mode="prompting"` (`u9-target.txt`).
- **`sk-save`'s writes to the memory store need `Edit(//<store>/**)`.** Adding the store by `--add-dir` let no write through (`u9-decisions.txt:41`).

### U13: how a call `dontAsk` denies shows in a transcript

**Measured** on Claude Code 2.1.322, from the raw transcripts of `r11p-u9-bare`, `r11p-u9-bare-wt`, `r11p-u9-allowed`, and `r11p-u24-control`. `bin/denials.py` and `bin/decisions.py` read them, into `evidence/u13-denials.txt` and `evidence/u9-decisions.txt`.

- **The tool result has `is_error: true`,** and its text names the cause. The mode's denial starts "Permission to use Bash has been denied because Claude Code is running in don't ask mode." A deny rule's reads "Permission to use Bash with command echo r11-denied has been denied."
- **The result's entry carries two fields of its own.** `permissionDecision` reads `{"decision": "reject", "source": "config", "reasonType": "mode", "reasonCode": "mode:dontAsk"}` for the mode. For a `--settings` deny rule, it reads `"reasonType": "rule", "ruleSource": "flagSettings", "reasonCode": "rule:flagSettings"`. Both set `toolDenialKind: "permission-rule"`.
- **An allowed call's entry carries `"decision": "accept"`,** with a `reasonType` of `mode`, `rule`, `hook`, or `subcommandResults`, or none.
- **So a reader can count denials from the transcript alone.** Count the `user` entries whose `permissionDecision.decision` is `reject`. Skip the `api-request-blob` entries, which copy each result without these fields. Read a subagent's transcript too, under `<session id>/subagents/`.
- **Two refusals escape that count.** The edit guard's refusal is a `tool_use_error` with no `permissionDecision` (`u9-decisions.txt:13-14`). A mod's approval past a deny rule records as `"decision": "accept", "reasonType": "hook"`, with no trace of the rule (`u9-decisions.txt:113`). The override shows only in the debug log: "tool.check Bash …: deny -> allow by plugins probe-approve, cc-plugin-privacy" (`r11p-u24-control-debug.log:398`).
- **The job record holds no denial field.** Its `state`, `detail`, and `needs` come from a classifier that reads the turn's end (`r11p-u9-bare-tick-debug.log:381`). After denied ticks, `r11p-u9-bare-tick` and `r11p-u9-bare-wt` read `state: blocked`, while `r11p-u9-bare` and `r11p-u9-control` read `state: done` (their `-job.json` files). The record cannot count denials.

### U24's control: a deny rule against a hook's approval and a mod's

**Measured** on Claude Code 2.1.322, in `r11p-u24-control`. Its `--settings` denies `Bash(echo r11-denied)` and `Bash(echo r11-mod-denied)`. Its plugin `probe-approve` holds a `PreToolUse` hook that approves `echo r11-denied`, and a mod whose `tool.check` approves `echo r11-mod-denied`. Each logs what it sees, to `evidence/u24-hook.log` and `evidence/u24-mod.log`.

The session loaded three layers, by its debug log. The project layer, `wd/.claude/settings.json`, is absent (line 3). The local layer, the main checkout's `.claude/settings.local.json`, holds one allow rule, `WebFetch(domain:raw.githubusercontent.com)` (line 42). `--settings` holds the two deny rules and no allow rule (line 43). It loaded `probe-r11`, `probe-approve`, and six built-in mods (lines 63, 151-158).

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

**Measured** on Claude Code 2.1.322: this run's probe `r11p-u9-target` updated a user-scope plugin. Every session on this Mac loads the new version from its next launch (`plugins-loading.md:384`). The probe's debug log reads "Plugin autoupdate: checking installed plugins" at 13:53:26. Then, at 13:53:28, it reads "Plugin autoupdate: updated superpowers@claude-plugins-official from 6.4.1 to 7.0.0" (`r11p-u9-target-debug.log:376,411`). sidekick 0.7.2 pins superpowers at `^6.4.1`, so sidekick failed to load in the control, launched at 13:59.

- **Every unguarded probe ran the pass,** 1.1 to 8.6 minutes after its launch (each `r11p-*-launch.txt` against its debug log). That includes the two U21 subjects, at 14:07 and 14:08. Only `r11p-u9-target`'s pass found a version to install. The plugin docs give the delay: "Claude Code waits a random delay of up to ten minutes" (`plugins-loading.md:382`).
- **The all-layer control's pass kept to the pin.** It logged "superpowers@claude-plugins-official Skipped — sidekick@rikmorn requires superpowers at a version range that 7.0.0 does not satisfy" (`r11p-u9-control-debug.log:1126,1133`).
- **The mechanism, inferred from those two logs:** a session that loads no layer enabling sidekick never sees sidekick's pin. Its pass then moves user-scope superpowers past that pin. The probes left the user layer out, and their working folder has no `.claude/` of its own.
- **`DISABLE_AUTOUPDATER=1` in the `--settings` env stops the pass.** `r11p-guard-env` logged "Plugin autoupdate: skipped (auto-updater disabled)" at startup, and no check in the 12 minutes after its first turn (`guard-env.txt`, `guard-env-debug.log:196`). The docs say the variable turns the whole pass off (`plugins-loading.md:394`).
- **Only `claude-plugins-official` auto-updates on this Mac,** by the docs' default (`plugins-loading.md:392`). The orchestrator read the machine's marketplace records, and none sets `autoUpdate`. This run restored nothing: putting superpowers 6.4.1 back is the operator's call.

## What breaks

Each stance is cited by its line in `docs/designs/loop/design.md`.

| Stance | Answer | Effect | Issue |
|---|---|---|---|
| `design.md:479,571`: launch allows the tick skill and the cron tools, since `dontAsk` needs `Skill`, `CronList`, `CronCreate`, and `CronDelete` allowed | U9: none of those needs a rule. The tick's own `Bash` and file writes do | Narrows: launch adds `Bash` and `Edit` rules only | #364 |
| `design.md:496`: the fix class allows `Edit(<its worktree>/**)` | U9: `Edit(//<path>/**)` worked, and a `Write(…)` rule never matched. By the docs, a single leading slash anchors at the settings file (`permissions.md:372,379`); no run tried it | Narrows: the mandate compiler writes every file allow as `Edit(//…)` | #363 |
| `design.md:1129`: G4b holds for the plugins a loop session loads that approve nothing, and `start` lists them | U9: two built-in mods that handle `tool.check`, `cc-plugin-plugin-authoring` and `cc-plugin-privacy`, loaded in all 11 of this task's sessions. The debug log names `cc-plugin-privacy` in a deny-to-allow override (`r11p-u24-control-debug.log:398`) | Breaks: G4b's set includes built-ins that no profile leaves out | #364 |
| `design.md:1129`: a profile that leaves the user layer out loads only the role's plugins and sidekick | U9: with the user layer out and a working folder with no `.claude/`, sidekick did not load (`r11p-u9-target-debug.log:16,59`). By the docs, a working folder whose project settings enable sidekick loads it (`permissions.md:727`), as every sidekick worktree's do (`u9-layers.txt:46`); not measured | Narrows: in a repo whose project settings omit sidekick, launch passes sidekick itself | #362 |
| `design.md:422,1065,1129` and ADR-0015 line 42: a profile that leaves the user layer out makes a loop a clean room | A session that loads no layer enabling sidekick ran plugin auto-update without sidekick's superpowers pin. It moved user-scope superpowers from 6.4.1 to 7.0.0 under every session on this Mac (`r11p-u9-target-debug.log:376-426`). Mechanism inferred from the logs | Breaks: a clean-room loop or worker must turn auto-update off, as `DISABLE_AUTOUPDATER=1` does, or load a layer that declares the pins | #366 |
