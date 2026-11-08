# Workers

`sidekick worker` starts a plan's worker and clears it away. `dispatch` checks a brief, then starts `sk-worker` as a background session in a worktree of its own, with pushes blocked. `finish` runs once the worker's branch is integrated. It saves the run report to the brief's `report` path, then removes the worker's session, desk record, worktree, and branch. `sk-execute` §Hand off to a worker runs both, after the operator chooses the worker mode. `sk-worker` holds the worker's own rules.

Issues #206 and #218 in the `Rikmorn/sidekick` repo decided the shape. Most measurements behind these claims are in `docs/research/control-centre/2026-10-14-dispatched-worker-probes.md` in that repo, called "the dispatch probes" here. They ran on Claude Code 2.1.299. The report beside them, `2026-10-14-dispatched-worker-bench.md`, ran the verbs end to end on 2.1.300. It is called "the dispatch bench" here. The report `2026-10-15-desk-probes.md` in the same folder is called "the desk probes" here. It ran on 2.1.300 and grades each answer as measured or read. One answer cited here is a read.

## The verbs

```
sidekick worker dispatch <brief> --permission-mode <mode> [--profile <name>] [--plugin-dir <dir>] [--allow-push]
sidekick worker dispatch --check --permission-mode <mode> [--profile <name>] [--plugin-dir <dir>] [--allow-push]
sidekick worker finish (<brief> | --name <name>) [--no-report] [--into <rev> | --discard] [--worktree <path>]
```

- Both run from any checkout of the repo: the main checkout or a linked worktree, from its top or any folder under it. `dispatch` refuses inside a worker, where `SIDEKICK_WORKER` is set, naming Rikmorn/sidekick#255. `finish` runs its `claude` calls at the main checkout.
- A relative brief path resolves against the current folder. The worker receives the absolute path.
- `--permission-mode` is required. It takes the values `claude --permission-mode` accepts: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`, or `manual`. "The permission mode" says which one to pass.
- `--profile` names the profile the worker launches with, and defaults to `worker`. "A worker profile" suggests one.
- `--plugin-dir <dir>` loads a plugin folder in the worker, for an orchestrator that tests unreleased plugin content.
- `--allow-push` leaves out the push block, on the operator's word for that dispatch.
- `--check` runs the checks that need no brief and starts nothing; "What `--check` runs" says which. It takes no brief, and a brief given with it refuses with `--check takes no brief`.
- `--no-report` lets `finish` run without a run report, for a worker stopped before it wrote one, on the operator's word.
- `--into <rev>` names the commit the work must have landed in, in place of the brief's `target`. It takes a branch, a tag, or a commit. It refuses the worker's own branch, which holds its head whether or not the work landed.
- `--discard` clears a worker that did not land, on the operator's word. It excludes `--into`.
- `--name <name>` stands in for a brief that is gone. There is then no brief to say where the report goes or what the target is, so it needs `--no-report` or `--discard`, and `--into <rev>` in landed mode.
- `--worktree <path>` names the worker's worktree, and replaces every way `finish` would look for it. "How `finish` finds the worktree" says what that is. It also confirms a branch other than `worktree-<name>`, as "How `finish` finds the worktree" says.

`dispatch` exits 1 on a refusal, before the launch or after it. After the launch it refuses a worker on the wrong worktree, as "What it does" under `dispatch` says. Otherwise it exits with `claude`'s exit code, except that `dispatch --check` exits 0 on a pass without launching a worker. `finish` exits 0 only when every step succeeded.

## The brief

The brief is a Markdown file in the launching checkout, named `<plan>-brief.md`. The orchestrator writes it, `dispatch` checks it, and a dispatched worker relies on those checks and checks only its own worktree, as `sk-worker` §On start describes. A worker the operator starts checks the brief itself. It opens with a frontmatter between two `---` lines. The body follows, carrying the gate commands and their results at the baseline, and the run's limits: where the worker may write, what it may read, and the commands it may not run. Nothing parses it.

The frontmatter is flat `key: value` lines, a strict subset of YAML. The CLI parses it itself, since it ships no YAML parser. A key is lower-case letters, and the value is the rest of the line after the first `: `, trimmed. Blank lines are skipped, and Windows line endings and trailing spaces parse the same. Any other line, a repeated key, or an unknown key refuses the brief.

| Field | Required | Form |
|---|---|---|
| `name` | yes | `^[a-z0-9][a-z0-9-]{0,39}$`. The session name. Claude Code's own creation names the worktree folder and the branch from it, as `.claude/worktrees/<name>` and `worktree-<name>` |
| `plan`, `spec` | yes | Absolute paths to existing files inside the launching checkout or the main checkout |
| `rulings` | yes | An absolute path inside the launching checkout. The file may not exist yet; its folder must |
| `baseline` | yes | A commit, as 7 to 40 lower-case hex characters |
| `skill` | yes | `subagent-driven-development` or `executing-plans` |
| `place` | yes | `worktree`, `in-place`, or `branch <name>`. `dispatch` starts a worker only for `worktree` |
| `target` | on a branch | The branch the launching checkout holds, where the work lands. `finish` checks the landing against it. `dispatch` refuses a brief without it when the checkout holds a branch, and a brief with it on a detached `HEAD` |
| `workstream` | no | `^[a-z0-9][a-z0-9-]{0,63}$`. The memory workstream the worker belongs to. `sidekick` only checks its form. The memory hook and `sk-save` read it |
| `setup` | no | A shell command the worker runs where it works, before its scan |
| `report` | yes | A path relative to the repo top, with no `..` segment |
| `orchestrator` | yes | The orchestrating session's name, as `ListAgents` prints it |

A worktree starts with none of the launching checkout's git-ignored files. List the ones the gates need in a `.worktreeinclude` at the repo top. Claude Code copies them into each worktree it makes (the dispatch probes, "`.worktreeinclude` held"). `setup` is then left for what a command rebuilds, such as dependencies.

Ask each repo for short worktree guidance in a file every session loads, such as `AGENTS.md`, `CLAUDE.md`, or a project rule. It covers three things:

- **setup**, the command a fresh worktree runs once it is on its branch, which a brief's `setup` can repeat;
- **landing**, how work lands;
- **quirks**, what a worktree must not do.

`sk-worktree` reads that guidance first. Ask also that the repo's linters, builds, and container contexts ignore `.claude/worktrees/` without skipping the files inside a worktree.

## `dispatch`

### What it checks

`dispatch` refuses with every reason it finds, and exits 1. A brief that does not parse stops the checks there. Otherwise every one of these must hold:

- It runs outside a worker, as "The verbs" says.
- `plan` and `spec` exist, and the folder of `rulings` exists. The brief and the rulings file's folder lie in the launching checkout. The plan and the spec lie in the launching checkout or the main checkout. Each is judged by the checkout git says holds it, not by its path prefix.
- `place` is `worktree`.
- `baseline` resolves to the launching checkout's `HEAD`, and no tracked file there has uncommitted changes. Untracked files do not count. The worktree is made from that `HEAD`, so an uncommitted change would not reach the worker.
- `target` names the branch the launching checkout holds. A missing or different `target` refuses and gives the line to write. On a detached `HEAD`, a `target` key refuses.
- The name is free. No session in `claude agents --json --all` carries it, interactive sessions included, since a clash breaks addressing by name. Neither the folder `<main checkout>/.claude/worktrees/<name>` nor the branch `worktree-<name>`, which Claude Code's own creation would make, exists. A listing that does not parse is a refusal.
- Unless `--allow-push`, no remote sets an explicit `pushurl`, as "The push block" explains.
- `--permission-mode` is given and names a known mode, and `--plugin-dir`, when given, is an existing folder.
- The profile loads, composes with the overlay, and passes the checks `profile launch` runs, the settings check and the plugin dependency check among them. `references/profiles.md` describes them. A missing profile refuses with a hint to run `sidekick profile new <name> --description <text>`.
- Unless `--allow-push`, the profile's own `settings.env.GIT_CONFIG_COUNT`, when set, is a string of digits.
- `bypassPermissions` refuses a profile whose `settingSources` leaves out `user`. Claude Code refuses bypass in a background session unless user or managed settings record its acceptance. Such a profile drops that record (the dispatch probes, "Steering by message", from the docs).

### What `--check` runs

`dispatch --check` runs the checks under "What it checks" that read no brief, from the same checkout `dispatch` uses, and reports every reason at once. An orchestrator runs it before it offers a worker.

- It runs outside a worker.
- `HEAD` has a commit, and no tracked file has uncommitted changes.
- Unless `--allow-push`, no remote sets an explicit `pushurl`.
- `--permission-mode` is given and known, and `--plugin-dir`, when given, is an existing folder.
- The profile loads, composes with the overlay, and passes the checks `dispatch` runs, with `bypassPermissions`'s acceptance among them. The overlay's marker names a placeholder brief path in the launching checkout, and the overlay carries no `Read` rules. The profile's warnings print on stderr, as `dispatch` prints them before its launch.

It does not run the brief's checks (the files, `baseline`, `target`, `place`, and the name), the `claude agents` listing, or the `main:` lookup. Those stay at `dispatch`, so a pass does not promise that `dispatch` will pass.

A pass exits 0 and prints one line on stdout, naming the branch the checkout holds, or `detached HEAD at <short commit>`, the profile, and the mode:

```
dispatch can run here: <branch>, profile <name>, mode <mode>
```

A refusal prints the same lines `dispatch` prints on stderr and exits 1.

### What it does

Once the checks pass, `dispatch` acts in this order:

1. Unless git already ignores `.claude/worktrees/`, it appends that line to `<common git dir>/info/exclude`, and prints the line it added. If it cannot read or write that file, it refuses and starts nothing.
2. It spawns `claude` from the launching checkout's top, with the timeout `profile launch` uses:

   ```
   claude --add-dir <profile folder> --settings <json> [--setting-sources <list>]
     [--plugin-dir <dir>] --permission-mode <mode> --worktree <name> --bg -n <name>
     -- /sidekick:sk-worker --dispatched <absolute brief path>
   ```

3. It relays `claude`'s output, which names the job's id. Once `claude` exits 0, it writes the worker's record, with that id, as "The record" says. Every outcome of the check in step 4 keeps the record, so it comes first. A write that fails prints why and leaves the exit code alone. The worker runs, and only the desk loses sight of it.

4. It then checks the worktree the worker runs in. It reads the job's row in `claude agents --json --all` by that id, from the launching checkout. It then reads the entry `git worktree list` gives at the row's `cwd`. Three things must hold, with paths compared in their physical form:

   - the path is `<main checkout>/.claude/worktrees/<name>`, even for a launch from a linked worktree;
   - the branch is `worktree-<name>`;
   - the branch was created at `baseline`, as the oldest entry of its reflog says.

   The row's `cwd` finds the worktree, since a `WorktreeCreate` hook makes no `worktree-<name>` branch to find it by. The check reads up to 5 times, a second apart, each read limited to 10 seconds. It reads again while the row, its `cwd`, or a listed worktree there is missing. While the `cwd` is still the launching checkout or the main checkout, it reads up to 30 times. A slow creator keeps the `cwd` there until the worktree exists: a `WorktreeCreate` hook that slept 8 seconds did.

   When the check cannot run, it goes on as for a match: it prints the summary, then one line on stderr saying why. That happens when the output names no job id, or when a failing `claude agents` or `git worktree list` call ends the reads. It also happens when the last read still misses the row, its `cwd`, or a listed worktree there, or still finds the `cwd` at a checkout. So does a branch with no reflog. Then the worker's own start check of `HEAD` and the branch is the backstop.

   On a match, or when the check did not run, it prints a summary:

   ```
   main: <the main's name>
   worker <name> dispatched · permission mode <mode> · pushes blocked
   every tool call the worker makes is pre-approved
   lands in: <target> · launched from <launching checkout>
   steer: rulings in <rulings>, then message "<name>" to point at them
   finish: sidekick worker finish <absolute brief path>
   ```

   The `main:` line appears only when `dispatch` records a main, as "The overlay" says. The `lands in:` line names the brief's `target`, or says the `HEAD` is detached and the operator lands the work. It adds `launched from` only when the launching checkout is not the main checkout. When an interactive session dispatches under a listed name that does not hold yet, the line ends ` · sidekick holds this name once this session is idle; ← before then loses it`. The `every tool call` line appears only under `bypassPermissions`. With `--allow-push`, the `dispatched` line ends `pushes ALLOWED on the operator's word`.

   On a mismatch it runs `claude stop <id>` from the launching checkout, with a 10-second limit. The record stays, so the desk shows the stray worker and `finish --discard` finds it. It prints what it found against what it expected, with the likely cause, prints no summary, and exits 1. A wrong path or branch points at a `WorktreeCreate` hook. A wrong creation commit on the right path and branch points at `worktree.baseRef`. The last line gives the way out: `sidekick worker finish <brief> --discard`, after the hook's own removal for a hook-made worktree. A `claude stop` that fails says so, and the way out then starts with that stop.

`--worktree <name>` starts the session in its worktree from its first command (the dispatch probes, "Second round, after the design review"). Claude Code's own creation makes the worktree at `<main checkout>/.claude/worktrees/<name>`, on the branch `worktree-<name>`.

### The overlay

`dispatch` composes this overlay between the profile's settings and the keys `profile launch` adds:

```json
{
  "worktree": { "baseRef": "head" },
  "env": {
    "SIDEKICK_WORKER": "<absolute brief path>",
    "SIDEKICK_MAIN": "<the main's name>",
    "GIT_CONFIG_COUNT": "<n + 1>",
    "GIT_CONFIG_KEY_<n>": "url.sidekick-push-blocked::.pushInsteadOf",
    "GIT_CONFIG_VALUE_<n>": ""
  },
  "permissions": {
    "allow": ["Read(//<brief>)", "Read(//<plan>)", "Read(//<spec>)", "Read(//<rulings>)", "Skill(sidekick:sk-save)"],
    "deny": ["Bash(git push:*)"]
  }
}
```

- `n` is the profile's own `settings.env.GIT_CONFIG_COUNT`, or 0 when it sets none. So the block's entry follows the profile's own entries. `--allow-push` leaves out the three `GIT_CONFIG_*` keys and the deny rule.
- The `allow` rules let the worker read the brief, the plan, the spec, and the rulings file with no prompt. Each has a rule for its absolute path, and a second for its physical path when that differs. The rule `Skill(sidekick:sk-save)` lets the worker run `sk-save` with no prompt, at its end and when the context monitor asks. It is in `allow` with or without `--allow-push`. No other allow rule exists.
- `worktree.baseRef: "head"` branches the worktree from the launching checkout's `HEAD`. The default, `"fresh"`, would branch from the remote's default branch.
- `SIDEKICK_WORKER` marks the session as a worker, for the mods' role and for the context monitor. At the critical warning, the context monitor then tells it to carry on rather than stop to tell the user, since no one watches it. It also says to keep superpowers' ledger current and to re-read the brief after a compaction.
- `SIDEKICK_MAIN` names the worker's main: the dispatching session's name as `claude agents --json --all` lists it, or its session id's first 8 characters without one. A worker that dispatches passes its own main on. `dispatch` adds the key only when it runs inside a session. It spawns `claude` without either marker in its environment, so the overlay is their only way in. The worker's identity row names the main from it, as `docs/reference/USAGE.md` §Mains and workers in the `Rikmorn/sidekick` repo says.

## The push block

Three things keep a worker from pushing:

- **The instruction.** `sk-worker` §Git tells the worker never to push. That overrides a background session's default, which is to push its branch.
- **The rewrite.** The overlay's `GIT_CONFIG_*` entries turn every push URL into `sidekick-push-blocked::<url>`. Git reads that as a remote helper that does not exist, so the push fails and fetch still works.
- **The deny rule.** `Bash(git push:*)` refuses the plain spelling before it runs.

The dispatch probes measured the rewrite and the deny rule in a background session, under "The push block" and "Second round, after the design review". In a worktree session, Claude Code's isolation guard also refuses spellings that could dodge the deny rule, such as `git -C` and `sh -c "git …"`, before they run. `sk-parallel-sessions.md` §The isolation guard gives the spellings that pass. #229 in the `Rikmorn/sidekick` repo holds the measurements.

The block does not guard against these:

- **A spelling the deny rule misses,** such as `git -c <key>=<value> push`. The rewrite still fails it, unless the command lifts the rewrite itself. The deny rule did refuse `env git push` (the dispatch bench).
- **A worker that lifts the block on purpose.** The block stops the default push and accidental spellings, not a deliberate bypass. `git -c remote.origin.pushurl=<url> push origin HEAD` sets an explicit `pushurl`, so git skips the rewrite and the push lands. That was measured on 2026-10-14, in a plain shell with the block's `GIT_CONFIG_*` variables set, on git 2.50.1. The deny rule does not match a `git -c … push` spelling (the dispatch bench). Under `bypassPermissions` nothing prompts first, so against a worker set on pushing, only `sk-worker`'s instruction stands.
- **A remote with an explicit `pushurl`.** Git ignores `pushInsteadOf` for such a remote, so the rewrite does not apply and a push lands (measured). `dispatch` refuses such a repo unless `--allow-push`. It checks at dispatch only, so a `pushurl` set later is not caught.
- **`GIT_CONFIG_*` entries in another settings layer.** The block numbers its entry after the profile's own `GIT_CONFIG_COUNT`, and reads no other layer. Nothing checks that the worker's environment still holds the block. `--settings` outranked the project layer: an `env` key set in the repo's `.claude/settings.json` lost to the overlay's (the dispatch bench). Where `--settings` outranks a layer, the block's entries win, and that layer loses its entries at index n or higher. The block replaces the one at n, and its count of n + 1 drops the rest. The user and local layers were not measured, and a managed layer could still outrank the block.
- **A mod's `$.env.set`.** It changes the environment that every later Bash child inherits, so any installed mod can lift the rewrite. That was read in the mod API's types during #206's design, not run.
- **A raw `claude --bg`.** A session can start a worker with `claude --bg` or `sidekick profile launch --bg` and skip `dispatch`. Such a worker has no rewrite, no deny rule, and none of `dispatch`'s checks. Agent view lists every background session, such a worker included.
- **The mode choice.** `dispatch` cannot verify that the operator chose the worker mode. It is a Bash command that any session's model can run, so that choice rests on `sk-execute`'s text.

With `--allow-push`, only the instruction stays, and `dispatch` skips the `pushurl` check. Pass it only on the operator's word for that dispatch.

## The permission mode

Pass the orchestrating session's own mode. A message from a session in another permission mode can be held for approval, and expire undelivered. The dispatch probes measured that with a bypassing sender and a worker in the default mode ("Steering by message"). Under `bypassPermissions`, every tool call the worker makes is pre-approved, and `dispatch` says so.

## `finish`

`finish` reads the brief's `name`, `report`, and `target`, or takes the name from `--name`. It finds the worker's worktree and branch as "How `finish` finds the worktree" says. It removes the worker's session, desk record, worktree, and branch, and, unless `--discard`, only once the work has landed. It also requires the work to be committed and reported. Every branch it deletes stays in a backup ref, as "The backup refs" says. `finish` needs git 2.40 or later for its landed check, which passes git's `--attr-source` option.

### How `finish` finds the worktree

`finish` tries these places in order, and takes the first that is a linked worktree:

1. The first `cwd` in the worker's transcript, with the `gitBranch` of that entry.
2. The `cwd` in the job listing.
3. Failing both, the worktree git lists on the branch `worktree-<name>`.

A place that is detached, with no branch in the transcript, is skipped. `--worktree <path>` replaces all three as the only place it tries. A match counts only when it is a linked worktree, and neither the main checkout nor the brief's checkout. Under `--name`, the checkout that stands in for the brief's is the one holding the brief folder the worker's dispatch record names. Failing that, it is the linked checkout `finish` runs in. A worktree that git marks prunable is found, and the checks in "What it checks" run on it.

`finish` acts on a branch only with evidence that it is the worker's. The evidence is the transcript's `gitBranch`, Claude Code's own name `worktree-<name>`, or `--worktree`. A branch other than `worktree-<name>` refuses, in landed and discard mode, when `finish` found the worktree through the listing or through a transcript entry with no branch. The refusal names the worktree, its branch, and how `finish` found it, and gives `--worktree <path>` as the confirmation.

A `--worktree <path>` that matches nothing refuses in both modes. The refusal lists the linked worktrees git lists. When no place yields a worktree otherwise, landed mode refuses. The refusal lists each place it tried, and names `--worktree <path>` and `--discard`. Discard mode instead removes the worker's session and record, deletes no branch, and says to run `sidekick worktree list`, then `sidekick worktree remove <name>`, for a worktree the worker left. `remove` takes a worktree, never a lone branch. A branch left with no worktree holds the worker's commits, and blocks a new worktree of that name; `dispatch` refuses a name whose `worktree-<name>` exists. With no worktree it reads no lock, so it runs `claude stop <id>` whatever the job lists as. A `done` worker's idle process still holds the lock (the dispatch bench). `claude rm` keeps everything while the lock names a running process (the dispatch probes, "Stopping and cleanup"). When `claude rm` keeps the session there, `finish` names `claude stop <id>`, then `claude rm <id>`, as the hand route.

### What it checks

`finish` refuses, exits 1, and says why and what to do, unless every one of these holds:

- **One job.** Exactly one session in `claude agents --json --all` carries the name, and it is a background job with an id. An interactive session the operator started is not a job, so `finish` does not apply to it.
- **Linked.** If the worktree folder exists with no `.git` entry while git still lists it, a removal went past git's link to it. `finish` refuses with that one issue and names `claude rm <id>`.
- **On its branch.** The worktree has checked out the branch `finish` found for it: the transcript's `gitBranch`, else the branch git lists there. A worker that switched the worktree to another branch refuses.
- **Landed.** The target is `--into <rev>`, else the brief's `target`, else the `HEAD` of the brief's checkout, detached or not. `finish` prints which one it used, and why, as soon as the target resolves, before it walks the history. Any refusal then follows that line. `finish` accepts the first of three checks that passes. The branch's head is an ancestor of the target. Else a simulated merge of the head into the target's tip adds nothing. Else the same merge adds nothing against a commit in the target's history since the merge base. Only commits that touched a file the branch changed count, newest first, up to 200. So a rebase or squash landing counts, even after the target edited near the landed lines. The simulated merge reads no in-tree attributes. A landing that changed the worker's content refuses, as does a walk that reaches its cap. Nothing is lost: the worktree stays. The refusal names `sidekick worker finish <brief> --discard`, the operator's call. It names `claude rm <id>` instead when the branch does not exist, since `--discard` needs the branch.
- **Clean.** `git status` in the worktree lists nothing but the report, untracked files included. It also holds no ignored file that the main checkout lacks or holds with other contents, outside `node_modules`, `.DS_Store` files, and the folders in `<common git dir>/sidekick/disposable`. The report is exempt there too, and takes no place among the 20. The refusal names up to 20 such files, then `and at least 1 more` when the scan stopped there, as `sidekick worktree list` words it. It also names that list's path.
- **Reported.** The report exists at `<worktree>/<report>`, unless `--no-report`.
- **No other report.** No different file sits at `<the brief's checkout>/<report>`. An identical one is fine, so this check lets a re-run through.

With `--discard`, the landed check is skipped on the operator's word. The job, the branch, the on-branch check, the clean check, and the report all still hold, and so does the backup. In that mode, the off-branch and missing-branch refusals name `claude rm <id>` as the hand route. The uncommitted-work refusal does not name `claude rm <id>`: it says to commit the work so that the backup ref keeps it, or remove it, then run `finish` again.

### Its steps

The steps run in order, and the first that fails stops the rest. In landed mode the line `target: <name> (<why>)` comes first, printed during the Landed check in "What it checks". The steps follow it with the landing line, `<branch> landed in <name> at <short sha>`. In discard mode `finish` prints `<branch> is discarded on your word`. It then prints what became of the report, then each removal: the session, the worktree, and the branch. On a re-run that restores deleted files, a `restored N deleted files` line comes between the report line and the session line. Its last line names the backup ref, as "The backup refs" says.

1. It copies the report to `<the brief's checkout>/<report>`, creating its folders. That puts it beside the plan when the plan sits in that checkout too.
2. It stops the job with `claude stop <id>`. A worker whose turn has ended lists as `done` while its process idles and holds the worktree's lock (the dispatch bench). So `finish` skips the stop only when the listing says `stopped` or `done` and the process the lock names has exited. A failing `stop` refuses before anything is removed. `claude stop` keeps a 30-second limit.
3. It waits up to 15 seconds for the process that the worktree's lock names to exit. `claude rm` keeps a worktree whose lock names a running process (the dispatch probes, "Stopping and cleanup").
4. It checks the worktree again: its branch, that branch's head, its status, and the report. The worker may have run on after the first check, so a change there means nothing is removed.
5. It writes the backup ref for the verified head, create-only, and in a partial removal restores the deleted files from the index.
6. It runs `claude rm <id>` with no time limit, since any limit can cut its delete short. Output that starts `removed` succeeds. For commits that no remote holds, `claude rm` keeps the worktree and prints a `--discard-unpushed <sha>@<worktree id>` line. `finish` runs that line only when `<sha>` equals the head it verified. Any other answer refuses, printing `claude rm`'s text.
7. It deletes the worker's record, as "The record" says. A missing record is fine.
8. It checks with `git worktree list` whether the worktree is gone. When git still lists it, `finish` reads the lock. It unlocks a Claude Code session's lock whose process has exited, or removes a worktree with no lock, with `git worktree remove`. Before it, `finish` deletes the worktree's copy of the run report when the saved copy holds the same bytes. The saved copy may be this run's or an earlier run's. That one file only, since it would otherwise block the removal. Then it reads the worktree's files again, ignored ones included, as `sidekick worktree remove` does. Any file the removal would lose refuses, and the refusal names it. It reads the lock once more after that check, since a session may lock the worktree meanwhile, and unlocks only from that reading. Git deletes an ignored file without a word, so this check guards it. `finish` never passes `--force`, so git still refuses a worktree holding a change made after that check. A lock whose process runs keeps the refusal, as does any lock that is not a Claude Code session's, one naming a pid included. The record is forgotten by then, so each refusal before the worktree is gone ends with `sidekick worktree remove <path>`, to run once what stopped the removal is cleared. `remove` deletes only the worktree's own branch: `worktree-<folder>`, or a branch `sidekick worktree move` marked for that worktree. For a worker on any other branch, such as a worktrunk worker's, the line gains a clause. It says that `remove` leaves that branch in place, and writes a backup ref for its head first. It deletes a leftover branch with `git update-ref -d` at the verified head, which refuses a branch that moved, then removes the `branch.<branch>` config section.

The Bash tool stops a foreground call at 120 seconds by default and 600 at most, and `claude rm` may run longer. Run `finish` with the Bash tool's `run_in_background`.

After a failure, fix what it names and run `finish` again. A re-run works until `claude rm` succeeds, except for a worktree off Claude Code's own folder or branch, which `claude rm` refuses and the re-run never removes. It completes a removal that an earlier `claude rm` cut short. The exception is a cut that took the worktree's `.git` entry, which the Linked check refuses. When the worktree's only tracked changes are deleted files and a backup ref already holds the head, `finish` restores those files from the index before `claude rm`. An ignored file beside them still refuses, and names only itself; once it is gone, the re-run restores them. It counts a report already at `<the brief's checkout>/<report>` as saved. Without the backup ref, deleted files refuse as uncommitted work. After `claude rm` succeeds, `finish` no longer finds the job, so run `sidekick worktree list`, then `sidekick worktree remove <name>`, for a worktree left. `remove` takes no lone branch. A branch left with no worktree holds the worker's commits, and blocks a new worktree of that name; `dispatch` refuses it.

### The backup refs

Every `finish` writes `refs/sidekick/landed/<name>/<head>`, or `refs/sidekick/discarded/<name>/<head>` under `--discard`, before `claude rm`. `sidekick worktree remove` writes one too, before every removal. It adds two kinds: `refs/sidekick/pushed/<name>/<head>`, for commits a remote-tracking ref holds, and `refs/sidekick/kept/<name>/<head>`. That one is for commits on a branch it keeps, held only there or where it cannot tell. Its `<name>` is the folder's name, with each byte outside `[A-Za-z0-9._-]` percent-encoded, as are the dots git refuses and a leading `-`; a worker's name never needs that. The ref keeps the branch's commits after the branch is deleted. `sidekick worktree list` lists every ref under `refs/sidekick/` after its rows, with its commit's date. Restore one with `git branch <branch> <ref>`. Nothing prunes them.

### What it reads from `claude rm`

The exit code of `claude rm` does not say whether it removed or kept, so `finish` reads its text. It exited 0 as it kept a live session (the dispatch probes, "Stopping and cleanup"). It exited 1 as it kept a job that `finish` had stopped moments before, on Claude Code 2.1.300 on 2026-10-15. `finish` takes the discard offer whatever the exit code. With a worktree found, it runs the offer only when its sha is the verified head. With no worktree found, it has no verified head, so it runs no offer and prints it for you to check. That text belongs to agent view, as do `claude --bg`, `claude attach`, and `claude agents --json`. Claude Code's docs call agent view a research preview. If the text changes, `finish` fails closed: it prints what `claude rm` said and removes nothing more. It then names two ways on, in order: run `finish` again with the same flags, or complete the removal by hand. With a worktree found, the hand route is the discard line when `finish` ran one, else `claude rm <id>`. With no worktree found, it is `claude stop <id>`, then `claude rm <id>`, as "How `finish` finds the worktree" says. With a worktree found, the re-run comes first because it restores any files a cut-short `claude rm` deleted, then runs `claude rm` again. `claude rm` keeps a worktree with uncommitted changes, so a hand-run `claude rm <id>` likely keeps one with deleted files. The Claude Code docs say so, as the desk probes record under "What happens to uncommitted changes on a delete?". When a re-run meets the same unreadable answer, only the hand route is left until sidekick catches up. For a worktree off Claude Code's own folder or branch, `finish` skips both ways. It likely came from a `WorktreeCreate` hook, which `claude rm` will not remove, so `finish` prints the hook's own removal and then `finish --discard`.

### What it does not guard

Git-ignored files that the check skips go with the worktree: `node_modules` and `.DS_Store` files at any depth, and each folder in `<common git dir>/sidekick/disposable`. `finish` neither checks nor saves them. Only the commits, once landed, and the run report survive. Ignored files elsewhere refuse the removal while the main checkout lacks them or holds other contents, as §What it checks says. The branch stays as a backup ref. Anything worth keeping belongs in a commit or in the report, as `sk-worker` §At the end says.

## The record

`dispatch` leaves one file per worker for the desk, at `<common git dir>/sidekick/workers/<name>.json`. It sits inside the git directory, outside every work tree, so no commit or `git status` sees it.

```json
{ "version": 2, "name": "<name>", "main": "<main name or null>", "job": "<job id or null>", "brief": "<absolute brief path>", "dispatchedAt": "<ISO time>" }
```

- **The main** is the name `dispatch` gives the worker as `SIDEKICK_MAIN`: an inherited one, else the listing's name for the dispatching session, else its 8-character id. Outside a session it is `null`. A version 1 record, written before `main` existed, reads as `main: null`.
- **The job id** comes from the line `claude --bg` prints, `backgrounded · <id> · <name>`, measured on Claude Code 2.1.300. A bare `backgrounded <id>` counts when it is the only such line. Without either, `job` is `null`.
- **The desk** lists this main's own workers from these records. It adds the records with no main, and those whose main no longer runs, gone from the listing or stopped. `sidekick desk --json` joins each to its session in `claude agents --json --all`, by `job`, else by name. A worker whose session is gone still lists, as `gone`, with its marks for commits not integrated and uncommitted changes.
- **`finish`** deletes the record once `claude rm` has removed the session. A record whose session has left the listing and whose worktree is gone describes nothing, and `sidekick desk` deletes it.

## Steering and stopping

- **To steer,** write the ruling to the rulings file the brief names, then message the worker to point at it. The worker acts on the file, never on a message's text, as `sk-worker` §Rulings says. `dispatch` prints the line to use.
- **To stop** the worker, run `claude stop <id>`. Its worktree and branch stay until `finish` clears them, or the operator discards them with `sidekick worker finish <brief> --discard`.
- **To look in,** run `claude attach <id>`.

`claude agents --json --all` lists a stopped job with its id and name. `claude rm` takes the id, not the name (the dispatch probes, "Second round, after the design review").

## The fallback, without agent view

When agent view is unavailable, the operator starts the worker instead. The orchestrator writes the brief as for a dispatch, and the operator types `/sidekick:sk-worker <brief>` in a session of their own.

- **`place`.** `worktree` suits only a session whose settings set `worktree.baseRef` to `"head"`. That worker enters its worktree with `EnterWorktree`, which branches from that setting. The default, `"fresh"`, branches from the remote's default branch, so the worker lands off the baseline and blocks. Otherwise use `in-place` or `branch <name>`.
- **The guards.** No overlay reaches that session, so only `sk-worker` §Git's instruction blocks a push. The context monitor gives it the warning any session gets.
- **The run report.** `finish` does not apply, since it clears only a dispatched job. The orchestrator saves the run report to the brief's `report` path by hand, before any worktree that worker used is removed.

## A worker profile

`dispatch` launches the `worker` profile unless `--profile` names another. Create it once with `sidekick profile new worker --description "A worker dispatched by sk-execute"`, then set its model. A suggested `profile.json`:

```json
{
  "description": "A worker dispatched by sk-execute",
  "settings": { "model": "opus" }
}
```

- **The model.** `opus` is a reasoning model, as `sk-execute` §A plan carries intent asks of the session that runs a plan. Superpowers picks the models of the subagents it dispatches.
- **The user setting source.** The profile sets no `settingSources`, so it keeps the user layer. A worker under `bypassPermissions` needs that layer, which records the bypass acceptance.
- **The plugins.** The worker needs sidekick, superpowers, and code-review: `sk-worker` is sidekick's, it runs superpowers' execution skills, and sidekick depends on both. With the user layer kept, the plugins enabled there stay on. In a profile that turns plugins off under `settings.enabledPlugins`, keep those three on.
