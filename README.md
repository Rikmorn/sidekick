# sidekick

The loop I use every day in every repo, packaged as a Claude Code plugin bundle. Superpowers and the official code-review plugin do the work and install as dependencies. sidekick adds the house guidance, a project-management layer on GitHub for the repos where I own the tracking, and design-side extensions the ecosystem lacks. How the loop runs day to day, and how it lands on GitHub, is `docs/USAGE.md`.

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

## The rules

The `sk-*` rules ship inside the plugin. Claude Code reads rules from a repo's `.claude/rules/` or the user-level `~/.claude/rules/`, and a plugin cannot write there on its own, so delivery is one explicit command, available on the Bash tool's PATH whenever the plugin is enabled:

```bash
sidekick rules install --project   # this repo's .claude/rules/
sidekick rules install --user      # the user-level rules directory
sidekick rules check --project     # drift and overlap report; changes nothing
sidekick rules check --user --strict   # exit 1 on drift or a skipped write
```

The command writes and removes only files named `sk-*.md`. That prefix is sidekick's namespace: a file you hand-write under it is removed on the next install if the plugin does not ship it, so keep your own rules out of the `sk-` prefix. It never edits another file.

Each scope delivers a different set:

- `--user` delivers every rule.
- `--project` delivers every rule except `sk-pm-conventions.md`, unless the repo's committed `.claude/settings.json` enables a `sidekick@` plugin. Project copies serve colleagues who may not have the plugin, and they have no use for conventions that only the plugin acts on. Without that key the install prints `not delivered to this repo`. It also removes an existing copy: a rule a scope does not deliver is removed from that scope. If the settings file exists but cannot be read, the install leaves an existing copy as it is and says so.

`check --project` checks the repo's `sk-*` copies. When the repo holds none, it checks the user-level copies instead and names that directory. Where both exist, Claude Code loads both, and the check says so; that is expected where the repo keeps copies for colleagues without sidekick.

The check also looks for overlap between the shipped rules and the repo's other `.md` files. A file overlaps a rule on any of three signals: the corresponding file name (`clean-code.md` for `sk-clean-code.md`), two or more shared H2 headings, or the same opening sentence. The check reports the pair and leaves the decision to you. A repo file that names its pair, such as by citing `sk-clean-code.md`, is a stated extension. The check lists it without reporting it. Repetition is accepted where colleagues who do not use sidekick rely on the repo's copy.

Exit `0` means the command ran, whatever it found. Exit `1` means it could not run: bad usage, no shipped rules, or a destination that is not a directory. With `--strict`, `1` also means drift or a skipped write. A hook should run the check without `--strict`, because Claude Code shows a non-zero exit as a hook error.

## The board

The project-management seat reads the repo's board and prints JSON; the skills do the judgement and the writes. `sk-orient` reads the pickup at session start, and a hook prints it into context. `sk-track` files and closes issues. `sk-milestone` opens and closes a milestone. A repo is tracked when one open Projects v2 board is linked to it, titled after the repo, and owned by you — no config file.

```bash
sidekick pm board              # discovery and preflight: which board, which Status ids, is gh ready
sidekick pm pickup             # active milestone, In Progress, candidates, plans, drift (--brief: six lines; --report: a status update; --milestone: name one)
sidekick pm lint               # the board's invariants; every count should be 0
sidekick pm gate --milestone "R6 — PM layer"   # can this milestone close?
```

`--quiet` on `board` and `pickup` prints nothing in an untracked repo, for hooks. Exit codes: `0` ran (the verdict is in the JSON), `1` usage or error, `2` `gh` missing or its token lacks the `project` scope.

## What is in the bundle

| Path | What |
|---|---|
| `plugin/.claude-plugin/plugin.json` | The manifest: name, version, dependencies |
| `plugin/rules/` | The portable rules: clean code, TypeScript, language, working standards, guidance authoring, PM conventions, agent-prompt authoring |
| `plugin/skills/` | The reference skill `sidekick`, the PM skills `sk-orient`, `sk-track`, and `sk-milestone`, the execution skills `sk-execute` and `sk-worker`, and the design skill `sk-design` |
| `plugin/hooks/` | The session-start hook that prints the board's pickup in a tracked repo, the Skill-tool hook that points the model at `sk-design` when brainstorming loads and gives `writing-plans` the plan stance of `sk-execute`, and the Read hook that gives superpowers' reviewers sidekick's reviewer lines |
| `plugin/bin/sidekick` | The executable, built from `bin/cli.ts` |
| `.claude-plugin/marketplace.json` | The one-plugin marketplace this repo is |

`sk-design` is the first design-side extension. The others arrive in later releases, each beside a superpowers skill rather than in place of one. The roadmap is the milestone list on GitHub.

## Developing

Bun is the dev toolchain; the executable runs on Node 22 (exact patch in `.nvmrc`).

```bash
bun install
bun run test        # bun test bin/
bun run typecheck   # tsc --noEmit
bun run check       # biome
bun run build       # bin/cli.ts → plugin/bin/sidekick (committed)
claude plugin validate --strict . && claude plugin validate --strict plugin
```

A release is a milestone closed: `claude plugin tag plugin --push` creates `sidekick--v<version>` from the manifest, and `gh release create` publishes it. This repo consumes its own plugin like any other repo, and reads the user-level rules, which only a release updates.

`docs/` holds the records: ADRs, research, reviews, and the frozen work history. `docs/README.md` says what each folder means.
