# sidekick

The loop I use every day in every repo, packaged as a Claude Code plugin bundle. Superpowers and the official code-review plugin do the work and install as dependencies. sidekick adds the house guidance, a project-management layer on GitHub for the repos where I own the tracking, and design-side extensions the ecosystem lacks. ADR-0009 under `docs/adr/` records the pivot from the harness this repo used to be.

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
```

The command writes and removes only files named `sk-*.md`. It never edits another file. When a repo keeps its own rule that overlaps an sk rule by heading or opening sentence, the check reports the pair and leaves the decision to you; repetition is accepted where colleagues who do not use sidekick rely on the repo's copy.

## What is in the bundle

| Path | What |
|---|---|
| `plugin/.claude-plugin/plugin.json` | The manifest: name, version, dependencies |
| `plugin/rules/` | The portable rules: clean code, TypeScript, language, working standards, guidance authoring, PM conventions, agent-prompt authoring |
| `plugin/skills/sidekick/` | The reference skill that explains the bundle |
| `plugin/bin/sidekick` | The executable, built from `bin/cli.ts` |
| `.claude-plugin/marketplace.json` | The one-plugin marketplace this repo is |

The PM layer and the design-side extensions arrive in later releases, each beside a superpowers skill rather than in place of one. The roadmap is the milestone list on GitHub.

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

A release is a milestone closed: `claude plugin tag plugin --push` creates `sidekick--v<version>` from the manifest, and `gh release create` publishes it. This repo consumes its own plugin like any other repo; its `.claude/rules/` copies are what `sidekick rules install --project` writes.

`docs/` holds the records: ADRs, research, reviews, and the frozen work history. `docs/README.md` says what each folder means.
