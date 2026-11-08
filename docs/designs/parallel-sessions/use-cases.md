# Worktree and session use cases, checked against the build

Issue: #309. Part of [the parallel-sessions design](design.md), whose §Cases lists C1 to C13. Scale: explore · 2026-11-04.

Amended 2026-11-08 (#313): I7, on `ExitWorktree` under `claude -w`, and §Breakdown's item 8, on #313 naming routes, predate plan 11b. The facts in the shipped `plugin/rules/sk-parallel-sessions.md` supersede them.

Every cell was checked on 2026-11-04 against `milestone/r10-memory-and-parallel-sessions` at `501676b`, on Claude Code 2.1.318. Nothing here was checked against 0.6.0.

## Problem

The design traced C1 to C4 on 2026-10-31. A week of daily use in the work repo found C5 to C13, and each gap surfaced alone, mid-work. This note puts every case on one matrix, checks each cell against the milestone branch, and marks it.

Goals, stated by the operator on 2026-11-04 (#308, and the session that opened #309):

- The outcome: any session can work in its own worktree, dispatch workers from it, land the work, and remove it, with no hand steps.
- Correctness over release date, bounded: no second week of build.
- Settle #287's keep-or-drop, and which tool makes worktrees.
- Confirm or return each issue that joined R10 with #308.

Non-goals, stated: overlap between parallel branches (the design's G2, #312), one objective across repos (G4), and Claude Code's isolation guard itself. A hand step that a repo chose, such as a deny rule on force pushes, is not a gap.

## Constraints

### Verified

- **V1.** `dispatch` runs `claude --settings <profile plus overlay> --worktree <name> --bg` from the launching checkout (`bin/helpers/worker-dispatch.ts:425-447`, `bin/helpers/profile-launch.ts:122-133`). Its default profile is `worker` (`worker-dispatch.ts:58-59`). The user-level `worker` profile sets `enabledPlugins: {"worktrunk@worktrunk": false}` (`sidekick profile argv worker`, run 2026-11-04).
- **V2. Probe P1**, 2026-11-04, in sidekick's main checkout, where worktrunk is enabled at local scope. It launched `claude` by hand with dispatch's flags, the profile's override, and `baseRef: "head"`; it did not run `sidekick worker dispatch`. The session got Claude Code's own `.claude/worktrees/probe-309a` on `worktree-probe-309a`, at `HEAD` `501676b`. The worktree was listed as soon as `--bg` returned. Its start hooks ran for about 7 seconds before its first turn (`claude logs`).
- **V3.** `claude rm` then removed P1's session, worktree, and branch (`git worktree list` and `git branch --list`, after). Plan 4's `finish` did the same on 2026-11-01 (#282's close comment).
- **V4.** A worker dispatched from a feature worktree lands in the feature's branch. #282's by-hand check on 2026-11-01 ran it from a hand-built sibling worktree, before worktrunk was enabled. The worker's worktree sat under the main checkout's `.claude/worktrees/`, at the feature's own commit.
- **V5. `finish` has no removal path for a hook-made worker worktree today.** In plans 5, 6, and 7, `claude rm` refused one, so `finish` saved the report and stopped (#287, comments of 2026-11-02). `finish` answers any such refusal with a generic way out that fails the same way (`bin/helpers/worker-teardown.ts:187-200`). The test fixture has no variant that refuses a hook-made worktree (`bin/helpers/fixtures/worker/finish.ts:183-210`, `:262-271`). Claude Code 2.1.318's `claude rm` has `--force-remove-worktree <worktree-id>`, for a worktree "the WorktreeRemove hook or git couldn't remove", given "the value a previous 'claude rm <id>' reported", and it keeps the branch (`claude rm --help`). Nothing in sidekick uses it. The refusals quoted on #287 print no such id.
- **V6.** Under worktrunk's hook, `ExitWorktree` refuses to remove a worktree without `discard_changes: true`, which Claude Code says to confirm with the user (#287, 2026-11-01). `plugin/rules/sk-parallel-sessions.md` §Rulings says to remove an unchanged support worktree without asking.
- **V7.** worktrunk's `WorktreeCreate` hook runs `wt switch --create <name>` with no base, so `worktree.baseRef` never reaches it (#287, 2026-11-01). In the work repo on 2026-11-04, a worker started at the default branch, off its baseline (#287, 2026-11-04). sidekick masks this by setting worktrunk's default branch to the milestone branch, a hand step at each milestone.
- **V8.** `finish`'s dirty check runs `git status --porcelain -z --untracked-files=all` with no `--ignored` (`bin/helpers/worker-repo.ts:112-114`). Removing a Claude Code worktree deletes its ignored files without asking (`docs/research/parallel-sessions/2026-10-31-claude-code-worktree-features.md:490`). So a new ignored script a worker wrote is lost.
- **V9.** No CLI path lists or removes a worktree that no worker record names. The worker verbs are `dispatch` and `finish` (`bin/helpers/worker.ts:51-54`), and the desk prunes only stale records (`bin/helpers/desk.ts:151-160`).
- **V10. Memory resolves from git, not from the path.** The start hook finds the repo through the common git folder and the main checkout (`bin/helpers/memory-view.ts:77-89`). It reads the store key from the main checkout's `settings.local.json` (`bin/helpers/memory-settings.ts:329-333`). The record path sits in the store (`memory-view.ts:220-233`). `sk-save` writes only inside the store (`plugin/skills/sk-save/SKILL.md:36`, `:62-70`). Plan 7's worker wrote its record to the store from a guarded worktree on 2026-11-02.
- **V11.** The match order is the session's record, the worker's brief, the title, then the branch (`bin/helpers/memory-match.ts:63-88`). The branch tier skips the default branch. `sk-save` adds the session's branch to the workstream (`plugin/skills/sk-save/SKILL.md:65`). So a feature worktree's second session matches by branch after the first save, and a fresh support worktree gets the menu.
- **V12.** The CLI always puts worktrees under `<repo>/.claude/worktrees/`, unless a `WorktreeCreate` hook replaces creation (the research report, `:221`, `:491`).
- **V13.** `claude -w <name>` reopens an existing worktree of that name, and `--resume` or `--continue` returns a session to its worktree (same report, `:59`, `:89`, `:117`). Under `"fresh"`, a reopened worktree resets to the default branch only when it is clean, on Claude Code's branch, and has no commits of its own (`:89-95`).
- **V14.** `dispatch`'s checks run apart from its launch (`checkDispatch`, `worker-dispatch.ts:314-362`), and it has no flag that runs only the checks. Most checks read the brief (`:215-231`), and a missing `--permission-mode` refuses (`:115-120`). The clean-tree and push-URL checks need no brief.
- **V15.** `sk-worker` names only `worktree.baseRef` as the cause of an off-baseline `HEAD` (`plugin/skills/sk-worker/SKILL.md:43`).
- **V16.** The parallel-sessions rule names no route for four moves (`plugin/rules/sk-parallel-sessions.md`, read 2026-11-04). They are reopening a worktree, moving a branch between checkouts, needing a second worktree, and checking out an existing ref. For landing from a worktree it says to hand the commit off (`:32`).
- **V17.** #293, #296, #297, and #303 still hold on the branch (`bin/helpers/pm-data.ts:23-35`, `worker-teardown.ts:375-379`, `bin/helpers/worker-finish-gone.ts:132-138`, `plugin/skills/sk-worker/SKILL.md` §On start). The claude runner inherits the git variables too (`profile-launch.ts:204`). `worker-landed.ts:120-135` passes every changed file to one `git log`, a third site of #293's kind. #296's start check used `git -C <main checkout>`, which the guard refuses in every mode (the rule, §The isolation guard).
- **V18.** Tracked files: 3,248 in the work repo and 398 in sidekick (`git ls-files | wc -l`, 2026-11-04). #293 estimates its limit at about 19,000 deleted files.
- **V19.** A worker cannot dispatch workers (`worker-dispatch.ts:309-310`, `:320-321`). That is the design, not a gap.
- **V20.** Claude Code cannot base a worktree on a named branch; its docs say to run `git worktree add` yourself. `baseRef: "head"`, from the checkout that holds the branch, bases it at that branch's commit, on `worktree-<name>`. `--worktree "#1234"` fetches a pull request's head into `.claude/worktrees/pr-<number>` (the research report, `:84-87`; docs, not probed).
- **V21.** sidekick sets `worktree.baseRef: "head"` for the whole repo (`.claude/settings.json`, from #286). So `EnterWorktree` there starts at the main checkout's `HEAD`, the milestone branch, even for support work.
- **V22.** In #286's rule probes, a sidekick feature session skipped setup in the first round and ran it in all six runs of each later round. Work-repo support sessions skipped `git fetch` (#286's close comment). A skipped setup in a nested worktree leaves no error: tools resolve the main checkout's packages, which the rule itself says (`plugin/rules/sk-parallel-sessions.md:10`). sidekick's own format hook ends in `|| true`, so it does nothing there either (`.claude/settings.json`).
- **V23.** `wt switch --create` bases a new branch on the default branch unless `--base` names another (`wt switch --help`, worktrunk 0.81.0). Its help names no fetch. `wt switch <branch>` makes a worktree for an existing branch, and `pr:<n>` for a pull request.
- **V24.** `installed_plugins.json` holds 11 local worktrunk entries, nine of them for worktree paths, P1's included despite the override (read 2026-11-04).
- **V25. Probe P2**, 2026-11-04. The work repo fixed its linter on 2026-11-03 and 2026-11-04, anchoring `.claude/worktrees/` in `.gitignore` and reading that file (`useIgnoreFile: true`). In a detached nested worktree at the fix, its linter checked 2,733 files, the same count as in the main checkout. The probe's worktree was removed after. Its one live nested worktree branched before the fix, and carries the old config until it rebases.
- **V26.** sidekick's worker runs took 2 to 4 hours each from dispatch to finish (#287's comments, 2026-11-01 and 2026-11-02). Plan 5 took about 4 hours, plan 6 about 2, and plan 7 about 4.

### Inferred, not measured

- **I1.** The profile's override acts the same from a linked worktree as from the main checkout. P1 ran from the main checkout. Settings resolve to the main checkout from a worktree (#287, 2026-11-01).
- **I2.** `ExitWorktree` with `keep` works in a session whose worktree state survived `/clear`. The work repo's transcripts show the state surviving two `/clear`s; nobody called `ExitWorktree` there.
- **I3.** sidekick's Biome checks files inside a nested worktree. `biome.json` has no `.claude/worktrees` pattern, and `.gitignore:27` is anchored to the root. Not run; P2 ran the same shape in the work repo.
- **I4.** `dispatch` and `finish` behave from a nested feature worktree as from a sibling one. K19 in the design measured `claude --bg --worktree` from both; the by-hand check ran from a sibling only.
- **I5.** worktrunk's "default branch" is the local branch, not `origin`'s, so a support worktree under its hook can start from a stale local branch. V23's help text implies it; #287 never measured it.
- **I7.** `ExitWorktree` is a no-op in a session launched with `claude -w`. The docs say it acts only on a worktree `EnterWorktree` created in that session (the research report, `:156`). In the work repo it did exit a worktree entered by path in the same session, on 2026-11-04. Neither case was probed.
- **I6.** The worktree exists when `claude --bg` returns. P1 saw it at once, once, for Claude Code's own creation. Under a `WorktreeCreate` hook it is unmeasured.

### Read and skipped

Read: #309, #308, the issues that joined with it, #287's comments, and #282's and #286's close comments. Also the design, the rule, the dispatch and overlay code, and the memory match code. Two subagents read the finish, teardown, and memory code; the lines this note rests on were re-read.

Skipped: the isolation guard (out of scope), `--tmux` sessions, worktrunk's per-turn hook cost, and shared local services (the design's assumption 9, unchanged).

## The matrix

Places:

- **M**, the main checkout;
- **F**, a feature worktree used over several days;
- **S**, a support worktree: thrown away, or an existing ref checked out for review;
- **W**, a worker's worktree.

Marks: **ok**, works on the branch now · **R**, must work at release, with the issue that makes it work · **later**, with the reason · **n/a**.

| Stage | M | F | S | W |
|---|---|---|---|---|
| Create | n/a | New branch: **ok** under Claude Code's creation, based by `baseRef` (V2, V12). Existing branch: a new session based by `"head"` from the branch's checkout (V20). The rule never names it, and a session detached the main checkout instead: **R**, #313. Under a `WorktreeCreate` hook the base is ignored (V7): **R**, #287 (the creator verdict) | From `origin`'s default branch **ok**, but one of two sessions skipped the fetch: **R**, #295. In sidekick, `EnterWorktree` starts from the milestone branch (V21): **R**, #313. A pull request: `claude -w "#<pr>"` (V20): **R**, #313 | **ok** through the worker profile's override (V1, V2). Nothing checks what came back (V7): **R**, #310 |
| Work across sessions | **ok** | Reopen with `claude -w <name>` or `--resume` (V13), which the rule never names (V16). A session left its worktree to make another: **R**, #313. Setup skipped leaves no error (V22): later, assumption 3 | As F | n/a: one session. A fresh context means a new worker |
| Save and pick up | **ok**: the store, matched by title or branch (V10, V11) | **ok** for saving: the store sits outside every checkout (V10). Pick-up matches by branch after the first save (V11). The work repo's own context file in the main checkout: **R**, #278 | Save **ok**. Pick-up offers the menu (V11). The design's line titling a support session with its workstream never reached the rule: **R**, #313 | **ok**: the brief's workstream matches first (V11), and a worker saves its record only |
| Dispatch workers | **ok**, plans 4 to 7. A dirty tree surfaces only after the mode is chosen: **R**, #311 | **ok** (V4, I4). Under a hook, the base is ignored: **R**, #310. The mode offered without checking: **R**, #311 | As F | n/a (V19) |
| Land | **ok**: in its own checkout, by fast-forward or pull request | Pull request **ok**; a force push by hand is the repo's own deny. Fast-forward into a branch the main checkout holds: the rule says hand off (V16). It has no route when no session is there: **R**, #313 | Changed code becomes a branch and a pull request (the rule) **ok** | **ok**: `finish`'s landed check against the target (#266, #282) |
| Remove | n/a | `ExitWorktree` **ok** under Claude Code's creation; under a hook it asks (V6). After a pull request lands days later, nothing removes it (V9): **R**, #284 | `ExitWorktree` **ok**. A worktree entered by path goes with `ExitWorktree keep`, then `git worktree remove`: **R**, #313 | **ok** under Claude Code's creation (V3). Ignored files go unchecked (V8): **R**, #284. A hook-made one: no path in `finish` (V5): **R**, #310 |

Repo traits change cells:

| Trait | Where it bites | Mark |
|---|---|---|
| Fast-forward landing (sidekick) | F's landing into the branch the main checkout holds | **R**, #313 |
| Pull requests merged by rebase or squash (the work repo) | Workers: **ok** (#266). An interactive worktree after the host merges: nothing removes it | **R**, #284 |
| A repo-wide `baseRef: "head"` (sidekick) | Support worktrees made with `EnterWorktree` start from the milestone branch (V21), and #295's fetch skips them | **R**: the rule says support starts a new session with `"fresh"`, in #313 |
| Deny rules in `settings.local.json` | They reach every worktree and worker (#287, 2026-11-01). In the work repo they denied a worker's recovery reset, and two sessions guessed the deny's source | Not a gap: the repo chose them. #310 removes the reset the worker needed. **R**, #313: the rule says where denies come from |
| Ignored setup files | Claude Code's creation copies what `.worktreeinclude` lists; a hand-built worktree gets nothing (the rule). worktrunk missed a nested pattern in sidekick (#287, 2026-11-01) | **ok** under Claude Code's creation, which every route but a detached ref uses |
| A `WorktreeCreate` hook | Base ignored (V7), no removal path in `finish` (V5), `ExitWorktree` asks (V6) | **R**: #287 (the creator verdict), and #310 |
| Tools that scan an in-repo worktree folder | Every Claude Code worktree nests in the repo (V12). A scanner whose ignore pattern matches the folder checks nothing inside a worktree; a nested worktree once broke the main checkout's linter (`docs/research/parallel-sessions/2026-10-31-worktree-probes-for-the-rule.md:133`) | The repo's own. The work repo's linter checks nested worktrees since its fix (V25). sidekick: I3. **R**, #313: sidekick's setup guidance names the check |

## Cases to cells

| Case | Cells | Mark |
|---|---|---|
| C1, parallel plans misread | Overlap and parallel dispatch | later: G2 is out (#312, #285) |
| C2, support beside a feature in one checkout | S create; M save | **ok**: the rule and the store (#286, #274) |
| C3, worker hand steps at landing | W land, remove | **ok** (#266, #267, #282) |
| C4, a locked orphan worktree | F remove | **R**, #284 lists it and leaves it |
| C5, a feature worktree over several days | F create (existing branch), work, save | **R**, #278 and #313 |
| C6, moving a branch back to the main checkout | F work, land | **R**, #313 |
| C7, dispatching from a feature worktree | F dispatch | **ok** (V4); **R**, #311 |
| C8, dispatching under a `WorktreeCreate` hook | W create | **R**, #310 and #287 |
| C9, recovering a worker under deny rules | W create; the deny trait | Not a gap; #310 removes the need |
| C10, a session drifting out of its worktree | F work | **R**, #313 |
| C11, a worktree inside the repo | The scanner trait | The repo's own, fixed in the work repo (V25); **R**, #313's setup check |
| C12, keep or remove at the end of the day | F and S remove | **R**, #284 |
| C13, a support worktree for a pull-request review | S create, remove | **ok** as done; **R**, #313 names `claude -w "#<pr>"` |

## Options

### Which tool makes worktrees

**D. Claude Code's own creation everywhere; drop worktrunk as a creator in both repos.** Recommended.

1. The design's L-b, the platform's own creation (design.md §T2).
2. The verbs the outcome names have measured passes under it: the base (V2), dispatch from a feature worktree (V4), `claude rm` (V3), `ExitWorktree`, and `.worktreeinclude`. Under worktrunk, a worker's base has a measured failure (V7), `finish` has no removal path (V5), and `ExitWorktree` asks (V6). The routes for an existing branch and a pull request are documented, not yet probed (V20).
3. `dispatch` already uses it, and the worker profile already forces it (V1).
4. Costs:
   - every worktree nests in the repo (V12), so a repo's scanners must ignore `.claude/worktrees/` from the root. The work repo's do since its fix (V25);
   - an existing branch takes a new session based by `"head"` from the branch's checkout. The work continues on `worktree-<name>`, and pushes to the branch's own name. Only a ref with no branch and no pull request is built by hand;
   - branches carry a `worktree-` prefix, which a pull-request repo sees unless it pushes to another name;
   - setup is the model's step under the rule, where worktrunk ran it before the session started. A skip leaves no error (V22);
   - `wt remove`'s squash-aware checks go; #284 covers interactive worktrees with #266's check;
   - open: I1, I3, I4, and I6.
5. The fifth repo needs `.worktreeinclude`, a setup line, the scanner check, and #284's disposable folders.

**K. Keep worktrunk for interactive sessions in the work repo; workers get Claude Code's creation.**

1. Two creators, split by role, through the worker profile's override.
2. It keeps sibling worktrees outside the repo, branch names without a prefix, and setup before the session starts. It has routes for an existing branch and a pull request (V23).
3. The override is in place (V1), and P1 measured it (V2).
4. Costs:
   - two lifecycles to keep working, the design's finding 2, though removal splits across several paths under D too;
   - every support worktree's removal asks (V6). One rule line could answer it: pass `discard_changes` after `git status --ignored` shows nothing new, an extra step the rule must carry;
   - a support check may start from a stale local default branch (I5), and #295's fetch updates only `origin`'s;
   - the override lives in a user-level profile, and any other hook-providing plugin needs its own line;
   - open: I1 and I5.
5. The fifth repo chooses its creator, and both lifecycles must keep working.

**Rejected: worktrunk for workers too.** Its hook receives only the name (V7), so no setting gives a worker its baseline. A user-level hook wrapping `wt` could pass a base, if the hook's input carries the launching checkout; that is new machinery, and unchecked. `finish` would also need V5's flag, whose id the refusals do not print.

**Rejected: keep the `wt` CLI without its plugin, for #284's listing and removal.** #284's new part is knowing which worktrees no live session holds, which the desk knows and `wt` does not. Its landed check is #266's. `wt` would add a binary every user must install, for a `git worktree remove` sidekick can run itself.

### How `dispatch` checks the worktree (#310)

**M1. Verify after creation.** Recommended. After `claude --bg` returns, `dispatch` reads the worktree on `worktree-<name>` from `git worktree list`. It requires the path `<main>/.claude/worktrees/<name>`, and the branch's creation commit at the baseline. It reads that commit from Claude Code's base marker or the branch's reflog, whichever the build verifies. So a fast first commit does not trip it. When the worktree is not yet listed, it waits a few seconds, well inside the Bash tool's limit. Then it says the check did not run (I6). On a mismatch it stops the job and refuses. The refusal names what it found and the likely cause: a `WorktreeCreate` hook, or `baseRef`.

The worker's start hooks run for seconds first (V2), and its own start check blocks off-baseline work (V15), though that check is model-followed text. M1 checks the result whatever made it, and models nothing of Claude Code's settings merge. It costs one `git worktree list` per dispatch. A refusal leaves a stray worktree. When `baseRef` caused it, `finish --discard` removes it. When a hook made it, `claude rm` cannot (V5), so the refusal names the hook's own removal, then `finish --discard`. That is a hand step, in a repo whose settings let a hook make worker worktrees.

Its blast radius: it pins Claude Code's naming again, which #282's finder had stopped computing. A change to that naming refuses every dispatch, closed and loud, and one constant changes.

**M2. Detect a `WorktreeCreate` hook before launch.** Rejected as the mechanism. It would model Claude Code's settings layers, managed settings, and plugin enablement, which drift between releases. A wrong model passes a bad worktree.

**M3. `dispatch` makes the worktree itself, then launches in it.** Rejected. Claude Code would not own the worktree, so `claude rm` would leave it, and it hand-rolls creation, which the design rejected (design.md §T2, L-c).

**M4. A `PreToolUse` hook in the worker that denies tools until `HEAD` is the baseline.** Considered, not adopted. It enforces V15's check without a race or a pinned name. But `dispatch` still prints success, and it adds a hook to every tool call in every worker.

### How `sk-execute` learns a mode can run (#311)

A brief-free check: `sidekick worker dispatch --check` with `--permission-mode` and no brief. It runs the checks that need none (V14): not inside a worker, a commit at `HEAD`, and clean tracked files. Also the branch held, push URLs, the profile, and the mode. `sk-execute` runs it before it offers a worker, and offers only modes that can run, naming why any other cannot. The brief's own checks stay at dispatch, and so does M1's, which `--check` cannot see. #311's verification changes to match. The profile check composes an overlay and may run `claude doctor` (`profile-launch.ts:298-325`), so #311 measures what the check costs before the mode is offered.

The other shape, a speculative brief written before the mode is chosen, was rejected: `sk-execute` writes the brief and runs the gates only after the choice (`plugin/skills/sk-execute/SKILL.md:73-86`).

## Recommendation

Adopt D, M1, and the brief-free check. Disable worktrunk in sidekick before plan 9, so the build and its probes run under the creator that ships. Drop it in the work repo at the release evening, when that repo's sessions get the rule. Confirm #284, #295, #296, #303, #310, and #311, and bring in #298, whose condition now holds. Return #293 and #297 to backlog. Add one rule issue, #313, and findings to #284, #295, #299, #303, #310, and #311.

Assumptions, and what changes if each is wrong:

1. **The operator accepts nested worktrees in the work repo, and `worktree-` branch names there.** Its linter already checks them (V25). If not, K is the fallback, and I5 is measured before the release.
2. **The profile's override works from a feature worktree (I1).** If it fails, #310 refuses the hook-made worktree at dispatch, and the operator disables worktrunk in that repo.
3. **Sessions follow the rule's setup line.** #286's later rounds ran it six times out of six (V22). A skip leaves no error, so a transcript pass after 0.7.0 checks it. A setup hook returns if sessions skip it, as #287's 2026-11-01 comment says.
4. **#293 and #297 fail closed and lose nothing.** Each refuses and removes nothing, and a re-run clears #297. #296 and #303 stay. #296's start check can trip the guard in every mode (V17). #303 fails open, letting a git call act on another repo.
5. **Plans 9 and 10 fit the bound.** sidekick's worker runs took 2 to 4 hours each (V26), plus a design session per plan. So the two plans are about two days of build, inferred from three runs. #284 is the largest piece.

## Lenses

| Lens | Load-bearing | Where it bites |
|---|---|---|
| Data model | Partly | No record changes here. #284, unchanged, adds a cached landed verdict per worktree and a per-repo declaration of disposable folders |
| Boundaries | Yes | Creation stays with Claude Code, and sidekick checks the result rather than modelling its settings (M1) |
| Extension points | Yes | A new creator is a refusal at dispatch, not a branch in `finish` |
| Contracts | Yes | `dispatch --check` is a new flag. The rule's text, which every session reads |
| Concurrency and failure | Yes | The worker starts before M1's check ends; its start hooks and its own check cover the gap. A late listing gets a bounded wait, then a stated skip. A refusal leaves a stray worktree |
| Operability | Yes | Each refusal names what it found and the way out |
| Testability | Yes | The finish fixture lacks a `claude rm` that refuses a hook-made worktree (V5) |
| Security | Partly | Dropping worktrunk removes its `PermissionRequest` auto-approval of worktree entry |
| Performance | No | One `git worktree list` per dispatch; `--check`'s cost is measured in #311 |
| Reversibility | Yes | Reinstalling the plugin restores the trial. The uninstall leaves a local entry per worktree path (V24), which the release evening clears |

## Breakdown

Each piece is a brief for one issue.

1. **#287 takes its verdict and stays open until the drop is done.** Before plan 9, disable worktrunk in sidekick's `settings.local.json` and clear its default-branch state there. At the release evening, uninstall it at local scope in both repos, and clear the entries for worktree paths (V24). #287 then closes by #201's route. The worker profile's override can stay, since it is harmless. P1 and P2 go on #287 as a comment, since this note is not their only record.
2. **#310, widened.** M1's check, with its bounded wait and its refusal texts. `sk-worker` §On start names a `WorktreeCreate` hook as the other cause. The finish fixture gains a `claude rm` that refuses a hook-made worktree, as the real one does. `finish`'s refusal for one names the way out: the hook's own removal, then `finish --discard`. That covers workers dispatched before the check. Its verification adds a by-hand dispatch from a nested feature worktree (I4).
3. **#296, confirmed.** #310 edits the same §On start, and the start check's `git -C` trips the guard in every mode (V17).
4. **#311.** The brief-free check, `sk-execute` running it before it offers a worker, and the verification changed to match.
5. **#303, widened.** The claude runner strips the same variables (V17).
6. **#284, with two additions.** Its body carries the ignored-file check for `finish`'s removal (V8), the listing of orphaned worktrees (V9), and the per-repo disposable folders. With none declared, every worktree that installed dependencies counts as dirty, so #284 declares the folders for sidekick and the work repo itself. It picks a home that needs no team agreement, and a `finish` in each repo still removes a worker's worktree. An interactive worktree's landed target is the default branch, or the branch the main checkout holds, so sidekick's milestone-branch work reads as landed. It is the largest piece, a plan of its own.
7. **#295, narrowed.** Its hook covers `EnterWorktree` under `"fresh"`. The rule's "fetch first" stays for `claude -w`, which no `PreToolUse` reaches, and #313's support route in a `"head"` repo is a `claude -w` launch.
8. **#313, new: the parallel-sessions rule names the routes a week of worktree use needed** (`area:guidance`). Each route is probed under the guard before its line is written, and one that fails is left out and filed. The routes:
   - work that will land or move back from the same session enters with `EnterWorktree`, by name or by path, so `ExitWorktree` can return it (I7). A session launched with `claude -w` hands off instead;
   - reopening with `claude -w <name>`, or `--resume`;
   - an existing branch: a new session with `"head"` from the branch's checkout, pushing to the branch's own name;
   - moving a branch back: `ExitWorktree` with `keep`, then remove the worktree and switch to the branch in the main checkout. Fast-forward it to the worktree's commits, with no `git -C`;
   - a session needing a second worktree starts a new session, and does not leave its own;
   - a pull request through `claude -w "#<pr>"`, and any other ref as a detached worktree entered by path;
   - landing by fast-forward from a worktree with no session in the main checkout: exit, and land as that checkout's owner;
   - support in a repo whose `baseRef` is `"head"`: fetch, then a new session with `"fresh"`;
   - a session started with `claude -w` for a workstream takes a title that starts with it, so the memory hook's title tier matches it;
   - a repo's deny rules reach every worktree and worker.

   sidekick's setup guidance, in `docs/reference/USAGE.md` §Set up once and `plugin/skills/sidekick/references/workers.md`, asks each repo to check that its scanners ignore `.claude/worktrees/` without skipping the files inside one. Out of scope: a gauge mark for the checkout, unless drift recurs after the rule ships.
9. **#299 joins plan 12, ahead of #278, at the operator's word.** `memory link`'s refusals print a `git -C` command and a `.gitignore` edit, which the guard refuses from a worktree (`memory-settings.ts:148`, `:157`). That finding goes on #299, the polish pass on the same refusals, whose condition #278's planning meets. #278 runs `link` in each repo, so it meets them all.
10. **#298 joins plan 9.** Its condition holds: plans 9 and 10 change `worker-dispatch.ts` and `worker-repo.ts`. It splits each by concern first, as a pure move.
11. **Returned to backlog:** #293 (V18; fails closed; add the third site, `worker-landed.ts:120-135`) and #297 (fails closed; a re-run clears it).

Plans after this one:

- **Plan 9, worker dispatch and hand-off hold in every checkout:** #298, #310, #296, #311, #303, #237. They share `dispatch`, `sk-worker` §On start, and `sk-execute` §Hand off to a worker. #298's split runs first.
- **Plan 10, one worktree lifecycle, through clean-up:** #284 alone, the largest piece.
- **Plan 11, the parallel-sessions rule names its routes:** #295 and #313, which both settle the rule's fetch line.
- **Plan 12, the family repos and home projects move onto the store:** #299, then #278.
- Plan 2 keeps #287 and #270. #201 follows as plan 13.

#313 ships with the release, like every rule (`AGENTS.md` §Working here). Nothing here is a contract change that must ship alone.

## Decision

Approved by the operator at gate 3 on 2026-11-04 ("i accept the rest"), with #299 brought in ("yes bring 299 in"). Their rulings:

- **D:** Claude Code's own creation makes every worktree. worktrunk was disabled in sidekick that day, and the work repo drops it at the release evening.
- **A session the operator launches is not a hand step.** A hand step is the operator running a git, clean-up, or copy command the tooling should run. The close's audit of the outcome reads "no hand steps" that way.
- **The regroup:** plans 9 to 13 as §Breakdown lists them, after the sealed scope review.

In the context of a week of worktree gaps found one at a time in daily use, we faced two creators with different lifecycles. A worker's base was ignored, and removals needed hand steps. We decided for Claude Code's own creation everywhere, a check in `dispatch` of the worktree it gets, and a CLI check before `sk-execute` offers a worker. The rule names a route for each move the week needed. That achieves create, dispatch, land, and remove with no hand steps in both repos. We accept nested worktrees under `.claude/worktrees/`, branch names with a `worktree-` prefix, and setup the model must run.

## Review

### Round 1

A fresh subagent on 2026-11-04, given only the note's path. Its answers changed the recommendation in two places, the drop's order and #311's shape, so a second round ran.

| # | Finding | Answer |
|---|---|---|
| 1 | `dispatch --check` needs a brief and a mode, and `sk-execute` writes the brief only after the mode is chosen | **Accepted.** The check takes no brief and runs only the checks that need none (V14); the brief's own checks stay at dispatch |
| 2 | V5's "no removal path" overstates: `claude rm --force-remove-worktree` exists, and the hook-loading cause was never probed | **Accepted.** V5 now says `finish` has no path today, and names the flag. The rejection of worktrunk for workers rests on V7 |
| 3 | Under D, an existing branch has no native route, and the matrix covered only new branches | **Accepted.** F create gains the existing-branch cell. Round 2 replaced the hand-built route that answer first gave |
| 4 | Nesting makes a skipped setup fail silently, and sessions already skip lines of the rule | **Accepted in part.** V22 records the silence. #286's later rounds ran setup six times out of six, so assumption 3 stands. A check after 0.7.0 would bring a hook back |
| 5 | Dropping worktrunk in the work repo takes lint coverage away from its feature worktrees | **Accepted.** Round 2 found the fix already in that repo, and P2 measured it (V25) |
| 6 | #284's disposable folders make every `finish` refuse until declared, unsized | **Accepted.** D's fifth-repo line names the declaration. Assumption 5 sizes plans 9 and 10 |
| 7 | S create's "ok from `origin`" is false in sidekick, whose `baseRef` is `"head"` repo-wide | **Accepted.** V21, a trait row, and a line in #313 |
| 8 | A pull request has a native route, `claude -w "#<pr>"`, which #313 ignored | **Accepted.** #313 names it, and keeps the detached worktree for other refs |
| 9 | Several routes #313 writes were never probed under the guard | **Accepted.** Each route is probed before its line is written, and one that fails is filed instead |

Round 1's minor findings, as they came:

- P1 is recorded only in this uncommitted note, and was a launch by hand, not `dispatch`. Acted on: V2 says so, and P1 goes on #287.
- worktrunk left a local install entry per worktree path, P1's included. Acted on: V24, and the release evening clears them.
- V4 came from a sibling feature worktree. Acted on: I4.
- V5 overstated the fixture. Acted on.
- M1 pins Claude Code's naming again. Acted on: its blast radius is stated.
- M1 reads `HEAD` while a worker may already commit. Acted on: it reads the branch's creation commit.
- `--check` cannot report a creator problem. Acted on, in #311's shape.
- Removal splits across several paths under D too. Acted on, in K's first cost.
- One rule line could answer K's `ExitWorktree` ask. Acted on, in K's costs.
- A user-level hook wrapping `wt` could pass a base. Acted on, in the rejection.
- Keeping the `wt` CLI for squash-aware removal in #284. Answered in round 2's minor findings.
- The data model lens missed #284's additions. Acted on.
- D's open items were not counted against it. Acted on.

### Round 2

A second fresh subagent on 2026-11-04, given only the note's path. Per the review procedure, no third round runs; what stays open is named under §Decision at gate 3.

| # | Finding | Answer |
|---|---|---|
| 1 | D's hand-built route for an existing branch is a second creator with no lifecycle. The rule's own `"head"` route, from the branch's checkout, gives a Claude Code worktree | **Accepted.** That route replaces the hand-built one for a branch (V20, D's costs, #313). Only a ref with no branch and no pull request is built by hand |
| 2 | The work repo's linter was already fixed, so the drop's condition was never re-checked | **Accepted.** P2 measured the fix in a nested worktree (V25), so both repos drop at the release evening |
| 3 | Deferring the work repo's drop leaves it running K at release, with the outcome unmet there | **Accepted.** Settled by round 2's finding 2: no deferral remains |
| 4 | M1 assumes the worktree exists when `--bg` returns, unmeasured under a hook; #282's design ruled out a wait in `dispatch` | **Accepted.** I6 labels it. M1 waits a few seconds, well inside the Bash tool's limit, and then says the check did not run. That bounded wait is a new decision, made here |
| 5 | A stray hook-made worktree from M1's refusal cannot be removed by `finish --discard` | **Accepted.** The refusal names the hook's own removal, then `--discard`. That hand step remains in a repo whose settings let a hook make worker worktrees, which the verdict removes from both repos |
| 6 | The breakdown is never sized against "no second week of build" | **Accepted.** Assumption 5 sizes plans 9 and 10 at about two days, from three worker runs (V26) |

Round 2's minor findings, as they came:

- V14 and V19 cited drifted lines. Acted on.
- V13 left out the reset caveat under `"fresh"`. Acted on.
- The rule already says to hand a landing off; only exiting and landing is new. Acted on, in the matrix and #313.
- #296's start check uses `git -C`, which the guard refuses in every mode, so bypass mode does not make it moot. Acted on: #296 stays, in plan 9.
- #311's verification cannot be met for M1's refusals. Acted on: it changes to match.
- `--check` costs a profile load and maybe a `claude doctor` run. Acted on: #311 measures it.
- M1's reflog read assumes ref logging; Claude Code's base marker may be sturdier. Acted on: the build takes whichever it verifies.
- V8 had no source. Acted on: the research report's §Gaps, item 6.
- Keeping the `wt` CLI for #284's listing and removal was dismissed too fast. Acted on: a rejection with its reason.
- A worker-side `PreToolUse` hook could enforce the baseline. Acted on: M4, considered.
- The design's line titling support sessions never reached the rule. Acted on, in #313.
- sidekick's format hook does nothing in a worktree with no setup. Acted on, in V22.
