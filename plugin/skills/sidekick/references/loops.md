# Loops

A loop is one long-lived background session on Claude Code's own cron, which works one repo within a written mandate. This page covers what defines a loop and what it records: its folder, `loop.json`, the check, the inherited listing, and the record. `sidekick loop list`, `show`, and `record` read and write them. Issue #363 in the `Rikmorn/sidekick` repo built these pieces, and ADR-0014 and ADR-0015 in that repo bind them.

Later issues build the rest. #364 starts and arms a loop, #367 dispatches its workers, #377 lands their work, and #365 shows a loop on the desk. The `sk-loop` skill, which writes `loop.json` with you, is #366. Until #364 ships, nothing starts a loop.

The measurements cited here come from two probe records in that repo, linked by permalink, both on Claude Code 2.1.322 on 2026-11-12. "The loop probes" is [`docs/research/loop/2026-11-12-loop-probes.md`](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md). "The operator-present probes" is [`2026-11-12-loop-probes-operator-run.md`](https://github.com/Rikmorn/sidekick/blob/e1725169edd5003d050f8b3d9ebd6f71b7379205/docs/research/loop/2026-11-12-loop-probes-operator-run.md) beside it. A fact measured on macOS while #363 was built, on 2026-11-14, says so where it appears.

## The folder

A loop lives in the loop store, one folder per loop:

```text
<config>/sidekick/loops/<name>/
  loop.json      the definition
  records/       one <YYYY-MM-DD>.jsonl per local day
  state.json     what sidekick loop start writes (#364)
```

`<config>` is `CLAUDE_CONFIG_DIR`, or `~/.claude` when that is unset or empty. `SIDEKICK_PROFILES_DIR` moves the profile store only, never the loop store. A loop's name follows the profile name rule: 1 to 64 lowercase letters, digits, and hyphens, starting with a letter or digit. `list` skips files and hidden entries in the store.

`records/` and `state.json` are a loop's runtime entries. The sidekick folder's `.gitignore` keeps `loops/*/records/` and `loops/*/state.json` out of its repo, so a loop's record and state stay local. That file exists once `profile new` has made the sidekick folder a repo, as `references/profiles.md` §The sidekick folder says.

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

A class's state is its rung on ADR-0015 Decision 2's ladder. A class in `record` writes what it would do, one in `ask` writes a request for the operator, and one in `act` acts. A promotion edits one class's state, then starts the loop again.

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

`CronCreate` takes standard five-field cron in local time. By its tool description, read while #363 was designed on 2026-11-14, a recurring job runs up to half its period late, at most 30 minutes.

## The caps

The four required caps, and the optional fifth, are whole numbers of at least 1.

| Cap | What it counts |
|---|---|
| `attemptsPerUnit` | Attempts at one unit. An attempt is one `dispatched` line for the unit. |
| `workMinutesPerUnit` | A unit's working time, from its `dispatched` line, less the time its worker waits on an answer. #367 defines the lines that bound a wait. |
| `waitMinutesPerUnit` | Optional. The time a unit's worker waits on an answer. |
| `unitsPerDay` | Units dispatched in one day: the operator's local calendar day, the one that names each record file. |
| `failedUnitsInARow` | Units that fail one after another. |

A dispatch under `sidekick loop start --record` writes `dispatched` with `record: true`. It counts toward `unitsPerDay`, since it still spends. Its failures count toward `failedUnitsInARow`, since its worker does real work in its worktree. It does not count toward `attemptsPerUnit`: nothing it builds can land, so the unit's real attempts are still to come.

#367 and #377 count the caps from the lines their verbs write, never from the model's lines.

## The check

The check judges one loop from its folder, its repo, and its profile. It finds issues, which refuse the loop, and warnings, which do not. Each reads `<path>: <why>`, naming the file and the field. `list` and `show` run it, and `record` runs only the schema and its own argument checks.

### What the check refuses

- A loop name that breaks the name rule.
- A `loop.json` that is missing, is not JSON, or fails the schema.
- A `repo` that is not a main checkout's root. It must be a folder inside a git work tree, and the top of that work tree by real path. Its git common dir must be its own `.git`. A subfolder, a linked worktree, and a submodule each refuse, with the fix. The loop's own worktree and its workers' worktrees are made from the main checkout (#364, #367).
- A `profile` that no store holds. The search is the one a launch in `repo` makes: the repo store `<repo>/.claude/profiles/`, then the user store. `SIDEKICK_PROFILES_DIR` replaces both, as `references/profiles.md` §The folder says.
- A profile the repo store holds, since the repo's commits can change its plugin code. Keep a loop's profile in the user store. Committed loops are out of scope (#374).
- The profile's own load issues, and its role plugin's. Each `pluginDirs` entry must be a folder, and no file in one may hold a key.
- The old-store refusal, while `<config>/profiles` still holds a profile, as every profile verb gives it.
- A file in the loop's folder that the key check flags, outside `records/` and `state.json`. Like the profile scan, it skips `.git`, `node_modules`, links, binary files, and files over 1 MiB. The loop's folder sits in the sidekick folder, which can be a git repo, and a loop's definition needs no secret.
- Each rule the judge refuses, in `mandate.reads`, each class's `allow`, and `mandate.never`. "How the check judges a rule" gives every refusal and its reason.

### What the check warns on

- **A host that lets workers reach GitHub.** That is a pattern matching `github.com` or a subdomain of it, so `*.com` and `*` warn too. The check reads `hosts`, and each kept layer's `sandbox.network.allowedDomains`. A worker that reaches origin can push by a spelling the push block misses (#367). A worker that never reaches it cannot push at all.
- **A kept settings layer the check cannot read,** since it then cannot see which hosts that layer lets workers reach.
- **In `show` alone, a `claude plugin list` that fails,** times out, or prints what the listing cannot parse. The listing then says it is incomplete.

## How the check judges a rule

ADR-0015 Decision 3 sets the aim: no allow rule may grant a shell, an interpreter, `sidekick worker`, or `claude`. The judge is a test of the words in a rule. A loop needs few rules: its reads, its classes, and the fixed `sidekick loop` verbs #364 adds. So the judge refuses wherever the cost to you is a narrower rule. "What the judge cannot see" names what it leaves open.

### In every list

These refuse in `reads`, in each class's `allow`, and in `never`:

- **A rule that does not parse** as `Tool` or `Tool(specifier)`, such as `Bash(x` or `Bash()`.
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
- **`sidekick`** must name its subcommand plainly, with no wildcard and no leading option in the next word. It refuses `sidekick worker` and `sidekick profile launch`, which start sessions, and `sidekick profile` before a wildcard. Its first two words compare lower-cased. `Bash(sidekick loop record fixer *)` passes.
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

`show` lists what a loop and its workers inherit beyond the mandate, since each item can widen what they may do. Both launch with the loop's profile from the loop's repo, so both inherit one set, believed from the launch shapes #364 and #367 plan. The listing blocks nothing. The operator chose listing over refusing, on 2026-11-14, to keep loops free of permission upkeep (#363).

The listing has five sections:

1. **Allow rules** from each settings layer the profile keeps. Those are the user settings, the repo's `.claude/settings.json`, and its `.claude/settings.local.json`, as `settingSources` keeps them, all three when it is absent. Then come the profile's own `settings`, and the managed settings file when one exists. Each rule names its layer and file.
2. **Hooks that can approve a call:** the `PreToolUse` and `PermissionRequest` hooks in those layers and in each loaded plugin's `hooks/hooks.json`, each with its source. A hook can approve a call that no rule allows.
3. **What widens the workers' fence,** from each kept layer and the profile's `settings`. That is `permissions.additionalDirectories`, `sandbox.filesystem.allowWrite`, `sandbox.network.allowedDomains`, `Edit` allow rules, and file-write allow rules for every path. Under the fence these matter more than a worker's allow rules. A sandboxed command may write an added directory unless a rule denies it ([the loop probes, §U15](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u15-an-overlay-against-a-sandboxed-write-into-an-added-directory)).
4. **Plugins** the loop loads, each with its folder. A plugin that ships a mod, a `modules` entry in its `hooks.json`, carries a mark. On a personal subscription, a mod can approve a call past a deny rule ([the loop probes, §U24's control](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u24s-control-a-deny-rule-against-a-hooks-approval-and-a-mods)).
5. **Built-ins,** as a fixed note.

Which plugins load comes from each kept layer's `enabledPlugins`, the profile's composed settings, and the role's `pluginDirs`. The composed settings hold the plugins a clean room enables, as `references/profiles.md` §The folder lists. An installed plugin's folder comes from `installPath` in `claude plugin list --json`, which `show` runs in the repo, with a 30-second limit. The listing never reads that command's `enabled`, which ignores `--setting-sources`, as `references/profiles.md` §The plugin dependency check says. It leaves out ids ending `@builtin` or `@inline`.

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

The loop itself stays under `dontAsk` with its short allow list: its reads, its classes, and the fixed `sidekick loop` verbs #364 adds.

Three unknowns wait on #367's checks by hand. They are whether auto-allow approves a sandboxed call under `dontAsk`, and whether `gh` and `git` authenticate inside the sandbox. The third is whether a `denyWrite` on `.git/config` holds against `git config`.

## Managed settings

A loop's `never` rules stay in its own launch settings, which #364 compiles. The operator ruled that on 2026-11-14, and ADR-0015 records it. A managed settings file stays an option, and sidekick never writes one.

What is measured, on Claude Code 2.1.322 on a personal subscription:

- **With no managed settings,** a `--settings` deny rule held against a `PreToolUse` hook's approval. A mod's `tool.check` approval ran a command the deny rule refused. Claude Code's built-in guard, `cc-plugin-sec-default`, logged that it was not seated ([the loop probes, §U24's control](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u24s-control-a-deny-rule-against-a-hooks-approval-and-a-mods)).
- **With the deny rules in a managed settings file** the operator wrote with `sudo`, the guard seated. The mod's approval then no longer overrode them ([the operator-present probes, §U24](https://github.com/Rikmorn/sidekick/blob/e1725169edd5003d050f8b3d9ebd6f71b7379205/docs/research/loop/2026-11-12-loop-probes-operator-run.md#u24-a-deny-rule-in-managed-settings-against-a-mods-approval)).

Two things are not measured. One is whether a managed file holding no rules seats the guard. The other is whether each loop's own deny rules then bind over a mod. The file's effect on the operator's other sessions is not measured either. #394 probes the empty file. If it holds, the operator writes one file, once, and every loop's own `never` binds.

The loops' `never` rules stay out of the managed file itself for three reasons. It applies to every session on the Mac, the operator's bypass sessions included, which is believed from the docs. Each edit of it needs `sudo`. And a loop's `never` entry such as `Bash(bun run release:install)` would block the operator's own release.

Until #394 settles it, a loop's `never` binds only while no loaded plugin's mod approves past it. sidekick's mods approve nothing (ADR-0012 Decision 2). The listing marks each plugin that ships a mod, so read those before you start a loop.

When a managed file exists, the check and the listing read it as a kept layer. Its path is `/Library/Application Support/ClaudeCode/managed-settings.json`, where the operator-present probes wrote it on macOS.

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

The bounds: `summary` and `reason` run 1 to 1,000 characters, and `command` 1 to 4,000. `unit` is 1 to 64 of letters, digits, `.`, `_`, and `-`. `commit` is a hex object id of 7 to 64 characters, so a SHA-256 id fits. `hash` stays absent until #364 writes `state.json`.

`summary`, `command`, `reason`, and `class` hold no control character: nothing from U+0000 to U+001F, and no U+007F. A terminal reads those as commands, so a line `show` prints could otherwise move the cursor and hide the lines before it.

The caps count the four verb kinds, so the model never writes them, and `record` refuses each with the name of its writer. Every write checks its line against the schema first and refuses one that fails, so a line a verb writes always reads back. A write after a torn last line starts a new line, so only the torn line is lost.

The reader skips a line that is not JSON or fails the schema, and counts the skips, so one bad line hides nothing else. A day file that exists and cannot be read, such as a folder in its place, is named instead of read. A line holding a field a newer writer added still reads, without that field.

## `sidekick loop record`

```text
sidekick loop record <name> --kind <would|request|did|denied|note> --summary <text>
                            [--class <class>] [--command <text>] [--unit <id>]
```

It refuses:

- a loop name that breaks the name rule, and a `loop.json` that fails to parse;
- any kind outside the five, naming the writer of each verb kind;
- `would` and `did` without `--class`, and every kind but `note` without `--command`;
- `note` with `--class` or `--command`, since its line holds a summary alone;
- a value past its bound, outside its form, or holding a control character, naming the flag;
- a `--class` that `loop.json` does not name;
- `did` for a class whose state is not `act`, with the advice to record `would`, or to ask with `request`;
- text in `--summary`, `--command`, `--class`, or `--unit` that the key check flags, so keys stay out of the record and off the desk. The refusal names the flag and the check, never the text.

`record` checks `loop.json` as it is now, not as the loop was started. So a class removed before the next `start` refuses records for that class until then, and the refusal names the cause. `record` runs no git and no `claude`, and skips the rest of the check. A loop whose profile goes bad mid-run therefore keeps its record, and each call stays cheap.

On success it prints one line: `recorded <kind>`, or for a request, `new request` or `repeat request`.

### When a request is new

A request is new when no request with the same `class`, `command`, and `unit` sits in the record since the schedule's second-most-recent fire at or before now. An absent field matches only an absent field, and the window ends now. A tick runs at most half a period late, so the window covers the previous tick's lines and the current tick's own. `record` judges a request before it appends it, so the line never counts itself. A schedule without two fires in the past 366 days looks back 366 days instead.

## The verbs

```text
sidekick loop list                                # every loop, with its repo, profile, schedule, classes, and verdict
sidekick loop show <name> [--since <YYYY-MM-DD>]  # the definition, the check, the listing, and the records
sidekick loop record <name> --kind <kind> --summary <text> [--class <class>] [--command <text>] [--unit <id>]
```

- **`list`** prints one line per loop: its name, `repo`, `profile`, `schedule`, each class with its state, then `ok` or `refused: <n> issues`. It runs the check without the inherited listing, so it runs git and no `claude`. An empty store prints one line saying so. `list` exits 1 when any loop is refused.
- **`show`** prints the definition, the issues, the warnings, the inherited listing, then the records. A refused loop prints its issues first, and the rest still shows. The records are those of the last 24 hours, or those since local midnight of `--since`. Each prints as one line: local time, kind, class, command or summary, and unit. After them come the count of skipped lines and each day file that could not be read. A line break in a definition value prints as a space. `show` exits 1 when the loop is refused.
- **`record`** appends one line, as "`sidekick loop record`" says.
- **A usage error** prints the usage and exits 1, as the `profile` family's do.
