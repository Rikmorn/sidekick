# Worktrees

`sidekick worktree list` answers "keep or remove?" for every linked worktree of the repo. It is read-only, and runs from the main checkout or any linked worktree. It exits 0 when it ran and 1 on a usage error or a git failure.

## What `list` prints

One line per linked worktree. The main checkout gets none. Fields join with ` · `:

```
r10-x · removable · landed in milestone/r10-memory-and-parallel-sessions · worktree-r10-x · /repo/.claude/worktrees/r10-x
old-y · folder gone · only here, 3 commits · worktree-old-y · /repo/.claude/worktrees/old-y
feat · dirty: scratch.sh, notes.md · pushed to origin/feature-x · worktree-feat · /repo/.claude/worktrees/feat
w1 · a worker's: sidekick worker finish · worktree-w1 · /repo/.claude/worktrees/w1
s · held by pid 4242 · worktree-s · /repo/.claude/worktrees/s
```

The fields run in this order: the folder's name, the state, where the commits live, the branch (`detached` when there is none), and the path. A held or worker row has no commits field, since the check costs seconds and its answer would change nothing. With no linked worktrees, `list` prints `no linked worktrees`.

After the rows, a `backup refs:` line lists each ref under `refs/sidekick/` with `commit dated <date>`. The ref holds no creation date, so the date is its commit's. With no refs, nothing prints. When any row is `removable` or `folder gone`, the last line is `remove one with: sidekick worktree remove <name>`.

Warnings print before the rows:

- `claude agents failed, so held states may be missing: <reason>`. The listing runs with a 5-second limit. Without it, a clean worktree shows as `held, unknown: claude agents failed`, since no session is known to be absent.
- A skip list that cannot be read, and a worker record that does not parse.

## The states

The first match wins.

| State | Meaning |
|---|---|
| `held by pid N` | The worktree's lock names a process that is alive. |
| `held by session <id>` | A current row of `claude agents --json --all` has its `cwd` inside the worktree. This covers a worktree Claude Code did not lock. |
| `held by lock: <reason>` | The lock names no pid, so nothing says it is stale. |
| `held, unknown: …` | Git status, the ignored-file check, or `claude agents` failed, so nothing says the worktree is free. |
| `a worker's: sidekick worker finish` | A worker record names this folder. Clear it away with `sidekick worker finish`. |
| `folder gone` | The folder is missing from disk, or git marks the entry prunable. |
| `dirty: <files>` | Tracked or untracked changes exist, or an ignored file that removal would lose. The line names the first 20 files, then `and more`. |
| `removable` | No other state applies. |

A lock whose pid is dead does not hold the worktree.

## Where the commits live

Both checks read local refs, as of the last fetch.

- `landed in <ref>`: the commits reached the branch the main checkout holds, or `origin`'s default branch, by merge, fast-forward, or squash.
- `pushed to <ref>`: a remote-tracking ref contains the commit, such as `origin/feature-x`.
- `only here, N commits`: neither holds them. Removal would leave them in a backup ref only.
- `commits unknown: <why>`: git could not answer.

## The ignored-file check

`git worktree remove` deletes ignored files without a word, so `dirty` includes each ignored file that the main checkout lacks, or holds with other contents. The check lists ignored entries collapsed, drops the skipped ones, and expands only the rest.

The skip list is `node_modules` at any depth, built in, plus the repo's own list at `<git common dir>/sidekick/disposable`. That file is one folder per line, relative to the repo's top. A `#` starts a comment, and a leading `./` and trailing `/` are dropped. Nothing is committed, so no team has to agree.

A skipped folder is unguarded: the check never looks inside it, so a new file there goes with the worktree.
