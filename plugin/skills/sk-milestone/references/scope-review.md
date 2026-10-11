# The scope review

The scope review asks whether a milestone's scope makes sense as a whole, before the operator agrees its plans. It runs inside Opening step 4, after the draft grouping. Each issue was agreed on its own merits, and the review reads them together: against each other, against the outcome, and against the repo's objective. A sealed reviewer asks, because the session that drafted the scope finds little by reviewing its own proposals.

## The file

Write one file, on a path git ignores or outside the repo, holding:

- the outcome sentence and the scope lines;
- every milestone issue, with its number, title, and body, from `gh issue list --milestone "<title>" --state all --limit 200 --json number,title,body`;
- the draft plans, in their order, each with its issues;
- the open `backlog` issues' numbers and titles, so the reviewer can see a gap that is already filed, from `gh issue list --label backlog --state open --limit 200 --json number,title`;
- the path of the repo's objective source, found as `release-review.md` §The package finds it.

## The question

Dispatch `sidekick:sk-holistic-reviewer` once, with this prompt and `<SCOPE_PATH>` filled in. Send nothing else from the conversation.

```text
You are reviewing the scope of a milestone as it opens, before the operator agrees its plans. Its outcome sentence says what will be true when it closes. Each plan is a group of issues one session can hold, and the plans run in the order listed.

Read <SCOPE_PATH> first. It holds the outcome, every issue in the milestone, the draft plans, the titles of the open backlog issues, and the path of the doc that states the repo's objective. Your working directory is the repository: read the code and docs the issues name, as far as the question needs.

The question has four parts:
- Do any of the issues oppose each other, so that resolving one undoes or blocks another?
- Do the plans make sense: does each group belong together, fit one session, and come after the plans it depends on?
- Is a gap or an improvement missing, one the outcome needs and no issue covers? A backlog title may already name it.
- Does each issue serve the repo's objective, as its source states it?
```

## Answering

Answer each finding beside it: what it changes in the grouping or the scope, or why it does not hold. Hold each answer to the finding's evidence standard. Show the operator the review and your answers beside the draft grouping, and ask them to rule on both in one ask. Then write the plans header as Opening step 4 says.

An issue that fits the repo but not this milestone returns to `backlog`, with a `Revisit when:` line in its body: `gh issue edit <n> --remove-milestone --add-label backlog`. One that does not fit the repo closes `not planned`, with a one-line verdict: `gh issue close <n> --reason "not planned" --comment "<verdict>"`. Both are written on the operator's yes, like every other change the review leads to.
