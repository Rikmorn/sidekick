---
name: sidekick
description: What the sidekick bundle is, what it depends on, how to deliver its rules into a repo, how to bring a repo under tracking on GitHub, and how the docs folders its skills write work. Use when asked what sidekick is, how to install or update it, where the sk-* rules come from, how to set up the board and labels for a repo, or where a design, research report, ADR, or learning record goes.
user-invocable: true
---

# sidekick

sidekick is a plugin bundle, not a harness. Superpowers and the official code-review plugin do the design, plan, execute, and review work; they install as this plugin's dependencies. sidekick adds four things around them. They are the house guidance (the `sk-*` rules), a project-management layer on GitHub, an execution process for written plans, and design-side extensions the ecosystem lacks. The project-management layer runs only in the repos where the operator owns the tracking. ADR-0009 in the sidekick repo records why.

## The rules

The portable rules ship inside the plugin under `rules/`. Claude Code reads rules from a repo's `.claude/rules/` or from the user-level `~/.claude/rules/`, and a plugin cannot write there by itself, so delivery is one explicit command:

```
sidekick rules install --project   # writes sk-*.md into this repo's .claude/rules/
sidekick rules install --user      # writes them into the user-level rules directory
sidekick rules check --project     # reports drift and overlap; changes nothing
sidekick rules check --user --strict   # also exits 1 on drift
```

`sidekick` is on the Bash tool's PATH whenever the plugin is enabled. The command writes and removes only files named `sk-*.md`. That prefix is sidekick's namespace: a hand-written file under it is removed on the next install if the plugin does not ship it, so keep your own rules out of the `sk-` prefix. Other rule files are never edited.

- `--user` delivers every rule. `--project` leaves out `sk-pm-conventions.md` unless the repo's committed `.claude/settings.json` enables a `sidekick@` plugin, and removes an existing copy; an unreadable settings file leaves it as it is.
- `check --project` checks the user-level copies when the repo holds no `sk-*` copies. Where the two directories share a rule, Claude Code loads both copies, which is expected.
- The check reports overlap between a shipped rule and a non-`sk-*` file directly inside the repo's `.claude/rules/` (the user-level directory for `--user`). The signals are a corresponding file name, two or more shared H2 headings, or the opening sentence. A repo file that names its pair is a stated extension. The decision stays with you.
- Exit `0` means the command ran, and `1` means it could not run. `--strict` also exits `1` on drift or a skipped write. Run the check in a hook without it, because Claude Code shows a non-zero exit as a hook error.

## Bringing a repo under tracking

The PM layer is on where you own the tracking and silent everywhere else. A repo is tracked when one open Projects v2 board, titled after the repo and owned by you, is linked to it. There is no config file; the board is the switch. `sidekick pm board` reports `tracked` and, when false, a `reason`. `no-board` is the state this section resolves. The other reasons (`no-origin`, `not-github`, `no-local-login`, `remote-owner-mismatch`) mean the repo is not yours to track, and nothing here applies.

The sidekick board, `users/Rikmorn/projects/2`, is the reference shape. It carries Status with Backlog, In Progress, and Done, plus the Board view. Five built-in workflows are on. The sixth, "Pull request linked to issue", was removed. It sets an issue's Status to In Progress whenever a pull request is linked, overriding the Status the PM set. A copy carries all of that with zero items. It also carries the reference's other views, such as By milestone. sidekick does not prescribe those, so each repo keeps or deletes them. A board can also be repaired through the API, which creates a view and sets its filter. It cannot set a table's group-by or enable a workflow; those take the web UI, which a copy never needs. The reference board is infrastructure, so an edit to its views or workflows reaches every board copied after it.

Bringing a repo in is four writes and a check:

1. Copy and describe. `gh project copy 2 --source-owner Rikmorn --target-owner @me --title <repo> --format json` prints the new number. `gh project edit <n> --owner @me --description "…"` names the repo and points at `sk-pm-conventions.md`.
2. Link, so discovery finds it: `gh project link <n> --owner <login> --repo <repo>`. Copy and edit accept `--owner @me`; link does not, because it looks the repository up as `@me/<repo>`.
3. Labels. `backlog` and `change-request` are fixed; `gh label create <name> --force --color <hex> --description "…"` creates or updates them, with the descriptions the sidekick repo uses. The `area:*` set is the repo owner's to name, one per open issue. Propose a set from the repo's own structure, its packages and its docs topics, and agree it before creating.
4. Verify. `sidekick pm board` reports `tracked: true` with the three Status options, and `sidekick pm lint` prints zeros. Any other Status options mean the copy or the reference has changed: stop and say so, and repair the reference board, never the copy. A repair to its options uses `updateProjectV2Field`, which replaces the whole list: pass each kept option's `id`, or the cards holding it lose their value. A board made by hand, or copied before the reference lost that workflow, may still list "Pull request linked to issue". One `deleteProjectV2Workflow` mutation with the id from `projectV2.workflows` removes it. The API offers delete only; there is no create or update.

Nothing else is configured. There is no auto-add workflow, because filing adds the card and lint's `unboarded` reports a miss. There is no milestone; the first one opens with the first piece of work. A repo that is already `tracked: true` needs at most the label step, which `--force` makes safe to repeat. A second copy produces two boards with the repo's title: discovery takes the lower number, and lint reports `multiple_linked_boards`.

## The docs layout

`references/docs-layout.md` says how each `docs/` folder that sidekick's skills write works: designs, research, ADRs, learnings, tech debt, and the superpowers working directory. For each it gives the index file, what the folder holds, and its lifecycle. A repo's own `README.md` in one of those folders extends or overrides its section, and a repo may add folders of its own.

## What is here, what is coming

The PM layer is here, over `sidekick pm`. `sk-orient` reads the pickup at session start, and a hook prints it; `sk-track` files and closes; `sk-milestone` opens and closes a milestone. `sk-execute` chooses how a written plan runs and hands it to a worker session, where `sk-worker` runs it. A hook on `Read` gives superpowers' reviewers sidekick's reviewer lines when they open a review package, as ADR-0011 records. `sk-design` is the design pass: it designs a change before or during brainstorming. A hook on the Skill tool points the model at it when `superpowers:brainstorming` loads, and gives `superpowers:writing-plans` the plan stance of `sk-execute`, as ADR-0010 records. The other design-side extensions (a sealed review after a spec, a goal-backward verdict after a build, decision capture) arrive in later releases. Each one runs beside a superpowers skill; none replaces one.
