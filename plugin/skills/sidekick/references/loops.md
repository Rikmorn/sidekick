# Loops

A loop is one long-lived background session on Claude Code's own cron, which works one repo within a written mandate. This page covers what defines a loop, how it starts and keeps running, and what it records. Its sections are the folder, `loop.json`, the check, the inherited listing, starting and arming a loop, and the record. The verbs are `sidekick loop list`, `show`, `record`, `start`, and `arm`, and the `loop-arm` skill arms a running loop. Issues #363 and #364 in the `Rikmorn/sidekick` repo built these pieces, and ADR-0014 and ADR-0015 in that repo bind them.

Later issues build the rest. #367 dispatches a loop's workers, #377 lands their work, and #365 shows a loop on the desk. The `sk-loop` skill, which writes `loop.json` with you, is #366.

The measurements cited here come from two probe records in that repo, linked by permalink, both on Claude Code 2.1.322 on 2026-11-12. "The loop probes" is [`docs/research/loop/2026-11-12-loop-probes.md`](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md). "The operator-present probes" is [`2026-11-12-loop-probes-operator-run.md`](https://github.com/Rikmorn/sidekick/blob/e1725169edd5003d050f8b3d9ebd6f71b7379205/docs/research/loop/2026-11-12-loop-probes-operator-run.md) beside it. A fact measured on macOS while #363 was built, on 2026-11-14, says so where it appears. So does a fact from Claude Code's docs, fetched on 2026-11-15 while #364 was designed.

## The folder

A loop lives in the loop store, one folder per loop:

```text
<config>/sidekick/loops/<name>/
  loop.json      the definition
  records/       one <YYYY-MM-DD>.jsonl per local day
  state.json     what sidekick loop start launched
  armed.json     the cron jobs sidekick loop arm reported
  start.lock     present while a sidekick loop start acts on the loop
```

`<config>` is `CLAUDE_CONFIG_DIR`, or `~/.claude` when that is unset or empty. `SIDEKICK_PROFILES_DIR` moves the profile store only, never the loop store. A loop's name follows the profile name rule: 1 to 64 lowercase letters, digits, and hyphens, starting with a letter or digit. `list` skips files and hidden entries in the store.

`records/`, `state.json`, `armed.json`, and `start.lock` are a loop's runtime entries. The sidekick folder's `.gitignore` keeps them out of its repo, as `loops/*/records/`, `loops/*/state.json`, `loops/*/armed.json`, and `loops/*/start.lock`. So a loop's record, state, arm, and lock stay local. Two runs make the sidekick folder a repo: a `profile new` of a user profile, and a `start` that acts on a loop. Each adds any of those lines the folder's `.gitignore` lacks. `references/profiles.md` §The sidekick folder says when.

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
| `gates` | Required, and may be empty. The commands a worker reruns before it reports a tested commit (#367), and whose files `land --check` reports (#377). They are not allow rules: workers run them inside the fence. |
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
| `workMinutesPerUnit` | A unit's working time, from its `dispatched` line, less its waits. A wait opens at a `request` line for the unit and closes at the next `answered` line for it, or runs to now. Waits count only up to `waitMinutesPerUnit` in total; past that, waiting counts as working. |
| `waitMinutesPerUnit` | The most waiting that does not count as working time. |
| `unitsPerDay` | Units dispatched in one day: the operator's local calendar day, the one that names each record file. |
| `failedUnitsInARow` | Units that fail one after another. |

A dispatch under `sidekick loop start --record` writes `dispatched` with `record: true`. It counts toward `unitsPerDay`, since it still spends. Its failures count toward `failedUnitsInARow`, since its worker does real work in its worktree. It does not count toward `attemptsPerUnit`: nothing it builds can land, so the unit's real attempts are still to come.

#367 and #377 count the caps from the lines their verbs write, never from the model's lines.

## The check

The check judges one loop from its folder, its repo, and its profile. It finds issues, which refuse the loop, and warnings, which do not. Each reads `<path>: <why>`, naming the file and the field. The old-store refusal is the exception: its lines are the ones every profile verb prints, the commands that move the store among them. `list`, `show`, and `start` run it, and `record` runs only its schemas and its own argument checks. `start` skips it for a paused loop, as "What `start` does" says.

### What the check refuses

- A loop name that breaks the name rule.
- A `loop.json` that is missing, is not JSON, or fails the schema.
- A `repo` that is not a main checkout's root. It must be a folder inside a git work tree, and the top of that work tree by real path. Its git common dir must be its own `.git`. Both compare without regard to case, since git prints a folder's real case and Node's `realpathSync` keeps the case it is given. A subfolder, a linked worktree, a submodule, and a repo made with `--separate-git-dir` each refuse, with the fix that applies. The first three name the main checkout's root. A `--separate-git-dir` repo is a main checkout already, so its fix is to move the git dir back to `<repo>/.git`. The loop's own worktree, which `start`'s launch makes, comes from the main checkout, and so do its workers' worktrees (#367).
- A `profile` that no store holds. The search is the one a launch in `repo` makes: the repo store `<repo>/.claude/profiles/`, then the user store. `SIDEKICK_PROFILES_DIR` replaces both, as `references/profiles.md` §The folder says.
- A profile the repo store holds, since the repo's commits can change its plugin code. Keep a loop's profile in the user store. When it hides a user-store profile of the same name, the user store already holds the profile. The refusal then says to remove or rename the repo store's one. Committed loops are out of scope (#374).
- The profile's own load issues, and its role plugin's. Each `pluginDirs` entry must be a folder, and no file in one may hold a key.
- The old-store refusal, while `<config>/profiles` still holds a profile, as every profile verb gives it.
- A file in the loop's folder that the key check flags, outside its runtime entries. Like the profile scan, it skips `.git`, `node_modules`, links, binary files, and files over 1 MiB. The loop's folder sits in the sidekick folder, which can be a git repo, and a loop's definition needs no secret.
- An `mcp__<server>` rule that names, by its bare name, a server only a role plugin declares. A plugin declares servers in its `.mcp.json`, with or without the `mcpServers` wrapper, and in the `mcpServers` key of its `plugin.json`. That key holds an inline map, a path to a JSON file, or an array of either. A path resolves against the plugin's root (the plugins docs, fetched on 2026-11-15). The check reads no MCP bundle, a `.mcpb` or `.dxt` file, so a bundle's servers escape it. Claude Code spells a plugin server's tools `mcp__plugin_<plugin>_<server>__<tool>`, so the bare rule matches none. The refusal names the right spelling. It passes when the server also appears in the repo's `.mcp.json`. It passes too when the server sits in the user or local scope of the global config file. That file is `.claude.json` in `CLAUDE_CONFIG_DIR`, or in the home folder when that is unset or empty. The check reads the legacy `<config>/.config.json` instead when that file has content, or is writable while `.claude.json` does not exist. A missing or malformed file names no server. Role plugins are the folders in the profile's `pluginDirs`.
- Each rule the judge refuses, in `mandate.reads`, each class's `allow`, and `mandate.never`. "How the check judges a rule" gives every refusal and its reason.

### What the check warns on

- **A host that lets workers reach GitHub.** That is a pattern matching `github.com` or a subdomain of it, so `*.com` and `*` warn too. The check reads `hosts`, and each kept layer's `sandbox.network.allowedDomains`. A worker that reaches origin can push by a spelling the push block misses (#367). A worker that never reaches it cannot push at all.
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

- **`claude`** refuses outright, since it starts a Claude session. That covers `Bash(claude respawn *)`, which a loop would need to respawn a stopped worker; #367 holds that open question.
- **`sidekick`** must name its subcommand plainly, with no wildcard and no leading option in the next word. It refuses `sidekick worker` and `sidekick profile launch`, which start sessions, and `sidekick profile` before a wildcard. Its first two words compare lower-cased. `Bash(sidekick loop record fixer *)` passes, though a loop needs no such rule: `start` adds it, and the two `arm` rules, itself.
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
- **Any git rule runs the commands git config names.** `core.fsmonitor` runs on `git status`, `core.pager` on paged output, and textconv drivers on `git diff` and `git show`. A linked worktree shares its main checkout's `.git/config` and `.git/hooks/`. So a worker that could write the shared `.git/config` would reach every git rule the loop holds. That is believed from git's documentation, and not run. #367's fence closes it, as "The workers' fence" says.
- **The judge weighs code, not reach.** It refuses rules that run code or start sessions. It does not weigh what an allowed command changes elsewhere. `Bash(gh api *)` passes, and by gh's manual `gh api` calls any GitHub endpoint the token reaches. A class's state bounds that, on the `record`, `ask`, `act` ladder.

## The inherited listing

`show` lists what a loop and its workers inherit beyond the mandate, since each item can widen what they may do. `start` prints the same listing before each launch, relaunch, or respawn. Both launch with the loop's profile from the loop's repo, so both inherit one set. That holds for the loop by `start`'s launch, and is believed for the workers from the launch #367 plans. The listing blocks nothing. The operator chose listing over refusing, on 2026-11-14, to keep loops free of permission upkeep (#363).

The listing has five sections:

1. **Allow rules** from each settings layer the profile keeps. Those are the user settings, the repo's `.claude/settings.json`, and its `.claude/settings.local.json`, as `settingSources` keeps them, all three when it is absent. Then come the profile's own `settings`, and the managed settings file when one exists. Each rule names its layer and file.
2. **Hooks that can approve a call:** the `PreToolUse` and `PermissionRequest` hooks in those layers and in each loaded plugin's `hooks/hooks.json`, each with its source. The listing also reads the `hooks` a plugin declares in its `.claude-plugin/plugin.json`. That is an inline object, a path to a file with a top-level `hooks` key, or an array of both. A path resolves against the plugin's root, and its hooks name that file as their source. A file that is missing or malformed gets a line on the plugin, and the listing goes on. A hook can approve a call that no rule allows.
3. **What widens the workers' fence,** from each kept layer and the profile's `settings`. That is `permissions.additionalDirectories`, `sandbox.filesystem.allowWrite`, `sandbox.network.allowedDomains`, `Edit` allow rules, and file-write allow rules for every path. A rule prints once per layer, so `Edit(*)` prints only as a file-write rule for every path. Under the fence these matter more than a worker's allow rules. A sandboxed command may write an added directory unless a rule denies it ([the loop probes, §U15](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u15-an-overlay-against-a-sandboxed-write-into-an-added-directory)).
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

A loop's workers are bounded by a fence, and the loop keeps its allow list. The operator ruled this on 2026-11-14, revising ADR-0015 Decision 4 for workers, and #367 builds it.

- **A unit worker runs sandboxed,** with auto-allow on, `autoAllowBashIfSandboxed: true`, and the unsandboxed retry off, `allowUnsandboxedCommands: false`. Any command runs inside the fence, which the OS enforces whatever the command's spelling.
- **One `Edit(//<worktree>/**)` rule lets its file tools work in its own worktree.** The sandbox bounds a command's writes, not the `Edit` and `Write` tools, which follow permission rules ([the loop probes, §U15](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u15-an-overlay-against-a-sandboxed-write-into-an-added-directory)).
- **Its network reaches only `loop.json`'s `hosts`.** With the retry off, Claude Code ignores network entries from the repo's project and local settings. It keeps those from user settings, managed settings, and `--settings` ([the loop probes, §U10](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u10-sidekicks-gates-inside-the-sandbox)). So the hosts reach a worker through its launch settings. A host in the user settings, the managed settings, or the profile's own `settings` widens the fence, and the inherited listing names each one.
- **The fence leaves out the shared `.git`'s `config` and `hooks/`.** From a linked worktree, the sandbox may write the main repo's `.git` (§U10). A command written into its `config` or `hooks/` runs in every checkout of the repo, from the next `git` call that reads it. The loop, `land`'s push, and the operator's own main checkout would then run it unsandboxed. That is believed from git's documented behaviour, and not run.
- **Classes are the loop's alone.** A worktree is disposable, so a worker's work inside it climbs no ladder. The `record`, `ask`, `act` ladder covers the outward actions, and only the loop takes those: labels, comments, closes, and landing. No class carries rules for workers, and `gates` are commands a worker reruns, not allow rules.

The loop itself stays under `dontAsk` with its short allow list: its reads, its `act` classes, and the fixed `sidekick loop` verbs `start` adds.

Three unknowns wait on #367's checks by hand. They are whether auto-allow approves a sandboxed call under `dontAsk`, and whether `gh` and `git` authenticate inside the sandbox. The third is whether a `denyWrite` on `.git/config` holds against `git config`.

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

`sidekick loop start` brings each loop it names to the state its definition asks for, and never runs two sessions for one loop.

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
3. **It reads the session listing once,** `claude agents --json --all`, for every loop. When the listing fails, every loop refuses, since `start` cannot tell a running loop from a stopped one without it. `start` reads each row's status then, before the prepare and the commit. So a tick that starts between the listing and the stop is stopped without `--now`.
4. **It prepares each loop.** It runs the check, and refuses on any issue or on a `state.json` that does not parse. It compiles the mandate, then composes the launch as `profile launch` does from the loop's repo, and refuses where those checks refuse. It hashes the launch and chooses an action, as "The reconcile" says. A paused loop skips the check and the compose, so a pause holds while the check would refuse other keys. A `loop.json` that does not parse, or fails its schema with an unknown key or a bad `schedule`, cannot say it is paused. The check then refuses it as usual. A paused loop's preparation refuses only a broken `state.json`.
5. **It commits the sidekick folder,** once per run, before the first `claude` call that acts. The subject names each loop that acts and its action. A launch, relaunch, or respawn adds the first 12 characters of its hash, and a pause adds none, as in `loop start: fixer launch 3f2a9c1d0b7e, triage pause`. A run in which no loop acts makes no commit. A failed commit warns, and the loops start anyway, since the history serves tracing.
6. **It acts on each loop,** in name order. It first prints the loop's warnings, then the inherited listing before a launch, relaunch, or respawn. It releases each loop's lock once that loop's last write is done.
7. **It waits for every fresh launch to arm,** all together, for up to 90 seconds, checking every 2. A launch has armed once an `armed.json` that carries its `launch` id exists. A respawn needs no wait, since its cron jobs come back with it ([the loop probes, §U11](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u11-a-one-shot-job-across-claude-stop-then-claude-respawn)).
8. **It prints one line per loop,** as "What `start` prints" says, and exits 1 when any loop refused or failed.

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

- **The fixed verbs,** allowed and pinned to the loop's name: `Bash(sidekick loop record <name> *)`, `Bash(sidekick loop arm <name>)`, and `Bash(sidekick loop arm <name> *)`. Both `arm` forms are named, bare and with flags, so the allow list states each spelling the skill runs.
- **The self-deny:** `Edit(//<loop folder>/**)` and `Edit(//<profile folder>/**)`, each by its real path. So the loop's file tools never edit its `loop.json`, its runtime entries, or its profile. The verbs still write there, since an `Edit` rule binds the file tools, not a command's own process.
- **`permissions.blockReadsOutsideWorkingDirectories: true`.** The permissions docs, as #364's design read them, let the built-in read-only commands run in every mode otherwise. With it, the loop reads only its worktree and its added folders, among them the profile's folder, which the launch passes as `--add-dir`. That is believed from the docs; no probe ran it.
- **`env`:** `SIDEKICK_LOOP=<name>`, which `arm` checks, and `DISABLE_AUTOUPDATER=1`, as "The launch" says. `SIDEKICK_MAIN` is set empty, which sidekick reads as absent, so a daemon started from a main session's shell names no main.
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

`start` can outlast a session's `Bash` call, which ends at 120 seconds unless it sets a longer timeout. The listing takes up to 30 seconds. A relaunch can take about 265 seconds: 10 for `claude stop`, 15 for the process to exit, 180 for `claude rm`, and 60 for `claude --bg`. The wait for the arm adds up to 90, and each loop's checks run `claude` too. So run `start` from a terminal, or in a session with a long `Bash` timeout. A run cut short is recoverable. The next `start` takes over its lock, and finds a session launched with no job id by its name.

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
| `dispatched` | `sidekick loop dispatch` (#367) | `unit`, `record?: true` |
| `landed` | `sidekick loop land` (#377) | `unit`, `commit` |
| `failed` | `sidekick loop reap` and `land` (#367, #377) | `unit`, `reason` |
| `discarded` | `sidekick loop discard` and `reap` (#367) | `unit`, `reason` |

The bounds: `summary` and `reason` run 1 to 1,000 characters, and `command` 1 to 4,000. `unit` is 1 to 64 of letters, digits, `.`, `_`, and `-`. `commit` is a hex object id of 7 to 64 characters, so a SHA-256 id fits. `hash` is the launch hash from `state.json`, which `record` stamps on each line the model writes once a `state.json` exists. A loop that `start` never launched writes lines without it.

`summary`, `command`, `reason`, and `class` hold no control character. That is nothing from U+0000 to U+001F, no U+007F, and nothing from U+0080 to U+009F, the C1 controls. A terminal reads those as commands, so a line `show` prints could otherwise move the cursor and hide the lines before it.

The caps count the four verb kinds, so the model never writes them, and `record` refuses each with the name of its writer. Every write checks its line against the schema first and refuses one that fails, so a line a verb writes always reads back. A write after a torn last line starts a new line, so only the torn line is lost.

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

Once a `state.json` exists, `record` judges by the launch and reads `state.json` alone. It stamps the launch's `hash`, and checks `--class` and the `did` rule against the launch's `states`. So a trial under `--record` records no `did`, and an edit to `loop.json` changes nothing until the next `start`. A class the launch lacked refuses until the loop restarts, and the refusal names the cause.

Without a `state.json`, `record` checks `loop.json` as it is now. So a class removed from it refuses records for that class, and the refusal names the cause.

`record` runs no git and no `claude`, and skips the rest of the check. A loop whose profile goes bad mid-run therefore keeps its record, and each call stays cheap.

On success it prints one line: `recorded <kind>`, or for a request, `new request` or `repeat request`.

### When a request is new

A request is new when no request with the same `class`, `command`, and `unit` sits in the record since the schedule's second-most-recent fire at or before now. The schedule is the launch's, from `state.json`, or `loop.json`'s when no `state.json` exists. An absent field matches only an absent field, and the window ends now. A tick runs at most half a period late, so the window covers the previous tick's lines and the current tick's own. `record` judges a request before it appends it, so the line never counts itself. A schedule without two fires in the past 366 days looks back 366 days instead.

## The verbs

```text
sidekick loop list                                # every loop, with its repo, profile, schedule, classes, and verdict
sidekick loop show <name> [--since <YYYY-MM-DD>]  # the definition, the check, the listing, and the records
sidekick loop record <name> --kind <kind> --summary <text> [--class <class>] [--command <text>] [--unit <id>]
sidekick loop start (<name> | --all) [--record] [--now]  # bring each loop to its definition
sidekick loop arm <name> [--armed --tick <id> --renewal <id>]  # what a running loop's cron jobs are, and report them
```

- **`list`** prints one line per loop: its name, `repo`, `profile`, `schedule`, each class with its state, then `ok` or `refused: <n> issues`, and `paused` for a paused loop. It runs the check without the inherited listing, so it runs git and no `claude`. An empty store prints one line saying so. `list` exits 1 when any loop that is not paused is refused.
- **`show`** prints the definition, the issues, the warnings, the inherited listing, then the records. A refused loop prints its issues first, and the rest still shows. A definition value the key check flags prints as `(withheld: <ids>)`, so `show` never prints the key. The records are those of the last 24 hours, or those since local midnight of `--since`. Each prints as one line: local time, kind, class, command or summary, and unit. After them come the count of skipped lines and each day file that could not be read. A line break in a definition value prints as a space. `show` exits 1 when the loop is refused.
- **`record`** appends one line, as "`sidekick loop record`" says.
- **`start`** launches, respawns, relaunches, pauses, or leaves each loop, as "Starting a loop" says.
- **`arm`** prints a running loop's cron jobs, and records them with `--armed`, as "Arming a loop" says.
- **A usage error** prints the usage and exits 1, as the `profile` family's do.
