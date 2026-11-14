# Locking a version

When something is off after Claude Code or superpowers updates, lock the version that worked until sidekick catches up, then report it. The issues named here are in the `Rikmorn/sidekick` repo; #390 holds this design. Each step names its source: measured on the operator's machine, or the Claude Code docs alone.

## How updates reach a session

- **One install serves every repo.** `~/.local/bin/claude` links to one build under `~/.local/share/claude/versions/` (measured 2026-11-14). Only the user-scope plugin record decides what loads. Two repos' project records read 6.4.1 and 6.3.0, and their sessions loaded the user-scope 7.0.2 (#385's close comment).
- **An update runs early in a session.** In an interactive session it waits until after the first message, plus a random delay of up to ten minutes. Only that session shows Claude Code's notice, `Plugin updated: <name> · Run /reload-plugins to apply` (docs: `plugins/loading.md`, "When auto-update runs"). After its own update Claude Code shows nothing, unless the update failed (docs: `setup.md`, "Auto-updates").
- **sidekick's own unattended sessions run no updates** (#390). A dispatched worker, a `sidekick profile launch --bg` session, and the sessions `check:mods` and `typecheck:mods` start all set `DISABLE_AUTOUPDATER=1`.
- **A session you launch by hand can still update.** A `claude --bg` session takes its env from the daemon and its settings, not from the shell that launched it. So it updates even when a worker launches it, unless its `--settings` env carries the key. A `claude -p` inherits its shell's env, so one started from your own shell updates. Give such a session `--settings '{"env":{"DISABLE_AUTOUPDATER":"1"}}'`. `sk-worker`'s limits tell a worker to. The update of 2026-11-12 came from a background session a worker launched by hand (#390's close comment).
- **A running session keeps its versions.** It runs what it started with until it restarts, so a lock or a roll-back takes effect in new sessions.

## superpowers

**Lock.** Open `/plugin`, choose **Marketplaces**, and turn off auto-update for `claude-plugins-official`. That writes `autoUpdate: false` for it in `~/.claude/plugins/known_marketplaces.json`. It holds every plugin from that marketplace, not only superpowers. Measured in #385's comment of 2026-11-12.

**Roll back.** Point the `user` record of `superpowers@claude-plugins-official` in `~/.claude/plugins/installed_plugins.json` at the folder that worked. The record holds `installPath`, `version`, and `gitCommitSha`. Then start a new session. Measured in the same comment, which pointed the record at the 6.4.1 folder. The folders sit under:

```text
~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>
```

A folder no record names gets an `.orphaned_at` file, and goes after about 14 days (docs: `plugins/loading.md`; the file was seen on 7.0.0 on 2026-11-14). Copy the folder elsewhere when the lock may last longer.

**Unlock.** Turn auto-update back on, or delete the `autoUpdate` key. Then update at user scope, and start a new session. Measured in #385's close comment of 2026-11-14:

```bash
claude plugin update -s user superpowers@claude-plugins-official
```

## Claude Code

**Lock.** Set `DISABLE_AUTOUPDATER` to `"1"` in the `env` of `~/.claude/settings.json` (docs: `env-vars.md` and `setup.md`, "Disable auto-updates"). It also turns off the whole plugin auto-update pass, unless `FORCE_AUTOUPDATE_PLUGINS` is `"1"` too (docs: `plugins/loading.md`, "Which marketplaces and plugins auto-update"). Set both to hold Claude Code while plugins keep moving. An R11 probe's log on 2026-11-12 read "Plugin autoupdate: skipped (auto-updater disabled)".

The `"stable"` value of `autoUpdatesChannel` is a softer hold, but it can move you to an older build. Pair it with `minimumVersion` set to the build that worked (docs: `setup.md`, "Configure release channel" and "Pin a minimum version").

**Roll back.** Install the build that worked (docs: `setup.md`, "Install a specific version"):

```bash
curl -fsSL https://claude.ai/install.sh | bash -s <version>
```

The installer keeps the two newest builds in `~/.local/share/claude/versions/`, with the one the launcher points to and any a session runs. It deletes the rest (docs: `setup.md`, "Install on network storage"). Copy a build that worked elsewhere when you may need it later.

**Unlock.** Remove the keys, and start a new session. Once sidekick has a fix, run `bun run check:mods` in sidekick's repo on the new build.

## Project scope

No project setting holds a shared install. A session in another repo still updates it, and every repo then loads the new version. The project-scope lever is per launch:

- Launch with the superpowers folder that worked, which replaces the installed one for that session (docs: `plugins/loading.md`, "Name conflicts"):

  ```bash
  claude --plugin-dir ~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>
  ```

- Launch a kept Claude Code build by its path under `~/.local/share/claude/versions/`.

## Profiles that leave out the user layer

A profile whose `settingSources` drops `user` never reads `~/.claude/settings.json`, so a lock written there does not reach it. Put `DISABLE_AUTOUPDATER` in the profile's own `settings.env`. Whether the marketplace lock in `known_marketplaces.json` reaches such a session is unmeasured.

## Report it

File the incompatibility on the `Rikmorn/sidekick` repo: with `sk-track` from a session in sidekick's repo, or from anywhere with `gh issue create -R Rikmorn/sidekick`. Name the version on each side, and the step or name that moved.
