# A background worktree launched from a linked worktree

Research for the `parallel-sessions` design, not yet planned. It answers one question: where does `claude --bg --worktree <name>` put its worktree when launched from a linked worktree, and what does it start from? That decides what `sidekick worker dispatch` needs before it can run from a feature worktree (#255's first half).

Run on 2026-10-31, on Claude Code 2.1.316, git 2.50.1, and sidekick at `c190201`.

## Method

1. In the sidekick repo, two temporary feature worktrees, each with an empty marker commit so its `HEAD` differs from `master`:
   - a sibling outside the repo, in an untrusted scratch folder, on branch `probe-sib` at `8766d5b`;
   - a nested one at `.claude/worktrees/probe-nest`, the way `claude -w` places them, on branch `worktree-probe-nest` at `ddb88e4`.
2. From each, the call `sidekick worker dispatch` makes, minus the profile, with `haiku` and a read-only prompt:

   ```sh
   claude --settings '{"worktree":{"baseRef":"head"},"permissions":{"deny":["Bash(git push:*)"]}}' \
     --model haiku --permission-mode bypassPermissions --worktree <name> --bg -n <session> -- "<prompt>"
   ```

   The prompt asked for `pwd`, `git rev-parse --show-toplevel`, `git rev-parse --abbrev-ref HEAD`, and `git log --oneline -2`.
3. Read `git worktree list`, `claude agents --json --all`, and each session's reply from its transcript.

An earlier attempt in a fresh scratch repository stopped at `Workspace not trusted`. Trusting it would have meant writing `~/.claude.json`, which every running session also writes, so the probe moved into the trusted sidekick repo instead.

## Results

All measured.

| Launched from | Worktree made at | Branch | Started from | Listing's `cwd` |
|---|---|---|---|---|
| The sibling, in an untrusted folder | `<sidekick>/.claude/worktrees/w-sib` | `worktree-w-sib` | `8766d5b`, the launching worktree's `HEAD` | The new worktree |
| The nested `.claude/worktrees/probe-nest` | `<sidekick>/.claude/worktrees/w-nest` | `worktree-w-nest` | `ddb88e4`, the launching worktree's `HEAD` | The new worktree |

- **Placement.** Claude Code puts the worktree under the main checkout's `.claude/worktrees/`, from either kind of linked worktree. It never nests one inside the launching worktree.
- **Base.** With `worktree.baseRef: "head"`, the worktree starts at the launching worktree's `HEAD`, not the main checkout's.
- **Trust.** A linked worktree of a trusted repository launched without the trust prompt, even from an untrusted folder.
- **The listing.** `claude agents --json --all` reports the session's `cwd` as its new worktree while it runs.
- **Removal.** `claude rm` removed each session, its worktree, and its `worktree-<name>` branch without asking, since neither session made a commit of its own.

## What follows for `dispatch`

Inferred from the results and from sidekick's code at `c190201`.

- Of everything `dispatch` and `finish` derive from the checkout's top, only the worker's folder is wrong from a feature worktree. They compute `<top>/.claude/worktrees/<name>` (`bin/helpers/worker-dispatch.ts:160-170`, `bin/helpers/worker-finish.ts:236-238`). Claude Code uses the main checkout's top.
- The baseline, the brief's bounds, and the integration target all come out as the feature worktree's, which is what a feature main wants.
- So lifting the refusal in `bin/helpers/worker-repo.ts:51-57` takes two changes. The folder comes from the main checkout's top, found through the common git folder. Everything else comes from the launching worktree's top.

## Cleanup

Both sessions were stopped and removed with `claude rm`. The two feature worktrees and their branches were removed with `git worktree remove` and `git branch -D`, and the scratch folder was deleted. `git worktree list` then showed only the main checkout. The probe's transcript folders under `~/.claude/projects/` remain; `claude purge <path>` clears one.
