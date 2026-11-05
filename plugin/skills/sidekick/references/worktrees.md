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

- `claude agents failed, so held states may be missing: <reason>`. The listing runs with a 5-second limit. Without it, no session is known to be absent. So each worktree that no lock holds and no worker owns shows as `held, unknown: claude agents failed`, a missing folder included.
- An entry of the listing that does not parse. A session may hide in it, so each worktree that nothing holds and no worker owns shows as `held, unknown: claude agents gave a partial listing: <warning>`.
- A worker record that does not parse. Any worktree may be that record's worker's, so each worktree that nothing holds and no worker owns shows as `held, unknown: a worker record would not read: <warning>`.
- A skip list that cannot be read.

After any of the first three warnings, no row reads `removable` or `folder gone`, so the hint does not print. The same holds when a current session lists no `cwd`. `remove` and the desk's count read the same states, so all three agree.

## The states

The first match wins, in this order.

| State | Meaning |
|---|---|
| `held by pid N` | The worktree's lock names a process that is alive. |
| `held by lock: <reason>` | The lock names no pid, so nothing says it is stale. |
| `held by session <id>` | A current row of `claude agents --json --all` has its `cwd` inside the worktree. This covers a worktree Claude Code did not lock. |
| `a worker's: sidekick worker finish` | A worker record names this folder. Clear it away with `sidekick worker finish`. |
| `held, unknown: claude agents failed` | Without the session rows, nothing says no session is in the worktree. |
| `held, unknown: claude agents gave a partial listing: …` | An entry of the listing would not parse, and may be a session in the worktree. |
| `held, unknown: a current session lists no cwd: <id>` | Nothing says where that session is, so it may be in the worktree. |
| `held, unknown: a worker record would not read: …` | The record may be this worktree's worker's. The state names the record. |
| `folder gone` | The folder is missing from disk, or git marks the entry prunable. |
| `held, unknown: …` | Git status or the ignored-file check failed, so nothing says the worktree is clean. |
| `dirty: <files>` | Tracked or untracked changes exist, or an ignored file that removal would lose. The line names the first 20 files, then `and N more`. When the ignored-file scan stopped at its cap, the count is a lower bound and reads `and at least N more`, since the scan never walks further to count. |
| `removable` | No other state applies. |

A lock whose pid is dead does not hold the worktree.

## Where the commits live

Both checks read local refs, as of the last fetch.

- `landed in <ref>`: the commits reached the branch the main checkout holds, or `origin`'s default branch, by merge, fast-forward, or squash.
- `pushed to <ref>`: a remote-tracking ref contains the commit, such as `origin/feature-x`.
- `only here, N commits`: neither holds them. When `remove` deletes the worktree's own branch, or the `HEAD` is detached, a backup ref is then the only place they remain.
- `commits unknown: <why>`: git could not answer.

## The ignored-file check

`git worktree remove` deletes ignored files without a word, so `dirty` includes each ignored file that the main checkout lacks, or holds with other contents. The check lists ignored entries collapsed, drops the skipped ones, and expands only the rest.

The skip list is `node_modules` at any depth, built in, plus the repo's own list at `<common git dir>/sidekick/disposable`. That file is one folder per line, relative to the repo's top. A `#` starts a comment, and a leading `./` and trailing `/` are dropped. Nothing is committed, so no team has to agree.

A skipped folder is unguarded: the check never looks inside it, so a new file there goes with the worktree.

## What `remove` does

`sidekick worktree remove <name|path> [--discard]` removes one linked worktree. The name is the path's last segment, as `list` prints it. Of the branches, it deletes only `worktree-<name>`, the one Claude Code makes for a worktree of that name, and keeps any other. Before it deletes that branch, or removes a worktree on a detached `HEAD`, it keeps the commits in a backup ref. It exits 0 once the worktree is gone, with its own branch, and 1 on a refusal, a usage error, or a git failure.

### What it refuses

Each refusal names what it found and deletes nothing. The checks run in this order. The last two rows' checks run after any backup ref is written, as "The steps" says.

| Refusal | Why |
|---|---|
| A name that matches no worktree, or several | It removes exactly one. When two share a name, give the path. |
| The main checkout | The repository lives there. |
| The worktree that holds the command's own directory | Leave it first: in a Claude Code session, `ExitWorktree` with `keep`; in a shell, `cd` out. Then run `remove` from the main checkout. |
| A worktree with another worktree inside its folder | Removing the outer folder would delete the inner worktree's files. Remove the inner one first. |
| `claude agents` failed | Without the session rows, a worktree Claude Code did not lock looks free. The refusal gives the reason. |
| `held` or `a worker's`, in the order "The states" gives | A live session is in it or locks it, or a lock names no pid. Or a worker owns it, a worker record would not read, or a check failed. The refusal names which, and names an unreadable record's file. `sidekick worker finish` clears a worker, with its session and record. |
| `dirty` | Removal would lose the files it names. It also names the skip list's path, for an ignored folder that is safe to lose. |
| A `HEAD` that git cannot resolve to a commit | No backup ref could keep it. |
| `only here` or `commits unknown`, without `--discard`, on `worktree-<name>` or a detached `HEAD` | The backup ref would be the only place the commits remain. The refusal counts them. A worktree on any other branch needs no `--discard`, since that branch stays and keeps them. |
| A `HEAD` that moved since the checks | A new commit is in no backup ref, and a detached one would go with the worktree. The refusal names both heads. Run `remove` again. |
| A file written since the checks | `remove` runs the `dirty` check again before `claude rm`, and once more right before git's removal. A new or changed file refuses with the `dirty` refusal. |

`--discard` is the operator's word that commits found nowhere else may go. It applies only when something would be lost: `remove` deletes `worktree-<name>`, or the `HEAD` is detached. Landed or pushed work needs none, and neither does a worktree on a branch `remove` keeps. With it, the backup ref's kind is `discarded`.

### The steps

Once the checks pass, `remove` runs these in order, and the first that fails stops the rest:

1. When `remove` deletes the branch, or the `HEAD` is detached, it writes the backup ref `refs/sidekick/<kind>/<name>/<head>`, create-only, before it deletes anything. The kind is `landed`, `pushed`, or `discarded`, from where the commits live. A ref already holding the head counts as written, so a re-run passes. A kept branch gets no ref, since nothing of it is deleted.
2. It reads the session rows, the worker records, the lock, the `HEAD`, and the worktree's files again. Anything that now holds the worktree refuses, as do a moved `HEAD` and a new or changed file, and any backup ref stays.
3. An exited background session whose `cwd` is inside the worktree goes first, by `claude rm <id>` with no time limit. When `claude rm` does not say `removed`, its text prints as a note, and git's removal follows.
   When another linked worktree holds this one, `remove` skips `claude rm`, since the session may belong to the enclosing worktree, which nothing checked. A note names the session, which stays listed in `claude agents`.
4. If git still lists the worktree, `remove` reads its `HEAD` and its files once more, and a moved `HEAD` or a new or changed file refuses. Then it reads the lock, unlocks a lock whose pid is dead, and runs `git worktree remove <path>`. A `folder gone` worktree goes the same way.
5. When the worktree was on `worktree-<name>`, it deletes that branch with `git update-ref -d` at the verified head, which refuses a branch that moved. Then it removes the branch's `branch.<name>` config section. Any other branch stays, and a detached worktree has no branch to delete.

It prints `worktree <path> removed`, then `branch <branch> removed` for the branch it deleted. For a kept branch it prints `branch <b> kept: remove deletes only worktree-<name>, the branch made for this worktree`. When it wrote a backup ref, the last line is the way back:

```
restore with: git branch worktree-r10-x refs/sidekick/landed/r10-x/<head>
```

For a detached worktree, the restore line names the worktree's name as the branch to create. A kept branch gets no restore line, since it still exists.

### It never forces

`remove` never runs `git worktree remove --force`, `git worktree prune`, or `git clean`. So git itself refuses a worktree with tracked or untracked changes, including changes made after the checks ran. Git deletes an ignored file without a word, so `remove` runs its `dirty` check again right before git's removal. Only an ignored file written between that check and the removal goes unguarded. When git refuses, fix what it names, then run `remove` again. A backup ref already written counts, so the re-run goes on.
