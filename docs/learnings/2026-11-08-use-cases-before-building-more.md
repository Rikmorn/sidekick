# Map the use cases before building more, then run each plan by hand

R10, milestone 10 on `Rikmorn/sidekick`, released as 0.7.0 (#308, #309).

## Context

R10 set out to give every session one memory store. Daily use of the milestone branch in a work repo, from 2026-10-27 to 2026-11-04, kept hitting worktree gaps, each fixed as it surfaced. #308 lists four, among them a worker that could not be dispatched from a feature worktree, and worktrees removed by hand. Each fix cost a context switch in the middle of real work, and the next gap came days later. On 2026-11-04 the operator ruled that the release waits for correctness. The outcome widened to worktrees that run end to end (#308), and an analysis of every use case came before anything more was built (#309).

## Lesson

**A matrix of the use cases, checked against the branch, finds the gaps that piecemeal fixes find one at a time.** #309 crossed six lifecycle stages, four places, and seven repo traits. It checked each cell against the milestone branch by reading the code or by a probe, and gave every must-work cell an issue. Its regroup became plans 9 to 13.

**By-hand runs on real inputs still find what the matrix and the tests miss.** So each plan ends with them, before the release rather than after. The analysis did not end new defects: it moved where they turned up.
- Plan 9's after-file found #316, a stopped worker's locked worktree.
- Plan 11a's by-hand runs found a refusal that offered to mark a branch `move` had only switched to, fixed in `9bb8064`.
- Plan 11b's after-file found that a fresh `claude -w` session stepped out with the wrong verb, and that `remove`'s restore line could name a branch already in use, both fixed in `79b37e1`.
- Plan 12's real migration found that `link` counted finished background jobs as open sessions (#299's comment of 2026-11-08). Its after-file found that a re-run refused on a linked repo whose emptied project folder was gone, fixed in `eadfa79`.

Each was fixed before the release instead of in the middle of the operator's work.

Both halves hold beyond worktrees. When a feature's inputs vary along several axes, map them before building. Then test each plan on the real inputs it will meet.

## Consequences

- The operator's ruling stands as a working preference: between an earlier release and covering every use case, wait, and keep the analysis bounded by marking each case must-work or later. It is not yet in a rule. One milestone is one data point, under `sk-guidance-authoring.md` §Admission.
- Plans carry an after-file of by-hand runs (`sk-execute` §Before the plan goes out), and R10's plans 9 to 12 each used one.
- Nothing else changed. A second milestone with the same shape would make the analysis step a candidate for `sk-design`.
