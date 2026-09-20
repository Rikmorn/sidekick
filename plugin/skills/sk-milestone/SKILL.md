---
name: sk-milestone
description: Open a milestone with its outcome, or close one with an audit against that outcome and a release. Use when a milestone is being opened, when its work is done, or when asked whether a milestone can close.
---

# sk-milestone

Milestones are releases: one opens with an outcome sentence and closes with an audit against it, a version tag, and a GitHub Release. Both moments run only where `sidekick pm board` reports `tracked: true`. Grooming between the two is not this skill's; it is tracked separately.

## Opening

1. The outcome sentence comes first: what will be true when the milestone closes. Agree it with the operator, then the scope in a line or two and the size, one or two sessions. A milestone that needs more is two milestones.
2. Create it: `gh api -X POST repos/<owner>/<repo>/milestones -f title="<title>" -f description="Outcome: <sentence> Scope: <lines> Size: <sessions>."`. There is no `gh milestone` command.
3. Seed scan: list the open `backlog` issues with `gh issue list --label backlog --state open`. For each, read its `Revisit when:` line and ask whether the condition now holds. Propose the ones that do; nothing moves without agreement. An accepted seed loses the label and gains the milestone: `gh issue edit <n> --milestone "<title>" --remove-label backlog`.
4. Tell the operator the milestone, its outcome, and what it opened with, then orient: the first pickup comes from the board.

## Closing

1. `sidekick pm gate --milestone "<title>"` says whether anything is still open, and `sidekick pm lint` says whether the board is clean. Every open issue is dispositioned before anything else. It is carried into the next milestone with a reason, closed `not planned` with a verdict, or returned to `backlog` with a `Revisit when:` line. Every lint finding is fixed or named.
2. Audit against the outcome sentence: for each clause, what shows it is true? A clause without evidence is a gap, and each gap gets an issue or an explicit judgment that it did not matter. The extension test applies here. A milestone extends only for must-haves that survived scope-cutting and carry no remaining unknowns; everything else belongs to the next milestone.
3. Present the dispositions, the audit, and the version to the operator, and ask before anything outward. Nothing after this step runs without a yes.
4. The release, in this order. Bump the version where the repo keeps it (sidekick: `version` in both `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, then `bun run build`; a package: `package.json`) and commit. Tag and push the tag: for sidekick, `claude plugin tag plugin --push -m "sidekick %s"` does both. Otherwise `git tag -a <tag> -m "<title>"`, then `git push origin <tag>`. Then `gh release create <tag> --verify-tag --generate-notes`, and `gh api -X PATCH repos/<owner>/<repo>/milestones/<n> -f state=closed`.
5. Comment `Resolved in <version>.` on each issue the milestone completed, so an issue says which release carried it. List them with `gh issue list --milestone "<title>" --state closed --json number,stateReason` and keep only `stateReason` `COMPLETED`; a `not planned` close gets no comment. GitHub relates a milestone to a release nowhere; the comment is that link.
6. If the bar in `docs/learnings/README.md` holds, write the milestone's learning record. Then tell the operator what shipped, in one line, and orient again: the next milestone opens from the board.
