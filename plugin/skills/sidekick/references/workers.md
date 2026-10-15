# Workers

`sidekick worker` starts a plan's worker and clears it away. `dispatch` checks a brief, then starts `sk-worker` as a background session in a worktree of its own, with pushes blocked. `finish` runs once the worker's branch is integrated. It saves the run report beside the plan, then removes the worker's session, desk record, worktree, and branch. `sk-execute` §Hand off to a worker runs both, after the operator chooses the worker mode. `sk-worker` holds the worker's own rules.

Issues #206 and #218 in the `Rikmorn/sidekick` repo decided the shape. Most measurements behind these claims are in `docs/research/control-centre/2026-10-14-dispatched-worker-probes.md` in that repo, called "the dispatch probes" here. They ran on Claude Code 2.1.299. The report beside them, `2026-10-14-dispatched-worker-bench.md`, ran the verbs end to end on 2.1.300. It is called "the dispatch bench" here.

## The verbs

```
sidekick worker dispatch <brief> --permission-mode <mode> [--profile <name>] [--plugin-dir <dir>] [--allow-push]
sidekick worker finish <brief> [--no-report]
```

- Both run in the main checkout, from its top or any folder under it. Inside a linked worktree they refuse, saying to run them from the main checkout.
- A relative brief path resolves against the current folder. The worker receives the absolute path.
- `--permission-mode` is required. It takes the values `claude --permission-mode` accepts: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`, or `manual`. "The permission mode" says which one to pass.
- `--profile` names the profile the worker launches with, and defaults to `worker`. "A worker profile" suggests one.
- `--plugin-dir <dir>` loads a plugin folder in the worker, for an orchestrator that tests unreleased plugin content.
- `--allow-push` leaves out the push block, on the operator's word for that dispatch.
- `--no-report` lets `finish` run without a run report, for a worker stopped before it wrote one, on the operator's word.

`dispatch` exits 1 on a refusal, and otherwise with `claude`'s exit code. `finish` exits 0 only when every step succeeded.

## The brief

The brief is a Markdown file beside the plan, named `<plan>-brief.md`. The orchestrator writes it, `dispatch` checks it, and the worker checks it again, as `sk-worker` §On start describes. It opens with a frontmatter between two `---` lines. The body follows, carrying the gate commands and their results at the baseline, and nothing parses it.

The frontmatter is flat `key: value` lines, a strict subset of YAML. The CLI parses it itself, since it ships no YAML parser. A key is lower-case letters, and the value is the rest of the line after the first `: `, trimmed. Blank lines are skipped, and Windows line endings and trailing spaces parse the same. Any other line, a repeated key, or an unknown key refuses the brief.

| Field | Required | Form |
|---|---|---|
| `name` | yes | `^[a-z0-9][a-z0-9-]{0,39}$`. The session name, the worktree folder `.claude/worktrees/<name>`, and the branch `worktree-<name>` |
| `plan`, `spec` | yes | Absolute paths to existing files inside the main checkout |
| `rulings` | yes | An absolute path inside the main checkout. The file may not exist yet; its folder must |
| `baseline` | yes | A commit, as 7 to 40 lower-case hex characters |
| `skill` | yes | `subagent-driven-development` or `executing-plans` |
| `place` | yes | `worktree`, `in-place`, or `branch <name>`. `dispatch` starts a worker only for `worktree` |
| `setup` | no | A shell command the worker runs where it works, before its scan |
| `report` | yes | A path relative to the repo top, with no `..` segment |
| `orchestrator` | yes | The orchestrating session's name, as `ListAgents` prints it |

## `dispatch`

### What it checks

`dispatch` refuses with every reason it finds, and exits 1. A brief that does not parse stops the checks there. Otherwise every one of these must hold:

- It runs in the main checkout, as "The verbs" says.
- `plan` and `spec` exist, the folder of `rulings` exists, and all three lie inside the main checkout.
- `place` is `worktree`.
- `baseline` resolves to the main checkout's `HEAD`, and no tracked file has uncommitted changes. Untracked files do not count. The worktree is made from `HEAD`, so an uncommitted change would not reach the worker.
- The name is free. No session in `claude agents --json --all` carries it, interactive sessions included, since a clash breaks addressing by name. Neither the folder `.claude/worktrees/<name>` nor the branch `worktree-<name>` exists. A listing that does not parse is a refusal.
- Unless `--allow-push`, no remote sets an explicit `pushurl`, as "The push block" explains.
- `--permission-mode` is given and names a known mode, and `--plugin-dir`, when given, is an existing folder.
- The profile loads, composes with the overlay, and passes the checks `profile launch` runs, the settings check and the plugin dependency check among them. `references/profiles.md` describes them. A missing profile refuses with a hint to run `sidekick profile new <name> --description <text>`.
- Unless `--allow-push`, the profile's own `settings.env.GIT_CONFIG_COUNT`, when set, is a string of digits.
- `bypassPermissions` refuses a profile whose `settingSources` leaves out `user`. Claude Code refuses bypass in a background session unless user or managed settings record its acceptance. Such a profile drops that record (the dispatch probes, "Steering by message", from the docs).

### What it does

Once the checks pass, `dispatch` acts in this order:

1. Unless git already ignores `.claude/worktrees/`, it appends that line to `<common git dir>/info/exclude`, and prints the line it added. If it cannot read or write that file, it refuses and starts nothing.
2. It spawns `claude` from the repo top, with the timeout `profile launch` uses:

   ```
   claude --add-dir <profile folder> --settings <json> [--setting-sources <list>]
     [--plugin-dir <dir>] --permission-mode <mode> --worktree <name> --bg -n <name>
     -- /sidekick:sk-worker <absolute brief path>
   ```

3. It relays `claude`'s output, which names the job's id. Once `claude` exits 0, it prints a summary:

   ```
   worker <name> dispatched · permission mode <mode> · pushes blocked
   every tool call the worker makes is pre-approved
   steer: rulings in <rulings>, then message "<name>" to point at them
   finish: sidekick worker finish <absolute brief path>
   ```

   The second line appears only under `bypassPermissions`. With `--allow-push`, the first line ends `pushes ALLOWED on the operator's word`.

4. Once `claude` exits 0, it writes the worker's record, with the job's id from that output, as "The record" says. A write that fails prints why and leaves the exit code as `claude`'s. The worker runs, and only the desk loses sight of it.

`--worktree <name>` starts the session in its worktree from its first command (the dispatch probes, "Second round, after the design review"). The worktree's branch is `worktree-<name>`.

### The overlay

`dispatch` composes this overlay between the profile's settings and the keys `profile launch` adds:

```json
{
  "worktree": { "baseRef": "head" },
  "env": {
    "SIDEKICK_WORKER": "<absolute brief path>",
    "GIT_CONFIG_COUNT": "<n + 1>",
    "GIT_CONFIG_KEY_<n>": "url.sidekick-push-blocked::.pushInsteadOf",
    "GIT_CONFIG_VALUE_<n>": ""
  },
  "permissions": { "deny": ["Bash(git push:*)"] }
}
```

- `n` is the profile's own `settings.env.GIT_CONFIG_COUNT`, or 0 when it sets none. So the block's entry follows the profile's own entries. `--allow-push` leaves out the three `GIT_CONFIG_*` keys and the deny rule.
- `worktree.baseRef: "head"` branches the worktree from the main checkout's `HEAD`. The default, `"fresh"`, would branch from the remote's default branch.
- `SIDEKICK_WORKER` marks the session as a worker. At the critical warning, the context monitor then tells it to carry on rather than stop to tell the user, since no one watches it. It also says to keep superpowers' ledger current and to re-read the brief after a compaction.

## The push block

Three things keep a worker from pushing:

- **The instruction.** `sk-worker` §Git tells the worker never to push. That overrides a background session's default, which is to push its branch.
- **The rewrite.** The overlay's `GIT_CONFIG_*` entries turn every push URL into `sidekick-push-blocked::<url>`. Git reads that as a remote helper that does not exist, so the push fails and fetch still works.
- **The deny rule.** `Bash(git push:*)` refuses the plain spelling before it runs.

The dispatch probes measured the rewrite and the deny rule in a background session, under "The push block" and "Second round, after the design review". In a worktree session, Claude Code also refuses `git -C` and `sh -c "git …"` before they run. It refused a line that mixed git with a shell variable too (the dispatch bench).

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

`finish` reads the brief's `name` and `report`. The worktree is `<top>/.claude/worktrees/<name>`, and the branch is `worktree-<name>`. It removes nothing that is not integrated, committed, and reported.

### What it checks

`finish` refuses, exits 1, and says why and what to do, unless every one of these holds:

- **One job.** Exactly one session in `claude agents --json --all` carries the name, and it is a background job with an id. An interactive session the operator started is not a job, so `finish` does not apply to it.
- **On its branch.** The worktree has `worktree-<name>` checked out.
- **Integrated.** The branch's head is an ancestor of the main checkout's `HEAD`. A squash or rebase merge rewrites the commits, so `finish` refuses after one. Nothing is lost: the worktree stays, and discarding it is the operator's call, through `claude rm <id>`.
- **Clean.** `git status` in the worktree lists nothing but the report, untracked files included.
- **Reported.** The report exists at `<worktree>/<report>`, unless `--no-report`.
- **No other report.** No different file sits at `<top>/<report>`. An identical one is fine, so this check lets a re-run through.

### Its steps

The steps run in order, and the first that fails stops the rest. `finish` prints what became of the report, then each removal: the session, the worktree, and the branch.

1. It copies the report to `<top>/<report>`, creating its folders.
2. It stops the job with `claude stop <id>`. A worker whose turn has ended lists as `done` while its process idles and holds the worktree's lock (the dispatch bench). So `finish` skips the stop only when the listing says `stopped` or `done` and the process the lock names has exited. A failing `stop` refuses before anything is removed.
3. It waits up to 15 seconds for the process that the worktree's lock names to exit. `claude rm` keeps a worktree whose lock names a running process (the dispatch probes, "Stopping and cleanup").
4. It checks the worktree again: its branch, that branch's head, its status, and the report. The worker may have run on after the first check, so a change there means nothing is removed.
5. It runs `claude rm <id>`, and output that starts `removed` succeeds. For commits that no remote holds, `claude rm` keeps the worktree and prints a `--discard-unpushed <sha>@<worktree id>` line. `finish` runs that line only when `<sha>` equals the head it verified as integrated. Any other answer refuses, printing `claude rm`'s text.
6. It deletes the worker's record, as "The record" says. A missing record is fine.
7. It confirms with `git worktree list` that the worktree is gone. It deletes a leftover branch with `git branch -d`, which refuses an unmerged branch.

After a failure, fix what it names and run `finish` again. A re-run works until `claude rm` succeeds. After that, `finish` no longer finds the job, so clear any worktree or branch left by hand.

### What it reads from `claude rm`

The exit code of `claude rm` does not say whether it removed or kept, so `finish` reads its text. It exited 0 as it kept a live session (the dispatch probes, "Stopping and cleanup"). It exited 1 as it kept a job `finish` had just stopped, on Claude Code 2.1.300 on 2026-10-15. `finish` takes the discard offer whatever the exit code, and still runs it only when its sha is the verified head. That text belongs to agent view, as do `claude --bg`, `claude attach`, and `claude agents --json`. Claude Code's docs call agent view a research preview. If the text changes, `finish` fails closed: it prints what `claude rm` said and removes nothing more. Cleanup is then manual until sidekick catches up.

### What it does not guard

Git-ignored files in the worktree go with it. `git status` does not list them, so `finish` neither sees nor saves them. They include `node_modules`, and scratch under `docs/superpowers/` or a superpowers workspace where the repo ignores those. Only the commits, once integrated, and the run report survive. Anything worth keeping belongs in a commit or in the report, as `sk-worker` §At the end says.

## The record

`dispatch` leaves one file per worker for the desk, at `<common git dir>/sidekick/workers/<name>.json`. It sits inside the git directory, outside every work tree, so no commit or `git status` sees it.

```json
{ "version": 1, "name": "<name>", "job": "<job id or null>", "brief": "<absolute brief path>", "dispatchedAt": "<ISO time>" }
```

- **The job id** comes from the line `claude --bg` prints, `backgrounded · <id> · <name>`, measured on Claude Code 2.1.300. A bare `backgrounded <id>` counts when it is the only such line. Without either, `job` is `null`.
- **The desk** lists the repository's workers from these records. `sidekick desk --json` joins each to its session in `claude agents --json --all`, by `job`, else by name. A worker whose session is gone still lists, as `gone`, with its marks for commits not integrated and uncommitted changes.
- **`finish`** deletes the record once `claude rm` has removed the session. A record whose session has left the listing and whose worktree is gone describes nothing, and `sidekick desk` deletes it.

## Steering and stopping

- **To steer,** write the ruling to the rulings file the brief names, then message the worker to point at it. The worker acts on the file, never on a message's text, as `sk-worker` §Rulings says. `dispatch` prints the line to use.
- **To stop** the worker, run `claude stop <id>`. Its worktree and branch stay until `finish` clears them, or the operator discards them with `claude rm <id>`.
- **To look in,** run `claude attach <id>`.

`claude agents --json --all` lists a stopped job with its id and name. `claude rm` takes the id, not the name (the dispatch probes, "Second round, after the design review").

## The fallback, without agent view

When agent view is unavailable, the operator starts the worker instead. The orchestrator writes the brief as for a dispatch, and the operator types `/sidekick:sk-worker <brief>` in a session of their own.

- **`place`.** `worktree` suits only a session whose settings set `worktree.baseRef` to `"head"`. That worker enters its worktree with `EnterWorktree`, which branches from that setting. The default, `"fresh"`, branches from the remote's default branch, so the worker lands off the baseline and blocks. Otherwise use `in-place` or `branch <name>`.
- **The guards.** No overlay reaches that session, so only `sk-worker` §Git's instruction blocks a push. The context monitor gives it the warning any session gets.
- **The run report.** `finish` does not apply, since it clears only a dispatched job. The orchestrator saves the run report beside the plan by hand, before any worktree that worker used is removed.

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
