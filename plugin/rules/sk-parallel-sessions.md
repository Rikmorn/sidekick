# sk-* Parallel sessions

Sessions sharing a checkout move files and `HEAD` under each other. So a session that needs its own seat works in a worktree Claude Code makes, started and finished with `sk-worktree`.

## When to move

- Move on the operator's word, or when another live session works on this checkout's branch.
- Move before writing a spec or plan, since a worktree session cannot edit the main checkout.
- Support work, such as a production check, gets its own worktree from the remote's default branch. "Go off main" asks for one, even when this checkout holds that branch.

## Facts

- Git checks a branch out in one checkout at a time, and refuses a second checkout's switch to it. So work lands onto a held branch in the checkout that holds it.
- Landing in a checkout rewrites its files under every session working there.
- `ExitWorktree` acts only on a worktree this session made or entered with `EnterWorktree`, and elsewhere changes nothing. So a session launched with `claude -w` cannot step out.
- Claude Code makes each worktree inside the repo, under `.claude/worktrees/`, and copies in the git-ignored files `.worktreeinclude` lists. A worktree built by hand gets no copy. A scanner run from the main checkout, such as a linter, reaches into the nested worktrees unless it ignores that folder.
- A fresh worktree runs the repo's setup once it is on its branch, before other work. Without it, a tool that looks for packages in parent folders finds the main checkout's, since the worktree sits inside it. Link nothing from the main checkout: an install through a link writes the main checkout's files, under every session using them.
- Settings and denies reach every worktree and worker, `settings.local.json` included. Claude Code reads that file from the main checkout's root, so a change to it holds in every checkout.

## The isolation guard

Claude Code refuses any command in a worktree, a subagent's too, whose text cannot show that git stays there. These pass:

- git with literal arguments; pipes, `&&`, and redirects are fine;
- no `$VAR` or `$(…)` beside git; elsewhere, spell paths out, or double-quote a value starting with literal text, as in `"./$f"`;
- no `git -C`, subshell around git, or heredoc chained with other commands;
- the Write tool for files, and `sed -i ''` on macOS;
- the main checkout read by absolute path, never through `cd`.

## Rulings

- Remove an unchanged support worktree without asking, at the operator's standing request.
- A dispatched worker follows its brief: its `place` says where the work runs, and its `setup` what runs first. `sidekick worker finish` removes its worktree.
