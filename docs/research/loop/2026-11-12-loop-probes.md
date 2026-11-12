> Research for the `loop` design (`docs/designs/loop/`), measured for issue #360, R11 plan 1. Run 2026-11-12 by Claude for the operator, on Claude Code 2.1.322, from the worker `r11-probes` (session b9315799) in its worktree. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Loop probes on Claude Code 2.1.322 (2026-11-12)

These probes answer the rows of #360 that the loop design left unmeasured. Each result names the build, the command, and the evidence file. Local time in the probes is GMT.

## Sources

The probe folder is `docs/superpowers/probes/2026-11-12-r11/` in the main checkout, written `<P>` here. Git ignores it, so this record names its files without linking them. Its `evidence/` folder holds every excerpt cited here.

- The probe sessions, listed in §Sessions. For each one, `evidence/` holds the transcript printed by `bin/tx.py`, the raw transcript (`.jsonl`), and the subagent transcripts (`.subagents/`). It also holds the job record (`-job.json`) and the debug log (`r11p-<name>-debug.log`).
- `evidence/u9-decisions.txt`, one line per tool call in the U9, U20, and U24 sessions, with the call's permission decision and result. `bin/decisions.py` writes it from the raw transcripts.
- `evidence/u9-layers.txt`, the settings layers read before the runs, and `evidence/u9-disk.txt`, the files and commits the calls left.
- The Claude Code docs, fetched on 2026-11-12 into `evidence/docs/` from `https://code.claude.com/docs/en/`. This record cites `permissions.md`, `tools-reference.md`, `skills.md`, `settings-reference.md`, and `agent-view.md`.

## Sessions

Each Task 2 session launched through `bin/launch.sh`, from `<P>/wd` unless its row says otherwise, as:

```sh
env -u SIDEKICK_WORKER -u SIDEKICK_MAIN claude --bg <other flags> --name <name> --model haiku --effort low \
  --permission-mode dontAsk --plugin-dir <P>/probe-r11 --agent probe-r11:role \
  --debug-file <P>/evidence/<name>-debug.log "<prompt>"
```

The table gives each session's other flags. `sessions.tsv` holds every full command, and `prompts/` every prompt.

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

Every session but the two U21 subjects was stopped and removed at about 14:08. `claude rm` removed each job record but left its transcript under `~/.claude/projects/`.

## Results by row

### U9: what `dontAsk` denies a background loop, and the rule that allows each

**Measured** on Claude Code 2.1.322, in `r11p-u9-bare`, `r11p-u9-bare-wt`, `r11p-u9-allowed`, and `r11p-u9-allowed2`. Each ran the role agent under `dontAsk` with `--setting-sources project,local`. The working folder `<P>/wd` sits inside the sidekick checkout and has no `.claude/` of its own. `r11p-u9-bare` put its edit targets in `wd/` itself. The later runs put them, and the commit, in `wd/matrix-wt`, a linked worktree of the toy repo `wd/matrix-repo`. The fake memory store `<P>/fake-store` sits outside the working folder and joins by `--add-dir`. `<P>/allow-rules.json` holds the spellings for later tasks.

| Call | With no allow rule | Narrowest rule that let it run | `u9-decisions.txt` lines |
|---|---|---|---|
| `/probe-r11:tick`, typed or fired by cron | Expands with no tool call | None needed | None: `u9-bare-tick.txt`, and `u9-bare.txt` at 13:55:00 |
| `Skill` for `probe-r11:tick` | Runs | None needed | 4, 57 |
| The tick's `date -u … >> <P>/ticks/<name>.log` | Denied | `Edit(//<P>/ticks/**)` | 5, 58, 78 |
| `CronCreate` a day out, `CronList`, `CronDelete` | Run | None needed | 7–10 |
| `Agent` with `general-purpose` | Runs | None needed | 11, 64 |
| The subagent's `Edit` and `Bash` | Denied | The parent's rules | 54–55, 81–82 |
| `Edit` in the linked worktree | Denied | `Edit(//<folder>/**)` | 39, 66 |
| `Write` of a new file in the linked worktree | Denied | `Edit(//<folder>/**)`, after `Write(//<folder>/**)` failed | 40, 67, 84 |
| `Write` in the `--add-dir` store | Denied | `Edit(//<P>/fake-store/**)` | 41, 68 |
| `Read` in the working folder | Runs | None needed | 42 |
| `Bash(bun run test)` | Denied | `Bash(bun run test)` | 47, 74 |
| `Bash(git commit …)` | Denied | `Bash(git commit *)` | 48–50, 75–77 |
| `Bash(sidekick --version)` | Denied | `Bash(sidekick --version)` | 45, 72 |
| `Bash(cd <folder>)` | Runs, as a read-only command | None needed | 46 |
| `ListAgents`, then `SendMessage` to `r11p-u9-target` | Run, and the message arrived | None needed | 43–44 |
| `PushNotification` | Runs, but sends nothing | None needed | 19 |

What the measurements show:

- **The calls that need a rule are the ones that would prompt in Manual mode:** file writes, and `Bash` past the read-only set. The tools reference's "Permission required" column predicted each tool but `Skill`. The skills docs cover `Skill`: "By default, Claude can invoke any skill that doesn't have `disable-model-invocation: true` set" (`skills.md:862`).
- **A `Write(path)` rule never matches, and `Edit(path)` covers `Write`.** The permissions docs say so under "`Write(path)`, `Glob(path)`, and `Grep(path)` rules don't match". An absolute path takes two slashes: `Edit(//Users/…/**)`.
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
- **These sessions loaded `probe-r11` and Claude Code's four built-in mods,** and no installed plugin (`r11p-u9-target-debug.log:59-84`). Two of the built-ins, `cc-plugin-plugin-authoring` and `cc-plugin-privacy`, handle `tool.check`.
- **`r11p-u9-control` loaded every layer, and matched `r11p-u9-bare-wt` call for call.** The user layer's `~/.claude/settings.json` holds no allow rule. `~/.claude/settings.local.json` holds seven, and none loaded. The docs say Claude Code "reads it only in sessions you start in your home directory itself" (`permissions.md:802`).
- **In the control, sidekick 0.7.2 failed to load:** "Requires "superpowers@claude-plugins-official" ^6.4.1, installed 7.0.0" (`r11p-u9-control-debug.log:24`). Superpowers moved to 7.0.0 at 13:53:28, during the run. sidekick's mods approve no call, so this changes no result here.

### U20: what a unit worker under `dontAsk` needs allowed

**Measured** on Claude Code 2.1.322, in the U9 sessions. A unit worker needs a rule for each call U9 found denied, and nothing for its subagents:

- **`Skill` and `Agent` need no rule.**
- **A subagent runs under the parent's mode and allow list.** In `r11p-u9-bare-wt`, the subagent's `Edit` and `Bash` were denied with `reasonCode: "mode:dontAsk"`. In `r11p-u9-allowed`, both passed on the parent's `--settings` rules, recorded as `reasonType: "rule"` and `ruleSource: "flagSettings"` (`u9-decisions.txt:54-55,81-82`). The worker's own mandate must therefore cover its subagents' calls.
- **A subagent meets the edit guard too.** In `r11p-u9-bare`, its `Edit` returned "This subagent's parent bg session hasn't isolated yet, so writes to the shared checkout are blocked" (`u9-decisions.txt:27`).
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
- **Two refusals escape that count.** The edit guard's refusal is a `tool_use_error` with no `permissionDecision` (`u9-decisions.txt:13-14`). A mod's approval past a deny rule records as `"decision": "accept", "reasonType": "hook"`, with no trace of the rule (`u9-decisions.txt:113`).
- **The job record holds no denial field.** Its `state`, `detail`, and `needs` come from a classifier that reads the turn's end (`r11p-u9-bare-tick-debug.log:381`). After denied ticks, `r11p-u9-bare-tick` and `r11p-u9-bare-wt` read `state: blocked`, while `r11p-u9-bare` and `r11p-u9-control` read `state: done` (their `-job.json` files). The record cannot count denials.

### U24's control: a deny rule against a hook's approval and a mod's

**Measured** on Claude Code 2.1.322, in `r11p-u24-control`. Its `--settings` denies `Bash(echo r11-denied)` and `Bash(echo r11-mod-denied)`. Its plugin `probe-approve` holds a `PreToolUse` hook that approves `echo r11-denied`, and a mod whose `tool.check` approves `echo r11-mod-denied`. Each logs what it sees, to `evidence/u24-hook.log` and `evidence/u24-mod.log`.

| Call | What approves it | Result | Evidence |
|---|---|---|---|
| `echo r11-denied` | The `PreToolUse` hook, which answered `allow` | Denied: "Permission to use Bash with command echo r11-denied has been denied." | `u24-hook.log`, `u9-decisions.txt:112` |
| `echo r11-mod-denied` | The mod, which answered `allow` | Ran, and printed `r11-mod-denied` | `u24-mod.log`, `u9-decisions.txt:113` |
| `echo r11-control` | Nothing, and no rule names it | Ran, as a read-only command | `u9-decisions.txt:114` |

- **A deny rule holds against a `PreToolUse` hook,** as the docs say.
- **A mod's `allow` overrides a deny rule on this account.** The mod's log shows Claude Code's own decision before it answered: `"decision":"deny"` with `"rule":"Bash(echo r11-mod-denied)"`. The mod returned `allow`, and the command ran.
- **The built-in guard did not load:** "cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (max)" (`r11p-u24-control-debug.log:78`). This is the setup U23's answer names: a personal subscription, with no managed settings.
- **The operator-present run repeats this** with the deny rules in a managed settings file. It shows whether the guard then loads, and the mod's `allow` stops working.

The permissions docs on a hook's approval against a deny rule (`permissions.md:635`):

> PreToolUse hook decisions don't bypass permission rules. Claude Code evaluates deny and ask rules regardless of what a PreToolUse hook returns: a matching deny rule blocks the call, and a matching ask rule still prompts even when the hook returned `"allow"` or `"ask"`.

And on a mod's (`permissions.md:645`):

> Your setup might lack managed settings, a `managed-mcp.json` file, and a Team or Enterprise `/login` as the session's credential. In that setup, the mod can approve a call that a deny rule refuses or a `PreToolUse` hook blocked.

## What breaks

Each stance is cited by its line in `docs/designs/loop/design.md`.

| Stance | Answer | Effect | Issue |
|---|---|---|---|
| `design.md:479,571`: launch allows the tick skill and the cron tools, since `dontAsk` needs `Skill`, `CronList`, `CronCreate`, and `CronDelete` allowed | U9: none of those needs a rule. The tick's own `Bash` and file writes do | Narrows: launch adds `Bash` and `Edit` rules only | #364 |
| `design.md:496`: the fix class allows `Edit(<its worktree>/**)` | U9: an absolute path needs `Edit(//<path>/**)`, and a `Write(…)` rule never matches | Narrows: the mandate compiler writes every file allow as `Edit(//…)` | #363 |
| `design.md:1129`: a profile that leaves the user layer out loads only the role's plugins and sidekick | U9: with the user layer out, sidekick did not load. Claude Code's built-in mods loaded in every session, and two of them handle `tool.check` | Breaks: sidekick loads only if launch passes it or the working folder's project settings enable it. The plugins G4b must vet include the built-ins | #362, #366 |
