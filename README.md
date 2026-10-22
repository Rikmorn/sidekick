# sidekick

The loop I use every day in every repo, packaged as a Claude Code plugin bundle. Superpowers and the official code-review plugin do the work and install as dependencies. sidekick adds the house guidance, a project-management layer on GitHub for the repos where I own the tracking, and design-side extensions the ecosystem lacks. How the loop runs day to day, and how it lands on GitHub, is `docs/reference/USAGE.md`.

## Install

Add the marketplace once, then install the plugin. Dependencies resolve on install.

```bash
claude plugin marketplace add Rikmorn/sidekick
claude plugin install sidekick@rikmorn
```

Enable it where you want it: user scope makes it available in every repo on the machine; project scope commits it to a repo's `.claude/settings.json` so everyone who opens that repo gets it.

```bash
claude plugin enable sidekick@rikmorn --scope user
# or, inside a repo the team should share it in:
claude plugin marketplace add Rikmorn/sidekick --scope project
claude plugin enable sidekick@rikmorn --scope project
```

To update, name the scope:

```bash
claude plugin update -s user sidekick@rikmorn
```

`-s project` updates a project-scope record. Run from a repo that holds a project-scope record for the plugin, the bare command updates that record, not the user install. Restart Claude Code, then run `sidekick rules install` again for each scope you deliver to. Auto-update is the alternative. It is off by default for a third-party marketplace, and `/plugin` → **Marketplaces** → **Enable auto-update** turns it on for `rikmorn`.

sidekick's mods need Claude Code 2.1.287 or later. The board draws one state line under the prompt in each interactive session of a tracked repo. It names the board, with a link, how the milestone stands, and the time. `/board` shows or hides a pane with the brief. A Bash call that writes to the board, runs `git commit` or `git push`, or posts a status update refreshes the line. The gauge draws `profile: <name>` in the footer, and a `⚠` line when no profile settings reached the session. The scope mod keeps a profile's hidden agents out of the model's listing, and refuses their dispatch. `/profile` toggles a pane showing the profile, what it hides, and what loaded. It opens holding the keys, so ↓ scrolls it and Esc closes it. A pane taller than its room says so in its first row; press ctrl+x tab to focus it, then ↓ to scroll. The three commands run at once when typed mid-turn, and pass on a name that another plugin or command owns. In a background session `/profile` works, and `/desk` and `/board` answer that they are off. The desk draws its own band above the prompt, in each interactive session. It names the sessions waiting on you, with their reasons, and lists the workers `sidekick worker dispatch` started from the session's repository. Its pane gives each worker's detail, then every other session, and `/desk` shows or hides it. In the fullscreen layout, on a terminal at least 144 columns wide, the pane also opens by itself when workers appear. `sidekick desk --json` prints the snapshot the desk draws, without the mod. sidekick checks its own mods against the version in `.claude-code-version`.

The context monitor hook takes your session's limit from the first of these that applies:

1. The gauge's figure, for the session and model it was set for. It is the exact compaction point, or the window when auto-compaction is off.
2. `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, read as a compaction window: raised to Claude Code's 100,000 floor, less a 33,000 margin.
3. The `context_window` setting, read as the window.

It stays silent when none applies. When the gauge's figure is missing on a main-thread batch, the hook tells you once per session that the mods are not running. Set the setting for every session under `pluginConfigs` in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "sidekick@rikmorn": { "options": { "context_window": 1000000 } } } }
```

For one session, pass the same key to `--settings`:

```bash
claude --settings '{"pluginConfigs":{"sidekick@rikmorn":{"options":{"context_window":1000000}}}}'
```

A session started with `--plugin-dir ./plugin` loads the plugin as `sidekick@inline`, and reads that key's options instead. Set the setting under both keys to cover both kinds of session.

## The rules

The `sk-*` rules ship inside the plugin. Claude Code reads rules from a repo's `.claude/rules/` or the user-level `~/.claude/rules/`, and a plugin cannot write there on its own, so delivery is one explicit command, available on the Bash tool's PATH whenever the plugin is enabled:

```bash
sidekick rules install --project   # this repo's .claude/rules/
sidekick rules install --user      # the user-level rules directory
sidekick rules check --project     # drift and overlap report; changes nothing
sidekick rules check --user --strict   # exit 1 on drift
```

The command writes and removes only files named `sk-*.md`. That prefix is sidekick's namespace: a file you hand-write under it is removed on the next install if the plugin does not ship it, so keep your own rules out of the `sk-` prefix. It never edits another file.

Each scope delivers a different set:

- `--user` delivers every rule.
- `--project` delivers every rule except `sk-pm-conventions.md`, unless the repo's committed `.claude/settings.json` enables a `sidekick@` plugin. Project copies serve colleagues who may not have the plugin, and they have no use for conventions that only the plugin acts on. Without that key the install prints `not delivered to this repo`. It also removes an existing copy: a rule a scope does not deliver is removed from that scope. If the settings file exists but cannot be read, the install leaves an existing copy as it is and says so.

`check --project` checks the repo's `sk-*` copies. When the repo holds none, it checks the user-level copies instead and names that directory. Where the two directories share a rule, Claude Code loads both copies, and the check says so. That is expected where the repo keeps copies for colleagues without sidekick.

The check also looks for overlap. It compares the shipped rules with the non-`sk-*` `.md` files directly inside the repo's `.claude/rules/` (for `--user`, the user-level rules directory). A file overlaps a rule on any of three signals. They are the corresponding file name (`clean-code.md` for `sk-clean-code.md`), two or more shared H2 headings, and the same opening sentence. The check reports the pair and leaves the decision to you. A repo file that names its pair, such as by citing `sk-clean-code.md`, is a stated extension. The check lists it without reporting it. Repetition is accepted where colleagues who do not use sidekick rely on the repo's copy.

Exit `0` means the command ran, whatever it found. Exit `1` means it could not run: bad usage, no shipped rules, or a destination that is not a directory. With `--strict`, `1` also means drift or a skipped write. A hook should run the check without `--strict`, because Claude Code shows a non-zero exit as a hook error.

## The board

The project-management seat reads the repo's board and prints JSON; the skills do the judgement and the writes. `sk-orient` reads the pickup at session start, and a hook prints it into context. `sk-track` files and closes issues. `sk-milestone` opens and closes a milestone. A repo is tracked when one open Projects v2 board is linked to it, titled after the repo, and owned by you — no config file.

```bash
sidekick pm board              # discovery and preflight: which board, which Status ids, is gh ready
sidekick pm pickup             # active milestone, In Progress, candidates, plans, drift (--brief: six lines; --glance: the board mod's JSON; --report: a status update; --milestone: name one)
sidekick pm lint               # the board's invariants; every count should be 0
sidekick pm gate --milestone "R6 — PM layer"   # can this milestone close?
```

`--quiet` on `board` and `pickup` prints nothing in an untracked repo, for hooks. Exit codes: `0` ran (the verdict is in the JSON), `1` usage or error, `2` `gh` missing or its token lacks the `project` scope.

## Profiles

A profile is a folder of rules plus a `profile.json` manifest. `sidekick profile` hands it to `claude` through `--add-dir`, `--settings`, and `--setting-sources`, so a session loads the layers the profile names. Auto memory and the claude.ai connectors still load in a clean room. It checks the composed settings with `claude doctor` first, because Claude Code drops a wrongly typed settings object without a warning. When a profile sets `settings.enabledPlugins` or `settingSources`, the CLI also refuses one that leaves a plugin without its dependency, or names a plugin `claude plugin list` does not list.

```bash
sidekick profile list                          # every profile in the repo and user stores
sidekick profile show <name>                   # the folder, store, manifest, composed settings, plugin check, and arguments
sidekick profile new <name> --description "…" [--repo]  # create a profile folder, in the repo store with --repo
sidekick profile launch --bg <name> -- <prompt>   # start a background session
sidekick profile alias --shell zsh <name>      # print the skp shell function, to paste into your shell startup file
sidekick profile switch <name>                 # print the lines that resume this session under <name>
```

`sidekick` is on `PATH` only inside a session, so run these from one, or call the installed `bin/sidekick` directly. `skp <name>` then starts an interactive session. Profiles live in two stores, searched in order. The repo store is `.claude/profiles/` at the top of the git work tree, and wins on a shared name. The user store is `profiles/` under `CLAUDE_CONFIG_DIR` or `~/.claude`. `SIDEKICK_PROFILES_DIR`, when set and non-empty, is the only store. The skill reference `plugin/skills/sidekick/references/profiles.md` covers the rest.

## What is in the bundle

| Path | What |
|---|---|
| `plugin/.claude-plugin/plugin.json` | The manifest: name, version, the `context_window` setting, dependencies |
| `plugin/rules/` | The portable rules: clean code, TypeScript, language, working standards, guidance authoring, PM conventions, agent-prompt authoring |
| `plugin/skills/` | The reference skill `sidekick`, the PM skills `sk-orient`, `sk-track`, and `sk-milestone`, the execution skills `sk-execute` and `sk-worker`, and the design skill `sk-design` |
| `plugin/agents/` | The sealed reviewer `sk-holistic-reviewer`, which `sk-milestone` dispatches to review a milestone's scope at Opening and its release at the close |
| `plugin/hooks/` | The session-start hook prints the board's pickup brief in a tracked repo, as one `additionalContext` JSON object. The Skill-tool hook points the model at `sk-design` when brainstorming loads. It gives `writing-plans` the plan stance and the handoff of `sk-execute`. The Read hook gives sidekick's reviewer lines to superpowers' reviewers and to the release check's. The context monitor hook tells the model once at 65% and once at 75% of the way to compaction when a compaction point is known, and of the window otherwise. It stays silent while no limit is set. `mods.ts` registers the board in `board/`, the gauge in `gauge/`, the scope mod in `scope/`, and the desk in `desk/`. The board draws one state line under the prompt from `sidekick pm pickup --glance`, and `/board` toggles a pane with the brief. A Bash call that writes to the board, runs `git commit` or `git push`, or posts a status update refreshes both. The gauge draws the footer label and sets the limit the monitor reads. The scope mod keeps a profile's hidden agents out of the model's listing, and refuses their dispatch. `/profile` toggles a pane showing the profile, what it hides, and what loaded. Each command runs at once when typed mid-turn and passes on a name sidekick did not register. A pane taller than its room says so in its first row. The desk draws who waits on you and the workers, in a band above the prompt and in a pane |
| `plugin/bin/sidekick` | The executable, built from `bin/cli.ts` |
| `.claude-plugin/marketplace.json` | The one-plugin marketplace this repo is |

`sk-design` is the first design-side extension. The others arrive in later releases, each beside a superpowers skill rather than in place of one. The roadmap is the milestone list on GitHub.

## Developing

Bun is the dev toolchain; the executable runs on Node 22 (exact patch in `.nvmrc`).

```bash
bun install
bun run test        # bun test bin/
bun run typecheck   # tsc --noEmit
bun run typecheck:mods  # the mods against Claude Code's declarations
bun run check:mods  # after a Claude Code upgrade: do the mods load and fire?
bun run check       # biome
bun run check:docs  # Markdown links, permalinks, docs layout
bun run build       # bin/cli.ts → plugin/bin/sidekick (committed)
claude plugin validate --strict . && claude plugin validate --strict plugin
claude plugin test plugin  # the mods' tests
```

A release is a milestone closed, tagged `sidekick--v<version>` and published as a GitHub Release; `AGENTS.md` §Releasing holds the steps. This repo consumes its own plugin like any other repo, and reads the user-level rules, which only a release updates.

`docs/` holds the records: ADRs, research, and learnings, beside the steering docs. `docs/README.md` lists what sidekick adds to the docs layout.
