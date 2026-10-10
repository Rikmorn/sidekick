---
name: sk-milestone
description: Open a milestone with its outcome, or close one with an audit against that outcome and a release. Use when a milestone is being opened, when its work is done, or when asked whether a milestone can close.
---

# sk-milestone

Milestones are releases: one opens with an outcome sentence and closes with an audit against it, a version tag, and a GitHub Release. Both moments run only where `sidekick pm board` reports `tracked: true`. Grooming between the two is not this skill's; it is tracked separately.

## Opening

1. The outcome sentence comes first: what will be true when the milestone closes. Agree it with the operator, then the scope in a line or two. Size the milestone by that outcome: the smallest release that makes the sentence true.
2. Create it from a file, so line breaks reach GitHub as written. Write `Outcome: <sentence> Scope: <lines>.` to a file, then run `gh api -X POST repos/<owner>/<repo>/milestones -f title="<title>" -F description=@<file>`. There is no `gh milestone` command.
3. Seed scan: list the open `backlog` issues with `gh issue list --label backlog --state open --limit 200`. For each, read its `Revisit when:` line and ask whether the condition now holds. Propose the ones that do; nothing moves without agreement. An accepted seed loses the label and gains the milestone: `gh issue edit <n> --milestone "<title>" --remove-label backlog`. Then list the designs whose `docs/designs/<topic>/design.md` status line reads `ready for PM`, and propose them the same way. An accepted design is filed through `sk-track`, one issue per piece of its breakdown, into the milestone. Its status line becomes `planned (#NN, …)`.
4. Group the milestone's issues into plans. Each is a logical group sized to what one session holds, so a session starts and ends cleanly. Name each plan by its content, never by a letter or a number. List the plans in the order to take them: the header's order is the run order, so the description needs no separate `Order:`. Agree the grouping with the operator, then write the plans header at the top of the description's file, before the outcome:

   ```
   <!-- plans -->
   1. <name> (#N, #N)
   2. <name> (#N)
   <!-- /plans -->

   Outcome: <sentence> Scope: <lines>.
   ```

   `sidekick pm` reads plans from this header alone, and never from the prose after it. PATCH the whole description from the file: `gh api -X PATCH repos/<owner>/<repo>/milestones/<n> -F description=@<file>`. A `PATCH` replaces the whole field, so the file carries the description in full. The grouping comes last because a design's breakdown gets its issue numbers in step 3. After Opening, a regroup or an addition first writes the live description to the file:

   ```
   gh api repos/<owner>/<repo>/milestones/<n> --jq .description > <file>
   ```

   Then edit its header and PATCH it with the step's `PATCH` command, with a comment on each moved issue saying why.
5. Tell the operator the milestone, its outcome, its plans, and what it opened with. The scope is now what the description names, and later additions follow `sk-pm-conventions.md` §Change control. Post the first status update, `ON_TRACK`, as `sk-orient` §Status updates says, naming this milestone. Then orient: the first pickup comes from the board. While another milestone stays open, `pickup` names this one once it alone holds In Progress cards. Until then the brief lists both, and the operator chooses.

## Closing

1. `sidekick pm gate --milestone "<title>"` says whether anything is still open, and `sidekick pm lint` says whether the board is clean. Every open issue is dispositioned before anything else. It is carried into the next milestone with a reason, closed `not planned` with a verdict, or returned to `backlog` with a `Revisit when:` line. Every lint finding is fixed or named.
2. Audit against the outcome sentence: for each clause, what shows it is true? A clause without evidence is a gap, and each gap gets an issue or an explicit judgment that it did not matter. The extension test applies here. A milestone extends only for must-haves that survived scope-cutting and carry no remaining unknowns; everything else belongs to the next milestone. The audit also lists each `docs/designs/<topic>/` whose status line reads `planned` and whose issues have all closed. It lists the issues added after Opening too, so each addition is visible at the close. An addition carries the comment `sk-pm-conventions.md` §Change control asks for. Without one, `gh api repos/<owner>/<repo>/issues/<n>/events` dates the issue's `milestoned` event against the milestone's `created_at`. Opening's own filings follow `created_at` within its session, and a later join is an addition.
3. Decide the learning record here, because the release commit carries it. The bar is a counterfactual: without the record, would the next engineer repeat the mistake or redo the investigation? Present the dispositions, the audit, the version, and the record judgment to the operator, and ask before anything outward. Nothing after this step runs without a yes.
4. The release, in this order. When the record clears the bar, write it in the repo's learnings folder, in the shape its README states. Without one, the shape is the docs layout's default: `../sidekick/references/docs-layout.md` §learnings/, relative to this skill's base directory. Bump the version where the repo keeps it and delete the design folders the audit listed. For sidekick the version lives in `plugin/.claude-plugin/plugin.json` and in both `version` fields of `.claude-plugin/marketplace.json` (`metadata.version` and `plugins[0].version`), and `bun run build` follows the bump; for a package, it lives in `package.json`. Commit it all together, so the tag carries the record. Tag and push the tag: for sidekick, `claude plugin tag plugin --push -m "sidekick %s"` does both. Otherwise `git tag -a <tag> -m "<title>"`, then `git push origin <tag>`. Then `gh release create <tag> --verify-tag --title "<repo> <version>" --notes-file <notes>`, with notes the close wrote from the audit, issue by issue, and a link to the record when there is one. Then post the closing status update, `COMPLETE`, as `sk-orient` §Status updates says, naming this milestone. Post it while the milestone is still open, since `pickup --report` reads only an open one. Last, `gh api -X PATCH repos/<owner>/<repo>/milestones/<n> -f state=closed`.
5. Comment `Resolved in <version>.` on each issue the milestone completed, so an issue says which release carried it. List them with `gh issue list --milestone "<title>" --state closed --limit 200 --json number,stateReason` and keep only `stateReason` `COMPLETED`. A `not planned` close gets no comment. GitHub relates a milestone to a release nowhere; the comment is that link.
6. Tell the operator what shipped, in one line, and orient again: the next milestone opens from the board.
