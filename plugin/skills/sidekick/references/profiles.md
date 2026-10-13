# Profiles

A profile is a folder plus a settings object that `sidekick profile` hands to `claude`. Claude Code has no profile feature of its own, so the CLI builds the launch from three native flags: `--add-dir`, `--settings`, and `--setting-sources`. Issue #205 decided the shape. The measurements behind each claim here are in `docs/research/control-centre/2026-10-13-profile-launch-probes.md`, called the probes report below, and each one names the Claude Code version and date it ran on.

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
- `claudeMdExcludes` for the user's `~/.claude/CLAUDE.md` and `~/.claude/rules/**`, when `settingSources` is present and leaves out `user`. The next section explains why.

The folder's agents and skills load whether or not that variable is set.

### What the CLI refuses in a folder

The layout check refuses a folder that holds any of these, and every verb that takes a name runs it:

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

- `list` exits 1 when any folder in the store is invalid, and prints that folder's first issue.
- `argv` is for the shell function. It prints each argument followed by a NUL, so an argument holding spaces or quotes survives intact.
- `launch` starts a background session through `claude --bg`. Everything after `--` joins with single spaces into one prompt, placed after a bare `--` so a leading dash cannot read as a flag. Without `--bg` it refuses and points at the shell function, because an interactive session needs the caller's terminal.
- The arguments run in a fixed order: `--add-dir <folder>`, `--settings <JSON>`, then `--setting-sources <list>` when the manifest sets it. `--add-dir` is variadic, so a prompt placed straight after it becomes a second folder (probes report, "`--add-dir` is variadic"). It is never last.

## The shell function

An interactive session needs the shell to keep job control, so the function runs `claude` itself. `sidekick profile alias` prints it, and you paste it once into your shell startup file:

```
sidekick profile alias --shell zsh frontend >> ~/.zshrc
```

Use `--shell bash` for bash. The bash form targets bash 3.2, which macOS ships and which has no `mapfile`. The output is the function `skp <name> [claude arguments...]`, then one `alias <name>='skp <name>'` line for each name you gave. The function:

1. Finds the user-scope `sidekick@rikmorn` install in `claude plugin list --json`, and runs that install's `bin/sidekick`. `sidekick` is not on `PATH` outside a session.
2. Runs `profile argv <name>`. A non-zero status returns at once and `claude` never starts.
3. Splits the output on NUL and runs `claude <arguments> "$@"`.

Starting costs about 1.7 seconds: up to 1.0 for the plugin list and 0.7 for the settings check. Because the function reads the installed plugin, `skp` works only once the installed release has the `profile` family.

Avoid two kinds of alias name. An alias named `skp` replaces the function with itself, and an alias named after a shell reserved word, such as `do`, breaks later loops in that shell. The name rule allows both. Both were measured in child shells during review of the alias verb, and the probes report does not cover them.

## What each mode drops

`settingSources` sets the mode. Absent, the profile keeps the user layer, and `--settings` merges into it key by key. A plugin the profile does not name keeps its user-level state, and `false` turns one off.

A `settingSources` that leaves out `user` makes a clean room. Measured on Claude Code 2.1.296 on 2026-10-13 (probes report, "The user layer and the clean room under `$HOME`"):

| Item | Clean room |
|---|---|
| User settings, hooks, and plugins | dropped |
| The user's `model`, `effortLevel`, and similar keys | dropped |
| User `pluginConfigs` | dropped. Claude Code reads that key from user settings, managed settings, and `--settings`, so a plugin option goes in the profile's `settings` block. |
| User `CLAUDE.md` and rules | dropped, by the excludes launch adds. The `--setting-sources` flag alone does not drop them under `$HOME`, where Claude Code reads `~/.claude/` as a parent folder's `.claude/`. |
| claude.ai connectors | kept |
| Auto memory (`MEMORY.md`) | kept. Its loading was seen in a clean room, and no setting that turns it off was looked for. |
| The repo's `AGENTS.md` and rules | kept |
| The repo's own plugins | kept in the sidekick repo. In odin, three of seven loaded; the cause is inferred, not tested, as a `-p` session not installing a marketplace the repo declares. |

A profile turns a repo plugin off by writing it `false` under `settings.enabledPlugins`.

A kept user rule is copied into the profile's `.claude/rules/`, not linked. An exclude pattern also excludes a symlink whose target it matches, so a link to `~/.claude/rules/x.md` would vanish with the original. A copy then drifts from its source, and nothing flags the drift.

A rule in the folder steered a reply as well as an appended system prompt in five of five paired runs (probes report, "The bench and the steering test"). That is a first reading with a trivial instruction, not proof of equal strength.

## Agents and trust

An `--add-dir` folder's agents load, but their frontmatter hooks and inline MCP servers are skipped unless the folder is itself trusted. A `-p` session never counts as trusted (probes report, "What a folder's own `.claude/settings.json` does"; grade: docs, not run). A profile agent that relies on either runs without it. A `--bg` start also refuses a workspace that was never trusted, and the message names the folder to open once.

## Deleting or renaming a profile

`--add-dir` refuses a path that does not exist, and a background job keeps its flags and reapplies them on `claude respawn` (probes report, "Background sessions, respawn, and the daemon"). Deleting or renaming a profile folder can therefore stop its running sessions respawning. Nothing was deleted in the probes, so this is inferred from the docs. The settings are a snapshot taken at launch, while the folder is live: Claude Code re-reads its rules at each start and respawn.

## No secrets

A profile never holds a secret. Every `env` key in `settings` reaches Bash children. The launch settings travel as one argument to `claude`, where `ps` shows them, and a background job stores them in its job record (`respawnFlags` in `state.json`, measured in the probes report). Pass a secret through the shell environment of the session that needs it, or through the tool that uses it.

## The settings check

Claude Code drops a whole settings object, without a warning, when one known key has the wrong type (probes report, "The settings flag and a dropped object"). The session then runs unprofiled. So `argv` and `launch` first run `claude --settings <copy> doctor` on a copy of the composed settings in a temp folder, and delete the folder afterwards.

The copy carries a wrongly typed canary key, `feedbackSurveyRate` or else `cleanupPeriodDays`, set to `"sidekick-canary"`. `doctor` must report the canary, which proves its undocumented output still parses, and must report nothing else. Otherwise the CLI refuses and prints the lines. The check catches wrongly typed values only. It does not catch a misspelled key or a misspelled plugin id.

If `doctor` changes its output and the check refuses every launch, set `SIDEKICK_PROFILE_SKIP_CHECK=1`. The CLI then skips the check and prints a warning on stderr for each launch that skipped it. Unset the variable once sidekick catches up.
