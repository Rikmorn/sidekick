# sk-* Parallel sessions

Sessions sharing a checkout move files and `HEAD` under each other, so a session needing its own seat works in a worktree Claude Code makes.

## Moving into a worktree

- Move on the operator's word, or when another live session has work on this checkout's branch.
- Move before writing a spec or plan. A worktree session cannot edit the main checkout.
- Use `EnterWorktree`, or `claude -w <name>` for a new session. Both copy what `.worktreeinclude` lists, and offer removal. A hand-built worktree gets neither.
- In a fresh worktree, run the repo's declared setup before any other command, even for a task with no gates. Without it, tools borrow the main checkout's packages. Link nothing from the main checkout: installs write through links.

## Bases

The repo's `worktree.baseRef` sets the base. `"fresh"`, the default, is the remote's default branch, from an `origin` up to a day old: fetch first. `"head"` is this checkout's `HEAD`. For the other base, start a new session with `claude -w <name> --settings '{"worktree":{"baseRef":"…"}}'`, from the branch's checkout for `"head"`.

## Support work

Support work, such as a production check, runs in its own worktree from the remote's default branch. "Go off main" asks for one, even when this checkout holds that branch. Removing it unchanged at the end is the operator's standing request: call `ExitWorktree` with `remove` without asking. Changed code instead becomes a branch landing by the repo's own route, and its worktree stays until then.

## The isolation guard

Claude Code refuses any command in a worktree, a subagent's too, whose text cannot show that git stays there. These pass:

- git with literal arguments; pipes, `&&`, and redirects are fine;
- no `$VAR` or `$(…)` beside git; elsewhere, spell paths out, or double-quote a value starting with literal text, as in `"./$f"`;
- no `git -C`, subshell around git, or heredoc chained with other commands;
- the Write tool for files, and `sed -i ''` on macOS;
- the main checkout read by absolute path, never through `cd`.

## Landing and leaving

- Land only in the target branch's owner checkout. From a worktree, hand the tested commit to its session or the operator; never move a branch another checkout holds.
- In a worktree, at superpowers' `finishing-a-development-branch`, offer only a pull request or keep, since merging locally changes into the main checkout. At its `using-git-worktrees` Project Setup, run the repo's setup, not `npm install`.
- `ExitWorktree` removes only a worktree this session made with `EnterWorktree`. Any other goes at the session's exit prompt.
