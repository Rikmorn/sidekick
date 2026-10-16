---
name: sidekick
description: What the sidekick bundle is, what it depends on, how to deliver its rules into a repo, how to bring a repo under tracking on GitHub, and how the docs folders its rules and skills use work. Use when asked what sidekick is, how to install or update it, where the sk-* rules come from, how to set up the board and labels for a repo, how to make, list, or launch a profile, how sidekick worker dispatches and finishes a plan's worker, or where a reference doc, design, research report, ADR, or learning record goes.
user-invocable: true
---

# sidekick

sidekick is a plugin bundle, not a harness. Superpowers and the official code-review plugin do the design, plan, execute, and review work; they install as this plugin's dependencies. sidekick adds five things around them. They are the house guidance (the `sk-*` rules), a project-management layer on GitHub, an execution process for written plans, and a context monitor. The fifth is design-side extensions the ecosystem lacks. The project-management layer runs only in the repos where the operator owns the tracking. ADR-0009 in the sidekick repo records why.

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

To update the plugin, run `claude plugin update -s user sidekick@rikmorn`. Without `-s user`, the command updates the project-scope record instead when the repo holds one. Restart Claude Code, then run `sidekick rules install` again for each scope you deliver to.

## Bringing a repo under tracking

The PM layer is on where you own the tracking and silent everywhere else. A repo is tracked when one open Projects v2 board, titled after the repo and owned by you, is linked to it. There is no config file; the board is the switch. `sidekick pm board` reports `tracked` and, when false, a `reason`. `no-board` is the state this section resolves. The other reasons (`no-origin`, `not-github`, `no-local-login`, `remote-owner-mismatch`) mean the repo is not yours to track, and nothing here applies.

The sidekick board, `users/Rikmorn/projects/2`, is the reference shape. It carries Status with Backlog, In Progress, and Done, plus the Board view. Five built-in workflows are on. The sixth, "Pull request linked to issue", was removed. It sets an issue's Status to In Progress whenever a pull request is linked, overriding the Status the PM set. A copy carries all of that with zero items. It also carries the reference's other views, such as By milestone. sidekick does not prescribe those, so each repo keeps or deletes them. A board can also be repaired through the API, which creates a view and sets its filter. It cannot set a table's group-by or enable a workflow; those take the web UI, which a copy never needs. The reference board is infrastructure, so an edit to its views or workflows reaches every board copied after it.

Bringing a repo in is four writes and a check:

1. Copy and describe. `gh project copy 2 --source-owner Rikmorn --target-owner @me --title <repo> --format json` prints the new number. `gh project edit <n> --owner @me --description "…"` names the repo and points at `sk-pm-conventions.md`.
2. Link, so discovery finds it: `gh project link <n> --owner <login> --repo <repo>`. Copy and edit accept `--owner @me`; link does not, because it looks the repository up as `@me/<repo>`.
3. Labels. `backlog` and `change-request` are fixed; `gh label create <name> --force --color <hex> --description "…"` creates or updates them, with the descriptions the sidekick repo uses. The `area:*` set is the repo owner's to name, one per open issue. Propose a set from the repo's own structure, its packages and its docs topics, and agree it before creating.
4. Verify. `sidekick pm board` reports `tracked: true` with the three Status options, and `sidekick pm lint` prints zeros. Any other Status options mean the copy or the reference has changed: stop and say so, and repair the reference board, never the copy. A repair to its options uses `updateProjectV2Field`, which replaces the whole list: pass each kept option's `id`, or the cards holding it lose their value. A board made by hand, or copied before the reference lost that workflow, may still list "Pull request linked to issue". One `deleteProjectV2Workflow` mutation with the id from `projectV2.workflows` removes it. The API offers delete only; there is no create or update.

Nothing else is configured. There is no auto-add workflow, because filing adds the card and lint's `unboarded` reports a miss. There is no milestone; the first one opens with the first piece of work. A repo that is already `tracked: true` needs at most the label step, which `--force` makes safe to repeat. A second copy produces two boards with the repo's title: discovery takes the lower number, and lint reports `multiple_linked_boards`.

## Profiles

`sidekick profile` makes and launches profiles: a folder of rules plus a manifest, handed to `claude` through `--add-dir`, `--settings`, and `--setting-sources`. A profile lives in the repo store, the repo's `.claude/profiles/`, or in the user store, and the repo's wins on a shared name. Its verbs are `list`, `show`, `new` (with `--repo` for the repo store), `argv`, `launch --bg`, `alias`, and `switch`. `alias` prints the `skp <name>` shell function for interactive starts. `switch` prints the lines that resume the current session under another profile. `references/profiles.md` covers the folder layout, the repo store, switching, and what each mode drops. It also covers the settings check, the plugin dependency check, their skip variables, and what a profile must never hold.

## Workers

`sidekick worker` starts a plan's worker and clears it away. `dispatch <brief> --permission-mode <mode>` checks the brief, the main checkout, and the `worker` profile. Then it starts `sk-worker` as a background session, in a worktree of its own, with pushes blocked. `finish <brief>` runs once the worker's branch is integrated. It saves the run report beside the plan and removes the worker's session, desk record, worktree, and branch. `sk-execute` §Hand off to a worker runs both, after the operator chooses the worker mode. `references/workers.md` covers the brief, what each verb checks, the record the desk lists a worker from, and the push block with what it does not guard. It also covers steering and stopping, the fallback when agent view is unavailable, and a suggested `worker` profile.

## The docs layout

`references/docs-layout.md` says how each `docs/` folder that sidekick's rules and skills use works: reference docs, designs, research, ADRs, learnings, tech debt, and the superpowers working directory. For each it gives the layout, who writes and deletes its files, and the lifecycle. Where the folder has an index file, it says what goes in it. A repo's `docs/README.md` cites the layout and lists only what the repo adds or overrides. A repo's own `README.md` in one of those folders extends or overrides its section. A repo may add folders of its own that pass the layout's folder-earning test.

## What is here, what is coming

The PM layer is here, over `sidekick pm`. `sk-orient` reads the pickup at session start, and a hook prints it; `sk-track` files and closes; `sk-milestone` opens and closes a milestone. Through the `sk-holistic-reviewer` agent, it reviews the scope at Opening and checks the release as a whole at the close. `sk-execute` chooses how a written plan runs and hands it to a worker session, where `sk-worker` runs it. A hook on `Read` gives superpowers' reviewers, and the release check's, sidekick's reviewer lines when they open a review package, as ADR-0011 records. A hook on `PostToolBatch` tells the model once at 65% and once at 75% of the way to compaction, or of the window when no compaction point is known. Its limit comes from the gauge, else `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, else the `context_window` setting. sidekick's mods need Claude Code 2.1.287 or later. The board band shows the board's pickup above the prompt in each interactive session of a tracked repo. It refreshes on `/board` and after a Bash call writes to the board. The gauge draws `profile: <name>` in the footer, and a `⚠` line when no profile settings reached the session. The scope mod keeps a profile's hidden agents out of the model's listing. The desk draws its own band below the board band, in each interactive session. Its band names who waits on the operator and why, lists the workers `sidekick worker dispatch` started in the session's repository, and counts the other sessions that finished. Its pane gives each worker's state, tokens, plan, and last commit, and marks unintegrated commits and uncommitted changes. Every other session follows. `/desk` shows or hides the pane, which opens by itself only in the fullscreen layout. `sidekick desk --json` prints the snapshot the desk draws. `sk-design` is the design pass: it designs a change before or during brainstorming. A hook on the Skill tool points the model at it when `superpowers:brainstorming` loads, and gives `superpowers:writing-plans` the plan stance and the handoff of `sk-execute`, as ADR-0010 records. The other design-side extensions (a sealed review after a spec, a goal-backward verdict after a build, decision capture) arrive in later releases. Each one runs beside a superpowers skill; none replaces one. `sidekick profile` is here too, and launches a session with a folder of rules and chosen settings layers. So is `sidekick worker`, which dispatches a plan's worker and clears it away once its work is integrated.
