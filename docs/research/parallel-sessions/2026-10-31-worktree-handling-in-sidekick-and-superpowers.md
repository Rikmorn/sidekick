> Research for the `parallel-sessions` design, not yet planned. Gathered on 2026-10-31 by a research subagent for the operator. It read sidekick at `c190201`, superpowers 6.4.1, and Claude Code 2.1.316. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Worktree handling in sidekick and superpowers (2026-10-31)

This report maps how worktrees are made, used, and removed today. Three parties act on them: superpowers' skills, Claude Code itself, and sidekick's skills, hooks, and CLI. It proposes no design.

Every claim carries one of three labels:

- **Verified:** read at the line named, or run, on 2026-10-31. Sidekick paths are at `c190201`. Superpowers paths sit under its 6.4.1 cache folder, some with `skills/` left off.
- **Cited:** measured or read by the record named. The line was read here; the measurement was not re-run.
- **Inferred:** reasoned from verified or cited facts. Nothing tested it.

After its first full path, a file goes by its name alone.

## Sources

Sidekick, at `c190201` (`git rev-parse HEAD`):

- `plugin/skills/sk-execute/SKILL.md`
- `plugin/skills/sk-worker/SKILL.md` and `references/run-report.md`
- `plugin/skills/sidekick/SKILL.md`, and its `references/workers.md`, `references/profiles.md`, and `references/docs-layout.md`
- `plugin/hooks/hooks.json`, `session-start`, `post-skill`, `role.ts`, `publish/contract.ts`, `desk/desk.ts`, `desk/keys.ts`, `board/board.ts`, and `scope/scope.ts`
- A search of `plugin/hooks/` for "worktree", which matched no file
- `bin/cli.ts`, and in `bin/helpers/`: `worker.ts`, `worker-repo.ts`, `worker-dispatch.ts`, `worker-finish.ts`, `worker-overlay.ts`, `worker-record.ts`, `worker-jobs.ts`, `worker-brief.ts`, `main-session.ts`, `profile-launch.ts`, `profile.ts`, `profile-store.ts`, `rules.ts`, `hook.ts`, `pm.ts`, `desk.ts`, `desk-children.ts`, `desk-snapshot.ts`, and `desk-transcripts.ts`
- `AGENTS.md`, `.worktreeinclude`, `.gitignore`, `.claude/README.md`, and the top-level keys of `.claude/settings.json` and `.claude/settings.local.json`
- `docs/reference/LOOP.md` and `docs/reference/USAGE.md`
- `docs/designs/memory/design.md`, its mechanism facts K6, K7, K13, and K20
- `docs/research/control-centre/2026-10-14-dispatched-worker-probes.md`, called "the dispatch probes" here
- `docs/research/control-centre/2026-10-14-dispatched-worker-bench.md`, called "the dispatch bench" here
- `docs/research/control-centre/2026-10-22-main-and-worker-probes.md`, called "the main and worker probes" here
- `docs/research/memory/2026-10-30-claude-code-mechanisms.md` §2, and `docs/research/memory/2026-10-31-auto-memory-location-probes.md`
- Issues in `Rikmorn/sidekick`, read with `gh issue view --comments`: #123, #206, #218, #228, and #229, all closed, and #248, #252, #255, #266, and #267, all open

Superpowers 6.4.1, at `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/`. The version is the one its `package.json` and `.claude-plugin/plugin.json` state.

- `skills/using-git-worktrees/SKILL.md`, the only file in that folder
- `skills/finishing-a-development-branch/SKILL.md`, the only file in that folder
- `skills/subagent-driven-development/SKILL.md`, `scripts/sdd-workspace`, and `scripts/task-brief`
- `skills/executing-plans/SKILL.md`, `scripts/task-start`, and `scripts/task-done`
- `skills/writing-plans/SKILL.md`, `skills/brainstorming/SKILL.md`, and `skills/dispatching-parallel-agents/SKILL.md`
- `skills/using-superpowers/references/codex-tools.md`
- A search of `skills/` for "worktree" and for "isolation"

Claude Code:

- The installed build, `2.1.316 (Claude Code)` from `claude --version`. The `worktree` settings schema and the isolation guard's messages were read as text in its binary, `~/.local/share/claude/versions/2.1.316`.
- The mod API declarations in `.cache/claude-code-types/2.1.312.d.ts`, the newest build cached. They cover `$.store`, `$.state`, `$.process.run`, `$.session.repo`, `EnterWorktree`, `ExitWorktree`, and the `WorktreeCreate` and `WorktreeRemove` hooks.
- A listing of `~/.claude/projects/` for this repo's folders.

One probe ran: two `git worktree add` calls in a fresh repo under this session's scratchpad, with git 2.50.1. The repo was deleted afterwards.

## Summary

| Question | Answer |
|---|---|
| 1. What `using-git-worktrees` decides | It detects existing isolation, asks consent, and prefers the harness's tool. Its fallback is `.worktrees/<branch>`. Then it installs dependencies and runs the baseline tests. It cleans nothing up; `finishing-a-development-branch` does. `subagent-driven-development` and `executing-plans` call it at Setup |
| 2. How sidekick relates to it | Sidekick never invokes it in code. `sk-worker` overrides its consent, Project Setup, and finishing steps by text. `sidekick worker dispatch` bypasses it with `claude --worktree`. No sidekick hook fires on either skill |
| 3. A dispatched worker's worktree | `claude --bg --worktree <name>` makes `.claude/worktrees/<name>` on `worktree-<name>`, from `HEAD` under the overlay's `worktree.baseRef`. `finish` checks ancestry, then removes through `claude rm`. Its open failures are #266 and #267; dispatch's are #248, #252, and #255 |
| 4. Two interactive sessions in one repo | No guard covers them. Claude Code's isolation guard covers background sessions; sidekick's checks cover dispatched workers. Several stores are shared by every checkout of the repo |
| 5. What is keyed by what | Worker records, auto-memory, and the local settings file key on the repository. Profiles, the superpowers workspace, transcripts, and board drift key on the checkout. `$.store` keys on the session id |

## 1. What `using-git-worktrees` decides

### Step by step

| Step | What it decides | Where | Label |
|---|---|---|---|
| 0. Detect | It compares `git rev-parse --git-dir` with `--git-common-dir`, after a submodule guard. In a linked worktree it skips to Step 2 and creates nothing | `skills/using-git-worktrees/SKILL.md:16-33` | verified |
| 0. Report | It reports the branch, or a detached HEAD as "externally managed" | `:35-37` | verified |
| 0. Consent | In a normal checkout it asks first, unless the instructions declare a preference. On a no, it works in place | `:39-45` | verified |
| 1a. Native tool | It uses a tool like `EnterWorktree`, `WorktreeCreate`, `/worktree`, or `--worktree` when one exists | `:51-57` | verified |
| 1b. Location | Fallback only. An instruction wins, then an existing `.worktrees/`, then `worktrees/`, then a new `.worktrees/` at the project root | `:63-76` | verified |
| 1b. Safety | It runs `git check-ignore`. When the folder is not ignored, it adds it to `.gitignore` and commits | `:78-88` | verified |
| 1b. Create | It runs `git worktree add "$LOCATION/$BRANCH_NAME" -b "$BRANCH_NAME"`, then `cd`s there. It sets no naming rule for the branch | `:90-98` | verified |
| 1b. Sandbox | On a permission error it works in the current folder | `:100` | verified |
| 2. Project Setup | It runs `npm install`, `cargo build`, `pip install`, `poetry install`, or `go mod download`, by manifest | `:102-119` | verified |
| 3. Baseline | It runs the tests. A failure is reported with a question; a pass is reported as ready | `:121-140` | verified |

Its reason for preferring the native tool is that `git worktree add` "creates phantom state your harness can't see or manage" (`:55`, again at `:164`). Verified.

What the skill leaves to others (verified by reading the whole file):

- **The base commit.** It names none. In Claude Code the native tool branches from `worktree.baseRef`, whose default is `"fresh"`, the remote's default branch (§2 C1). The fallback's `git worktree add -b` branches from `HEAD`, which is git's default (inferred).
- **Cleanup.** The skill has no cleanup step. `finishing-a-development-branch` Step 6 owns it.
- **The handoff.** It ends with a ready report (`:134-140`) and names no next skill. The calling skill continues.

The research session's own tool list on 2026-10-31 offered `EnterWorktree` and `ExitWorktree` (verified). So under Claude Code, Step 1a applies and Step 1b does not (inferred).

### The skills that call it

| Skill | When | Where | Label |
|---|---|---|---|
| `subagent-driven-development` | Setup, before Task 1: "use superpowers:using-git-worktrees to create one or verify the existing one" | `skills/subagent-driven-development/SKILL.md:126-129` | verified |
| `executing-plans` | Setup, with the same text | `skills/executing-plans/SKILL.md:110-113` | verified |
| `writing-plans` | Calls nothing. One context line says a worktree "should have been created via" the skill "at execution time" | `skills/writing-plans/SKILL.md:16` | verified |
| `brainstorming` | No mention. It hands to `writing-plans` | `skills/brainstorming/SKILL.md:265-266` | verified |
| `dispatching-parallel-agents` | No mention | whole file | verified |
| `using-superpowers` | Its Codex reference repeats the Step 0 detection | `skills/using-superpowers/references/codex-tools.md:83-96` | verified |

Both execution skills add one rule beside the call: "Never start implementation on a main/master branch without your human partner's explicit consent" (`subagent-driven-development/SKILL.md:128-129`, `executing-plans/SKILL.md:112-113`). Verified.

Superpowers' implementer subagents run in the controller's checkout. No skill sets the Agent tool's `isolation: "worktree"` (verified, a search for "isolation").

### `finishing-a-development-branch`, its counterpart

Both execution skills end by invoking it (`subagent-driven-development/SKILL.md:487`, `executing-plans/SKILL.md:304`). Verified.

| Step | What it does | Where | Label |
|---|---|---|---|
| 1 | Runs the full suite, and stops on a failure | `skills/finishing-a-development-branch/SKILL.md:14-26` | verified |
| 2 | Compares the git dirs again, and captures `WORKTREE_PATH` from `git rev-parse --show-toplevel` | `:28-44` | verified |
| 3 | Settles the base branch, asking when it is unknown | `:46-51` | verified |
| 4 | Offers merge locally, push and open a PR, or keep. A detached HEAD gets the last two | `:53-82` | verified |
| 5, merge | Moves to the main root with `git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel`. Then it runs `git checkout <base>`, `git pull`, `git merge <feature>`, the tests, Step 6, and `git branch -d` | `:86-111` | verified |
| 5, PR | Pushes and opens a PR, keeping the worktree | `:113-126` | verified |
| 5, keep | Reports "Worktree preserved at <path>" | `:128-130` | verified |
| 5, discard | Only on an explicit request and the typed word `discard`, then Step 6 and `git branch -D` | `:132-157` | verified |
| 6 | Runs for merge and discard only. Under `.worktrees/` or `worktrees/` it runs `git worktree remove` and `git worktree prune`. Elsewhere "the host environment owns this workspace" | `:159-201` | verified |

A refused removal is never forced; the skill lists the uncommitted files and asks (`:177-198`). Its rationalisation table repeats the boundary: "Clean up only worktrees under `.worktrees/` or `worktrees/`. Everything else belongs to the host" (`:221`). Verified.

### The workspace both execution skills share

`sdd-workspace` puts each plan's ledger, briefs, and review packages under `<root>/.superpowers/sdd/<plan basename>/` (`skills/subagent-driven-development/scripts/sdd-workspace:41-46`). `root` is `git rev-parse --show-toplevel`, so a worktree gets its own workspace. It writes a self-ignoring `.gitignore` there (`:81`). `task-brief` says "concurrent runs of the SAME plan in the same working tree share it" (`scripts/task-brief:7-9`). At the end the controller deletes the plan's folder with `rm -rf` (`subagent-driven-development/SKILL.md:482-485`). All verified.

## 2. Where sidekick touches worktrees, against superpowers

No sidekick code or hook names either superpowers skill. The Skill-tool hook nudges `superpowers:brainstorming` and `superpowers:writing-plans` only (`bin/helpers/hook.ts:210-213`). No file in `plugin/hooks/` mentions worktrees, and `hooks.json` registers no `WorktreeCreate` or `WorktreeRemove` hook. All verified.

The worktree guard from #229 is Claude Code's, not sidekick's. #229 puts "Changing the guard itself, which is Claude Code's" out of scope, and sidekick answers it only with text in `sk-worker` §Git. Verified.

### Each touch point

| Place | Relation | What it says or does | Label |
|---|---|---|---|
| `sk-execute` §Hand off to a worker | Bypasses | "The worker runs in a worktree of its own, made from this session's `HEAD`" (`plugin/skills/sk-execute/SKILL.md:75`). "`place` is `worktree`, the only place `dispatch` starts a worker" (`:78`) | verified |
| `sk-execute`, without agent view | Uses Claude Code's tool | "`worktree` only when that session's settings set `worktree.baseRef` to `"head"`" (`:103`). Otherwise `in-place` or `branch <name>` (`:104`) | verified |
| `sk-execute` §After an in-session run | Defers | "At `finishing-a-development-branch`, take the option that matches the repo's route" (`:110`). Where an in-session run works is left to "the chosen mode" (`:51`) | verified |
| `sk-worker` §On start | Overrides Steps 0 and 1 | The brief's `place` decides. `worktree` means `.claude/worktrees/<name>` on `worktree-<name>`. A worker the operator starts calls `EnterWorktree` with the brief's `name` (`plugin/skills/sk-worker/SKILL.md:31-37`) | verified |
| `sk-worker` §Setup | Overrides Step 2 | "It replaces Project Setup in superpowers' `using-git-worktrees`, which runs `npm install` whenever it finds a `package.json`" (`:41`) | verified |
| `sk-worker` §The run | Overrides the finish menu | "At `finishing-a-development-branch`, keep the branch as it is; the orchestrator reviews and integrates" (`:68`). That is option 3 | verified |
| `sk-worker` §Git | Works around Claude Code's guard | It names the refused shapes and says to run git plainly with literal paths (`:76`). "Never push, and open no pull request" (`:79`) | verified |
| `sk-worker` §At the end | Orders the report before superpowers' deletion | The report is written before superpowers deletes its workspace; `finish` removes the rest (`:83-89`) | verified |
| `sidekick worker dispatch` | Bypasses | Spawns `claude --worktree <name> --bg` (`bin/helpers/worker-dispatch.ts:383-393`, `bin/helpers/profile-launch.ts:319-338`). Overlays `worktree.baseRef: "head"` (`bin/helpers/worker-overlay.ts:40`) | verified |
| `sidekick worker finish` | Replaces finishing's Step 6 for a worker | Removes through `claude rm`, never `git worktree remove` (`bin/helpers/worker-finish.ts:474-519`) | verified |
| The desk | Reads | Knows only `.claude/worktrees/<name>` and `worktree-<name>` (`bin/helpers/desk-children.ts:85-93`) | verified |
| The Read hook | Fires in any checkout | Matches `.superpowers/sdd/<x>/review-<a>..<b>.diff` with an unanchored pattern (`bin/helpers/hook.ts:66-71`). So it fires inside a worktree too | inferred |
| `.worktreeinclude` | Claude Code's mechanism | Copies two ignored type caches (`.worktreeinclude:1-3`). Superpowers' `git worktree add` fallback does not read it | verified file; inferred fallback |
| `.gitignore` | Satisfies the fallback's check here | Ignores `.worktrees/` and `.claude/worktrees/` (`.gitignore:25-27`) | verified |

### Conflicts and frictions

**C1. The base commit of a native worktree.** Superpowers hands creation to the native tool and names no base (`using-git-worktrees/SKILL.md:51-57`). Claude Code 2.1.316's schema describes `worktree.baseRef` like this:

> 'fresh' (default) branches from origin/<default-branch> for a clean tree. 'head' branches from your current local HEAD so unpushed commits and feature-branch state are present. Applies to --worktree, EnterWorktree, and agent isolation.

No settings file here sets it: the project, local, and user files have no `worktree` key (verified). Sidekick sets it only in a dispatched worker's overlay (`worker-overlay.ts:40`). It warns about it only for a worker the operator starts (`sk-execute/SKILL.md:103`, `sk-worker/SKILL.md:33`). Inferred: an in-session run that takes Step 1a starts from `origin/master`. It would miss unpushed commits and a `milestone/<name>` branch, which `AGENTS.md` §Working here allows.

**C2. Two locations and two branch schemes.** Claude Code makes `.claude/worktrees/<name>` on `worktree-<name>` (cited: the dispatch probes, §The worktree). Superpowers' fallback makes `.worktrees/<branch>` on the branch as given (`using-git-worktrees/SKILL.md:94-96`, verified). Sidekick's CLI and desk know only the first (`bin/helpers/worker-repo.ts:12-13`, `desk-children.ts:86`, `bin/helpers/desk-snapshot.ts:137`; verified). Inferred: a session in a `.worktrees/` worktree gets the branch's folder name as its repo label on the desk.

**C3. Who removes a worktree under `.claude/worktrees/`.** Finishing's Step 6 removes worktrees "under `.worktrees/` or `worktrees/`" (`finishing-a-development-branch/SKILL.md:169-175`). It does not anchor that to the project root. `<top>/.claude/worktrees/<name>` contains a `worktrees/` segment (verified, both texts). Inferred: a literal reading lets a merge-locally finish remove a worktree Claude Code made. A dispatched worker never reaches Step 6, since it keeps the branch (`sk-worker/SKILL.md:68`). An in-session run in a native worktree can.

**C4. Finishing against `sidekick worker finish`.** They do not overlap for a worker, because `sk-worker` takes option 3 and `finish` removes afterwards (verified, both texts). They differ on integration:

- Superpowers' merge runs a plain `git merge <feature-branch>` (`finishing-a-development-branch/SKILL.md:96`, verified).
- Sidekick integrates by fast-forward or a pull request (`AGENTS.md` §Working here; `sk-execute/SKILL.md:90`, verified).
- `finish` accepts only ancestry: `git merge-base --is-ancestor <head> HEAD` (`worker-finish.ts:120`, verified). A rebase or squash merge then refuses (#266, open).

**C5. Superpowers' commands against the worktree guard.** Its detection and merge lines put `$(…)` in operands and use `git -C`:

- `using-git-worktrees/SKILL.md:21-23`
- `finishing-a-development-branch/SKILL.md:31-35`, `:90`, and `:149`

`sk-worker/SKILL.md:76` lists both shapes as refused in a worktree session. #229 measured that on Claude Code 2.1.310 (cited). Inferred: those lines, run as written in a worktree session, are refused and must be split. #229's close records 13 calls to superpowers' scripts by literal path, none refused (cited).

**C6. Project Setup in a bun repo.** Step 2 runs `npm install` wherever a `package.json` exists (`using-git-worktrees/SKILL.md:107-108`). This repo has `bun.lock` and no `package-lock.json` (verified, a listing). `sk-worker` §Setup replaces the step for workers; no sidekick text replaces it for an in-session run (verified, a search). #206 left the stray lockfile question unverified (cited).

**C7. Consent and work on `master`.** The execution skills require consent before work on `master` (`subagent-driven-development/SKILL.md:128-129`, verified). #123 made a plain branch in the main checkout a valid place (cited). For a worker, the brief's `place` is the declared preference Step 0 honours "without asking" (`using-git-worktrees/SKILL.md:45`, `sk-worker/SKILL.md:68`; verified). For an in-session run, sidekick declares none (inferred from the search in C6).

**C8. `task-done`, a contradiction between a record and the tree.** #229's close comment says "superpowers 6.4.1 ships no `task-done` script". The installed 6.4.1 cache holds `skills/executing-plans/scripts/task-done`. `executing-plans/SKILL.md:224` tells the session to run it with `-- <test command>` (verified, both). This report followed the tree. The `subagent-driven-development` scripts folder has no `task-done` (verified), and the comment may have meant that folder (inferred). The script takes its test command as text. `sk-worker` §Git lists that shape as refused when the text is a git command, as #229's body first recorded.

**C9. Git's admin folder against `finish`'s lock path.** `finish` reads the lock at `<common dir>/worktrees/<name>/locked` (`worker-finish.ts:354-359`, verified). Git names the admin folder after the worktree folder's basename, adding a number on a clash. The scratch probe gave `alpha` and `alpha1` (verified, git 2.50.1). Inferred: an earlier worktree with the same basename, such as `.worktrees/<name>`, takes `<name>`. `finish` would then read that worktree's lock.

## 3. A dispatched worker's worktree lifecycle

### From brief to removal

1. **The brief.** The orchestrator writes it beside the plan (`sk-execute/SKILL.md:77-84`). Its `name` is the session name, the folder `.claude/worktrees/<name>`, and the branch `worktree-<name>` (`plugin/skills/sidekick/references/workers.md:32`). Verified.
2. **The checks.** `dispatch` runs them all before acting (`worker-dispatch.ts:281-324`, verified):
   - it runs in the main checkout (`worker-repo.ts:22-59`);
   - `baseline` is the main checkout's `HEAD`, and tracked files are clean (`worker-dispatch.ts:136-157`);
   - the folder and the branch are free (`:159-169`), and no listed session has the name (`:171-182`);
   - no remote sets `pushurl` (`:184-189`), and the profile loads.
3. **The exclude.** Unless git already ignores `.claude/worktrees/`, `dispatch` appends it to `<common dir>/info/exclude` (`worker-repo.ts:170-176`, `:218-234`; `worker-dispatch.ts:376-382`). Verified.
4. **The spawn.** It runs `claude` from the main checkout's top (`worker-dispatch.ts:383-393`, verified):

   ```
   claude --add-dir <profile folder> --settings <json> [--setting-sources <list>] [--plugin-dir <dir>]
     --permission-mode <mode> --worktree <name> --bg -n <name> -- /sidekick:sk-worker <brief>
   ```

5. **What creates the worktree.** Claude Code's `--worktree <name>` flag. The session starts there from its first command, branched from `HEAD` (cited: the dispatch probes, §Second round). `EnterWorktree` serves only the worker the operator starts (`sk-worker/SKILL.md:33`, verified). No sidekick code runs `git worktree add` (verified, a search).
6. **The base.** The overlay's `worktree.baseRef: "head"` (`worker-overlay.ts:40`, verified). The dispatch probes measured it holding for both `--worktree` and `EnterWorktree` (cited).
7. **`worktree.bgIsolation`.** Sidekick does not set it (verified, a search). Its default, `"worktree"`, "blocks Edit/Write in the main checkout until EnterWorktree is called" (verified, 2.1.316 schema). `CLAUDE_BG_ISOLATION` overrides it (verified, the binary reads that variable first). A `--worktree` session starts isolated, so the guard never meets an unisolated worker (inferred). A respawned worker still refused a write in the main checkout (cited: the dispatch probes, §Second round).
8. **What `.worktreeinclude` copies.** `.cache/claude-code-types/` and `plugin/.claude-plugin/types/` (`.worktreeinclude:1-3`, verified). A dispatched worker on Claude Code 2.1.301 held both before anything ran (cited: #228's close). Nothing copies `docs/superpowers/`, `.superpowers/`, or `node_modules/`; the brief's `setup` rebuilds dependencies (`workers.md:42`, verified).
9. **The record.** Once `claude` exits 0, `dispatch` writes `<common dir>/sidekick/workers/<name>.json` (`worker-dispatch.ts:358-370`, `bin/helpers/worker-record.ts:42-50`). The job id comes from the `backgrounded · <id> · <name>` line (`worker-record.ts:52-70`). Verified.
10. **The run.** The worker reads the brief, plan, spec, and rulings by their main-checkout paths (`sk-worker/SKILL.md:29`). It writes its report inside the worktree (`:83`). Verified. Superpowers' workspace then sits at `<worktree>/.superpowers/sdd/<plan>/` (inferred from `sdd-workspace:45-46`).
11. **The end.** The worker keeps its branch at the finish menu, then messages the orchestrator (`sk-worker/SKILL.md:68`, `:89`). The orchestrator reviews, integrates, and runs `finish` (`sk-execute/SKILL.md:88-92`). Verified.

### How `finish` decides integration

`finish` resolves the worktree as `<top>/.claude/worktrees/<name>` and the branch as `worktree-<name>` (`worker-finish.ts:237-238`). It proceeds only when all of these hold (verified):

| Check | Where |
|---|---|
| Exactly one listed session has the name, and it is a background job | `worker-finish.ts:70-102` |
| The branch's head is an ancestor of the main checkout's `HEAD` | `:104-127`, the test at `:120` |
| The worktree has `worktree-<name>` checked out | `:132-143` |
| `git status` there lists nothing but the report, untracked files included | `:147-162` |
| The report exists, or `--no-report`; no different report sits at the destination | `:186-210` |

### How `finish` removes it

The steps run in order, and the first failure stops the rest (`worker-finish.ts:529-537`, verified):

1. Copy the report to `<top>/<report>` (`:280-311`).
2. Stop the job with `claude stop`, unless it lists as ended and its lock names no live process (`:335-349`).
3. Wait up to 15 s for the lock's process (`:366-387`).
4. Check the worktree again: branch, head, status, and report (`:425-437`).
5. Run `claude rm <id>`, and its `--discard-unpushed` line only when the sha is the verified head (`:439-480`).
6. Delete the worker's record (`:521-525`).
7. Confirm with `git worktree list` that the worktree is gone, then `git branch -d` (`:482-519`).

`claude rm`'s exit code does not say whether it removed or kept, so `finish` reads its text (cited: the dispatch probes, §Stopping and cleanup; `workers.md:168-170`).

### Known failure points

| # | Failure | Where | Status |
|---|---|---|---|
| F1 | `dispatch` refuses inside a linked worktree, so a worker cannot dispatch a worker | `worker-repo.ts:51-57` | #255, open |
| F2 | A brief read outside the worktree prompts in `default` mode, since the overlay grants no read rule | `worker-overlay.ts:36-61` | #252, open |
| F3 | `profile launch --bg` takes no `--plugin-dir`; `dispatch` does | `bin/helpers/profile.ts:37-38` | #248, open |
| F4 | Integration by rebase or squash fails the ancestry test | `worker-finish.ts:120` | #266, open |
| F5 | `claude rm` gets 30 s. A timeout left 394 tracked files deleted, and the re-run refused them as uncommitted work | `worker-finish.ts:313-319`, `:147-162` | #267, open |
| F6 | The worktree guard refuses `git -C`, `sh -c "git …"`, `$(…)` operands, heredoc then git, and git as script text | `sk-worker/SKILL.md:76` | #229, closed with text |
| F7 | Ignored files the gates need are absent from a fresh worktree | `.worktreeinclude` | #228, closed |
| F8 | The report's folder is absent in a fresh worktree | `sk-worker/SKILL.md:83` | #218, closed |
| F9 | A job listed `done` still holds the lock | `worker-finish.ts:335-349` | fixed in `c059403` (cited: the dispatch bench) |
| F10 | The lock's process outlives the 15 s wait | `worker-finish.ts:366-381` | verified code |
| F11 | `claude rm`'s discard offer names a sha other than the verified head; its unpushed count includes the base's commits | `worker-finish.ts:456-470` | cited: the dispatch probes |
| F12 | The lock path assumes git's admin folder has the worker's name | `worker-finish.ts:354-359` | C9; inferred |
| F13 | Ignored files in the worktree, such as `node_modules` and scratch, go with it | `workers.md:172-174` | verified text |
| F14 | After `claude rm` succeeds, a re-run cannot find the job, so leftovers are cleared by hand | `worker-finish.ts:78-84`, `workers.md:166` | verified |
| F15 | On 2.1.299, a respawn's saved flags dropped `--worktree`, and the listing's `cwd` became the main checkout. On 2.1.308, a worker resumed by `claude attach` kept its worktree `cwd` | — | cited: the dispatch probes, §Second round; the main and worker probes, R4 |
| F16 | A repo profile's folder rides `--add-dir` and is branch content, so a respawn can lose or swap it | `bin/helpers/profile-launch.ts:95-109` | #206's comment of 2026-10-14; inferred there |
| F17 | A worker the operator starts, with `baseRef` at `"fresh"`, lands off the baseline and blocks | `sk-worker/SKILL.md:33`, `:37` | verified text |
| F18 | A job id in another format leaves `job` null, so the desk joins by name | `worker-record.ts:52-70` | verified code |

The dispatch probes left two cases unmeasured: two workers dispatched at once from one checkout, and a session started in a subfolder (cited).

## 4. Two interactive sessions in one repo today

### Guards

| Guard | Covers | Two interactive sessions | Label |
|---|---|---|---|
| Claude Code's `bgIsolation` | Background sessions: "'worktree' (default) blocks Edit/Write in the main checkout until EnterWorktree is called" | Not covered, by its wording | verified text; inferred reach |
| Claude Code's worktree fence | A session isolated in a worktree: "its writes are limited to that folder" | Measured for background workers only | verified text in the binary; cited: the dispatch bench |
| Claude Code's `sharesCwd` | An `@internal` field on an Agent result: another write-capable agent already runs in that folder | Subagents only, by its placement | verified in `2.1.312.d.ts:17984`; inferred reach |
| Sidekick's `dispatch` | Refuses a name any listed session holds, interactive ones included, and dirty tracked files | Not an interactive guard | verified, `worker-dispatch.ts:152-182` |
| Sidekick's `finish` | Refuses an interactive session as a worker | Not an interactive guard | verified, `worker-finish.ts:94-100` |
| Sidekick's role tracker | Settles a session with no markers and no `CLAUDE_JOB_DIR` as a `main` | Both sessions become mains, wherever they run | verified, `plugin/hooks/role.ts:46-60` |
| Superpowers' workspace | One folder per plan and per checkout | Two plans stay apart; two runs of one plan in one checkout share a folder | verified, `sdd-workspace:6-9`, `task-brief:7-9` |

The desk reads git status with `--no-optional-locks`, so its status refresh cannot fail a worker's commit (`desk-children.ts:79-81`, verified). Nothing else in sidekick handles git's own locks.

### Shared state

| State | Where it lives | Both sessions on `master` in the main checkout | One session in a worktree | Label |
|---|---|---|---|---|
| Working tree, index, `HEAD` | Per checkout | Shared: a checkout or merge in one moves the other's files | Separate trees and branches | inferred |
| The board | GitHub | Shared, with no lock between writers | Shared. Drift is per checkout: the current branch, its upstream, its open PR (`bin/helpers/pm.ts:571-631`) | verified code |
| `$.store` | One JSON file per plugin, "under the user's Claude Code configuration directory" (`2.1.312.d.ts:3446-3451`) | Shared. Each session writes `session:<id>` (`plugin/hooks/publish/contract.ts:14-21`). Any desk deletes keys of sessions gone from the listing (`plugin/hooks/desk/keys.ts:39-57`) | Same | verified |
| `$.state` | Per session (`2.1.312.d.ts:3477-3483`) | Not shared | Not shared | verified |
| Worker records | `<common dir>/sidekick/workers/` (`worker-record.ts:42-45`) | Shared | Shared: the desk resolves the common dir from a linked worktree (`desk-children.ts:28-58`). Any desk prunes stale records (`bin/helpers/desk.ts:118-162`) | verified |
| The desk's listing | `claude agents --json --all`, machine-wide | Shared. Each main lists its own workers, records with no main, and orphans (`desk-snapshot.ts:325-344`) | Same | verified code |
| `docs/superpowers/` | Ignored, in the main checkout (`.gitignore:29-30`) | Shared: specs, plans, briefs, rulings, and reports | Absent from the worktree. A worker reads it by absolute path and cannot edit it (`sk-worker/SKILL.md:29`) | verified text |
| `.superpowers/sdd/` | The checkout's top (`sdd-workspace:45-46`; `.gitignore:32-33`) | Shared, one folder per plan | Separate | verified |
| Auto-memory | One folder per repository, shared across worktrees | Shared | Shared. This repo's worktree folders under `~/.claude/projects/` hold no `memory/` | cited: memory design K6; verified listing |
| `.claude/settings.local.json` | The main checkout's file, read from worktrees too since v2.1.211 | Shared | Shared. Claude Code saves permission approvals there | cited: memory design K7 and line 391 |
| `.claude/settings.json` | Tracked, so per checkout | Shared | The worktree's branch copy | inferred |
| Transcripts | `~/.claude/projects/<checkout path>/` | One folder | A folder per worktree path, such as `…-sidekick--claude-worktrees-p8-band` | verified listing |
| `.git/info/exclude` | The common dir | Shared | Shared | verified, `worker-repo.ts:224` |

Concurrent writes to one auto-memory folder lost no update in an earlier probe (cited: memory design K13). Concurrent writes from many sessions to the one `$.store` file were not checked.

## 5. What each piece is keyed by

| Piece | Key | Keyed by | Where | Label |
|---|---|---|---|---|
| Worker record | `<common dir>/sidekick/workers/<name>.json` | Repository, then worker name | `worker-record.ts:42-50` | verified |
| Worker worktree | `<main top>/.claude/worktrees/<name>` | Main checkout path, then name | `worker-finish.ts:237`, `desk-children.ts:93` | verified |
| Worker branch | `worktree-<name>` | Name | `worker-dispatch.ts:162`, `worker-finish.ts:238`, `desk-children.ts:86` | verified |
| Worktree lock | `<common dir>/worktrees/<name>/locked` | Git's admin folder name | `worker-finish.ts:355` | verified; see C9 |
| `dispatch` and `finish` | Run only in the main checkout | Main checkout | `worker-repo.ts:51-57` | verified |
| Brief paths | Absolute, inside the main checkout | Main checkout | `bin/helpers/worker-brief.ts:74-76`, `:151-172` | verified |
| Run report | Relative to the top; copied from the worktree to the main checkout | Both | `worker-finish.ts:240-242` | verified |
| Desk's repository | Common dir, and the first `git worktree list` entry | Repository, from any checkout | `desk-children.ts:33-58` | verified |
| Desk's unintegrated count | `HEAD..refs/heads/worktree-<name>`, run at the main top | Main `HEAD` and branch | `desk-children.ts:94-101` | verified |
| Desk's repo label | The row's `cwd`, minus `/.claude/worktrees/<name>` | Path | `desk-snapshot.ts:137-143` | verified |
| Desk's join of record to session | Job id, else name | Session | `workers.md:186` | verified |
| Desk's transcript lookup | Session id, across every project folder | Session | `bin/helpers/desk-transcripts.ts:60-78` | verified |
| A worker's main | `SIDEKICK_MAIN`, else the listing's name for the session id, else an 8-character id | Session; the root main is passed down unchanged | `bin/helpers/main-session.ts:32-46` | verified |
| `$.store` key | `session:<session id>` | Session | `publish/contract.ts:14-21` | verified |
| `$.state` | The session | Session | `2.1.312.d.ts:3477-3483` | verified |
| Role | Flag-settings markers and `CLAUDE_JOB_DIR` | Environment, not path | `role.ts:46-60` | verified |
| Repo profile store | `<git rev-parse --show-toplevel>/.claude/profiles/` | Checkout: a worktree reads its own | `bin/helpers/profile-store.ts:87-111`, `bin/helpers/rules.ts:35-46`, `references/profiles.md:17` | verified |
| Profile switch's `cd` | The work tree's top, else `cwd` | Checkout | `profile.ts:418-421` | verified |
| Board discovery | `origin` of the checkout's top | Checkout, same remote | `pm.ts:129-153` | verified |
| Board drift | The checkout's current branch | Branch | `pm.ts:571-631` | verified |
| Session-start pickup | `sidekick pm pickup --brief`, run in the session's folder | Checkout | `plugin/hooks/session-start:13` | verified |
| Mods' commands | `$.process.run` defaults to "the session's" `cwd` | Checkout | `2.1.312.d.ts:3599-3620`; `plugin/hooks/board/board.ts:204`, `plugin/hooks/desk/desk.ts:95` | verified |
| `$.session.repo().root` | "the main working tree's for a worktree" | Main checkout | `2.1.312.d.ts:12179-12186`; no sidekick mod calls it | verified |
| Superpowers' workspace | `<show-toplevel>/.superpowers/sdd/<plan basename>/` | Checkout, then plan | `sdd-workspace:41-46` | verified |
| Read hook's match | `.superpowers/sdd/<x>/review-<a>..<b>.diff` | Any checkout | `hook.ts:66-71` | verified |
| Auto-memory | The git repository | Repository | memory design K6 | cited |
| `.claude/settings.local.json` | The main checkout's root | Main checkout | memory design K7 | cited |
| Transcripts | The session's checkout path | Checkout | `~/.claude/projects/` listing | verified |

## Not run

- No session was started. No `claude --worktree`, `EnterWorktree`, or agent-view command ran for this report.
- The isolation fence for an interactive `claude --worktree` session, against background sessions.
- Finishing's Step 6 against a `.claude/worktrees/` path (C3).
- Superpowers' Step 0 and finishing lines run verbatim in a worktree session (C5).
- Concurrent writes to `$.store` from several sessions.
- The mod API for 2.1.316: the cached declarations stop at 2.1.312.
