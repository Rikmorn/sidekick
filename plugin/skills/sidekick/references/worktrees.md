# Worktrees

`sidekick worktree list` answers "keep or remove?" for every linked worktree of the repo. It is read-only, and runs from the main checkout or any linked worktree. It exits 0 when it ran and 1 on a usage error or a git failure. `sidekick worktree remove` removes one worktree that `list` shows as `removable` or `folder gone`, as "What `remove` does" says.

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
| `dirty: <files>` | Tracked or untracked changes exist, or an ignored file that removal would lose. The line names the first 20 files, then `and N more`. When the ignored-file scan stopped at its cap, the count is a lower bound and reads `and at least N more`, since the scan never walks further to count. |
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

## What `remove` does

`sidekick worktree remove <name|path> [--discard]` removes one linked worktree, and keeps its commits in a backup ref first. The name is the path's last segment, as `list` prints it. It exits 0 once the worktree and its branch are gone, and 1 on a refusal, a usage error, or a git failure.

### What it refuses

Each refusal names what it found and changes nothing. The checks run in this order:

| Refusal | Why |
|---|---|
| A name that matches no worktree, or several | It removes exactly one. When two share a name, give the path. |
| The main checkout | The repository lives there. |
| The worktree that holds the command's own directory | Leave it first: in a Claude Code session, `ExitWorktree` with `keep`; in a shell, `cd` out. Then run `remove` from the main checkout. |
| A worktree with another worktree inside its folder | Removing the outer folder would delete the inner worktree's files. Remove the inner one first. |
| `claude agents` failed | Without the session rows, a worktree Claude Code did not lock looks free. |
| A worker record that does not parse | It may be this worktree's worker's, so nothing says the worktree is free. The refusal names the record. |
| `held` | A live session is in it, a lock names no pid, or a check failed. The refusal names which. |
| `a worker's` | `sidekick worker finish` clears a worker, with its session and record. |
| `dirty` | Removal would lose the files it names. It also names the skip list's path, for an ignored folder that is safe to lose. |
| `only here` or `commits unknown`, without `--discard` | The backup ref would be the only place the commits remain. The refusal counts them. |

`--discard` is the operator's word that commits found nowhere else may go. Landed or pushed work needs none. With it, the backup ref's kind is `discarded`.

### The steps

Once the checks pass, `remove` runs these in order, and the first that fails stops the rest:

1. It writes the backup ref `refs/sidekick/<kind>/<name>/<head>`, create-only, before it deletes anything. The kind is `landed`, `pushed`, or `discarded`, from where the commits live. A ref already holding the head counts as written, so a re-run passes.
2. It reads the session rows, the worker records, and the lock again. Anything that now holds the worktree refuses, and the backup ref stays.
3. An exited background session whose `cwd` is inside the worktree goes first, by `claude rm <id>` with no time limit. When `claude rm` does not say `removed`, its text prints as a note, and git's removal follows.
4. If git still lists the worktree, `remove` reads its lock once more. It unlocks a lock whose pid is dead, then runs `git worktree remove <path>`. A `folder gone` worktree goes the same way.
5. It deletes the branch with `git update-ref -d` at the verified head, which refuses a branch that moved. Then it removes the branch's `branch.<name>` config section. A detached worktree has no branch to delete.

It prints `worktree <path> removed`, then `branch <branch> removed`, and last the way back:

```
restore with: git branch worktree-r10-x refs/sidekick/landed/r10-x/<head>
```

For a detached worktree, the restore line names the worktree's name as the branch to create.

### It never forces

`remove` never runs `git worktree remove --force`, `git worktree prune`, or `git clean`. So git itself refuses a worktree with tracked or untracked changes, even changes made after the checks ran. When git refuses, fix what it names, then run `remove` again. The backup ref already written counts, so the re-run goes on.
