# Loops

A loop is one long-lived background session on Claude Code's own cron, which works one repo within a written mandate. This page covers what defines a loop, how it starts and keeps running, how it runs its units, and what it records. Its sections are the folder, `loop.json`, the check, the inherited listing, the workers' fence, starting and arming a loop, the record, and units. The verbs are `sidekick loop list`, `show`, `record`, `start`, and `arm`. The unit verbs are `dispatch`, `answer`, `wake`, `report`, `discard`, and `reap`, and the operator's `resume` clears a tripped breaker. The `loop-arm` skill arms a running loop. Issues #363, #364, and #367 in the `Rikmorn/sidekick` repo built these pieces, and ADR-0014 and ADR-0015 in that repo bind them.

Later issues build the rest. #377 lands a worker's work, and #365 shows a loop on the desk. The `sk-loop` skill, which writes `loop.json` with you, is #366.

The measurements cited here come from two probe records in that repo, linked by permalink, both on Claude Code 2.1.322 on 2026-11-12. "The loop probes" is [`docs/research/loop/2026-11-12-loop-probes.md`](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md). "The operator-present probes" is [`2026-11-12-loop-probes-operator-run.md`](https://github.com/Rikmorn/sidekick/blob/e1725169edd5003d050f8b3d9ebd6f71b7379205/docs/research/loop/2026-11-12-loop-probes-operator-run.md) beside it. A fact measured on macOS while #363 was built, on 2026-11-14, says so where it appears. So does a fact from Claude Code's docs, fetched on 2026-11-15 while #364 was designed.

## The folder

A loop lives in the loop store, one folder per loop:

```text
<config>/sidekick/loops/<name>/
  loop.json      the definition
  records/       one <YYYY-MM-DD>.jsonl per local day
  units/         one folder per unit, holding one folder per attempt
  state.json     what sidekick loop start launched
  armed.json     the cron jobs sidekick loop arm reported
  start.lock     present while a sidekick loop start acts on the loop
  units.lock     present while a unit verb, record, or start's reap reads or writes the record
```

An attempt's folder, `units/<unit id>/<worker>/`, holds one attempt at a unit. `dispatch` writes `unit.md`, the unit's text, `brief.md`, the unit brief, and `worker.json`. `answer` adds `rulings.md`, and `finish` saves the worker's run report there as `report.md`. `worker.json` names the worker, its job id, the issue, and the time of dispatch. Its job is `null` until `claude` reports a start, and stays `null` after a launch that timed out.

`<config>` is `CLAUDE_CONFIG_DIR`, or `~/.claude` when that is unset or empty. `SIDEKICK_PROFILES_DIR` moves the profile store only, never the loop store. A loop's name follows the profile name rule: 1 to 64 lowercase letters, digits, and hyphens, starting with a letter or digit. `list` skips files and hidden entries in the store.

`records/`, `units/`, `state.json`, `armed.json`, `start.lock`, and `units.lock` are a loop's runtime entries. The sidekick folder's `.gitignore` keeps them out of its repo, as `loops/*/records/`, `loops/*/units/`, `loops/*/state.json`, `loops/*/armed.json`, `loops/*/start.lock`, and `loops/*/units.lock`. So a loop's record, units, state, arm, and locks stay local. Two runs make the sidekick folder a repo: a `profile new` of a user profile, and a `start` that acts on a loop. Each adds any of those lines the folder's `.gitignore` lacks. `references/profiles.md` §The sidekick folder says when.

No `sidekick loop` verb writes `loop.json`. You write it, through `sk-loop` once #366 ships.

## `loop.json`

```json
{
  "description": "Fix bugs filed in sidekick",
  "repo": "/Users/<you>/Documents/Projects/sidekick",
  "profile": "fixer",
  "schedule": "7 * * * *",
  "tick": "/fixer:tick",
  "hosts": ["registry.npmjs.org"],
  "gates": ["bun run test", "bun run typecheck"],
  "caps": {
    "attemptsPerUnit": 2,
    "workMinutesPerUnit": 180,
    "waitMinutesPerUnit": 1440,
    "unitsPerDay": 4,
    "failedUnitsInARow": 3
  },
  "mandate": {
    "reads": ["Bash(gh issue view *)", "Bash(gh issue list *)"],
    "classes": {
      "triage":    { "state": "record", "allow": ["Bash(gh issue edit * --add-label *)"] },
      "integrate": { "state": "ask",    "allow": ["Bash(sidekick loop land fixer *)"] }
    },
    "never": ["Bash(git push --force *)"]
  }
}
```

Every object is strict, so an unknown key at any level refuses. Every list entry must be a non-empty string.

| Key | Rule |
|---|---|
| `description` | Required, non-empty. |
| `repo` | Required. An absolute path to a main checkout's root. The schema checks that the path is absolute, and the check does the rest, as "What the check refuses" says. |
| `profile` | Required. A profile name, which the check resolves. |
| `schedule` | Required. A five-field cron expression, read as "The schedule" says. |
| `tick` | Required. `/` and a skill name, `/<plugin>:<skill>` or `/<skill>`, then optionally a space and arguments. Each name is letters, digits, `-`, and `_`, starting with a letter or digit. A cron-fired tick reaches the model as a slash command ([the loop probes, §U9](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u9-what-dontask-denies-a-background-loop-and-the-rule-that-allows-each)). |
| `hosts` | Optional, empty by default. Domain names, each with at least one dot and an optional leading `*.`. They are the hosts the workers' sandbox may reach, as "The workers' fence" says. |
| `gates` | Required, and may be empty. The commands a worker reruns before it reports a tested commit, which `dispatch` lists in the unit brief, and whose files `land --check` reports (#377). They are not allow rules: workers run them inside the fence. A gate spelled with a leading variable assignment, through `make VAR=…`, or with `eval` leaves the sandbox's auto-allow (Claude Code's sandboxing docs, fetched on 2026-11-12). `dontAsk` then denies it, unless an inherited allow rule matches it. So spell each gate without one. The check does not refuse such a gate. |
| `caps` | Required. "The caps" says what each counts. |
| `mandate.reads` | Required. Allow rules for the loop's reads. |
| `mandate.classes` | Required. A class name, which follows the profile name rule, maps to `{ "state", "allow" }`. `state` is `record`, `ask`, or `act`. `allow` holds at least one allow rule. |
| `mandate.never` | Required. Deny rules. |
| `paused` | Optional. `true` keeps the loop off: `start` stops it between ticks, and never launches or respawns it. A fresh launch follows only once a `start` has ended the loop off and recorded `pausedAt`. "Pausing, stopping, and updating a loop" says how. `list` marks the loop `paused`, and a paused loop's issues do not make `list` exit 1. |

A class's state is its rung on ADR-0015 Decision 2's ladder. A class in `record` writes what it would do, one in `ask` writes a request for the operator, and one in `act` acts. A promotion edits one class's state, then runs `sidekick loop start <name>`, which relaunches the loop between ticks.

### The schedule

The schedule has five fields, read in local time:

| Field | Values |
|---|---|
| Minute | 0 to 59 |
| Hour | 0 to 23 |
| Day of month | 1 to 31 |
| Month | 1 to 12 |
| Day of week | 0 to 7, where 0 and 7 are both Sunday |

Each field takes `*`, a number, a range `a-b`, a step on either such as `*/15`, or a comma list of those. Names such as `MON` and `JAN`, `@` macros such as `@hourly`, and a sixth field refuse, since no source says `CronCreate` takes them.

- **Both day fields restricted:** a day matches either field, as standard cron reads it. A day field counts as unrestricted when its text starts with `*`, as Vixie cron and cronie read it. Claude Code's own reading of both is unknown. A mismatch shifts the new-request window, and refuses nothing.
- **A schedule that never fires refuses.** That is a restricted day of month, an unrestricted day of week, and no listed month holding a listed day in a non-leap year. So `0 0 30 2 *` refuses, and so does `0 0 29 2 *`, which fires only in leap years.
- **A `*`-led day field still filters by its step.** `*/7` counts as unrestricted, yet matches Sunday alone. So `0 0 31 12 */7` passes, though it fires only when 31 December falls on a Sunday, years apart. Its new-request window then looks back 366 days, as "When a request is new" says.

`CronCreate` takes standard five-field cron in local time. By its tool description, read while #363 was designed on 2026-11-14, a recurring job runs up to half its period late, at most 30 minutes.

## The caps

The five caps are required, and each is a whole number of at least 1.

| Cap | What it counts |
|---|---|
| `attemptsPerUnit` | Attempts at one unit. An attempt is one `dispatched` line for the unit. |
| `workMinutesPerUnit` | A unit's working time: the wall time since its `dispatched` line, less its waits. A wait opens at a `request` line for the unit, and closes at the next `answered` line for the unit and its worker, or runs to now. Waits count only up to `waitMinutesPerUnit` in total; past that, waiting counts as working. |
| `waitMinutesPerUnit` | The most waiting that does not count as working time. |
| `unitsPerDay` | Units dispatched in one day: the operator's local calendar day, the one that names each record file. |
| `failedUnitsInARow` | `failed` lines across units, since the later of the last `landed` line and the last `resumed` line. |

A dispatch under `sidekick loop start --record` writes `dispatched` with `record: true`. It counts toward `unitsPerDay`, since it still spends. Its failures count toward `failedUnitsInARow`, since its worker does real work in its worktree. It does not count toward `attemptsPerUnit`: nothing it builds can land, so the unit's real attempts are still to come.

The caps count only the lines sidekick's verbs write, never the model's, so the model cannot stretch them. Each count reads every day file in `records/`, and `dispatch` refuses when one cannot be read, since a count that skips a file undercounts. It also refuses a day file whose name is no real date, such as `2026-02-30.jsonl`, naming it, since that name would read as another day's file. `dispatch` refuses at any cap's limit, and while an attempt is in flight, since one worker runs at a time.

- **The clock.** `reap` closes an attempt once its working time passes `workMinutesPerUnit`. So an attempt runs at most the work cap plus the wait cap, whatever the model writes. A finished unit that waits past both caps for the operator's landing is reaped too; #377 stops the clock once `land --check` records a tested commit.
- **The breaker.** `reap` writes `failed`, and so does `discard --failed`, the route #377 gives a failed rebase or gate. A plain `discarded` line neither breaks the run nor extends it. Once the run reaches the cap, `dispatch` refuses until the operator runs `sidekick loop resume <name>`, which writes `resumed`. Under `start --record` nothing lands, so a trial loop stops after that many failures until the operator resumes it.

## The check

The check judges one loop from its folder, its repo, and its profile. It finds issues, which refuse the loop, and warnings, which do not. Each reads `<path>: <why>`, naming the file and the field. The old-store refusal is the exception: its lines are the ones every profile verb prints, the commands that move the store among them. `list`, `show`, and `start` run it, and `record` runs only its schemas and its own argument checks. `start` skips it for a paused loop, as "What `start` does" says.

### What the check refuses

- A loop name that breaks the name rule.
- A `loop.json` that is missing, is not JSON, or fails the schema.
- A `repo` that is not a main checkout's root. It must be a folder inside a git work tree, and the top of that work tree by real path. Its git common dir must be its own `.git`. Both compare without regard to case, since git prints a folder's real case and Node's `realpathSync` keeps the case it is given. A subfolder, a linked worktree, a submodule, and a repo made with `--separate-git-dir` each refuse, with the fix that applies. The first three name the main checkout's root. A `--separate-git-dir` repo is a main checkout already, so its fix is to move the git dir back to `<repo>/.git`. The loop's own worktree, which `start`'s launch makes, comes from the main checkout, and so do its workers' worktrees.
- A `profile` that no store holds. The search is the one a launch in `repo` makes: the repo store `<repo>/.claude/profiles/`, then the user store. `SIDEKICK_PROFILES_DIR` replaces both, as `references/profiles.md` §The folder says.
- A profile the repo store holds, since the repo's commits can change its plugin code. Keep a loop's profile in the user store. When it hides a user-store profile of the same name, the user store already holds the profile. The refusal then says to remove or rename the repo store's one. Committed loops are out of scope (#374).
- The profile's own load issues, and its role plugin's. Each `pluginDirs` entry must be a folder, and no file in one may hold a key.
- The old-store refusal, while `<config>/profiles` still holds a profile, as every profile verb gives it.
- A file in the loop's folder that the key check flags, outside its runtime entries. Like the profile scan, it skips `.git`, `node_modules`, links, binary files, and files over 1 MiB. The loop's folder sits in the sidekick folder, which can be a git repo, and a loop's definition needs no secret.
- An `mcp__<server>` rule that names, by its bare name, a server only a role plugin declares. A plugin declares servers in its `.mcp.json`, with or without the `mcpServers` wrapper, and in the `mcpServers` key of its `plugin.json`. That key holds an inline map, a path to a JSON file, or an array of either. A path resolves against the plugin's root (the plugins docs, fetched on 2026-11-15). The check reads no MCP bundle, a `.mcpb` or `.dxt` file, so a bundle's servers escape it. Claude Code spells a plugin server's tools `mcp__plugin_<plugin>_<server>__<tool>`, so the bare rule matches none. The refusal names the right spelling. It passes when the server also appears in the repo's `.mcp.json`. It passes too when the server sits in the user or local scope of the global config file. That file is `.claude.json` in `CLAUDE_CONFIG_DIR`, or in the home folder when that is unset or empty. The check reads the legacy `<config>/.config.json` instead when that file has content, or is writable while `.claude.json` does not exist. A missing or malformed file names no server. Role plugins are the folders in the profile's `pluginDirs`.
- Each rule the judge refuses, in `mandate.reads`, each class's `allow`, and `mandate.never`. "How the check judges a rule" gives every refusal and its reason.

### What the check warns on

- **A host that lets workers reach GitHub.** That is a pattern matching `github.com` or a subdomain of it, so `*.com` and `*` warn too. The check reads `hosts`, and each kept layer's `sandbox.network.allowedDomains`. A worker that reaches origin can push by a spelling the push block misses, as "The workers' fence" says. A worker that never reaches it cannot push at all.
- **A kept settings layer the check cannot read,** since it then cannot see which hosts that layer lets workers reach.
- **In `show` and `start`, which print the listing, a `claude plugin list` that fails,** times out, or prints what the listing cannot parse. The listing then says it is incomplete.

## How the check judges a rule

ADR-0015 Decision 3 sets the aim: no allow rule may grant a shell, an interpreter, `sidekick worker`, or `claude`. The judge is a test of the words in a rule. A loop needs few rules: its reads and its classes, since `start` adds the fixed `sidekick loop` verbs itself, as "The compiled settings" says. So the judge refuses wherever the cost to you is a narrower rule. "What the judge cannot see" names what it leaves open.

### In every list

These refuse in `reads`, in each class's `allow`, and in `never`:

- **A rule that does not parse** as `Tool` or `Tool(specifier)`, such as `Bash(x` or `Bash()`.
- **An `mcp__` rule with parentheses.** Claude Code skips it when it loads a settings file, so a `never` entry denies nothing. Write `mcp__<server>`, `mcp__<server>__*`, or `mcp__<server>__<tool>`.
- **A `Write`, `NotebookEdit`, `MultiEdit`, `Glob`, or `Grep` rule with a path.** Such a rule never matches, so a deny spelled that way denies nothing. Write the bare tool, or the tool with `(*)`. The permissions docs say so under "`Write(path)`, `Glob(path)`, and `Grep(path)` rules don't match". Under `dontAsk`, a `Write` allow rule with a path matched nothing, and an `Edit(//<path>…)` rule covered `Write` ([the loop probes, §U9](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u9-what-dontask-denies-a-background-loop-and-the-rule-that-allows-each)).
- **A `Read` or `Edit` rule whose path starts with exactly one slash.** By the permissions docs' §How path patterns match, one slash anchors at the settings source, not the filesystem root. Write `//` before an absolute path, as in `Edit(//Users/<you>/x/**)`, or `~/` for the home folder.

In `never`, nothing else refuses, since a deny rule that matches more denies more.

### File-write rules in `reads` and `allow`

A loop only allocates (ADR-0014 Decision 3), and it writes nothing but its record, through `sidekick loop record`. It also runs unsandboxed, so a write rule is the only bound on its writes. In `reads` and `allow`, a `Write`, `Edit`, `NotebookEdit`, or `MultiEdit` rule must name a folder by its `//` absolute path:

- the bare tool, and the tool with `(*)`, refuse, since each allows every path;
- a `~` path refuses, since it reaches the home folder and Claude Code's own settings;
- a relative path refuses, such as `Edit(src/**)` or `Edit(**)`, since it anchors in the loop's own worktree of the repo;
- a `//` path whose first folder is empty or holds a wildcard refuses, as in `Edit(//**)` or `Edit(//*/x/**)`, since it reaches the whole disk;
- a `//` path with a `.` or `..` segment refuses, since it can climb out of the folder it names.

So the one write rule that passes there is a scoped `Edit(//<path>…)`, such as `Edit(//Users/<you>/x/**)`. A `Write`, `NotebookEdit`, or `MultiEdit` rule with a path already refuses in every list. In `never`, each bare form passes, since a bare deny denies every write.

### Command rules in `reads` and `allow`

`Bash`, `Monitor`, and `PowerShell` rules pass through one judge. By Claude Code's tools reference, `Monitor` takes Bash's permission rules, and a bare `PowerShell` rule matches every command. By its permission-modes docs, Claude Code runs `Monitor` commands through the shell.

The judge splits a rule's specifier on whitespace, and reads no quoting. Before it splits, it reads a trailing `:*` as a space and `*`, as Claude Code's permissions docs say it does. So `Bash(git status:*)` passes as `Bash(git status *)` does, and `Bash(git log:*)` refuses as `Bash(git log *)` does. The command word is the first word. These refuse:

- **The bare tool, and the tool with `(*)`,** which match every command.
- **Shell syntax anywhere in the specifier:** `$(`, a backtick, `<(`, `>(`, `;`, `|`, `&`, or a newline. Each chains a command the check never sees, so write one rule per command.
- **A `NAME=value` or `NAME+=value` word,** since an assignment can change what a program loads, and no loop rule needs one.
- **A wildcard in or before the command word:** `*`, `?`, or `[…]`. The shell expands `?` and `[…]` as well as `*`. So `Bash(ba?h -c *)` runs `bash` once the working folder holds a file named `bash`, which a worker could commit.
- **A redirect, a parenthesis, or `!` in or before the command word.** Each is shell grammar that moves the real command later, as in `Bash(2>x bash -c *)`.
- **A quote, a backslash, a brace, or `$`** in the command word, or in any word its own check reads. Each changes the word before the program sees it, so `"bash"` runs `bash`. The git, `find`, `rg`, and `fd` checks read every word. The `sidekick` check reads two, and the `gh` check and the runners one. So `Bash(git log --format="%h %s")` refuses.

The judge lower-cases the command word's base name before every test, since the default macOS volume ignores case and `BASH` runs `bash`. It judges an absolute path by its base name too, so `/usr/bin/bash` is `bash`.

It then reads a shipped or packaged twin as the program it is: `bsdtar` and `gtar` as `tar`, `slogin` as `ssh`, `gnumake` and `gmake` as `make`, and `gfind` as `find`. That holds for the command word and for the word a runner or wrapper runs. On macOS, `/usr/bin/tar` links to `bsdtar`, `/usr/bin/slogin` links to `ssh`, and `gnumake` reports the same GNU Make as `make`. All three were measured while #363 was built.

#### A command path

A command word holding `/`, or starting with `~`, must be an absolute path that may run. These refuse:

- a relative path, since it anchors in the loop's own worktree of the repo;
- a `~` path, since the judge cannot expand it, so spell it absolute;
- a path with a `.` or `..` segment, since the judge resolves those before it follows links, and the kernel after;
- a path holding a wildcard, which could match any program;
- a path inside the repo, by real path, so a link into the repo counts as inside. Workers' branches land in the repo, so a program there may be code a worker wrote. The loop runs no code its workers wrote (ADR-0015 Decision 4);
- a path under a scratch folder: `/tmp`, `/private/tmp`, `/var/tmp`, `/private/var/tmp`, `/var/folders`, `/private/var/folders`, `/dev`, or `/Users/Shared`. A worker or the sandbox writes these, or any local user can, so a program there may be worker code.

The in-repo and scratch tests compare paths without regard to case. They also strip a leading `/System/Volumes/Data` from each side. Node's `realpathSync` keeps the case it is given, and macOS shows `/Users` and `/private` under that prefix as well. Both were measured while #363 was built. On a case-sensitive disk, the test therefore refuses a case twin of the repo or of a scratch folder.

#### Runners

`RUNNER_WORDS` is the set of shells, interpreters, runners, and wrappers a rule may not start with. A word followed by a version suffix of digits and dots counts as that word. So `python3.12`, `ruby3.3`, and `node22` are runners, while `nodemon` and `pythonista` are not. The words fall into three groups, by what may follow them.

**Script runners** run the file named next, and read no config from the working folder: `sh`, `bash`, `zsh`, `fish`, `dash`, `ksh`, `csh`, `tcsh`, `python`, `python3`, `node`, `ruby`, `perl`, `php`, `lua`, and `osascript`. A script runner passes only before an absolute script path that passes "A command path". The judge then reads that path as the command word, with the words after it. So `Bash(node /Users/<you>/bin/sidekick worker dispatch x)` refuses as `sidekick worker` does. Keep a loop's scripts in its role's plugin folder, as in `Bash(node /Users/<you>/.claude/sidekick/profiles/fixer/plugin/bin/filter-issues.js *)`. A `Bash` rule holds command text, so its path takes one slash; only `Read` and `Edit` paths take the `//` form.

**Wrappers** run their next word as a program: `exec`, `env`, `xargs`, `sudo`, `nohup`, `timeout`, `nice`, `command`, `source`, `.`, `time`, `builtin`, `stdbuf`, `noglob`, `coproc`, `xcrun`, `caffeinate`, and `arch`. The GNU twins `gtimeout`, `genv`, `gxargs`, `gnice`, `gstdbuf`, and `gnohup` are wrappers too. A wrapper passes only before an absolute program path that passes "A command path", and the judge then reads that path as the command word. So `Bash(env /usr/bin/git log --oneline)` passes, while `Bash(env -i *)` and `Bash(env /bin/sh -c x)` refuse.

**The rest take nothing,** so a rule starting with one refuses whatever follows: `bun`, `deno`, `npx`, `bunx`, `npm`, `pnpm`, `yarn`, `make`, `eval`, `trap`, `awk`, `gawk`, `nawk`, `script`, `expect`, `tclsh`, `pypy`, `pypy3`, and `nocorrect`.

- The package runners and `make`, with its twins `gnumake` and `gmake`, read the working folder's own files, such as `package.json` or a `Makefile`. So `Bash(bun run test)` runs whatever the repo's script says.
- `eval`, `trap`, and the `awk` family run the program text they are given.
- On macOS, `script` takes its output file first, then runs the command after it, as measured while #363 was built.
- `expect`, `tclsh`, `pypy`, `pypy3`, and `nocorrect` sit outside both lists that take a path. A word added to `RUNNER_WORDS` later starts there too, until a ruling moves it.

#### Programs with checks of their own

- **`claude`** refuses outright, since it starts a Claude session. That covers `Bash(claude respawn *)`, which also matches `--all` and every other session. A loop respawns its stopped worker with `sidekick loop wake`, a fixed verb, as "Units" says.
- **`sidekick`** must name its subcommand plainly, with no wildcard and no leading option in the next word. It refuses `sidekick worker` and `sidekick profile launch`, which start sessions, and `sidekick profile` before a wildcard. Its first two words compare lower-cased. It refuses every `sidekick loop` rule but one naming `land`, such as `Bash(sidekick loop *)` or `Bash(sidekick loop record fixer *)`. `start` compiles the loop's own verbs, pinned to its name. So a wider rule could only grant a verb the loop must not run, such as `resume`, which resets the breaker. `land` passes, since a class grants the landing as a request the operator runs (ADR-0015 Decision 5).
- **`gh`** must name its subcommand next, with no leading option and no wildcard. It refuses `gh extension` and `gh alias`, which run code. So put `-R` after the subcommand, as in `Bash(gh issue list -R <owner>/<repo>)`. The subcommand compares lower-cased.
- **`find`** and its GNU twin `gfind` refuse with `-exec`, `-execdir`, `-ok`, `-okdir`, or a wildcard in any word. Each primary runs a command, and a wildcard could spell one.
- **`rg`** refuses with `--pre`, alone or joined to a value, or a wildcard in any word. ripgrep 14.1.1 ran a preprocessor command for `--pre <cmd>` and `--pre=<cmd>`, as measured while #363 was built.
- **`fd`** refuses a single-dash word holding `x` or `X`, such as `-x`, `-X`, or `-Hx`. It also refuses `--exec` or `--exec-batch`, alone or joined to a value, and a wildcard in any word.
- **`tar`** and **`ssh`** refuse outright, and so do their twins `bsdtar`, `gtar`, and `slogin`. `tar` can run a command through its options, and `ssh` runs commands on another host.

**`git`** gets the most tests, since git runs commands that its options, its config, and some subcommands name:

- A leading option refuses, such as `-c`, `-C`, or `--exec-path`, since one can set config or the exec path.
- A wildcard in the subcommand refuses.
- The subcommands `config`, `rebase`, `bisect`, `submodule`, `filter-branch`, `difftool`, and `mergetool` refuse. Each runs code of its own: hooks, tools, editors, or config.
- The options `--upload-pack`, `--receive-pack`, `--exec`, `--open-files-in-pager`, and `--output` refuse anywhere in the rule. Each runs a command or writes a file. They refuse joined to a value, as in `--upload-pack=<cmd>`. They also refuse as any prefix of at least one letter, since git takes an unambiguous abbreviation, so `--upl`, `--o`, and `--e` all refuse. `git grep -O<cmd>` and `git fetch --upload-pack=<cmd>` each ran a command, as measured while #363 was built.
- A single-dash word holding a capital `O` refuses, since `-O` is `--open-files-in-pager`. A lower-case `-o` is a different option, and passes. In a `clone` rule, a single-dash word holding `u` refuses, since `-u` is `--upload-pack` there.
- A wildcard after `fetch`, `pull`, `clone`, `ls-remote`, `push`, `archive`, `grep`, `log`, `diff`, `show`, or `format-patch` refuses, since it admits those options. Name the options the rule needs: `Bash(git log --oneline -20)` passes, and `Bash(git log *)` refuses.
- The subcommand and the long options compare lower-cased. On a case-insensitive disk, `git MERGETOOL` runs mergetool, as measured while #363 was built.
- A program whose base name starts with `git-` refuses, such as `/usr/libexec/git-core/git-log`. git's exec path holds `git-<name>` links to `git`, and scripts, which run as `git <name>` past every test here. Write `git <name>` instead.

### What the judge cannot see

The judge reads words, and it has limits you should plan for.

- **No list of words is complete.** The loop's real bound is `dontAsk` with its short allow list, which denies every call no rule allows. Some rules pass and still grant more than they show. `Bash(repeat 1 bash -c *)` passes, and zsh 5.9 runs the command after `repeat`'s count, as measured while #363 was built. `Bash(git archive -o <file> HEAD)` passes and writes a file. `Bash(sidekick worktree remove *)` passes, and runs `claude rm` on the worktree's background sessions. Keep the list short, and read each rule as every command it matches.
- **The test is textual.** It reads the words a rule holds, not the files they name. So a link to a refused program, or a copy of one, passes under another name. `Bash(/Users/<you>/bin/tool *)` passes even when `tool` links to `bash`.
- **A trailing `*` admits any option.** After any `git` or `gh` subcommand, a `*` matches any words, options included. A `Bash(git commit *)` rule matched a message the model extended onto a new line ([the loop probes, §U9](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u9-what-dontask-denies-a-background-loop-and-the-rule-that-allows-each)). So `Bash(gh issue edit * --add-label *)` also matches an edit that sets `--body`. Name the options a rule needs.
- **A scoped `Edit` rule is yours to judge.** `Edit(//Users/<you>/**)` passes, and it reaches the home folder's `.claude/` too. A scoped `Edit` rule that reaches a script another rule runs also stays open. With `Edit(//Users/<you>/tools/**)` and `Bash(node /Users/<you>/tools/f.js)`, the loop can rewrite the script, then run it.
- **Any git rule runs the commands git config names.** `core.fsmonitor` runs on `git status`, `core.pager` on paged output, and textconv drivers on `git diff` and `git show`. A linked worktree shares its main checkout's `.git/config` and `.git/hooks/`. So a worker that could write the shared `.git/config` would reach every git rule the loop holds. That is believed from git's documentation, and not run. The workers' fence denies a unit worker that write, as "The workers' fence" says.
- **The judge weighs code, not reach.** It refuses rules that run code or start sessions. It does not weigh what an allowed command changes elsewhere. `Bash(gh api *)` passes, and by gh's manual `gh api` calls any GitHub endpoint the token reaches. A class's state bounds that, on the `record`, `ask`, `act` ladder.

## The inherited listing

`show` lists what a loop and its workers inherit beyond the mandate, since each item can widen what they may do. `start` prints the same listing before each launch, relaunch, or respawn. The loop inherits the whole set, by `start`'s launch. A unit worker inherits less: it loads no `project` or `local` settings layer, and keeps from the profile's `settings` only the keys "The workers' fence" lists. So for a unit worker, the lines from the user settings, the managed file, and the profile's kept keys apply. So do the plugins those layers and the role enable. The listing blocks nothing. The operator chose listing over refusing, on 2026-11-14, to keep loops free of permission upkeep (#363).

The listing has five sections:

1. **Allow rules** from each settings layer the profile keeps. Those are the user settings, the repo's `.claude/settings.json`, and its `.claude/settings.local.json`, as `settingSources` keeps them, all three when it is absent. Then come the profile's own `settings`, and the managed settings file when one exists. Each rule names its layer and file.
2. **Hooks that can approve a call:** the `PreToolUse` and `PermissionRequest` hooks in those layers and in each loaded plugin's `hooks/hooks.json`, each with its source. The listing also reads the `hooks` a plugin declares in its `.claude-plugin/plugin.json`. That is an inline object, a path to a file with a top-level `hooks` key, or an array of both. A path resolves against the plugin's root, and its hooks name that file as their source. A file that is missing or malformed gets a line on the plugin, and the listing goes on. A hook can approve a call that no rule allows.
3. **What widens the workers' fence,** from each kept layer and the profile's `settings`. That is `permissions.additionalDirectories`, `sandbox.filesystem.allowWrite`, `sandbox.network.allowedDomains`, `Edit` allow rules, and file-write allow rules for every path. It also names each key that loosens the sandbox, by its full path, as "What still escapes the fence" lists them. An object, such as `sandbox.credentials`, prints by its keys alone, never its values. A rule prints once per layer, so `Edit(*)` prints only as a file-write rule for every path. Under the fence these matter more than a worker's allow rules. A sandboxed command may write an added directory unless a rule denies it ([the loop probes, §U15](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u15-an-overlay-against-a-sandboxed-write-into-an-added-directory)). A unit worker's launch drops every such key from the profile's `settings`, and loads no project or local layer. So for a unit worker, only the user settings' and the managed file's entries apply.
4. **Plugins** the loop loads, each with its folder. A plugin that ships a mod, a `modules` entry in its `hooks.json`, carries a mark. On a personal subscription, a mod can approve a call past a deny rule ([the loop probes, §U24's control](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u24s-control-a-deny-rule-against-a-hooks-approval-and-a-mods)).
5. **Built-ins,** as a fixed note.

Which plugins load comes from each kept layer's `enabledPlugins`, the profile's composed settings, and the role's `pluginDirs`. The composed settings hold the plugins a clean room enables, as `references/profiles.md` §The folder lists. An installed plugin's folder comes from `installPath` in `claude plugin list --json`, which `show` runs in the repo, with a 30-second limit. When that command fails, the listing still names each plugin that loads, with its folder unknown. The listing never reads that command's `enabled`, which ignores `--setting-sources`, as `references/profiles.md` §The plugin dependency check says. It leaves out ids ending `@builtin` or `@inline`.

The built-in note reads:

```text
Claude Code also loads built-in plugins, which `claude plugin list` does not show.
On Claude Code 2.1.322, two of them handled tool calls: `cc-plugin-plugin-authoring` and `cc-plugin-privacy` (R11 loop probes, U9).
To see the current set, start a session with `--debug-file <file>` and search the log for `hooks module`.
```

It is a dated note, not a listing. `claude plugin list --json` lists no `@builtin` plugin, and a `--debug-file` log of that command names none. That was measured on Claude Code 2.1.325, on 2026-11-14, while #363 was designed. Built-in mods load only inside a session, and the set moves between builds. Every probe session with a debug log loaded both built-ins, each handling `tool.check` ([the loop probes, §U9](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u9-what-dontask-denies-a-background-loop-and-the-rule-that-allows-each)). #394 tracks an exact listing.

## The workers' fence

A loop's unit workers are bounded by a fence, and the loop keeps its allow list. The operator ruled this on 2026-11-14, revising ADR-0015 Decision 4 for workers, and #367 built it. `sidekick loop dispatch` launches each unit worker under `dontAsk`, with a settings overlay that holds the fence. Each path rule takes the `//` form, once for the path as given, and once more for its real path when that differs. This section is the contract a role's author reads: what the fence holds, what the launch keeps, and what still escapes it.

The loop itself stays under `dontAsk` with its short allow list: its reads, its `act` classes, and the fixed `sidekick loop` verbs `start` adds. Classes are the loop's alone. A worktree is disposable, so a worker's work inside it climbs no ladder. The `record`, `ask`, `act` ladder covers the outward actions, and only the loop takes those: labels, comments, closes, and landing. No class carries rules for workers, and `gates` are commands a worker reruns, not allow rules.

### What the overlay sets

- **`sandbox`:** `enabled: true`, `autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, and `failIfUnavailable: true`, with `network.allowedDomains` from `loop.json`'s `hosts`. It pins `false` on six keys that would loosen the sandbox: `filesystem.disabled`, `enableWeakerNestedSandbox`, `enableWeakerNetworkIsolation`, `allowAppleEvents`, `allowNestedUserNamespaces`, and `network.allowAllUnixSockets`. That a pin outranks a `true` in the user settings is believed from the settings docs' precedence. It ranks the command line over the user layer, and the managed file over both. Every command runs inside the sandbox, which the OS enforces whatever the command's spelling. The sandbox's other loosening keys, `excludedCommands` among them, still reach a worker from the user or managed settings, as "What still escapes the fence" says. With the retry off, Claude Code ignores network entries from the repo's project and local settings. It keeps those from user settings, managed settings, and `--settings` ([the loop probes, §U10](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u10-sidekicks-gates-inside-the-sandbox)). So the hosts reach a worker through its launch settings, and a host in the user or managed settings widens the fence.
- **`permissions.allow`:** `Edit(//<worktree>/**)`, so the file tools work in the worker's own worktree, and a `Read` rule each for the brief, the unit file, and the rulings file. The sandbox bounds a command's writes, not the `Edit` and `Write` tools, which follow permission rules ([the loop probes, §U15](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u15-an-overlay-against-a-sandboxed-write-into-an-added-directory)).
- **`permissions.deny`,** each an `Edit` rule unless named, where `<common>` is the repo's common git dir:
  - git's redirect files, which would send git, the worker's and sidekick's alike, to another git dir or config: `<common>/commondir`, `<common>/worktrees/*/commondir`, `<common>/worktrees/*/gitdir`, `<common>/worktrees/*/config.worktree`, and the worker's own `<worktree>/.git`;
  - `<common>/config` and `<common>/hooks/**`, as a belt over the sandbox. By Claude Code's sandboxing docs, fetched on 2026-11-12, a linked worktree's sandbox may write the shared `.git`, but not those two;
  - `<common>/sidekick/**`, which holds the desk's records and `finish`'s `disposable` list;
  - the sidekick folder, `<config>/sidekick/**`, which holds the profiles, their role plugins, the loops, and every attempt's folder;
  - each folder the launch adds, the profile's folder and the attempt's folder, so the worker reads them and never writes them;
  - the memory store, `SIDEKICK_MEMORY_STORE` or `~/sk-memory-store`, as both a `Read` and an `Edit` rule, since a working folder may hold it. The user layer may add it, and so may the launch itself. Take a profile whose `settingSources` leave out `user`, in a repo with a memory key: its launch adds the store to `permissions.additionalDirectories`. The deny holds either way;
  - each skill "The denied skills" names, as two `Skill` rules: `Skill(<skill>)` for a bare call, and `Skill(<skill> *)` for a call with arguments;
  - `WebFetch` and `WebSearch`, since `allowedDomains` binds neither, and an inherited layer may allow them;
  - `EnterWorktree` and `ExitWorktree`, since a unit worker starts in its worktree and works nowhere else. The deny does not stop sidekick's fetch hook. A `PreToolUse` hook runs even on a call that a deny rule then refuses ([the loop probes, §U24's control](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u24s-control-a-deny-rule-against-a-hooks-approval-and-a-mods)). So the hook checks for a unit worker itself, and fetches nothing there;
  - `Bash(git push:*)`, the push block's rule.
- **`permissions.blockReadsOutsideWorkingDirectories: true`,** so the worker reads only its worktree and the folders the launch adds. That is why the launch adds the attempt's folder, rather than allowing it. By the settings docs, as #367's design read them, an allow rule does not lift the block.
- **`autoMemoryEnabled: false`,** so Claude Code's own auto memory loads nothing into a worker that reads issue text.
- **`env`:** `SIDEKICK_WORKER`, naming the brief, `DISABLE_AUTOUPDATER=1`, and the push block's `GIT_CONFIG_*` entries. It names no main.
- **`worktree.baseRef: "head"`,** so the worktree branches from the loop's worktree, which `dispatch` has moved to origin's tip.

#### The denied skills

The list follows superpowers 7.0.2 and sidekick, as read on 2026-11-15. By Claude Code's skills docs, fetched on 2026-11-12, `Skill(name)` matches the skill called bare, and `Skill(name *)` a call with arguments. That a `Skill` deny keeps the skill out is believed from those docs, not measured.

| Skill | Why a unit worker may not run it |
|---|---|
| `superpowers:brainstorming` | It stops for a person's answer, and a unit worker has no one to ask |
| `superpowers:writing-plans` | It stops for a person's choice of how to execute |
| `superpowers:finishing-a-development-branch` | It stops for a person's choice of how to integrate |
| `superpowers:diagnosing-superpowers` | It works with a person on what went wrong |
| `sidekick:sk-execute` | It stops for the operator's choice of mode |
| `sidekick:sk-design` | A change's design belongs before a unit, not inside one |
| `sidekick:sk-track` | It files and closes issues, which the loop and the operator own |
| `sidekick:sk-milestone` | It opens and releases milestones, which the operator owns |
| `sidekick:sk-worktree` | It lands work, which the loop and the operator own |
| `sidekick:sk-save` | It writes the memory store, and a unit's run report is its record |

### What the launch keeps

- **The setting sources** are the profile's, or all three when it names none, less `project` and `local`. So the repo's hooks, its MCP approvals, and its local settings never load in a unit worker. The repo's hooks would run worktree code outside the sandbox.
- **The profile's `settings`** keep only `model`, `env`, `enabledPlugins`, `permissions.deny`, `permissions.ask`, `sandbox.filesystem.denyRead`, and `sandbox.filesystem.denyWrite`. None of those sets a fence key, so the overlay owns every one. Every other key drops, and a key Claude Code adds later stays out until sidekick lists it. `permissions.ask` only narrows, since under `dontAsk` an `ask` rule denies its call. `dispatch` prints one line naming the keys it dropped. Nothing refuses, so one profile serves the loop and its units.
- **The plugins.** The profile's `pluginDirs` load as in every profile launch, and `dispatch` passes no `--plugin-dir` of its own.

### For a role's author

- **The denied skills are denied** whatever the role's skill asks, as far as a `Skill` deny holds. "What waits on the check by hand" leaves that open. `superpowers:writing-plans` is among them, so a role skill that builds writes its own plan.
- **Keep a role's commands in its plugin folder.** A hook or MCP server in the role's plugin that runs a path inside the repo runs worker-written code outside the sandbox.
- **Spell each gate plainly,** as `gates` says, so auto-allow approves it.
- **Run each unit verb with a long `Bash` timeout,** since each can outlast a call's default 120 seconds, as "How long a unit verb runs" says.

### What still escapes the fence

- **The user layer.** The overlay owns every fence key in the profile's layer, but the user layer can still widen the fence while a unit keeps the `user` source. Section 3 of the inherited listing names its added directories, `allowWrite` paths, allowed domains, and file-write allow rules. It names the keys the next bullet gives too.
- **The user layer's sandbox exceptions.** A command that matches `sandbox.excludedCommands` in the user settings, or in the managed file, runs outside the sandbox. By Claude Code's sandboxing docs, fetched on 2026-11-12, `--settings` drops such entries only from a repo's own settings files. Under `dontAsk`, an excluded command still needs a kept allow rule, unless it is one of Claude Code's built-in read-only commands, which need none. The user settings' `sandbox.network.allowUnixSockets` and `sandbox.network.allowMachLookup` let a sandboxed command reach a socket or a macOS service outside the sandbox. `sandbox.network.allowLocalBinding` lets a command bind a localhost port. `sandbox.network.httpProxyPort` and `sandbox.network.socksProxyPort` hand the network fence to the operator's own proxy, which then decides what a worker reaches. `sandbox.credentials` and `sandbox.network.tlsTerminate` are on Claude Code's own list too. Section 3 of the inherited listing names each of these keys, with its layer. It also names the six the overlay pins, should a layer set one, since a pin does not outrank the managed file. The list is Claude Code 2.1.325's own, read from that build on 2026-11-16, with `excludedCommands` and `allowLocalBinding` beside it.
- **A loaded mod.** With no managed settings file, on a personal login, a loaded plugin's mod can approve a call past a deny rule or the read block. Claude Code's permissions docs, fetched on 2026-11-12, say so. So the fence's permission rules bind a tool call only while no loaded mod approves past them. Those are the `Edit` denies, the `Skill`, `WebFetch`, `WebSearch`, `EnterWorktree`, and `ExitWorktree` denies, and the read block. The sandbox still binds every sandboxed command. "Managed settings" says more, #394 probes the fix, and the inherited listing marks each plugin that ships a mod.
- **The environment.** The profile's `env`, and the user layer's, reach every process the worker starts, MCP servers included. An `env` value that names a path inside the repo, such as a `NODE_OPTIONS` `--require`, runs worker-written code outside the sandbox.
- **The role's MCP servers** run outside the sandbox, with their own network. They are the role's declared capability, and the inherited listing names them, as the operator ruled for the loop on 2026-11-14.
- **MCP servers beyond the role's.** A unit worker keeps the `user` source, so more servers than the role's may load. User-scope servers, claude.ai connectors, and the servers of plugins the user settings enable are believed to load too, and to run outside the sandbox. That is not measured, and the check by hand measures it. A user-layer allow rule approves their tools under `dontAsk`. Section 1 of the inherited listing prints every allow rule of the user layer, those among them, each with its file.
- **User-layer hooks** run outside the sandbox too. Keep their commands outside the repo, as under `~/.claude`, where a sandboxed command cannot write. A hook kept there can still run worker-written code. One that runs `npx`, `./node_modules/.bin/…`, or plain `git status` in the session's folder runs what the worker wrote or planted there. "For a role's author" says the same of a role's hooks.
- **Your own git in a leftover worktree.** Plain git you run in a unit worker's worktree, once it stops, runs what the worker planted there, such as an embedded repo's filter. sidekick's own reads there carry the hardened flags, so inspect such a worktree with `sidekick worktree list`.
- **The push block binds one spelling.** Under auto-allow, a sandboxed `git` call needs no allow rule, so the deny rule refuses only its own spelling of a push. The guarantee is `hosts` leaving out origin's host, which the check warns on.
- **The rest of the shared `.git`.** The sandbox lets a linked worktree write the shared `.git`, and the fence denies only the files "What the overlay sets" names. So a worker can still write the rest:
  - refs and `packed-refs`;
  - the `HEAD` and `index` of every admin folder, the loop's worktree's included;
  - `info/` and `objects/`;
  - an embedded repo's `modules/<name>/config` and `modules/<name>/hooks/`. Whether the sandbox's own denial of `config` and `hooks/` reaches those under `modules/` is unknown.

  `dispatch` takes its base from origin's own report, as "`sidekick loop dispatch`" says. sidekick's git into a worker's or the loop's worktree runs with replace refs off, and so does every git call of the desk and `sidekick worktree`. sidekick's plain git in the loop's repo top still reads them, such as `finish`'s landed check, as `references/workers.md` §Hardened git says. `dispatch` also refuses while the shared repo holds a replace ref or an `info/grafts` file. Claude Code makes the next worker's worktree with git of its own, which that flag cannot reach. A replace ref planted after dispatch, and a loose object rewritten in place, stay open until #404. The operator accepted, on 2026-11-15, that a worker can move refs, `HEAD`, or the main index. #404, in `backlog`, gives a worker a git dir of its own.
- **A `commondir` rewritten after a chain check.** sidekick's verbs that act in a worker's worktree check git's links first, then run hardened, as `references/workers.md` §Hardened git says. A `commondir` rewritten after that check would send a later call elsewhere. Hooks and fsmonitor stay off, the fence denies the write, and `discard` and `reap` stop the worker before `finish` runs.

### What waits on the check by hand

These unknowns wait on #367's check by hand, after it lands, on the Claude Code build of that day:

- whether auto-allow approves a sandboxed call under `dontAsk`;
- whether `gh` and `git` authenticate inside the sandbox;
- whether the fence's deny on `.git/config` holds against `git config`;
- whether the overlay's pinned `false` outranks a `true` in the user settings, checked on one of the six keys;
- whether a `Skill` deny keeps a denied skill out, through the `Skill` tool and through a slash command. A slash command expands with no `Skill` call ([the loop probes, §What breaks](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#what-breaks));
- whether the desk, watching a real unit worker, runs a filter that the worker planted in an embedded repo's own config;
- whether a bare `EnterWorktree` deny keeps the model from calling the tool at all under `dontAsk`, or only refuses each call once its `PreToolUse` hooks have run;
- which MCP servers load in a unit launch: the role's, user-scope servers, claude.ai connectors, or user-enabled plugins' servers.

## Managed settings

A loop's `never` rules stay in its own launch settings, which `start` compiles. The operator ruled that on 2026-11-14, and ADR-0015 records it. A managed settings file stays an option, and sidekick never writes one.

What is measured, on Claude Code 2.1.322 on a personal subscription:

- **With no managed settings,** a `--settings` deny rule held against a `PreToolUse` hook's approval. A mod's `tool.check` approval ran a command the deny rule refused. Claude Code's built-in guard, `cc-plugin-sec-default`, logged that it was not seated ([the loop probes, §U24's control](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u24s-control-a-deny-rule-against-a-hooks-approval-and-a-mods)).
- **With the deny rules in a managed settings file** the operator wrote with `sudo`, the guard seated. The mod's approval then no longer overrode them ([the operator-present probes, §U24](https://github.com/Rikmorn/sidekick/blob/e1725169edd5003d050f8b3d9ebd6f71b7379205/docs/research/loop/2026-11-12-loop-probes-operator-run.md#u24-a-deny-rule-in-managed-settings-against-a-mods-approval)).

Two things are not measured. One is whether a managed file holding no rules seats the guard. The other is whether each loop's own deny rules then bind over a mod. The file's effect on the operator's other sessions is not measured either. #394 probes the empty file. If it holds, the operator writes one file, once, and every loop's own `never` binds.

The loops' `never` rules stay out of the managed file itself for three reasons. It applies to every session on the Mac, the operator's bypass sessions included, which is believed from the docs. Each edit of it needs `sudo`. And a loop's `never` entry such as `Bash(bun run release:install)` would block the operator's own release.

Until #394 settles it, a loop's `never` binds only while no loaded plugin's mod approves past it. sidekick's mods approve nothing (ADR-0012 Decision 2). The listing marks each plugin that ships a mod, so read those before you start a loop.

When a managed file exists, the check and the listing read it as a kept layer. Its path is `/Library/Application Support/ClaudeCode/managed-settings.json`, where the operator-present probes wrote it on macOS.

## Starting a loop

`sidekick loop start` brings each loop it names to the state its definition asks for, and never runs two sessions for one loop. It reaps each loop's overrun attempt first, as "What `start` does" says.

```text
sidekick loop start (<name> | --all) [--record] [--now]
```

- **`<name>`** starts one loop, and **`--all`** every loop in the store, in name order. One loop's refusal never stops the others.
- **`--record`** launches a trial, with every class compiled as `record`, as "The compiled settings" says.
- **`--now`** stops or relaunches a session that is mid-tick, which `start` otherwise refuses to touch.

Run it after every edit to `loop.json` or to the loop's profile, and after a reboot. It leaves a loop that already matches alone, so a second run changes nothing. Under `--all`, an empty store prints one line and exits 0. Any other argument is a usage error, `--plugin-dir` included.

### What `start` does

1. **It refuses a relative `CLAUDE_CONFIG_DIR`** before it reads anything. The loop's own `record` and `arm` resolve that path against the loop's worktree, so they would read another store than `start` writes. Set it to an absolute path.
2. **It takes each loop's lock,** `start.lock` in the loop's folder, by an exclusive create. A lock taken since the last boot whose process still runs refuses that loop. The refusal names the lock file and the pid, and says to delete the file when no `start` runs. A lock whose process is gone is taken over, so a run cut short blocks no later one. So is a lock taken before the last boot, whatever its pid, since a reboot can hand that pid to another process. A bad name, or a loop with no folder, refuses without a lock.
3. **It reaps each loop** under that loop's units lock, as `sidekick loop reap` does, so a reboot clears an overrun attempt before a relaunch. The reap reads `loop.json` only while an attempt is in flight, and it runs for a paused loop too. Its lines start with `<name>: `. A units lock another verb holds leaves the reap to that verb, which reaps first, and `start` goes on. A reap that cannot run prints why, and `start` goes on.
4. **It reads the session listing once,** `claude agents --json --all`, for every loop. When the listing fails, every loop refuses, since `start` cannot tell a running loop from a stopped one without it. `start` reads each row's status then, before the prepare and the commit. So a tick that starts between the listing and the stop is stopped without `--now`.
5. **It prepares each loop.** It runs the check, and refuses on any issue or on a `state.json` that does not parse. It compiles the mandate, then composes the launch as `profile launch` does from the loop's repo, and refuses where those checks refuse. It hashes the launch and chooses an action, as "The reconcile" says. A paused loop skips the check and the compose, so a pause holds while the check would refuse other keys. A `loop.json` that does not parse, or fails its schema with an unknown key or a bad `schedule`, cannot say it is paused. The check then refuses it as usual. A paused loop's preparation refuses only a broken `state.json`.
6. **It commits the sidekick folder,** once per run, before the first `claude` call that acts. The subject names each loop that acts and its action. A launch, relaunch, or respawn adds the first 12 characters of its hash, and a pause adds none, as in `loop start: fixer launch 3f2a9c1d0b7e, triage pause`. A run in which no loop acts makes no commit. A failed commit warns, and the loops start anyway, since the history serves tracing.
7. **It acts on each loop,** in name order. It first prints the loop's warnings, then the inherited listing before a launch, relaunch, or respawn. It releases each loop's lock once that loop's last write is done.
8. **It waits for every fresh launch to arm,** all together, for up to 90 seconds, checking every 2. A launch has armed once an `armed.json` that carries its `launch` id exists. A respawn needs no wait, since its cron jobs come back with it ([the loop probes, §U11](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u11-a-one-shot-job-across-claude-stop-then-claude-respawn)).
9. **It prints one line per loop,** as "What `start` prints" says, and exits 1 when any loop refused or failed.

The warnings are the check's, the compose's, and two of `start`'s own:

- **A rule that compiles into both `permissions.allow` and `permissions.deny`,** such as one an `act` class and a `record` class both name. A deny wins, so the loop never runs it.
- **An `act` class whose rules allow `sidekick loop land`,** since a landing stays a request the operator runs (ADR-0015 Decision 5). Nothing warns under `--record`, since every class records.

### The compiled settings

`start` compiles `loop.json` into a settings overlay, which the launch's `--settings` layers over the profile's own `settings`. Under `dontAsk`, Claude Code denies each call that would otherwise prompt, unless a rule allows it ([the loop probes, §U9](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u9-what-dontask-denies-a-background-loop-and-the-rule-that-allows-each)). So Claude Code enforces the mandate itself.

| Source | Compiles to |
|---|---|
| `mandate.reads` | `permissions.allow` |
| A class in `act` | Its `allow` rules, into `permissions.allow` |
| A class in `record` or `ask` | Its `allow` rules, into `permissions.deny` |
| `mandate.never` | `permissions.deny` |
| `--record` | Every class compiled as `record` |
| Every loop | The keys in the list after this table |

- **The fixed verbs,** allowed and pinned to the loop's name: `Bash(sidekick loop record <name> *)`, `Bash(sidekick loop arm <name>)`, and `Bash(sidekick loop arm <name> *)`. Both `arm` forms are named, bare and with flags, so the allow list states each spelling the skill runs. The unit verbs follow, pinned the same way: `Bash(sidekick loop dispatch <name> *)`, the same form for `answer`, `wake`, `report`, and `discard`, and the bare `Bash(sidekick loop reap <name>)`, since `reap` takes no argument. `resume` has no rule: it is the operator's alone, and refuses in a loop's session anyway.
- **The self-deny:** `Edit(//<loop folder>/**)` and `Edit(//<profile folder>/**)`, each by its real path. So the loop's file tools never edit its `loop.json`, its runtime entries, or its profile. The verbs still write there, since an `Edit` rule binds the file tools, not a command's own process.
- **`permissions.blockReadsOutsideWorkingDirectories: true`.** The permissions docs, as #364's design read them, let the built-in read-only commands run in every mode otherwise. With it, the loop reads only its worktree and its added folders, among them the profile's folder, which the launch passes as `--add-dir`. That is believed from the docs; no probe ran it.
- **`env`:** `SIDEKICK_LOOP=<name>`, which `arm` checks, and `DISABLE_AUTOUPDATER=1`, as "The launch" says. `SIDEKICK_MAIN` and `SIDEKICK_WORKER` are set empty, which sidekick reads as absent. So a daemon started from a main's or a worker's shell names neither, and the loop's own `dispatch` does not refuse it as a worker.
- **`crossSessionInbound: "accept"`.** `dontAsk` counts as prompting, so without it Claude Code holds a message from a sender that bypasses permissions (docs, cross-session messaging).

The profile's own `permissions.allow` stays, since the layers' lists concatenate, and the inherited listing names those rules. Classes are the loop's alone, so the overlay holds no rule for workers.

### The launch

`start` runs `claude` from the loop's `repo`, with the composed settings and these arguments:

- `--permission-mode dontAsk`;
- `--worktree loop-<name>`, so the loop works in `.claude/worktrees/loop-<name>` of its repo;
- `--bg` and `-n loop-<name>`;
- the prompt `/sidekick:loop-arm <name>`, which arms the loop, as "Arming a loop" says.

`start` takes no `--plugin-dir` flag of its own. Each entry in the profile's `pluginDirs` passes as one, so a loop that needs a development sidekick names that plugin folder there. The choice then holds across `start --all` and a reboot, and the hash covers it.

**Trust.** In a repo Claude Code does not trust, `claude --bg` exits "Workspace not trusted" before the session starts ([the loop probes, §U19](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u19-finish---into-originmaster-after-a-loops-landing)). `start` then fails that loop and names the fix: run `claude` in the repo once and accept the trust prompt, then run `start` again. It removes the launch's `state.json` and keeps the store's commit. `start` judges trust only by the launch's own refusal, and never writes `~/.claude.json`. Its check reads the global config file only for MCP server names, as "What the check refuses" says.

**Updates.** A loop runs with `DISABLE_AUTOUPDATER=1`, as every session sidekick starts unattended does. So it keeps the Claude Code build and the plugins it launched with. By the CLI reference, `claude respawn` restarts a session "to pick up an updated Claude Code binary", and keeps its launch flags. A respawned session kept its cron jobs and their ids in the loop probes (§U11). So to update a loop's Claude Code, run `claude respawn <job>` between ticks. Whether a respawn loads newer plugins is not measured. "Pausing, stopping, and updating a loop" says how to launch a loop fresh, which loads both.

### `state.json` and `armed.json`

One writer writes each file, whole, through a temporary file and a rename.

`state.json`, written by `start` alone:

| Field | What it holds |
|---|---|
| `v` | `1` |
| `launch` | A fresh id for each fresh launch or relaunch. An `armed.json` counts only while it carries the same one |
| `job` | The background job id `claude --bg` printed; `null` until the launch returns, or when it printed none |
| `session` | `loop-<name>` |
| `launchedAt` | When this launch started |
| `startedAt` | When the last launch or respawn started, which the reboot test reads |
| `hash` | The launch hash |
| `record` | Whether `--record` forced the launch |
| `states` | Each class's state as launched: `record` for every class under `--record` |
| `schedule`, `tick` | As launched, which `arm` and `record` read |
| `pausedAt` | When a run first found the loop paused and ended it off; absent until then |

`start` writes it before `claude --bg`, with `job` set to `null`, since the launch prompt's arm reads it at once. Once `claude` returns, `start` writes it again with the job id. A launch that exits non-zero removes the file, so no `state.json` names a launch that never ran. A launch that timed out may have started, so its file stays, with `job` still `null`. A respawn moves only `startedAt`. A paused run that ends off adds `pausedAt`, and a later paused run keeps the first time. Only a fresh launch clears it, since its new file has none.

`armed.json`, written by `arm --armed` alone:

| Field | What it holds |
|---|---|
| `v` | `1` |
| `launch` | The launch id from `state.json` |
| `at` | When `--armed` ran |
| `tick`, `renewal` | The two cron job ids |
| `renewalAt` | When the renewal fires |

An `armed.json` whose `launch` is not `state.json`'s is stale, and every reader treats it as absent. A loop's cron jobs count as alive while its current `armed.json` is under six days old and its `renewalAt` is still ahead.

### The launch hash

A definition has changed when the launch hash differs from the `hash` in `state.json`. The hash is SHA-256, in hex, over five inputs:

1. `loop.json`'s bytes, so any edit relaunches, `schedule`, `tick`, and `repo` included;
2. the `--record` flag, since a trial of a loop whose classes all record changes no argument;
3. the whole argument list `start` passes to `claude`, which catches a compiler change in a newer sidekick;
4. the profile's folder;
5. each folder in the profile's `pluginDirs`.

A folder hashes as its sorted relative paths and their contents. It skips `.git`, `node_modules`, `.DS_Store`, and `.claude-plugin/types/` at any depth, and links. A subfolder that cannot be read hashes as one marker of its own, so the rest of the folder still counts.

It also skips a plugin folder's root `tsconfig.json` that parses to exactly `{ "extends": "./.claude-plugin/types/tsconfig.json" }`, one key with that value. The plugin folders are each `pluginDirs` entry, and each folder in the profile's folder that holds `.claude-plugin/plugin.json`. Any other `tsconfig.json` counts, as does one that does not parse.

Claude Code writes both into a `--plugin-dir` folder it loads ([the mod foundation probes, §Files the engine writes](https://github.com/Rikmorn/sidekick/blob/9fca66c6460aeaa7a44852bbeee32c1911de8fd3/docs/research/control-centre/2026-10-15-mod-foundation-probes.md#files-the-engine-writes), on Claude Code 2.1.300). It writes `.claude-plugin/types/`, whose MCP declarations list the tools of the servers that session connected. It writes the root `tsconfig.json` only where none exists, and leaves any other untouched. Hashing either would read a launched loop as changed. A role plugin usually sits inside its profile's folder, as `plugin/`. So both skips apply to the profile folder's hash, as to the plugin's own.

A paused loop is never hashed, so its `state.json` keeps the hash of the launch before the pause.

### The reconcile

`start` finds a loop's session in the listing. Its candidates are the row for `state.json`'s `job`, and every row named `loop-<name>`. Two or more candidates refuse, listing each, since `start` cannot tell which is the loop. A paused loop whose candidates are all stopped is left off instead. An interactive session by that name refuses too, and so does a row whose `pid` is not a number.

A row with a `pid` is live, and one without is stopped. A live row is between ticks when its `status` reads `idle` ([the loop probes, §U12](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u12-what-tells-a-loop-mid-tick-from-one-between-ticks)). Any other status, or none, counts as mid-tick.

A row by name is the launch's own only while `state.json`'s `job` is `null`. Once `job` is set and gone from the listing, a row by name is another launch, and counts as changed. A respawned job kept its id in the loop probes (§U11), so another id means another launch.

A definition is unchanged while the hash matches `state.json`'s and `state.json` records no `pausedAt`. So once a pause is lifted, the launch before it counts as changed, whatever the hash says.

The pause rows come first, so a pause wins whatever else holds:

| Session | Definition | Other facts | Action |
|---|---|---|---|
| None, or stopped | Paused | | Leave it off; `state.json` records the pause |
| Live, between ticks | Paused | | `claude stop`, keeping the row; `state.json` records the pause |
| Live, mid-tick | Paused | | Refuse, naming `--now`; with `--now`, `claude stop`, then `state.json` records the pause |
| None | Not paused | | Launch fresh |
| Live | Unchanged | | Leave it; not armed when it started before the boot |
| Live, between ticks | Changed, or no `state.json` | | Relaunch: `claude stop`, a wait for its process to exit, `claude rm`, then launch fresh |
| Live, mid-tick | Changed, or no `state.json` | | Refuse, naming `--now`; with `--now`, relaunch |
| Stopped | Unchanged | Jobs alive, and started since the boot | `claude respawn`, then set `startedAt` |
| Stopped | Unchanged | Jobs not alive, or a boot since `startedAt` | `claude rm`, then launch fresh |
| Stopped | Changed, or no `state.json` | | `claude rm`, then launch fresh |

- **A boot since `startedAt` launches fresh,** until the reboot probe, U1 in #364, shows that a respawn keeps a loop's cron jobs across one. Sleep leaves the boot time alone, so a loop that lost its process to sleep is respawned.
- **A live loop whose jobs are not alive is left, with a warning,** since a relaunch could race a fresh launch's arm. So is a live loop that started before the last boot, though its `armed.json` reads alive, since whether cron jobs outlive a reboot is U1's question. The warning names the fix: `claude stop <job>`, then `start <name>`, which launches it fresh.
- **A relaunch waits up to 15 seconds for the stopped process to exit** before `claude rm`. `claude rm` kept a job stopped a moment before, as measured on Claude Code 2.1.300 on 2026-10-15.
- **`start` judges `claude rm` by what it prints,** since its exit code does not say whether it removed the job. It never runs the `--discard-unpushed` line `rm` may offer.

### What `start` prints

Each loop ends with one summary line on stdout, after the wait for the arm:

| Line | When |
|---|---|
| `<name>: left <job> (unchanged), armed` | Its session runs and matches its definition |
| `<name>: launched <job> (new), armed` | A fresh launch, where no session was |
| `<name>: launched <job> in place of <old> (<why>), armed` | A fresh launch after `claude rm` of a stopped session |
| `<name>: relaunched <job> in place of <old> (<why>), armed` | A stop, a `claude rm`, and a fresh launch |
| `<name>: respawned <job> (stopped, cron jobs alive), armed` | A `claude respawn` |
| `<name>: paused` | A paused loop that ends off, stopped by this run or already off |
| `<name>: refused` | `start` changed nothing for this loop |
| `<name>: failed` | A `claude` call or a `state.json` write went wrong partway |

A line ends `not armed` in place of `armed` when no current `armed.json` shows the loop's jobs alive, or a live session started before the last boot. A launch whose `claude --bg` printed no job id reads `launched with no job id`, or `relaunched with no job id` after a relaunch. `<why>` is one of `new`, `definition changed`, `unpaused`, `state.json names another job`, `no state.json records it`, `cron jobs gone`, and `machine rebooted since it started`.

The lines that explain a refusal or a failure come first, on stderr. A line about one loop starts with `<name>: `. A line about the whole run has no name: a usage error, a relative `CLAUDE_CONFIG_DIR`, a failed listing, and a failed commit of the sidekick folder.

**`refused` and `failed` differ in what may stand.** A loop is `refused` when `start` changed nothing for it: no call acted on its session, and nothing was written for it. The check, the compose, a held lock, a failed listing, or the reconcile refused it. A loop is `failed` when a step that ran went wrong, so part of the action may stand:

- a `claude stop` that failed, in a pause or a relaunch, so the session may still run;
- a stopped process that still ran after 15 seconds, before any `rm`;
- a `claude rm` that failed, timed out, or did not say it removed the job, so `start` launched nothing. Read what `rm` printed and settle the job by hand, since `start` never discards a job's work;
- a `claude respawn` that failed. Each `start` tries the respawn again while the loop's jobs read alive, so its lines name the way out: `claude rm <job>`, then `start <name>`, which launches the loop fresh. After a respawn that timed out, the first step is `claude stop <job>` instead, since the respawn may have left a live row;
- a `state.json` write that failed before the launch, so nothing launched;
- a `claude --bg` that failed or did not return in time, the trust refusal included.

Both set exit 1. A paused loop that ends off never does. A paused loop that `start` could not stop does, since its session may still act: a mid-tick row without `--now` refuses, and a failed stop fails. After a `claude --bg` that failed, the next `start` launches the loop fresh. After one that timed out, it finds the session by its name, if one started.

### How long `start` runs

`start` can outlast a session's `Bash` call, which ends at 120 seconds unless it sets a longer timeout. The listing takes up to 30 seconds. A relaunch can take about 265 seconds: 10 for `claude stop`, 15 for the process to exit, 180 for `claude rm`, and 60 for `claude --bg`. The wait for the arm adds up to 90, and each loop's checks run `claude` too. A reap that stops an overrun worker adds its own stop and `finish`, whose `claude rm` has no limit. So run `start` from a terminal, or in a session with a long `Bash` timeout. A run cut short is recoverable. The next `start` takes over its lock, and finds a session launched with no job id by its name.

### Pausing, stopping, and updating a loop

- **To pause a loop,** add `"paused": true` to its `loop.json`, then run `start <name>`. It stops a live session between ticks, and `--now` stops a mid-tick one at once. The row stays, and `state.json` records `pausedAt`. The loop then stays off across `start --all` and a reboot.
- **To resume it,** delete the key or set it to `false`, then run `start`. Since `state.json` records the pause, `start` launches the loop fresh, for `unpaused`, whatever else changed. It removes a stopped row first. A live one, such as a session you respawned by hand, it relaunches between ticks, or refuses mid-tick, naming `--now`.
- **To stop a loop at once,** run `claude stop <job>`. A later `start` would start it again, so add the pause too when it should stay off.
- **To change a loop,** edit `loop.json`, its profile, or a folder in its `pluginDirs`, then run `start <name>`. It relaunches the loop between ticks, or refuses a mid-tick one, naming `--now`.
- **To try a change first,** run `start <name> --record`, which relaunches the loop with every class in `record`. A plain `start` afterwards brings the acting loop back, since the record flag is in the hash.
- **To update a loop's Claude Code,** run `claude respawn <job>` between ticks, as "The launch" says. To load newly installed plugins for certain, run `claude stop <job>` and `claude rm <job>`, then `start <name>`, which launches the loop fresh.

## Arming a loop

Only the model can make a cron job, so a loop arms itself. Its launch prompt, `/sidekick:loop-arm <name>`, runs the `loop-arm` skill. The skill leaves the session holding exactly one tick job and one renewal job, both made by that run. It reports them with `sidekick loop arm <name> --armed`. A recurring job expires seven days after it is made. So the renewal, a one-shot job six days out, runs the skill again, which remakes both jobs and restarts the tick job's seven days.

```text
sidekick loop arm <name>
sidekick loop arm <name> --armed --tick <id> --renewal <id>
```

- **The plain form writes nothing.** It prints what the skill makes, one fact per line, each led by a label. They are the tick job's schedule and prompt from `state.json`, and the renewal's cron, local time, and prompt. Then come the ids in a current `armed.json`, which the skill deletes, and last the `--armed` command, with the two ids to fill in.
- **`--armed` writes `armed.json`,** with the current launch, the time now, the two ids, and the renewal's time, computed as the plain form computes it. It prints `armed <name>: tick <id>, renewal <id>`, then the renewal's local time. Each id is 1 to 64 letters, digits, `-`, or `_`.

The renewal fires six days from now, rounded up to the next minute, on a cron that names that local minute, hour, day, and month. `SIDEKICK_LOOP_RENEWAL_MINUTES`, a positive whole number of minutes, replaces the six days, so a hand test can fire a renewal early. Set it in the profile's `settings.env`. The reconcile reads `renewalAt` from `armed.json`, so it follows the setting, while the six-day test on `at` stays six days.

Both forms refuse a bad name, and a `SIDEKICK_LOOP` that names another loop, so one loop cannot arm another. An unset or empty `SIDEKICK_LOOP` passes. They refuse a `SIDEKICK_LOOP_RENEWAL_MINUTES` that is not a positive whole number, naming it. They also refuse a missing or broken `state.json`, so `arm` arms only a loop `start` launched.

`CronList` shows each job's id and its prompt, cut to the first 79 characters, and no creation time ([the loop probes, §U5](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u5-what-cronlist-shows-of-a-job)). So the skill finds its old jobs by the ids `arm` prints, or by their two prompts, and `armed.json` is the only clock for the renewal. It deletes the old jobs before it makes new ones, since a loop with two tick jobs ticks twice. When `arm` refuses, the skill stops, says why, and makes no job. It declares no `allowed-tools`: under `dontAsk`, `CronCreate`, `CronList`, and `CronDelete` ran with no rule (§U9), and the fixed verbs allow `arm`. Its frontmatter keeps the model from invoking it, so only a loop's launch prompt, its renewal, or you start it.

Run `/sidekick:loop-arm` only in the loop's own session. `arm` passes an unset `SIDEKICK_LOOP`, so in an ordinary session the skill makes the loop's cron jobs there. It also writes an `armed.json` that `start` trusts, so `start` then reports the loop armed while its own session may hold no jobs.

## The record

A loop's record is one JSON line per entry, in `records/<YYYY-MM-DD>.jsonl` in its folder. The file is named for the local date the line was written on, and each line goes in with one write. Every line holds `v: 1`, `at` as an ISO 8601 UTC time, and `kind`:

| `kind` | Written by | Fields beside `v`, `at`, and `kind` |
|---|---|---|
| `would` | The model, through `record`: what a class in `record` would do | `summary`, `class`, `command`, `unit?`, `hash?` |
| `request` | The model: an action it asks the operator for | `summary`, `command`, `class?`, `unit?`, `hash?` |
| `did` | The model: what a class in `act` did | `summary`, `class`, `command`, `unit?`, `hash?` |
| `denied` | The model: a call Claude Code denied, so a mandate gap shows | `summary`, `command`, `class?`, `unit?`, `hash?` |
| `note` | The model: anything else worth keeping | `summary`, `unit?`, `hash?` |
| `dispatched` | `sidekick loop dispatch` | `unit`, `record?: true`, `worker?`, `issue?` |
| `answered` | `sidekick loop answer` | `unit`, `worker` |
| `resumed` | `sidekick loop resume` | `reason` |
| `landed` | `sidekick loop land` (#377) | `unit`, `commit` |
| `failed` | `sidekick loop reap`, `discard --failed`, and `land` (#377) | `unit`, `reason`, `worker?` |
| `discarded` | `sidekick loop discard` and `reap` | `unit`, `reason`, `worker?` |

The unit verbs write `worker` on every line, and `dispatch` writes `issue`. A closing line without a `worker`, such as `landed`, closes the unit's attempt whatever its worker.

The bounds: `summary` and `reason` run 1 to 1,000 characters, and `command` 1 to 4,000. `unit` is 1 to 64 of letters, digits, `.`, `_`, and `-`. `worker` follows the worker name rule in `references/workers.md` §The brief, and `issue` is a whole number of at least 1. `commit` is a hex object id of 7 to 64 characters, so a SHA-256 id fits. `hash` is the launch hash from `state.json`, which `record` stamps on each line the model writes once a `state.json` exists. A loop that `start` never launched writes lines without it.

`summary`, `command`, `reason`, and `class` hold no control character. That is nothing from U+0000 to U+001F, no U+007F, and nothing from U+0080 to U+009F, the C1 controls. A terminal reads those as commands, so a line `show` prints could otherwise move the cursor and hide the lines before it.

The caps read the verb kinds (`dispatched`, `answered`, `resumed`, `landed`, `failed`, and `discarded`), so the model never writes them, and `record` refuses each with the name of its writer. Every write checks its line against the schema first and refuses one that fails, so a line a verb writes always reads back. A write after a torn last line starts a new line, so only the torn line is lost.

The reader skips a line that is not JSON or fails the schema, and counts the skips, so one bad line hides nothing else. A day file that exists and cannot be read, such as a folder in its place, is named instead of read. A line holding a field a newer writer added still reads, without that field.

## `sidekick loop record`

```text
sidekick loop record <name> --kind <would|request|did|denied|note> --summary <text>
                            [--class <class>] [--command <text>] [--unit <id>]
```

It refuses:

- a loop name that breaks the name rule;
- a `state.json` that fails to parse, and, when the loop has none, a `loop.json` that fails to parse;
- any kind outside the five, naming the writer of each verb kind;
- `would` and `did` without `--class`, and every kind but `note` without `--command`;
- `note` with `--class` or `--command`, since its line holds a summary alone;
- a value past its bound, outside its form, or holding a control character, naming the flag;
- a `--class` the launch did not have, or, when no `state.json` exists, one `loop.json` does not name;
- `did` for a class whose state was not `act`, with the advice to record `would`, or to ask with `request`;
- text in `--summary`, `--command`, `--class`, or `--unit` that the key check flags, so keys stay out of the record and off the desk. The refusal names the flag and the check, never the text.

Once a `state.json` exists, `record` judges the line by the launch, from `state.json`, not `loop.json`. It stamps the launch's `hash`, and checks `--class` and the `did` rule against the launch's `states`. So a trial under `--record` records no `did`, and an edit to `loop.json` changes nothing until the next `start`. A class the launch lacked refuses until the loop restarts, and the refusal names the cause.

Without a `state.json`, `record` checks `loop.json` as it is now. So a class removed from it refuses records for that class, and the refusal names the cause.

`record` takes the units lock, and refuses while another verb holds it. It reaps first, as the unit verbs do, then stamps its line, so the day file keeps time order. The reap reads the record, and `loop.json` only while an attempt is in flight. An attempt past its time is stopped and discarded, so then `record` runs `claude`, git, and `finish`. A reap that cannot run prints why on stderr, and the line is still written. Otherwise `record` runs no git and no `claude`, and skips the rest of the check. A loop whose profile goes bad mid-run therefore keeps its record, and each call stays cheap.

On success it prints the reap's lines, if any, then one line: `recorded <kind>`, or for a request, `new request` or `repeat request`.

### When a request is new

A request is new when no request with the same `class`, `command`, and `unit` sits in the record since the schedule's second-most-recent fire at or before now. The schedule is the launch's, from `state.json`, or `loop.json`'s when no `state.json` exists. An absent field matches only an absent field, and the window ends now. A tick runs at most half a period late, so the window covers the previous tick's lines and the current tick's own. `record` judges a request before it appends it, so the line never counts itself. A schedule without two fires in the past 366 days looks back 366 days instead.

## Units

A loop runs its work one unit at a time. A unit is one issue under one skill of the loop's role. `dispatch` derives the unit's id, `<skill>-<issue>`, such as `fix-bug-42` for `--skill fixer:fix-bug --issue 42`, and the other verbs take it as `--unit`. Each attempt at a unit runs in one worker, from a unit brief, inside the workers' fence. An attempt is in flight from its `dispatched` line until a `landed`, `failed`, or `discarded` line for its unit that names its worker or no worker.

```text
sidekick loop dispatch <name> --issue <n> --skill <plugin>:<skill>
sidekick loop answer <name> --unit <id> <text>
sidekick loop wake <name> --unit <id>
sidekick loop report <name> --unit <id>
sidekick loop discard <name> --unit <id> --reason <text> [--failed]
sidekick loop reap <name>
sidekick loop resume <name> --reason <text>
```

Every unit verb refuses a name that breaks the name rule, and a `--unit` outside the unit id rule or of `.` or `..`. It refuses a non-empty `SIDEKICK_WORKER`, since a worker runs no unit verb. It refuses a `SIDEKICK_LOOP` that names another loop, since a loop acts only on its own units. It reads the loop from the store the environment names, and refuses when that store holds no such loop. A refusal names every reason it finds.

- **The units lock.** Each unit verb, `record`, and `start`'s reap take `units.lock` in the loop's folder, by an exclusive create, while they read the record and write verb lines. A lock whose process is gone, or that was taken before the last boot, is taken over, as `start.lock` is. A lock another verb holds refuses, except in `start`.
- **The reap runs first.** `dispatch`, `answer`, `wake`, `report`, `discard`, `reap`, and `record` reap the attempt in flight first, under the same lock, as "`sidekick loop reap`" says. So the work cap holds whenever the loop does anything, and its role's tick need not remember to reap. A loop that does nothing at all leaves an overrunning worker to run on until its next verb, or the next `start`.
- **When the reap cannot run,** because it cannot read the record or close the attempt, it refuses `dispatch`, `answer`, `wake`, `discard`, and `reap`. Each would act on an attempt the reap judged overdue. `report` and `record` print why on stderr and go on, so an overdue worker that will not stop never hides its report. `resume` reaps nothing.

### `sidekick loop dispatch`

```text
sidekick loop dispatch <name> --issue <n> --skill <plugin>:<skill>
```

It starts one unit in a worker. `--skill` names the unit's job, since one role can carry several, such as a fix and a triage. The derived id gives a triage and a fix on one issue a cap each. The loop cannot reset the attempts cap by renaming a unit.

It checks, in this order, and writes nothing in the loop's folder until every check passes, but for what its reap writes:

1. **The arguments.** The name follows the name rule, and `--issue` is a whole number of at least 1. `--skill` is `<plugin>:<skill>`, each part lower-case letters, digits, and hyphens, starting with a letter or digit, at most 48 characters. The derived unit id follows the unit id rule.
2. **The environment,** as every unit verb checks it.
3. **The loop.** Its folder exists in the store the environment names, and the check passes as `start` runs it. Its `state.json` exists and names `loop-<name>`, so `dispatch` runs only for a loop `start` launched. A daemon whose `CLAUDE_CONFIG_DIR` differs from `start`'s therefore refuses, rather than writing another store.
4. **The lock, the reap, and the record.** It takes the units lock and reaps first. Then the record must be readable, with no attempt in flight and each cap under its limit, as "The caps" says. An attempt in flight refuses, naming `report` and `discard` for it.
5. **The skill, the issue, and the loop's worktree,** each reason named together:
   - `--skill` names a skill of the role. The `pluginDirs` entry whose `.claude-plugin/plugin.json` names `<plugin>` holds `skills/<skill>/SKILL.md`.
   - The issue passes the read "The issue's text" says.
   - The loop's worktree, `<repo>/.claude/worktrees/loop-<name>`, exists, and its link to the repo holds, with the admin folder `loop-<name>`. It holds the branch `worktree-loop-<name>`, and its tracked files are clean. The shared repo holds no replace ref under `refs/replace/`, and no `info/grafts` file, each named when it does. `start` never checks it, so this is its first check. Each git call into it runs hardened, as `references/workers.md` §Hardened git says.
6. **The move.** It asks origin for its default branch and that branch's commit, with `git ls-remote --symref origin HEAD`, then fetches `origin`. After the fetch, that commit must be in the repo, and `refs/remotes/origin/<branch>` must be at it, or it refuses, naming both. Then it fast-forwards the loop's worktree to that commit. So the base is origin's own default branch, as origin reports it at dispatch. An `ls-remote` that fails refuses. So does one that prints what dispatch cannot read as one branch and its commit, and the refusal quotes what it printed. A worktree that is ahead or has diverged refuses, since the loop's worktree holds nothing of its own. The `ls-remote`, the fetch, and the fast-forward each run within 60 seconds, and every other git call within 10.
7. **The profile, from the moved worktree.** The unit launch looks the profile up from the loop's worktree, as every launch looks it up from where it runs. It refuses when that lookup finds the profile anywhere but the folder the loop's check judged, such as a repo store on origin's branch. A repo's own profile can run code from the repo's commits as the role's. It also refuses when it cannot tell whether the worktree holds a profile store.

Then it acts:

8. **The name.** It draws up to 33 characters of the loop's name, less any trailing hyphen, then a hyphen and 6 random hex characters. A name that the worker name rule, `worker dispatch`'s name checks, or an existing attempt folder refuses is drawn again, up to 5 draws.
9. **The attempt's folder.** It writes `unit.md`, `brief.md`, and `worker.json`, with no job yet. The brief's body holds its `## Limits`, the question channel, the loop's `gates`, and what the run report holds. It says to run each gate as one `Bash` call with a `timeout`.
10. **The launch.** It launches the worker through `worker dispatch`'s own checks and launch, inside the fence, from the loop's worktree, as `references/workers.md` §A unit brief says. So the worker branches from origin's tip. Once those checks pass, right before `claude --bg` runs, it writes `worker.json` with `job: null`, then `dispatched` with the unit, the worker, and the issue. Under `start --record`, the line also holds `record: true`. Once `claude` reports a start, it writes the job into `worker.json`. So the attempt counts before any worker can start. A dispatch ended during the launch leaves it counted, and so does a stray stopped on the wrong worktree.

Once the worker has started in its worktree, it prints the reap's lines, the profile keys the launch dropped on stderr, and `claude`'s output. Then come `worker <worker> dispatched · permission mode dontAsk · pushes blocked` and three lines of its own, and it exits 0:

```text
unit <unit> · worker <worker> · job <job>
next: once the worker messages, read its report with sidekick loop report <name> --unit <unit>
to give up on it: sidekick loop discard <name> --unit <unit> --reason <text>
```

When the launch goes wrong:

- **A refusal by the launch's own checks,** or a `dispatched` line that cannot be written, launches nothing. The attempt's folder goes, and no line counts it.
- **A launch `claude` refuses,** "Workspace not trusted" among them, writes `discarded` straight after, with the reason "the launch was refused". That frees the slot, and the attempt still counts, since the loop tried. It costs one attempt at the unit and one of the day's units. So a refusal that repeats reaches the attempts cap and goes to the operator. "Workspace not trusted" in `claude`'s output adds the fix line `start` gives, for the loop's worktree. When the `discarded` line cannot be written, the attempt stays in flight, and `dispatch` names `sidekick loop discard`.
- **A launch that timed out** may have started a worker, and its `dispatched` line already counts it. `dispatch` keeps the folder, with `job: null` in `worker.json`. It exits non-zero, saying that the attempt now counts, and names `sidekick loop discard`. Until `reap` or `discard` closes it, the attempt costs one attempt at the unit and one of the day's units, and blocks the next dispatch.
- **A dispatch ended during the launch,** as by the `Bash` tool's timeout, leaves the same: the folder, `job: null`, and the `dispatched` line. `discard` finds the worker by its session name and closes the attempt, and so does `reap` once the attempt passes its work cap.
- **A start whose job cannot be recorded** stops the worker as a stray and refuses. Its `dispatched` line stands, so `dispatch` names `sidekick loop discard`, which clears the stray's worktree and closes the attempt.
- **A worker on the wrong worktree** is stopped, as `references/workers.md` §`dispatch` says. Its `dispatched` line stands, so the attempt stays in flight, and `dispatch` names `sidekick loop discard` for it.

#### The issue's text

A unit's text is an issue, fetched and filtered in code, so only the operator's own account reaches a worker. `dispatch` reads it with one GraphQL query through `gh`, on the repo's `origin`, within 30 seconds. The trusted account is that query's `viewer`, the account `gh` is logged in as. The read refuses:

- an issue whose author is another account;
- an issue last edited by another account, or by one that no longer exists;
- a title renamed by another account, or by one that no longer exists;
- a closed issue;
- an issue with more than 100 comments, or more than 100 title renames, the most one read takes;
- a renames list whose length differs from its count, since a rename it leaves out cannot be checked;
- text the key check flags, in the title, the body, or a kept comment, naming the check and never the text.

Comments written, or last edited, by another account are dropped, and the unit file says how many were. The unit file holds the issue's title, its URL, its body, and each kept comment under its author and time.

### `sidekick loop answer`

```text
sidekick loop answer <name> --unit <id> <text>
```

It rules on a question from the unit's worker. The operator's main runs it, and so may the loop, when its role rules a question itself. The text is one argument, and must not be empty. It may hold newlines and tabs, and no other control character. It runs to 20,000 characters, and the key check refuses it.

Under the lock, after the reap, it needs the unit's attempt in flight, with a worker. It appends `## Ruling, <local date and time>` and the text to the attempt's `rulings.md`, and creates the file when needed. It never follows a link there. Then it writes `answered`, which closes the attempt's wait, and prints `unit <unit> · worker <worker> · answered in <rulings file>`. Its last line is the next step:

- **In the loop's own session,** run `sidekick loop wake <name> --unit <unit>`, then message the worker to read the rulings file.
- **Elsewhere,** where `SIDEKICK_LOOP` is unset or empty, message `loop-<name>`, so the loop wakes its worker and points it at the file.

When the ruling is in the file but the `answered` line cannot be written, it says so. Running `answer` again would append the ruling a second time, and the wait stays open until an `answered` line closes it.

### `sidekick loop wake`

```text
sidekick loop wake <name> --unit <id>
```

It wakes the unit's worker, once a ruling waits for it. Under the lock, after the reap, it needs the unit's attempt in flight, with a worker. It finds the worker's rows in `claude agents --json --all`, by the job `worker.json` names. When that job is `null`, or the file cannot be read, it finds them by the worker's session name.

- **A row whose process may run,** with a `pid` or one the listing gives in a form it cannot read, is left alone. It prints that the worker runs, and exits 0.
- **One stopped job** is respawned with `claude respawn <job>`, from the loop's worktree, within the limit `start` gives a respawn. It prints `worker <worker> was stopped, so wake respawned its job <job>`.
- **No row, rows with no job id, or several jobs by the worker's name** refuse, and name `discard`. So does a respawn that fails. A listing that fails refuses too, saying that wake cannot tell whether the worker still runs.

It never takes `--all`, and never names another job.

### `sidekick loop report`

```text
sidekick loop report <name> --unit <id>
```

It prints a unit's run report. That is the loop's only view of its worker, since the loop cannot read the worker's worktree. It reads the unit's attempt in flight, else the unit's newest attempt by the record, so it serves a closed attempt too.

- **The report** is the worker's `unit-report.md` while its worktree exists, else the attempt's `report.md`, which `finish` saved. A worktree that holds none falls through to the attempt's file too. Each read passes the report guard `references/workers.md` §A unit brief names, and a refused report never falls through. The output opens `report of unit <unit> · worker <worker>, from <file>:`.
- **The branch head.** It then prints `head of worktree-<worker>: <commit> <subject>`, from `git log -1` by the hardened git. That runs after the chain check, with the admin folder named for the worker. A worktree that is gone prints a line saying so instead.
- **What it withholds.** A line the key check flags prints as `(withheld: <ids>)`, and so does the commit subject. A private key's block withholds every line from its header through its `END` line.
- **Control characters.** Every line it prints, on stdout and stderr alike, shows each control character but a newline or a tab as `\xNN`. A chain refusal can quote paths the worker wrote, so stderr is escaped too.
- **The gap line.** A report with no `## Proposals` heading ends with a line saying that it proposes no outward action. Read that as a gap in the report, not as nothing to do.

A reap that cannot run prints why on stderr, and the report still prints. `report` exits 1 when the branch head cannot be read, after the report has printed.

### `sidekick loop discard`

```text
sidekick loop discard <name> --unit <id> --reason <text> [--failed]
```

It gives up on the unit's attempt in flight. `--failed` marks the attempt failed, as for a rebase that cannot settle or a gate that fails after it (#377), so the breaker counts it. A discard without it, such as a role's requeue, does not count. `--reason` follows the record's rule for `reason`, and the key check refuses it.

Under the lock, after the reap, it needs the unit's attempt in flight. When the reap closed that very attempt, it says so, and exits 0. Otherwise:

1. **It stops the worker.** It finds the worker's rows as `wake` does, and stops each whose process may run with `claude stop`. It waits up to 15 seconds for a listed process to exit.
2. **It runs `finish`'s discard** with the unit brief, without a report when the worktree holds no `unit-report.md`. A clean worktree is removed, with its branch kept as a backup ref, and its report saved to the attempt's folder.
3. **It closes the attempt.** It writes `failed` under `--failed`, then `discarded`, each with the unit, the worker, and the reason. That frees the loop's slot.

It prints `finish`'s lines, then `unit <unit> · worker <worker> · discarded`, or `failed, then discarded`.

- **A refusal from `finish`,** such as for uncommitted or ignored work, leaves the stopped worker's worktree in place, and the attempt closes anyway. It prints `finish`'s lines and the hand route: inspect the worktree with `sidekick worktree list`, not with plain `git status` there. Plain git runs what the worker planted, such as an embedded repo's filter. Settle what `finish` names, such as uncommitted work to copy out or remove. Then run `sidekick worker finish <brief> --discard` in the loop's repo.
- **A worker with no session left** has nothing to stop and no session for `finish` to find. The attempt closes, with the route for any worktree or branch the worker left.
- **While the worker may still run, it writes nothing,** and the attempt stays in flight until the worker is stopped by hand. That covers a stop that fails, and a process still running 15 seconds after it. It covers a session listing that fails, and a `finish` refusal while a live process holds the worktree's lock or `git worktree list` fails. Run `discard` again once the worker has stopped.
- **A record that cannot be written** after `finish` ran names `sidekick loop show <name>`, which shows whether the attempt closed.

### `sidekick loop reap`

```text
sidekick loop reap <name>
```

It closes the attempt in flight once its working time passes `workMinutesPerUnit`, as "The caps" counts it. It writes `failed` with the reason, then discards as `discard --failed` does. An attempt within its time is left alone. A worker with no session left is reaped the same way once past its time.

It prints, per attempt it reaps, a lead line, then the discard's lines, with the hand route for a dirty worktree. The lead reads `unit <unit> · worker <worker> worked <n> minutes, past the work cap of <m> minutes, so reap stops and discards it`. It prints nothing when nothing is due. A reap whose stop or session listing fails writes nothing, and the attempt stays in flight until the worker is stopped by hand.

Each unit verb and `record` reap first, and `start` reaps each loop before it acts, so a reboot clears an overrun before a relaunch.

### `sidekick loop resume`

```text
sidekick loop resume <name> --reason <text>
```

It resets a tripped breaker once its cause is settled. The operator runs it from a main: it refuses in any loop's session, its own included, where `SIDEKICK_LOOP` is set and not empty. It is not a fixed verb either, so a loop cannot clear its own breaker. It refuses an untripped breaker, naming the count and the cap, so its line always marks a real reset. `--reason` follows the record's rule, and the key check refuses it.

It takes the units lock and reaps nothing, since a reap can stop a worker or refuse, and neither belongs in the operator's reset. It writes `resumed` with the reason, which restarts the count of units failed in a row. It prints `loop <name> resumed: the count of units failed in a row restarts at 0`.

### How long a unit verb runs

Each unit verb can outlast a `Bash` call's default 120 seconds, so a loop runs each with the `Bash` tool's longest `timeout`, 600000 milliseconds. Even that does not cover the worst case. The limits below are the code's, as read on 2026-11-16:

- **`dispatch`** gives `ls-remote`, the fetch, and the fast-forward 60 seconds each, and every other git call 10. The issue read takes up to 30 seconds, and so do the session listing for the name, `claude plugin list`, and `claude doctor`. The launch takes up to 60 seconds. The worktree check after it reads the session listing up to 30 times, a second apart, each read up to 10 seconds. A stray's stop takes up to 10 more. Those alone pass ten minutes.
- **A reap,** which every unit verb and `record` run first, stops the worker within 10 seconds and waits up to 15 for its process. Then `finish` lists the sessions and stops the job within 30 seconds each, and waits up to 15 more. Its `claude rm` runs with no limit. So `discard` and `reap` have no worst case a timeout covers.

A verb the `Bash` tool ends leaves what its next run settles. A dispatch ended during the launch leaves a counted attempt, which `discard` closes, as "`sidekick loop dispatch`" says. A launch `claude` refuses counts as an attempt too. A `discard` or `reap` ended during `finish` writes no closing line, so the attempt stays in flight, and the next `discard` runs `finish` again.

## The verbs

```text
sidekick loop list                                # every loop, with its repo, profile, schedule, classes, and verdict
sidekick loop show <name> [--since <YYYY-MM-DD>]  # the definition, the check, the listing, and the records
sidekick loop record <name> --kind <kind> --summary <text> [--class <class>] [--command <text>] [--unit <id>]
sidekick loop start (<name> | --all) [--record] [--now]  # bring each loop to its definition
sidekick loop arm <name> [--armed --tick <id> --renewal <id>]  # what a running loop's cron jobs are, and report them
sidekick loop dispatch <name> --issue <n> --skill <plugin>:<skill>  # start one unit in a fenced worker
sidekick loop answer <name> --unit <id> <text>    # a ruling for the unit's worker
sidekick loop wake <name> --unit <id>             # respawn the unit's stopped worker
sidekick loop report <name> --unit <id>           # the unit's run report and its branch head
sidekick loop discard <name> --unit <id> --reason <text> [--failed]  # give up on the unit's attempt
sidekick loop reap <name>                         # close an attempt past its work cap
sidekick loop resume <name> --reason <text>       # the operator's reset of a tripped breaker
```

- **`list`** prints one line per loop: its name, `repo`, `profile`, `schedule`, each class with its state, then `ok` or `refused: <n> issues`, and `paused` for a paused loop. It runs the check without the inherited listing, so it runs git and no `claude`. An empty store prints one line saying so. `list` exits 1 when any loop that is not paused is refused.
- **`show`** prints the definition, the issues, the warnings, the inherited listing, then the records. A refused loop prints its issues first, and the rest still shows. A definition value the key check flags prints as `(withheld: <ids>)`, so `show` never prints the key. The records are those of the last 24 hours, or those since local midnight of `--since`. Each prints as one line: local time, kind, class, command or summary, and unit. A verb's line shows its own fields instead, such as the worker, the issue, and the reason. After them come the count of skipped lines and each day file that could not be read. A line break in a definition value prints as a space. `show` exits 1 when the loop is refused.
- **`record`** appends one line, as "`sidekick loop record`" says.
- **`start`** launches, respawns, relaunches, pauses, or leaves each loop, as "Starting a loop" says.
- **`arm`** prints a running loop's cron jobs, and records them with `--armed`, as "Arming a loop" says.
- **`dispatch`, `answer`, `wake`, `report`, `discard`, `reap`, and `resume`** run a loop's units, as "Units" says.
- **A usage error** prints the usage and exits 1, as the `profile` family's do.
