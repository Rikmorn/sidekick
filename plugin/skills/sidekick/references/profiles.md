# Profiles

A profile is a folder plus a settings object that `sidekick profile` hands to `claude`. Claude Code has no profile feature of its own, so the CLI builds the launch from three native flags: `--add-dir`, `--settings`, and `--setting-sources`. Issue #205 in the `Rikmorn/sidekick` repo decided the shape. Issue #213 added the repo store, the plugin dependency check, and switching. Most measurements behind these claims are in two reports under `docs/research/control-centre/` in that repo. `2026-10-13-profile-launch-probes.md` is called "the probes report" here, and `2026-10-14-repo-profiles-and-switching-probes.md` is "the 2026-10-14 report". Each names the Claude Code version and date it ran on. Two facts were measured on 2026-10-12 during #205's design, on Claude Code 2.1.296. No report holds them, so the text marks them "design-time". The alias hazards, and the facts in "The plugin dependency check" measured while building #213, have their own sources, named where they appear.

## The folder

A profile lives in a store, one folder per profile:

```
<store>/<name>/
  profile.json          the manifest
  .claude/rules/*.md    the stance, and any other rules
```

Two stores hold profiles. The CLI searches them in order, and the first that holds a name wins:

1. The repo store, `.claude/profiles/` at the top of the git work tree holding the current folder, as `git rev-parse --show-toplevel` reports it. A session in a subfolder finds the top's store, and a linked worktree reads its own checkout's. Outside a work tree there is no repo store.
2. The user store, `profiles/` under `CLAUDE_CONFIG_DIR`, or under `~/.claude` when that is unset or empty.

When the two stores are the same path, only the user store is searched. That happens in a dotfiles repo at `$HOME`, or with `CLAUDE_CONFIG_DIR` set to the repo's `.claude`. `SIDEKICK_PROFILES_DIR`, when set and non-empty, is the only store, and no repo store is searched. A relative path resolves against the current folder, so `--add-dir` always receives an absolute path.

A name is 1 to 64 lowercase letters, digits, and hyphens, starting with a letter or digit. The name is also a folder name and a shell alias, which is why the rule is that strict.

`profile.json` holds three keys, and the parser rejects any other:

| Key | Meaning |
|---|---|
| `description` | Required, non-empty. `list` prints it. |
| `settingSources` | Optional. A list of `user`, `project`, and `local`, without repeats. It becomes `--setting-sources`. |
| `settings` | Optional object, passed through to `--settings`. It must not hold a `sidekick` key, because launch writes that one. |

Launch composes the settings from the profile's `settings` object, then adds its own keys:

- `sidekick: { profile: <name> }` always. A session or a mod reads the profile's name from there.
- `env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1"` when `.claude/rules/` holds a `.md` file at any depth. Claude Code loads rules from an `--add-dir` folder only with that variable set, and a settings `env` block sets it (probes report, "The profile folder as `--add-dir`").
- `claudeMdExcludes` for the user's `~/.claude/CLAUDE.md` and `~/.claude/rules/**`, when `settingSources` is present and leaves out `user`. The clean-room table in "What each mode drops" explains why.

The folder holds only rules. The layout check refuses everything else under `.claude/`, so agents, skills, and commands go in a plugin the profile enables. From an `--add-dir` folder, Claude Code loads them only under the `project` setting source. With `--setting-sources local`, a folder's rule loaded but its agent and skill did not. That was measured on 2026-10-13 on Claude Code 2.1.296, and the docs say the same of commands (probes report, "The profile folder as `--add-dir`"). So a profile whose `settingSources` left out `project` would lose them without a word.

### What the CLI refuses in a folder

Under `.claude/`, the layout check allows only `rules/`. It refuses a folder that holds any of these, naming each path and why. `list`, `show`, `argv`, `launch`, `alias`, and `switch` run it, in both stores. `new` does not, since its folder does not exist yet:

- `CLAUDE.md` or `CLAUDE.local.md` at the root, or `.claude/CLAUDE.md`. By default, a `CLAUDE.md` in a parent folder or an `--add-dir` folder stops Claude Code loading the repo's `AGENTS.md`. A profile folder would hide it in every session that uses the profile. A rule in `.claude/rules/` does not (probes report, "`AGENTS.md` and what hides it"). Put the stance in a rule.
- `.claude/settings.json` or `.claude/settings.local.json`. An `--add-dir` folder's settings file can enable plugins, and the settings check never sees it. Put settings in `profile.json`, where the check covers them.
- Any other entry under `.claude/`, such as `agents/`, `skills/`, `commands/`, or `output-styles/`. A profile holds only rules, as "The folder" explains, so put these in a plugin the profile enables.

## The repo store

A repo profile has the layout and checks of a user profile, and travels with the repo. `new --repo` creates one in the repo store. It refuses outside a git work tree, and while `SIDEKICK_PROFILES_DIR` is set, since neither case has a repo store. Without `--repo`, `new` writes to the user store.

On a shared name the repo profile wins, so the CLI says where each profile comes from:

- `list` ends each line with the store and its folder, as `(repo: <store>)`. A user profile that a repo profile hides is still listed, ending `(user: <store>, shadowed by <folder>)`.
- `show` prints `store: repo` or `store: user` after the folder.
- `argv`, `launch`, and `switch` print one line on stderr for a repo profile, and none for a user profile. The `(it shadows …)` part appears only when the user store holds the same name. `argv`'s stdout stays the NUL-terminated arguments alone, since `skp` parses it.

```
profile "<name>" comes from the repo store: <folder> (it shadows <folder>)
```

A repo profile's rules can reach a session in the repo that never launched that profile. The 2026-10-14 report measured it with `claude -p` on Claude Code 2.1.299 ("A profile folder inside a repo"). A plain session did not load the rules at start. A session that read a file inside the profile's folder received the folder's rules on demand. In that run the model named the rule's token and declined to follow it, as text arriving with a tool result.

A repo profile is also branch content. A background job reapplies its `--add-dir` path on respawn, and `--add-dir` refuses a missing path ("Deleting or renaming a profile"). So checking out a branch without the profile can stop a job launched from it respawning. A branch holding another copy gives the job that copy's rules, and an interactive resume meets the same at its next launch. All of this is inferred; no checkout was run.

No trust gate stands in front of a repo profile. Its `settings` block can set permissions, and hooks, which run commands. Its `settingSources` can drop the user layer, and the user's own settings go with it, deny rules included ("What each mode drops"). The operator chose no gate on 2026-10-14, since they write every profile they launch (#213). `show` prints what a repo profile sets, so read it before you launch one from a repo you did not write. #223 tracks a gate.

## The verbs

```
sidekick profile list                       # every profile in both stores, with its description and store
sidekick profile show <name>                # the folder, the store, the manifest, the composed settings, the plugin check, the arguments
sidekick profile new <name> --description <text> [--repo]   # create the folder with a minimal manifest, in the user store or the repo's
sidekick profile argv <name>                # the arguments for claude, NUL-terminated, after the checks
sidekick profile launch --bg <name> [-n <session>] [-- <prompt>]
sidekick profile alias [--shell zsh|bash] [<name>...]
sidekick profile switch <name> [--session <id>]   # print the lines that resume this session under <name>
```

- `list` skips dot-folders such as `.git`, since no profile name starts with a dot. It exits 1 when any other folder in either store is invalid, and prints that folder's first issue.
- `argv` is for the shell function. It prints each argument followed by a NUL, so an argument holding spaces or quotes survives intact.
- `launch` starts a background session through `claude --bg`. Everything after `--` joins with single spaces into one prompt, placed after a bare `--` so a leading dash cannot read as a flag. Without `--bg` it refuses and points at the shell function, because an interactive session needs the caller's terminal.
- `launch` fails in a workspace that was never trusted. `claude --bg` refuses it, and the message names the folder to open once (probes report, "The settings flag and a dropped object").
- The arguments run in a fixed order: `--add-dir <folder>`, `--settings <JSON>`, then `--setting-sources <list>` when the manifest sets it. `--add-dir` is variadic, so a prompt placed straight after it becomes a second folder (probes report, "`--add-dir` is variadic"). It is never last.
- `switch` prints the lines that resume the current session under another profile, as "Switching a session's profile" explains.

## The shell function

An interactive session needs the shell to keep job control, so the function runs `claude` itself. `sidekick profile alias` prints it, and you paste it once into your shell startup file:

```
sidekick profile alias --shell zsh frontend >> ~/.zshrc
```

Use `--shell bash` for bash. The bash form targets bash 3.2, which macOS ships and which has no `mapfile`. The output is the function `skp <name> [claude arguments...]`, then one `alias <name>='skp <name>'` line for each name you gave. The function:

1. Finds the user-scope `sidekick@rikmorn` install in `claude plugin list --json`, and runs that install's `bin/sidekick`. `sidekick` is on `PATH` only inside a session, so the function cannot call it by name.
2. Runs `profile argv <name>`. A non-zero status returns at once and `claude` never starts.
3. Splits the output on NUL and runs `claude <arguments> "$@"`.

Starting costs about 1.7 seconds before `claude` runs. That sums two figures from the probes report. The plugin list took 0.7 seconds ("Plugin options and the installed CLI"), and the `doctor` check about 1 second ("`doctor`"). When the plugin dependency check runs, it adds about 0.7 seconds more. The function reads the installed plugin, so `skp` works only once the installed release has the `profile` family.

Pick a profile name that names no command, since each name you give becomes an alias. An alias shadows any command of the same name. That holds when you type the name, and in every file the shell sources after the alias. Before you choose a name, check that `command -v <name>` prints nothing.

`alias` refuses the names that would break the shell's own words: `skp`, `command`, `builtin`, and the reserved words of zsh and bash, such as `do` and `local`. These hazards are not in the probes report. They were measured in child shells during #205's reviews on 2026-10-13:

- With `alias test='skp test'`, a file sourced later that runs `test -n x` runs `skp test -n x` instead.
- With `alias skp='skp skp'`, every `skp <name>` call runs profile `skp` and passes `<name>` on to `claude`. Sourcing the zsh startup file again then fails with `parse error near '()'`.
- With an alias named after a reserved word, such as `alias do=…`, later `for … do … done` loops break. zsh reports `parse error near 'done'`, and bash 3.2 reports `syntax error near unexpected token`.

## Switching a session's profile

A session cannot relaunch itself. Claude Code's mod API has no call that ends, restarts, or relaunches a session, or changes its launch flags. That was read in the mod API's types for Claude Code 2.1.299 (the 2026-10-14 report, "A session cannot relaunch itself"). So a switch ends the session, then resumes it under the new profile.

`sidekick profile switch <name>`, run through the session's Bash tool, prints the lines to run:

```
To switch this session to "<name>", type /exit, then run one:
  cd '<folder>' && skp <name> --resume '<id>'   # keep the conversation
  cd '<folder>' && skp <name>                   # start fresh
After a resume, skills of plugins "<name>" turns off stay listed but fail when called.
```

- The id comes from `--session <id>`, else from `CLAUDE_CODE_SESSION_ID`, which a session's Bash sees. An empty value counts as unset, and with neither, `switch` refuses. The variable follows `/clear`, so it names the current conversation (the 2026-10-14 report, "The session id after `/clear`", run by the operator).
- `<folder>` is the folder `switch` ran in, quoted for a POSIX shell, so a folder holding a space or a quote stays one word.
- Before it prints, `switch` loads the profile and runs the checks `argv` runs. A refusal therefore shows before you exit, and a repo profile prints its provenance line.

A resume under another profile changes some parts and leaves others. Each row was measured with `claude -p` on Claude Code 2.1.299 unless it says otherwise (the 2026-10-14 report, "Switching by resume"):

| Part | After the resume | Grade |
|---|---|---|
| Rules | swapped: the new profile's load, and the old profile's are listed as removed | measured |
| Plugins the new profile adds | loaded: a fresh skill listing names their skills, and they run | measured |
| Plugins the new profile turns off | their skills stay listed from the first start, and calling one fails with `Unknown skill` | measured |
| MCP server instructions, hooks, `env`, permissions, and the model | unknown | not measured. The sessions docs say to pass the launch flags again on resume, and that the settings files are re-read at launch |

No switch in an interactive session was measured. The fresh line avoids the lingering skills, at the cost of the conversation.

To go back to no profile, type `/exit` and run `claude --resume <id>`. That resume was not run, and is inferred to change the same parts a switch does. #224 tracks a switch that relaunches the session after `/exit`, without the paste.

## What each mode drops

`settingSources` sets the mode. Absent, the profile keeps the user layer, and `--settings` merges into it key by key. A plugin the profile does not name keeps its user-level state, and `false` turns one off.

A `settingSources` that leaves out `user` makes a clean room. The grade of each row is in the table (probes report, "The user layer and the clean room under `$HOME`", Claude Code 2.1.296, 2026-10-13):

| Item | Clean room | Grade |
|---|---|---|
| User settings, hooks, and plugins | dropped | measured |
| The user's `model`, `effortLevel`, and similar keys | dropped | read from `~/.claude/settings.json`, not run |
| User `pluginConfigs` | dropped, so a plugin option goes in the profile's `settings` block | docs: Claude Code reads that key from user settings, managed settings, and `--settings`; how a flag-level entry merges with a user entry was not measured |
| User `CLAUDE.md` and rules | dropped by the excludes launch adds. The flag alone leaves them under `$HOME` | measured. The cause, that Claude Code reads `~/.claude/` as a parent folder's `.claude/`, is inferred |
| claude.ai connectors | kept | measured |
| Auto memory (`MEMORY.md`) | kept. The docs name `autoMemoryEnabled: false` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` to turn it off (memory page, §Enable or disable auto memory, read 2026-10-13) | kept: measured. Neither setting was tried through a profile |
| The repo's `AGENTS.md` and rules | kept | measured |
| The repo's own plugins | kept in the sidekick repo. In odin, three of seven loaded. The other four never loaded with the user layer kept (`bench`) either, so keeping it does not bring them back | measured. The cause, a `-p` session not installing a marketplace the repo declares, is inferred and not tested |

A profile turns a plugin off by writing it `false` under `settings.enabledPlugins`. The `bench` profile's `false` left a user-enabled plugin out of both `bench` runs (probes report, "The bench and the steering test"). For a repo plugin, a design-time measurement in the sidekick repo showed a profile's `false` removing `code-review`, which the repo's own settings enabled. Also design-time: a plugin the profile does not name keeps its user-level state when the user layer stays.

A kept user rule is copied into the profile's `.claude/rules/`, not linked. An exclude pattern also excludes a symlink whose target it matches, so a link to `~/.claude/rules/x.md` would vanish with the original. A copy then drifts from its source, and nothing flags the drift.

A folder rule steered a reply as well as an appended system prompt in five of five paired runs. The probes report has them under "The bench and the steering test". That is a first reading with a trivial instruction. It is not proof of equal strength.

## Deleting or renaming a profile

`--add-dir` refuses a path that does not exist. A background job keeps its flags and reapplies them on `claude respawn` (probes report, "Background sessions, respawn, and the daemon"). Deleting or renaming a profile folder can therefore stop its running sessions respawning. Nothing was deleted in the probes, so this is inferred from the docs.

The settings are a snapshot taken at launch, while the folder is live. Claude Code is inferred to re-read its rules at each start and respawn, since the probes report lists rule reload on resume as untested.

## No secrets

A profile never holds a secret. Every `env` key in `settings` reaches Bash children. The launch settings travel as one argument to `claude`, where `ps` shows them. A background job stores them in its job record (`respawnFlags` in `state.json`, measured in the probes report).

For an interactive `skp` start, pass a secret through the shell environment of that session. A `--bg` job does not inherit the dispatching client's environment (probes report, "A `--bg` job does not inherit"). A background session therefore has no measured way to receive one, and that case is open.

## The settings check

Claude Code drops a whole settings object without a warning when one known key has the wrong type. The probes report has this under "The settings flag and a dropped object". The session then runs unprofiled. So `argv`, `launch`, and `switch` first run `claude --settings <copy> doctor`. The copy holds the composed settings in a temp folder, which the CLI deletes afterwards. `show` does not run `doctor`.

The copy carries a wrongly typed canary key, `feedbackSurveyRate` or else `cleanupPeriodDays`, set to `"sidekick-canary"`. `doctor` must report the canary, which proves its undocumented output still parses, and must report nothing else. Otherwise the CLI refuses and prints the lines. The check catches wrongly typed values only. It does not catch a misspelled key. A misspelled plugin id under `settings.enabledPlugins` is the plugin dependency check's to catch.

If `doctor` changes its output and the check refuses every launch, set `SIDEKICK_PROFILE_SKIP_CHECK=1`. The CLI then skips the `doctor` check only, and prints a warning on stderr for each launch that skipped it. The plugin dependency check still runs, with a skip variable of its own. Unset the variable once sidekick catches up.

## The plugin dependency check

Claude Code keeps a plugin disabled while a dependency it names is off, and shows the error in `plugin list` and `/plugin`'s Errors tab. That is the docs' account, cited in the 2026-10-14 report ("Plugin dependencies through `plugin list`"). So a profile that turns off a plugin's dependency loses that plugin too. This check refuses such a profile before it launches.

`argv`, `launch`, and `switch` run it after the `doctor` check passes, and only when the manifest sets `settings.enabledPlugins` or `settingSources`. Any other profile loads the same plugins as an unprofiled session. `show` runs it without `doctor`. It prints `plugins: ok`, `plugins: refused` with the reasons, or why the check did not run. `show` exits 0 either way, since it launches nothing.

The check runs this in the current folder, where `<file>` is a copy of the composed settings in a temp folder the CLI removes afterwards:

```
claude --settings <file> [--setting-sources <list>] plugin list --json
```

The flags go before the subcommand, since `plugin list --settings` is an unknown option. The check reads only each entry's `id` and `errorDetails`. Claude Code computes `enabled` and `errorDetails` for the current folder on every entry, other repos' project-scope entries included. `errorDetails` follows both `--settings` and `--setting-sources`. `enabled` follows `--settings` but ignores `--setting-sources`, and a plugin with an unmet dependency still reads `enabled: true`. The 2026-10-14 report measured each of these under "Plugin dependencies through `plugin list`". So `enabled` does not say whether a plugin loads.

The check refuses on:

- Each `dependency-unsatisfied` detail, once per plugin and dependency, since the same detail can sit on several entries. The message names both plugins and the fix: enable the dependency in the profile's `settings.enabledPlugins`, or set the dependent plugin `false` too.
- Each key of `settings.enabledPlugins`, set `true` or `false`, that names no listed `id`. A misspelled `false` would otherwise leave the intended plugin on. Ids ending `@builtin` or `@inline` pass, on the assumption that the list never shows them. That assumption was not measured.
- Output that no longer parses, a non-zero exit, or a timeout. The parse refusal names the skip variable.

Any other detail `type` prints as a warning and does not refuse. An id installed only for another repo is listed, so it passes the unknown-id test.

These facts were measured on 2026-10-14 on Claude Code 2.1.299, while building #213. The runs used a scratch git repo and the sidekick repo, and neither report holds them:

- With superpowers set `false`, every install of sidekick carried the same `dependency-unsatisfied` detail, one entry per install.
- Leaving out the user source dropped the synced-scope entry `cowork-plugin-management@synced` from the list. That held under `--setting-sources project` and `project,local`, and every user-scope install stayed listed. So a clean-room profile that names a synced plugin is refused as an unknown id.
- Leaving out the user source kept a dependency error only where a kept source enabled the dependent plugin. With superpowers set `false` under `--setting-sources project,local`, the scratch repo showed no error, since only its user layer enabled sidekick. The sidekick repo, whose project settings enable sidekick, still showed it. So in a clean room, a dependency refuses only for a plugin that a kept source, or the profile itself, enables.

The check costs about 0.7 seconds on the launches it runs for. Three timed runs of `plugin list` with `--settings` took 0.64 to 0.67 seconds on Claude Code 2.1.299 (the 2026-10-14 report, "Plugin dependencies through `plugin list`"). It runs after `doctor`, not beside it.

If `plugin list` changes its output and the check refuses every launch, set `SIDEKICK_PROFILE_SKIP_PLUGIN_CHECK=1`. The CLI then skips this check only, and says so in a warning each time it skips. The `doctor` check still runs. Unset the variable once sidekick catches up.
