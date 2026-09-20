---
name: sidekick
description: What the sidekick bundle is, what it depends on, how to deliver its rules into a repo, and how to bring a repo under tracking on GitHub. Use when asked what sidekick is, how to install or update it, where the sk-* rules come from, or how to set up the board and labels for a repo.
user-invocable: true
---

# sidekick

sidekick is a plugin bundle, not a harness. Superpowers and the official code-review plugin do the design, plan, execute, and review work; they install as this plugin's dependencies. sidekick adds three things around them: the house guidance (the `sk-*` rules), a project-management layer on GitHub for the repos where the operator owns the tracking, and design-side extensions the ecosystem lacks. ADR-0009 in the sidekick repo records why.

## The rules

The portable rules ship inside the plugin under `rules/`. Claude Code reads rules from a repo's `.claude/rules/` or from the user-level `~/.claude/rules/`, and a plugin cannot write there by itself, so delivery is one explicit command:

```
sidekick rules install --project   # writes sk-*.md into this repo's .claude/rules/
sidekick rules install --user      # writes them into the user-level rules directory
sidekick rules check --project     # reports drift and overlap; changes nothing
```

`sidekick` is on the Bash tool's PATH whenever the plugin is enabled. The command writes and removes only files named `sk-*.md`. That prefix is sidekick's namespace: a hand-written file under it is removed on the next install if the plugin does not ship it, so keep your own rules out of the `sk-` prefix. Other rule files are never edited; when one overlaps an sk rule by heading or opening sentence, the check reports it and leaves the decision to you.

## Bringing a repo under tracking

The PM layer is on where you own the tracking and silent everywhere else. A repo is tracked when one open Projects v2 board, titled after the repo and owned by you, is linked to it. There is no config file; the board is the switch. `sidekick pm board` reports `tracked` and, when false, a `reason`. `no-board` is the state this section resolves. The other reasons (`no-origin`, `not-github`, `no-local-login`, `remote-owner-mismatch`) mean the repo is not yours to track, and nothing here applies.

The sidekick board, `users/Rikmorn/projects/2`, is the reference shape. It carries Status with Backlog, In Progress, Verify, and Done. Its views are Board, By milestone, and Focus, which is filtered to In Progress and Verify. Five built-in workflows are on. The sixth, "Pull request linked to issue", was removed. It rewrites an issue's Status to In Progress whenever a pull request is linked, which undoes an explicit move to Verify. A copy carries all of that with zero items. Copy is the only route to the Focus view: the API creates views but cannot set a filter. The reference board is infrastructure, so an edit to its views or workflows reaches every board copied after it.

Bringing a repo in is four writes and a check:

1. Copy and describe. `gh project copy 2 --source-owner Rikmorn --target-owner @me --title <repo> --format json` prints the new number. `gh project edit <n> --owner @me --description "…"` names the repo and points at `sk-pm-conventions.md`.
2. Link, so discovery finds it: `gh project link <n> --owner <login> --repo <repo>`. Copy and edit accept `--owner @me`; link does not, because it looks the repository up as `@me/<repo>`.
3. Labels. `backlog` and `change-request` are fixed; `gh label create <name> --force --color <hex> --description "…"` creates or updates them, with the descriptions the sidekick repo uses. The `area:*` set is the repo owner's to name, one per open issue. Propose a set from the repo's own structure, its packages and its docs topics, and agree it before creating.
4. Verify. `sidekick pm board` reports `tracked: true` with the four Status options, and `sidekick pm lint` prints zeros. Any other Status options mean the copy or the reference has changed: stop and say so, and repair the reference board, never the copy. A board made by hand, or copied before the reference lost that workflow, may still list "Pull request linked to issue". One `deleteProjectV2Workflow` mutation with the id from `projectV2.workflows` removes it. The API offers delete only; there is no create or update.

Nothing else is configured. There is no auto-add workflow, because filing adds the card and lint's `unboarded` reports a miss. There is no milestone; the first one opens with the first piece of work. A repo that is already `tracked: true` needs at most the label step, which `--force` makes safe to repeat. A second copy produces two boards with the repo's title: discovery takes the lower number, and lint reports `multiple_linked_boards`.

## What is here, what is coming

The PM layer is here, over `sidekick pm`. `sk-orient` reads the pickup at session start, and a hook prints it; `sk-track` files and closes; `sk-milestone` opens and closes a milestone. The design-side extensions (a design pass before brainstorming, a sealed review after a spec, a goal-backward verdict after a build, decision capture) arrive in later releases. Each one runs beside a superpowers skill; none replaces one.
