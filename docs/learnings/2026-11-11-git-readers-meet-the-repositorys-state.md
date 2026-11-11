# Code that reads git meets the repository's state, not git's defaults

R10.1, milestone 11 on `Rikmorn/sidekick`, released as 0.7.2 (#293, #319, #332).

## Context

R10.1 fixed defects in what 0.7.0 and 0.7.1 shipped. R10 had built its worker and worktree verbs from a matrix of use cases. That matrix crossed lifecycle stages, places, and repo traits (`2026-11-08-use-cases-before-building-more.md`). The verbs' tests built small repositories with `git init`. After the release, three defects came from git states that the matrix never named.

## Lesson

**Code that reads git inherits every way the repository's state departs from git's defaults.** A repository a test builds with `git init` exercises none of them. R10.1 fixed three kinds:

- Size: a status past the output buffer, and paths past the argument limit (#293).
- Index flags: a skip-worktree or assume-unchanged file hides its edit from `git status` (#319).
- Failure kinds: `git rev-parse` fails for reasons other than an outside folder, and sites across the CLI read every failure as that one (#332).

Its backlog holds four more of the same kind, each found during plan 5. They are `core.ignoreStat` (#352), the stat settings (#353), `move` and flagged files (#356), and a `warning:` line before git's `fatal:` (#357).

So a design that reads git's state lists the departures that touch what it reads, and its tests build each one. R10's matrix had an axis for repo traits, and git's own state belongs on it.

## Consequences

- 0.7.2 carries the three fixes. #352, #353, #356, and #357 stay in backlog, each with its `Revisit when:` line.
- This is the second milestone, after R10, whose defects came from inputs nobody listed before building. R10's record named a second one as the point where the analysis step becomes a candidate for `sk-design`. At R10.1's close the operator ruled to take it up, and it is filed as #358, in backlog.
