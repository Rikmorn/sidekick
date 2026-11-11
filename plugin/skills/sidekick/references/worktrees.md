# Worktrees

`sidekick worktree list` answers "keep or remove?" for every linked worktree of the repo, and says who works in the main checkout. It is read-only, and runs from the main checkout or any linked worktree. It exits 0 when it ran and 1 on a usage error or a git failure. `sidekick worktree move` puts a fresh worktree on the branch its work belongs on, as "What `move` does" says. `sidekick worktree remove` removes one worktree that `list` shows as `removable` or `folder gone`, as "What `remove` does" says.

## What `list` prints

After any warnings, the first line is the main checkout's. Then comes one line per linked worktree. Fields join with ` · `:

```
main checkout · in use by session 3f2a… · master · /repo
r10-x · removable · landed in milestone/r10-memory-and-parallel-sessions · worktree-r10-x · /repo/.claude/worktrees/r10-x
old-y · folder gone · only here, 3 commits · worktree-old-y · /repo/.claude/worktrees/old-y
feat · dirty: scratch.sh, notes.md · pushed to origin/feature-x · worktree-feat · /repo/.claude/worktrees/feat
w1 · a worker's: sidekick worker finish · worktree-w1 · /repo/.claude/worktrees/w1
s · held by pid 4242 · worktree-s · /repo/.claude/worktrees/s
```

A worktree row has these fields in order: the folder's name, the state, where the commits live, the branch (`detached` when none), and the path. A held or worker row has no commits field, since the check costs seconds and its answer would change nothing. With no linked worktrees, `list` prints `no linked worktrees` after the main checkout's line.

The main checkout's line reads `main checkout · <use> · <branch> · <path>`, with `detached` for a missing branch. `<use>` is one of three:

- `free`: no current session sits in the main checkout.
- `in use by session <id>`, with more sessions after a comma, each as `session <id>`: a current row of `claude agents --json --all` has its `cwd` in the main checkout and in no linked worktree.
- `unknown: <why>`: `claude agents` failed, or its listing was partial, so nothing says whether a session is there. An unreadable worker record does not make it unknown, since records name workers' worktrees.

After the worktree rows, when any row is `removable` or `folder gone`, the line `remove one with: sidekick worktree remove <name>` prints. Then a `backup refs:` line lists each ref under `refs/sidekick/` with `commit dated <date>`. The ref holds no creation date, so the date is its commit's. With no refs, nothing prints.

Warnings print before the rows:

- `claude agents failed, so every worktree that would otherwise read folder gone, dirty, or removable reads held, unknown: <reason>`. The listing runs with a 5-second limit. Without it, no session is known to be absent. So each worktree that no lock holds and no worker owns shows as `held, unknown: claude agents failed`, a missing folder included.
- `claude agents gave a partial listing, so every worktree that would otherwise read folder gone, dirty, or removable reads held, unknown: <warning>`, once per entry of the listing that does not parse or whose `pid` is not a number. A session may hide in it, so each worktree that nothing holds and no worker owns shows as `held, unknown: claude agents gave a partial listing: <warning>`.
- A worker record that does not parse. Any worktree may be that record's worker's, so each worktree that nothing holds and no worker owns shows as `held, unknown: a worker record would not read: <warning>`.
- A skip list that cannot be read.

After any of the first three warnings, no row reads `removable` or `folder gone`, so the hint does not print. The same holds when a current session lists no `cwd`.

`list` and `remove` read the same states, so they agree. The desk's count reads only the cheap checks: the locks, the session rows, and the worker records. So it can differ from `list` in two cases. It leaves out a worker record that it prunes as stale. It runs no git status, so it counts a worktree whose files git cannot read.

## The states

The first match wins, in this order.

| State | Meaning |
|---|---|
| `held by pid N` | The worktree's lock is Claude Code's, `claude session <name> (pid N …)`, and that process is alive. |
| `held by lock: <reason>` | Any other lock, one that names a pid included. Only Claude Code's own lock says what its pid means, so nothing says another is stale. |
| `held by session <id>` | A current row of `claude agents --json --all` has its `cwd` inside the worktree. This covers a worktree Claude Code did not lock. On macOS the paths compare with letter case aside, since its file system ignores case by default. That errs toward held. |
| `a worker's: sidekick worker finish` | A worker record names this worktree. The folder is the one Claude Code makes for that worker, or carries its name. Or the branch is `worktree-<name>`, or the worker's name itself. Clear it away with `sidekick worker finish`. |
| `held, unknown: claude agents failed` | Without the session rows, nothing says no session is in the worktree. |
| `held, unknown: claude agents gave a partial listing: …` | An entry of the listing would not parse, or its `pid` is not a number, so nothing says whether its process runs. Either entry may be a session in the worktree. |
| `held, unknown: a current session lists no cwd: <id>` | Nothing says where that session is, so it may be in the worktree. |
| `held, unknown: a worker record would not read: …` | The record may be this worktree's worker's. The state names the record. |
| `folder gone` | The folder is missing from disk. git also marks prunable a folder that lost its `.git` entry, and that folder reads `held, unknown` instead. |
| `held, unknown: <path> holds no .git entry, …` | Git run in that folder reads whatever repository encloses it, such as the main checkout, so nothing says the worktree is clean. |
| `held, unknown: …` | Git status, the flagged-file listing, or the ignored-file check failed, so nothing says the worktree is clean. |
| `dirty: <files>` | Tracked or untracked changes exist, or an ignored file that removal would lose. A flagged file counts too, which git status hides: a skip-worktree file with edits, or any assume-unchanged file on disk. Nothing can tell whether an assume-unchanged file holds edits. A missing flagged file is clean, since the commit holds its content. The line names the first 20 files, flagged ones first, then `and N more`. When the ignored-file scan stopped at its cap, the count is a lower bound and reads `and at least N more`, since the scan never walks further to count. |
| `removable` | No other state applies. |

A Claude Code session's lock whose pid is dead does not hold the worktree.

## Where the commits live

Both checks read local refs, as of the last fetch.

- `landed in <ref>`: the branch's content reached a target by merge, fast-forward, rebase, or squash, including work edited beside afterwards. The check compares content, not commit identity, so rebased hashes don't matter. It walks the target newest first, up to 200 commits that touched a file the branch changed. A landed change with an altered line, or one past that cap, reads as not landed. The targets are tried in this order: the `--into` ref when `remove` got one, the branch the main checkout holds, then `origin`'s default branch.
- `pushed to <ref>`: a remote-tracking ref contains the commit, such as `origin/feature-x`.
- `only here, N commits`: neither holds them. When `remove` deletes the worktree's own branch, or the `HEAD` is detached, a backup ref is then the only place they remain.
- `commits unknown: <why>`: git could not answer.

## The ignored-file check

`git worktree remove` deletes ignored files without a word, so `dirty` includes each ignored file that the main checkout lacks, or holds with other contents. The check lists ignored entries collapsed, drops the skipped ones, and expands only the rest.

Two skips are built in, at any depth: the `node_modules` folder, and the file `.DS_Store`, which Finder writes into each folder it opens. A folder named `.DS_Store` is checked as any other. The repo adds its own list at `<common git dir>/sidekick/disposable`. That file names folders only, one per line, relative to the repo's top. A `#` starts a comment, and a leading `./` and trailing `/` are dropped. Nothing is committed, so no team has to agree.

A skipped folder or `.DS_Store` file is unguarded: the check never looks at it, so a new file there goes with the worktree.

## What `move` does

`sidekick worktree move <branch> [--from <base>]` and `sidekick worktree move --pr <n>` move the worktree that holds the command's directory onto the branch its work belongs on. Claude Code makes a fresh worktree on `worktree-<name>`, a branch named for the folder. `move` puts the worktree on the branch you name, then deletes `worktree-<name>`, which holds no commits of its own. It never runs `reset`, `clean`, `branch -D`, or `--force`.

`move` runs only inside a linked worktree on `worktree-<name>`, with its `HEAD` still at that branch's creation commit and no tracked or untracked changes. Anything else refuses, so a worktree with work on it is never moved. Each refusal names what it found, exits 1, and changes nothing.

### Which move runs

| Kind | When | What `move` runs | Mark |
|---|---|---|---|
| `new branch` | `<branch>` exists neither locally nor on `origin` | `switch -c <branch> --no-track <start>`. The start is the creation commit, or the `--from` base. | `<branch>` |
| `existing branch` | A local branch no other worktree holds | `switch <branch>` | none, and a stale one cleared |
| `new branch for a held one` | A local branch another worktree holds | `switch -c <name> --no-track <the branch's commit>`, where `<name>` is the worktree's folder name | `<name>` |
| `tracking branch` | The branch exists on `origin` only | `fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>`, then `switch -c <branch> --no-track <fetched commit>`, then two `config` writes for `branch.<branch>.remote` and `branch.<branch>.merge` | none, and a stale one cleared |
| `pull request <n>, read-only` | `--pr <n>` | `fetch origin +refs/pull/<n>/head:refs/remotes/pr/<n>`, then `switch --detach refs/remotes/pr/<n>` | none |

Every `switch` carries `--no-overwrite-ignore`. The old branch goes last: `update-ref -d` deletes a checked-out branch and leaves `HEAD` unborn, so `move` switches first. Then it runs `update-ref -d refs/heads/worktree-<name> <creation commit>`, which refuses a branch that moved, and removes the branch's config section.

Git checks a branch out in one worktree at a time. So the held row makes a branch of the worktree's own name at the held branch's commit. Its line says `land onto <branch>`: the work belongs on the held branch. The `tracking branch` row sets its upstream by `config`. Under a narrow fetch refspec, `switch --track` exits 128 after it has changed the work tree. `move` never adds a fetch refspec, and `--no-track` means a `--from` base never becomes an upstream.

The `pull request` row's `refs/remotes/pr/<n>` stays after `remove`. A fetch with `--prune` leaves it, since a remote's default refspec covers only `refs/remotes/<remote>/`. A remote named `pr` is the exception: `git fetch --prune pr` deletes the ref, and a fetch from `pr` overwrites it with that remote's branch `<n>`. Drop one with `git update-ref -d refs/remotes/pr/<n>`.

`--from <base>` always creates a branch, so it refuses a `<branch>` that exists locally or on `origin`: drop `--from` to move onto it. A base is a branch, tag, or commit, read as the commit it names. A base written `<remote>/<b>` is fetched first, as `+refs/heads/<b>:refs/remotes/<remote>/<b>`, when `<b>` is a branch name git accepts as typed and no local branch has the whole name. Any other base, such as `origin/main~1`, resolves as a commit from the last fetch.

### The mark

`move` marks two branches: the `new branch` row's branch, and the held row's own-name branch. The `tracking branch` row stays unmarked, so `remove` keeps it. The mark is `git config --local branch.<branch>.sidekickWorktree <name>`, in the repo's shared config. `remove` deletes a branch only when it is the worktree's own: `worktree-<name>`, or a branch marked for that name. A branch marked for another name stays, as does an unmarked one. When the mark's write fails, `move` prints the `git config` line that sets it, and until then `remove` keeps the branch, the safe side.

A mark names a worktree by its folder's name, so it outlives a worktree that another tool removes. A later worktree of that name on the branch would then have `remove` delete it. So the `existing branch` and `tracking branch` rows read the branch's mark once the switch has run. They clear any mark they find. Only the `new branch` and held rows' branches are made for the worktree, while the `tracking branch` row copies a branch from `origin`. One case stays open: after a hand `git switch` onto a marked branch, in a worktree of the name the mark gives, `remove` deletes that branch.

### The line `move` prints

On success `move` prints one line and exits 0. Fields join with ` · `: the branch (`detached` for a pull request), the full commit, then the fields of its kind. The examples shorten the commit to `3f9a1c2…`.

```
feat-x · 3f9a1c2… · new branch · from the worktree's commit
feat-x · 3f9a1c2… · new branch · from origin/main
feat-x · 3f9a1c2… · existing branch · from feat-x
w1 · 3f9a1c2… · new branch for a held one · from feat-x · land onto feat-x
feat-x · 3f9a1c2… · tracking branch · from origin/feat-x
detached · 3f9a1c2… · pull request 42, read-only · from pr/42
```

The `from` field of a `new branch` line is the `--from` base as typed, or `the worktree's commit` without one. Skills read this line, so its fields and their order stay fixed.

When `move` clears a stale mark, it also prints one line to stderr, naming the key and the worktree the mark named. The stdout line stays as it is:

```
cleared the stale mark branch.feat-x.sidekickWorktree, which named the worktree w1: move leaves an existing or tracking branch unmarked, so remove keeps feat-x
```

### A re-run

A worktree that already moved prints one `already moved` line, fetches nothing, and exits 0:

```
feat-x · 3f9a1c2… · already moved
```

A worktree counts as moved when it is on `<branch>`, other than Claude Code's own. For the held row, it is on its own name's branch, marked for it, while another worktree holds `<branch>`. For `--pr <n>`, it is a detached `HEAD` at `refs/remotes/pr/<n>`. `move` checks for a re-run right after refusal 1, where it runs, and before every other refusal, the worker's included.

### What it refuses

The checks run in this order, and the first that fails stops `move`. The check for a re-run, as "A re-run" gives it, runs between 1 and 2:

1. It runs outside a repository, outside a work tree, in the main checkout, or in a folder git lists no worktree for.
2. A worker owns the worktree: `SIDEKICK_WORKER` is set, a worker record names the worktree, or an unreadable worker record may name it. `remove` refuses such a worktree too. A worker's brief sets its branch.
3. The worktree is on any branch but `worktree-<name>`, or its `HEAD` is detached. A held move whose mark failed prints the `git config` line that marks the branch, at the time it fails. This refusal gives no such line. A branch named for the worktree may be one `move` switched to, and marking it would have `remove` delete it. With the mark set, `move` onto the held branch reads as a re-run.
4. It has tracked or untracked changes. The refusal names the first 20 paths. Ignored files are not read, since `.worktreeinclude` copies some into every new worktree.
5. Its `HEAD` is not the creation commit of `worktree-<name>`, which is the oldest entry of that branch's reflog. The refusal names both commits, and counts the commits on top when `HEAD` is ahead.
6. git refuses `<branch>` as a name, or reads it as another, such as `@{-1}`.
7. `<branch>` is a remote's name, or begins with one and a slash, such as `origin/feat`. It would read as a remote's branch: name it without the remote.
8. `--from` with a `<branch>` that exists locally.
9. `<branch>` is `worktree-<name>`, the branch `move` replaces.
10. Another worktree holds `<branch>`, and git refuses `<name>` as a branch, as it refuses `HEAD` or a name that begins with a dot. The held row would name its branch `<name>`. Start a worktree under a name git takes as a branch, or land the work from another worktree.
11. Another worktree holds `<branch>`, and `<branch>` names no commit, so the held row has none to start from.
12. Another worktree holds `<branch>`, and a branch named `<name>` exists already.
13. `git ls-remote origin` fails, so `move` cannot tell whether `origin` has `<branch>`. It matches the full ref `refs/heads/<branch>` exactly, since a bare pattern also matches `foo/<branch>`. A repository with no remote named `origin` skips this check.
14. `--from` with a `<branch>` that exists on `origin`, or a base that names no commit.
15. `--pr` with no remote named `origin`.

Arguments that fit neither usage print the usage line and exit 1.

### When a step fails

A failed `fetch` leaves the worktree on `worktree-<name>`, and the output says so. `fetch` and `ls-remote` each stop after 60 seconds, with git's terminal prompts off. A call stopped that way fails as `git did not finish within 60 s`. A failed `switch` prints git's words and reads the worktree back. When git changed nothing, the output says to move or delete the files git names, then run `move` again. When git changed the work tree before it failed, the output names the branch `HEAD` is on and the count of changed paths. It then asks you to check `git status`.

`move` checks no ignored file beforehand, and refuses a switch that would overwrite one. A plain `git switch` replaces an ignored file that the target branch tracks, and exits 0. With `--no-overwrite-ignore`, git aborts and changes nothing. An ignored file that the target does not track never refuses, and stays where it is.

When a step after the switch fails, `move` exits 1 with no line on stdout. It says the worktree moved, names what is left undone, and prints the git command that finishes it. The steps are the mark, the upstream, and the deletion of `worktree-<name>`. A stale mark that will not clear is the one exception. `move` then exits 0 and prints its line, with the `git config --local --unset` line that clears the mark on stderr.

## What `remove` does

`sidekick worktree remove <name|path> [--into <target>] [--discard]` removes one linked worktree. The name is the path's last segment, as `list` prints it. Of the branches, it deletes only the worktree's own. That is `worktree-<name>`, the one Claude Code makes for a worktree of that name, or a branch that `sidekick worktree move` marked for that name. It keeps any other. Before it removes any worktree, it keeps the `HEAD` in a backup ref, the head of a branch it keeps included. It exits 0 once the worktree is gone, with its own branch, and 1 on a refusal, a usage error, or a git failure.

### What it refuses

Each refusal names what it found and deletes nothing. The checks run in this order. The last two rows' checks run after the backup ref is written, as "The steps" says.

| Refusal | Why |
|---|---|
| An `--into` target that names no local branch and no remote-tracking ref | `--into` takes an exact ref: a local branch such as `main`, else a remote-tracking ref such as `origin/main`. A revision such as `main~1` names no ref. This check runs before every other. |
| A name that matches no worktree, or several | It removes exactly one. When two share a name, give the path. |
| The main checkout | The repository lives there. |
| The worktree that holds the command's own directory | Leave it first: in a Claude Code session, `ExitWorktree` with `keep`. When `ExitWorktree` finds no worktree session to leave, close the session. In a shell, `cd` out. Then run `remove` from the main checkout. |
| An `--into` target that is the branch the worktree is on | That branch holds the worktree's head whether or not the work landed, so it shows nothing. Name the branch the work should land in. |
| A worktree with another worktree inside its folder | Removing the outer folder would delete the inner worktree's files. Remove the inner one first. |
| `claude agents` failed | Without the session rows, a worktree Claude Code did not lock looks free. The refusal gives the reason. |
| `held` or `a worker's`, in the order "The states" gives | A live session is in it or locks it, or a lock other than a Claude Code session's holds it. Or a worker owns it, a worker record would not read, or a check failed. The refusal names which, and names an unreadable record's file. `sidekick worker finish` clears a worker, with its session and record. |
| `dirty` | Removal would lose the files it names. When it names changed or ignored files, it also names the skip list's path, for an ignored folder that is safe to lose. Each kind of flagged file gets lines of its own, since `git add` alone refuses a skip-worktree file and stages nothing for an assume-unchanged one. For a skip-worktree file, clear the flag with `git update-index --no-skip-worktree -- <file>`, then commit the edit, or discard it with `git restore -- <file>`, and run `remove` again. For an assume-unchanged file, clear it with `--no-assume-unchanged`, then run `remove` again. |
| A `HEAD` that git cannot resolve to a commit | No backup ref could keep it. |
| `only here` or `commits unknown`, without `--discard`, on the worktree's own branch or a detached `HEAD` | The backup ref would be the only place the commits remain. The refusal counts them, and names the `--into` target it checked. A worktree on any other branch needs no `--discard`, since that branch stays and keeps them. |
| A `HEAD` that moved since the checks | A new commit is in no backup ref, and a detached one would go with the worktree. The refusal names both heads. Run `remove` again. |
| A file written since the checks | `remove` runs the `dirty` check again before `claude rm`, and once more right before git's removal. A new or changed file refuses with the `dirty` refusal. |

`--discard` is the operator's word that commits found nowhere else may go. It applies only when something would be lost: `remove` deletes the worktree's own branch, or the `HEAD` is detached. Landed or pushed work needs none, and neither does a worktree on a branch `remove` keeps. With it, the backup ref's kind is `discarded`. On a kept branch, the kind for those commits is `kept`.

### The steps

Once the checks pass, `remove` runs these in order, and the first that fails stops the rest:

1. It writes the backup ref `refs/sidekick/<kind>/<name>/<head>`, create-only, before it deletes anything. A kept branch gets one too, since `claude rm` or a hand may yet delete it. The kind comes from where the commits live: `landed` or `pushed`. Commits held only here, or where `remove` cannot tell, give `kept` when the branch stays, and `discarded` otherwise. A ref already holding the head counts as written, so a re-run passes. `<name>` is the folder's name, encoded so that git accepts any folder name. Each byte outside `[A-Za-z0-9._-]` is percent-encoded, as are the dots git refuses: a leading one, one before another, a trailing one, and the dot of `.lock`. A leading `-` is encoded too. So `my tree` becomes `my%20tree`, and a name already in that form stays as it is.
2. It reads the session rows, the worker records, the lock, the `HEAD`, and the worktree's files again. Anything that now holds the worktree refuses, as do a moved `HEAD` and a new or changed file, and the backup ref stays.
3. An exited background session whose `cwd` is the worktree's top, compared physically, goes first, by `claude rm <id>` with no time limit. When `claude rm` does not say `removed`, its text prints as a note, and git's removal follows. A session whose `cwd` is only inside the worktree stays, since it may belong to another worktree.
   When another linked worktree holds this one, `remove` skips `claude rm`, since the session may belong to the enclosing worktree, which nothing checked. A note names the session, which stays listed in `claude agents`.
4. If git still lists the worktree, `remove` reads its `HEAD` and its files once more, and a moved `HEAD` or a new or changed file refuses. Then it reads the lock afresh, since a session may lock the worktree during that check. Any lock but a Claude Code session's whose pid is dead refuses and stays. It unlocks that one, and runs `git worktree remove <path>`. A `folder gone` worktree goes the same way. When `claude rm` removed a session in step 3, a refusal here names it, and says that `remove` itself deleted no worktree and no branch.
5. When the worktree was on its own branch, `worktree-<name>` or one marked for that name, it deletes that branch. It runs `git update-ref -d` at the verified head, which refuses a branch that moved. Then it removes the `branch.<branch>` config section, the mark included. Any other branch stays, and a detached worktree has no branch to delete.

It prints `worktree <path> removed`, then `branch <branch> removed` for the branch it deleted. For a kept branch it prints `branch <b> kept: remove deletes only worktree-<name> or a branch sidekick worktree move made for this worktree`. The last line is the way back:

```
restore with: git branch worktree-r10-x refs/sidekick/landed/r10-x/<head>
```

For a detached worktree or a kept branch, the restore line names the worktree's name, encoded as in the ref, as the branch to create. The line prefixes that name with `restored-` where git refuses it as a branch, as it refuses `HEAD`. It does the same where a branch holds that name or nests under it, since git refuses `feat` beside `feat/x`. A kept branch often holds it, because `sk-worktree` names a worktree after its branch. When the prefixed name is taken too, the line adds `-` and the full head. The line quotes each word a POSIX shell would read otherwise, as `finish`'s does.

### What `--into` adds

`--into <target>` adds one ref to the landed check, tried before the main checkout's branch and `origin`'s default branch. It lets a worktree on its own branch, `feat-x` after `move`, show its work landed in a third branch, such as a milestone branch.

When the checks pass, `remove` prints `<branch> landed in <target>`, or `the detached HEAD at <path> landed in <target>` for a detached worktree. It prints that line only when `--into` was given and the work landed. The target it names is the first the check found, so it may be the main checkout's branch rather than the one you gave.

### It never forces

`remove` never runs `git worktree remove --force`, `git worktree prune`, or `git clean`. So git itself refuses a worktree with changes that git status lists, including changes made after the checks ran. Git deletes an ignored file without a word. It passes a flagged file whatever it holds, since git status hides one. So `remove` runs its `dirty` check again right before git's removal. Two kinds of file go unguarded. The skipped folders and `.DS_Store` files always do, since the check never looks at them. Any other ignored or flagged file goes unguarded only when written between that check and the removal. When git refuses, fix what it names, then run `remove` again. A backup ref already written counts, so the re-run goes on.
