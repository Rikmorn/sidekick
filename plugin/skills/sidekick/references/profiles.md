# Profiles

A profile is a folder plus a settings object that `sidekick profile` hands to `claude`. Claude Code has no profile feature of its own, so the CLI builds the launch from three native flags: `--add-dir`, `--settings`, and `--setting-sources`. Issue #205 in the `Rikmorn/sidekick` repo decided the shape. Most measurements behind these claims are in `docs/research/control-centre/2026-10-13-profile-launch-probes.md` in that repo, called "the probes report" here. Each names the Claude Code version and date it ran on. Two facts were measured on 2026-10-12 during #205's design, on Claude Code 2.1.296. No report holds them, so the text marks them "design-time". The alias hazards have their own source, named where they appear.

## The folder

A profile lives in the store, one folder per profile:

```
<store>/<name>/
  profile.json          the manifest
  .claude/rules/*.md    the stance, and any other rules
  .claude/agents/       agents the profile adds
  .claude/skills/       skills the profile adds
```

The store is `SIDEKICK_PROFILES_DIR` when that is set and non-empty. Otherwise it is `profiles/` under `CLAUDE_CONFIG_DIR`, or under `~/.claude` when that is unset or empty. A relative path resolves against the current folder, so `--add-dir` always receives an absolute path.

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

The folder's agents and skills load whether or not that variable is set.

### What the CLI refuses in a folder

The layout check refuses a folder that holds any of these, and `list`, `show`, `argv`, `launch`, and `alias` run it. `new` does not, since its folder does not exist yet:

- `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md`. By default, a `CLAUDE.md` in a parent folder or an `--add-dir` folder stops Claude Code loading the repo's `AGENTS.md`. A profile folder would hide it in every session that uses the profile. A rule in `.claude/rules/` does not (probes report, "`AGENTS.md` and what hides it"). Put the stance in a rule.
- `.claude/settings.json` or `.claude/settings.local.json`. An `--add-dir` folder's settings file can enable plugins, and the settings check never sees it. Put settings in `profile.json`, where the check covers them.

## The verbs

```
sidekick profile list                       # every profile in the store, with its description
sidekick profile show <name>                # the folder, the manifest, the composed settings, the arguments
sidekick profile new <name> --description <text>   # create the folder with a minimal manifest
sidekick profile argv <name>                # the arguments for claude, NUL-terminated, after the check
sidekick profile launch --bg <name> [-n <session>] [-- <prompt>]
sidekick profile alias [--shell zsh|bash] [<name>...]
```

- `list` skips dot-folders such as `.git`, since no profile name starts with a dot. It exits 1 when any other folder in the store is invalid, and prints that folder's first issue.
- `argv` is for the shell function. It prints each argument followed by a NUL, so an argument holding spaces or quotes survives intact.
- `launch` starts a background session through `claude --bg`. Everything after `--` joins with single spaces into one prompt, placed after a bare `--` so a leading dash cannot read as a flag. Without `--bg` it refuses and points at the shell function, because an interactive session needs the caller's terminal.
- The arguments run in a fixed order: `--add-dir <folder>`, `--settings <JSON>`, then `--setting-sources <list>` when the manifest sets it. `--add-dir` is variadic, so a prompt placed straight after it becomes a second folder (probes report, "`--add-dir` is variadic"). It is never last.

## The shell function

An interactive session needs the shell to keep job control, so the function runs `claude` itself. `sidekick profile alias` prints it, and you paste it once into your shell startup file:

```
sidekick profile alias --shell zsh frontend >> ~/.zshrc
```

Use `--shell bash` for bash. The bash form targets bash 3.2, which macOS ships and which has no `mapfile`. The output is the function `skp <name> [claude arguments...]`, then one `alias <name>='skp <name>'` line for each name you gave. The function:

1. Finds the user-scope `sidekick@rikmorn` install in `claude plugin list --json`, and runs that install's `bin/sidekick`. `sidekick` is on `PATH` only inside a session, so the function cannot call it by name.
2. Runs `profile argv <name>`. A non-zero status returns at once and `claude` never starts.
3. Splits the output on NUL and runs `claude <arguments> "$@"`.

Starting costs about 1.7 seconds before `claude` runs. That sums two figures from the probes report. The plugin list took 0.7 seconds ("Plugin options and the installed CLI"), and the `doctor` check about 1 second ("`doctor`"). The function reads the installed plugin, so `skp` works only once the installed release has the `profile` family.

Pick a profile name that names no command, since each name you give becomes an alias. An alias shadows any command of the same name. That holds when you type the name, and in every file the shell sources after the alias. Before you choose a name, check that `command -v <name>` prints nothing.

`alias` refuses the names that would break the shell's own words: `skp`, `command`, `builtin`, and the reserved words of zsh and bash, such as `do` and `local`. These hazards are not in the probes report. They were measured in child shells during #205's reviews on 2026-10-13:

- With `alias test='skp test'`, a file sourced later that runs `test -n x` runs `skp test -n x` instead.
- With `alias skp='skp skp'`, every `skp <name>` call runs profile `skp` and passes `<name>` on to `claude`. Sourcing the zsh startup file again then fails with `parse error near '()'`.
- With an alias named after a reserved word, such as `alias do=…`, later `for … do … done` loops break. zsh reports `parse error near 'done'`, and bash 3.2 reports `syntax error near unexpected token`.

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
| Auto memory (`MEMORY.md`) | kept. No setting that turns it off was looked for | measured |
| The repo's `AGENTS.md` and rules | kept | measured |
| The repo's own plugins | kept in the sidekick repo. In odin, three of seven loaded. The other four never loaded with the user layer kept (`bench`) either, so keeping it does not bring them back | measured. The cause, a `-p` session not installing a marketplace the repo declares, is inferred and not tested |

A profile turns a plugin off by writing it `false` under `settings.enabledPlugins`. The `bench` profile's `false` left a user-enabled plugin out of both `bench` runs (probes report, "The bench and the steering test"). For a repo plugin, a design-time measurement in the sidekick repo showed a profile's `false` removing `code-review`, which the repo's own settings enabled. Also design-time: a plugin the profile does not name keeps its user-level state when the user layer stays.

A kept user rule is copied into the profile's `.claude/rules/`, not linked. An exclude pattern also excludes a symlink whose target it matches, so a link to `~/.claude/rules/x.md` would vanish with the original. A copy then drifts from its source, and nothing flags the drift.

A folder rule steered a reply as well as an appended system prompt in five of five paired runs. The probes report has them under "The bench and the steering test". That is a first reading with a trivial instruction. It is not proof of equal strength.

## Agents and trust

An `--add-dir` folder's agents load, but their frontmatter hooks and inline MCP servers are skipped unless the folder is itself trusted. A `-p` session never counts as trusted (probes report, "What a folder's own `.claude/settings.json` does"; grade: docs, not run). A profile agent that relies on either runs without it. A `--bg` start also refuses a workspace that was never trusted, and the message names the folder to open once.

## Deleting or renaming a profile

`--add-dir` refuses a path that does not exist. A background job keeps its flags and reapplies them on `claude respawn` (probes report, "Background sessions, respawn, and the daemon"). Deleting or renaming a profile folder can therefore stop its running sessions respawning. Nothing was deleted in the probes, so this is inferred from the docs.

The settings are a snapshot taken at launch, while the folder is live. Claude Code is inferred to re-read its rules at each start and respawn, since the probes report lists rule reload on resume as untested.

## No secrets

A profile never holds a secret. Every `env` key in `settings` reaches Bash children. The launch settings travel as one argument to `claude`, where `ps` shows them. A background job stores them in its job record (`respawnFlags` in `state.json`, measured in the probes report).

For an interactive `skp` start, pass a secret through the shell environment of that session. A `--bg` job does not inherit the dispatching client's environment (probes report, "A `--bg` job does not inherit"). A background session therefore has no measured way to receive one, and that case is open.

## The settings check

Claude Code drops a whole settings object without a warning when one known key has the wrong type. The probes report has this under "The settings flag and a dropped object". The session then runs unprofiled. So `argv` and `launch` first run `claude --settings <copy> doctor`. The copy holds the composed settings in a temp folder, which the CLI deletes afterwards.

The copy carries a wrongly typed canary key, `feedbackSurveyRate` or else `cleanupPeriodDays`, set to `"sidekick-canary"`. `doctor` must report the canary, which proves its undocumented output still parses, and must report nothing else. Otherwise the CLI refuses and prints the lines. The check catches wrongly typed values only. It does not catch a misspelled key or a misspelled plugin id.

If `doctor` changes its output and the check refuses every launch, set `SIDEKICK_PROFILE_SKIP_CHECK=1`. The CLI then skips the check and prints a warning on stderr for each launch that skipped it. Unset the variable once sidekick catches up.
