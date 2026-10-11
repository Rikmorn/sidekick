# Sub-problem: when docs/superpowers/ goes

Part of `design.md`, gate 2. Status: superseded on 2026-10-11 by `working-file-citations.md`: no sweep ships · 2026-10-10

## Problem

The guidance says the working folder is disposable, and no step disposes of it (F2). `sk-pm-conventions.md` §Working docs says "delete on closure; the learning record is the tombstone". `docs-layout.md` §superpowers/ says "deleted when its work closes". Neither names who deletes or when. The result is 98 files dating back to 2026-06-10, measured 2026-10-10 with `find docs/superpowers -type f | wc -l`.

The two texts also state one lifecycle in two places, against "No mirroring".

## Constraints

- **Verified**: four producers write there. Superpowers writes specs and plans, `sk-design` writes shape notes under `designs/`, and `sk-worker` writes run reports beside the plan. Scratch research lands there too.
- **Verified**: nothing reads the folder once a plan has run. `sk-execute` reads a run report during the run, to review the branch. No skill reads it at or after a milestone's close.
- **Verified**: #138's measurement method reads session transcripts under `~/.claude/projects/`, not run reports, so deleting run reports costs it nothing.
- **Verified**: superpowers 6.4.1 deletes only its own `.superpowers/sdd/<plan>/` workspace, at the final review. Three abandoned workspaces from R3, dated 2026-09-13 and 2026-09-17, remain.
- **Verified**: both folders are gitignored, so a deletion cannot be undone. The operator asked to be asked before the first sweep (#100, 2026-09-26).
- **Verified**: `sk-milestone`'s close already deletes the design folders the audit listed, in its release step. #165, in the next plan, edits the same step.
- **Inferred**: plans are written when a plan is picked up, as in R8. At a close, then, the folder holds closed work, plus any design note still in progress.

## Options

### Option A: sweep at the milestone's close

- The layout's §superpowers/ says the folder empties at the close of the milestone its work served, after the learning record. The record is the tombstone, as the rule already says.
- `sk-milestone`'s close lists what `docs/superpowers/` holds, beside the design folders it deletes. It asks the operator which to keep, since open work may still use a file, and deletes the rest after a yes.
- The rule's §Working docs keeps one line pointing at the layout, so the lifecycle lives in one place.
- The first sweep is R8's close, the step's first run. It takes the 98 files and the three dead `.superpowers/sdd/` workspaces.

Pattern card:

1. Batch cleanup at a release boundary, with a dry run and a confirmation. GSD's milestone close archives its planning files, and its `cleanup` command moves phase folders after a dry run and a yes.
2. It gives the stated lifecycle an owner and a moment. The close already exists, already deletes design folders, and comes after the record that makes the files redundant.
3. Already in the repo: `sk-milestone`'s release step deletes the design folders the audit listed.
4. Cost: files live until the close, which can be weeks, and each close carries one more listing and one more yes. Don't use it in a repo with no milestones; there the layout's lifecycle falls to the operator, as it does for `designs/`.
5. Next change: a new kind of working file needs nothing, because the sweep covers the folder.

### Option B: delete when a plan finishes

- When `sk-track`'s close finishes a plan, which its step 6 already detects, it deletes that plan's spec, plan, run report, and shape notes.

Pattern card:

1. Per-unit cleanup, as superpowers deletes its own workspace at a plan's final review.
2. Files go as soon as their work is done.
3. Partly in the repo: `sk-track` step 6 detects a finished plan to post a status update.
4. Cost: nothing links a file to its plan, since filenames are free-form, so each close guesses. A spec that serves two plans goes early. Run reports go before the milestone's record is written. Don't use it without a machine-readable link from file to plan.
5. Next change: every new kind of working file needs a rule for which plan it belongs to.

### Option C: keep the files, and say so

- The rule and the layout say the folder is local scratch, never cited by a committed file, and pruned when the operator likes.

Pattern card:

1. Local scratch with no lifecycle.
2. Practice and guidance agree with no new step.
3. Already in the repo, as practice.
4. Cost: the folder grows without bound. Inferred: stale plans and specs surface in searches as planned state, which odin's `docs/README.md` warns about ("check the code first"). Don't use it if sessions search `docs/` for context.
5. Next change: none.

## Final decision, 2026-10-11

Review round 2 showed an automated trigger cannot be made reliable cheaply. Issues cite working files in prose, `#NN` strings are often PR or order numbers, and the real links between files are explicit `Spec:` and `Plan:` lines. The operator then reframed the problem. A deletion can only lose something when a durable thing depends on a working file, so the dependency is the defect. `working-file-citations.md` stops it with a rule line and a lint check.

With that in place, the operator accepted the recommendation: **no sweep command ships.** The layout says the folder is local scratch, cleared when the operator chooses, and that nothing durable cites it. Option C, "keep the files, and say so", stands, now safe. Its inferred cost was wrong anyway: searches that respect `.gitignore` never reach the folder.

## Revised after review round 1, 2026-10-11, since superseded

The operator accepted review answers 2 and 3 (`design.md` §Review). The sweep's trigger changes from the whole folder with a keep list to the issues each file names:

- A working file is listed as done once every issue it names has closed, and no open issue's body cites it. A file names its issues near the top, as `sk-pm-conventions.md` requires, or through its stem group. Plans, run reports, and after-files share their spec's date-and-slug stem.
- A file that names no issue is listed for the operator, never deleted unasked. That covers pre-GitHub files, a durable file such as aesir's test-bench log, and everything in an untracked repo. "Leave it without the PM layer" holds by construction.
- Before any sweep, #116's "Tests that could not fail" table moves into #116, which today calls a run report its full record.
- Deletion stands rather than archiving, per the operator's ruling that sidekick keeps no frozen history (#100, 2026-09-25). Furnace and GSD archive instead.
- Option B's rejection rested on "nothing links a file to its plan", which was false. Measured 2026-10-11: 37 of the 77 Markdown files name an issue in their first 15 lines, including every spec and shape note since R6.

## Stance

**Decided 2026-10-10, before the review: Option A in a tracked repo, through a cleanup command scoped to the folder.**

- The operator asked for a cleanup script that runs once work is complete. In a tracked repo, `sk-milestone`'s close runs it after the learning record. In a repo without the PM layer, such as odin, the folder stays until the operator runs the same command. "Complete" is hard to pin down in chaotic work with no issues.
- `git clean -X` was considered and rejected. Verified on git 2.50.1: with a pathspec, it removes only ignored files under that path. But its default scope is every ignored file in the repo, so one missing pathspec deletes files like odin's important ignored ones, with no undo. It also treats an ignored folder as one entry, so it cannot keep a single file.
- So the command's scope is fixed in its code, not given by a flag. It works only inside `docs/superpowers/`, lists by default, and deletes only with an explicit yes, sparing any file the operator names to keep. The plan settles its interface, and its own tests show it cannot reach outside the folder.
- `.superpowers/` stays superpowers' own, since superpowers deletes its workspaces and a sweep could hit a run in progress. Its three abandoned R3 workspaces go once, by hand, at R8's close, with a yes.

The recommendation, as written before the decision: Option A. Option B guesses which plan a file belongs to, and Option C keeps a growing pile of stale planned state.

It rests on three assumptions:

- Nothing needs a working file after the milestone's record. Verified for the skills and for #138. If the operator wants run reports as data across milestones, they must move to a record first, and Option A is unchanged otherwise.
- At a close, the folder holds closed work apart from a design note in progress. The listing and the operator's keep list cover the exception.
- One listing and one yes per milestone is acceptable friction.

Sequencing: this edits `sk-milestone`'s release step before #165 does, so #165 builds on it.
