---
name: sk-worktree
description: "Start a session's worktree on any branch, and finish it: land the work on its target, then remove the worktree. Use in a main session to start, reopen, finish, or remove a worktree, or to go off main. Also use when superpowers' using-git-worktrees loads, or when finishing-a-development-branch loads in a linked worktree. In a dispatched worker, the brief answers instead."
---

# sk-worktree

This skill gives a main session a worktree of its own, on the branch its work belongs on. It also finishes one: the work lands on its target, then the worktree goes. The `sidekick worktree` verbs hold the deterministic part. Their contract is `../sidekick/references/worktrees.md`, relative to this skill's base directory. You and the operator settle which branch and which target. Each repo keeps its own flow in its worktree guidance.

In a dispatched worker, the brief answers this skill instead. Its `place` says where the work runs, and its `setup` what runs first. `sidekick worker finish` removes the worktree once the work is integrated. `move` and `remove` both refuse a worker's worktree.

## Entry

The operator types `/sidekick:sk-worktree …` as a session's prompt, with their words after it. Those words name what they want: a branch to start on, "go off main", a pull request, or done with a target. From the shell, `claude "/sidekick:sk-worktree …"` launches a session that runs it. `claude -w <name> "/sidekick:sk-worktree …"` launches one inside a new worktree. Superpowers' `using-git-worktrees` points here when it loads, and `finishing-a-development-branch` does in a linked worktree. In the main checkout, `finishing-a-development-branch` runs as written.

## The repo's guidance comes first

Read the repo's worktree guidance before acting. It may sit in any file every session loads, such as `AGENTS.md`, `CLAUDE.md`, or a project rule. It covers setup, the command a fresh worktree runs; landing, how work lands; and quirks, what a worktree must not do. Where it speaks, it wins over this skill's defaults. When the session loaded none, say so: start then runs no setup, and done asks for the target.

## Start

Where the session is decides how it enters. `sidekick worktree list` prints the main checkout's path, then each linked worktree with its branch.

- **In the main checkout**, call `EnterWorktree` with a short name from the branch, with no slash. The name becomes the folder's, and `move` and `remove` know a worktree by its folder's last segment. For a branch another checkout holds, choose a name other than the branch's, since `move` then makes a branch of the worktree's name.
- **In a fresh worktree from a `claude -w` launch**, stay. It is on `worktree-<name>`, at the commit it was made from, with no changes: the state `move` needs. Under `worktree.baseRef` `"fresh"`, that commit is `origin`'s default branch as of the last fetch: Claude Code fetches only once the repo has gone 24 hours unfetched. So a new branch `move` makes there can start up to a day stale, and `move <branch> --from origin/<default>` fetches first.
- **In a worktree that holds work**, that work stays where it is. Offer the operator a new session with `claude -w <name>`, or stepping out first with `ExitWorktree` `keep` when this session entered with `EnterWorktree`. `EnterWorktree` creates no worktree from inside a worktree session.

Then run `sidekick worktree move <branch>`, and the repo's setup after it. `move` goes first for two reasons. It refuses a worktree with any tracked or untracked change. And setup run before it would install the base's lockfile, not the branch's. So a setup line that says "first" means first once the worktree is on its branch. With no setup declared, say so and run nothing.

`move` reads the branch the operator names:

- a name found neither locally nor on `origin` becomes a new branch, at the commit the worktree was made from;
- a local branch no other checkout holds is switched to;
- a branch another checkout holds gets a new branch of the worktree's own name at its commit, for landing onto the held one later;
- a branch only `origin` has is fetched and tracked;
- `move --pr <n>` puts the worktree on a pull request's head, detached and read-only.

"Go off main" asks for a worktree from the remote's default branch, even when this checkout holds that branch. It is `move <branch> --from origin/<default>` for a new branch, such as one named for the worktree. `git symbolic-ref --short refs/remotes/origin/HEAD` prints `origin/<default>`. `move` fetches a remote base before it branches from it, so the base is current.

### What `move` prints

On success `move` prints one line, its fields joined by ` · `: the branch, the full commit, the kind, then `from` and the base. The held kind adds `land onto <branch>`, which names done's target. A worktree that already moved prints `already moved` and changes nothing. After a move, `ExitWorktree`'s text still names `worktree-<name>`, though the worktree is on the moved branch. So read the branch from `move`'s line or from git.

### When `move` refuses

Each refusal names what it found, exits 1, and changes nothing. Report it in the verb's words, or git's, and leave the choice to the operator: the fix turns on work only they know about. Every switch carries `--no-overwrite-ignore`, so git refuses a target branch that tracks a file ignored here, and names the file. Ask whether to move those files aside or delete them, then run `move` again. When a step after the switch fails, `move` says the worktree moved and prints the git command that finishes the step.

### The report

Report the worktree's path, its branch, the base from `move`'s `from` field, setup's result, and the way back. The way back is `claude -w <name>`, which launches a session in this worktree later.

## Reopen

A later session returns to a worktree by launching `claude -w <name>`, or by `claude --resume` on the session that worked there. Either starts in the worktree, so in a repo linked to the memory store the memory start hook picks up its workstream. In an open session, `EnterWorktree` with the worktree's `path` enters it too, without that pick-up.

## Done

Done lands the work on its target, then removes the worktree. Nothing lands, is discarded, or is removed without the operator's word. The one exception is an unchanged support worktree, such as one from "go off main": it goes without asking, at the operator's standing request.

The target comes from the operator, or from the repo's landing line; with neither, ask. The operator's ask for done is their word to land there. When done starts any other way, such as from `finishing-a-development-branch`, confirm the target first. Uncommitted work is a question too, since only the operator knows whether it belongs in a commit.

### Where the target lives

The route depends on which checkout holds the target, which `sidekick worktree list` shows. A fast-forward needs the target in the branch's history. When the target has moved on, bring the branch up to it from inside. Rebase an unpushed branch, or merge the target into a pushed one, so no push needs force.

| Target | Route |
|---|---|
| The remote | Push the branch. A pull request follows the repo's convention, and the worktree stays until it merges. A later done fetches, and `remove` then finds the work landed, squash merges included |
| A branch no checkout holds | From inside, `git push . HEAD:<target>`. Git fast-forwards the branch, and refuses a push that is not a fast-forward |
| The branch the main checkout holds | Read `list`'s main-checkout row from inside the worktree, before stepping out, since the row counts this session once its `cwd` is in the main checkout. A fast-forward moves files under any session there. So when the row reads `in use` or `unknown`, ask whether to land anyway, wait, or push instead. Then step out with `ExitWorktree` `keep`, and run `git merge --ff-only <worktree-branch>` in the main checkout. `<worktree-branch>` is the worktree's branch, the first field of `move`'s line, not the target |
| A branch another worktree holds | When `list` shows nothing holds that worktree, and it sits under `.claude/worktrees/`, enter it with `EnterWorktree` and its `path`. Fast-forward there, and step out with `keep`. Otherwise ask |

The worktree stays for a pull request because removing it at the push would delete the branch `move` marked. A review round would then bring the branch back through `move` as an unmarked tracking branch, which the next `remove` keeps.

### Removing the worktree

`remove` refuses the worktree that holds its own directory, so it runs once the session has stepped out. From the main checkout, run `sidekick worktree remove <name> --into <target>`. `--into` takes a local branch, or a remote-tracking ref such as `origin/main`. With the work landed, `remove` needs no `--discard`. It deletes the worktree's own branch, `worktree-<name>` or a branch `move` marked for it, and keeps any other. It keeps the head in a backup ref, and ends with a `restore with:` line; report its lines. Work that has not landed stays, or goes with `--discard` on the operator's word. For a worktree no session is in, `list`'s state says whether `remove` takes it as it stands.

An unchanged support worktree has no commits or changes of its own, so its commit is already in the base. Step out with `keep` and run `remove <name>`, in place of `ExitWorktree` `remove`. `remove` checks that the work landed, reads this commit as landed, and deletes the branch `move` marked.

### Ignored files

`git worktree remove` deletes ignored files without a word. So `remove`'s `dirty` check counts each ignored file the main checkout lacks, or holds with other contents. A spec or plan written under `docs/superpowers/` in the worktree is one. When `remove` refuses as `dirty` over such files, name them, and ask the operator whether to copy each into the main checkout or let it go. A copy with the same contents clears the check, and so does deleting the file. Where the main checkout holds a file with other contents, a copy replaces that version, so say which files those are.

### Stepping out

`ExitWorktree` waits for the user's ask, and running done is the operator's ask to step out. With `keep`, it returns the session to where it was before `EnterWorktree`, usually the main checkout, where `remove` runs.

`ExitWorktree` acts only on a worktree this session made or entered with `EnterWorktree`. Anywhere else it reports that no worktree session is active and changes nothing. In a session launched with `claude -w`, `ExitWorktree` does nothing, so the session cannot step out. It lands what it can from inside, by a push or by `git push .`, and hands the rest of done to a session in the main checkout. Tell the operator the target and what is left. `remove` refuses a worktree a live session holds. So the main checkout's session lands the rest and runs `remove` once this one is closed. Ask the operator to keep the worktree at Claude Code's exit prompt, so the checks fall to `remove`.
