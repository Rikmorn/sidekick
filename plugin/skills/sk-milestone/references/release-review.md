# The release check

The release check reads what a milestone ships as one piece, before the release is prepared. Each plan had its own review, and the audit asks whether each clause of the outcome holds. Neither reads the plans' changes together. The check asks three questions of the whole release: do its statements agree, is its work complete, and does it fit the project? Three sealed reviewers ask them, and the closing session confirms and fixes what they find.

## The range

The range is what ships: from the latest published release's tag to `HEAD`. Find the tag, then resolve it to its commit, since an annotated tag's own name resolves to the tag object:

```
gh release list --exclude-drafts --exclude-pre-releases --limit 1 --json tagName --jq '.[0].tagName // "none"'
git rev-parse --short '<tag>^{commit}'
```

When the first command prints `none`, the repo has no published release. Start then from the last commit before the previous milestone closed. The previous milestone is the closed one with the latest `closed_at`:

```
gh api 'repos/<owner>/<repo>/milestones?state=closed&per_page=100' --jq 'max_by(.closed_at) | .closed_at'
git rev-list -1 --before='<closed_at>' HEAD
```

When no milestone has closed, this milestone is the first. Start from the last commit before this milestone was created:

```
gh api repos/<owner>/<repo>/milestones/<n> --jq .created_at
git rev-list -1 --before='<created_at>' HEAD
```

When `git rev-list` prints nothing, no commit precedes the milestone, because the repo was born with it. The base is then git's empty tree, `git hash-object -t tree /dev/null`, whose hash stands in for a commit's.

Every open milestone's landed work is in the range, because it ships with this release. The package lists those milestones' plans, so the reviewers read that work as in progress.

## The package

Run the repo's gates first, at `HEAD`: the ones its guidance names, in `AGENTS.md`, `CLAUDE.md`, or a doc they name. The reviewers have no shell, so the package carries what the gates said.

Then write two files to `.superpowers/sdd/release-check-<version>/` inside the repo, and nowhere else, so the reviewers read them from their working directory. When `.superpowers/sdd/.gitignore` is absent, write it holding `*`, as superpowers' own workspace script does. Then confirm git ignores the directory: `git check-ignore -q <dir>` exits 0 when it does.

**`review-<base>..<head>.diff`** names both ends of the range by their short hashes, as in `.superpowers/sdd/release-check-1.2.0/review-4e1f0a2..9c7b3d5.diff`. sidekick's Read hook knows that name, so a reviewer reading the file gets sidekick's claims check from the hook's one source. It also gets the Comments paragraph when the diff touches files `sk-clean-code.md` covers. Another name loses it without an error. The file holds the range's commits, its file stat, and its diff with ten lines of context, so a reviewer sees what each change replaced. Leave out generated output, lockfiles, and test fixtures, one `':(exclude)<path>'` pathspec each:

```
git log --oneline <base>..<head>
git diff --stat <base>..<head> -- . ':(exclude)<path>'
git diff -U10 <base>..<head> -- . ':(exclude)<path>'
```

When the base is the empty tree, list the commits with `git log --oneline <head>`, since the empty tree is no commit.

**`milestone.md`** holds what the reviewers need and the working tree does not show:

- the range, where its base came from, and what the diff left out;
- the outcome sentence and the plans header;
- every milestone issue, open or closed, with its number, title, state, close reason, and body, from `gh issue list --milestone "<title>" --state all --limit 200 --json number,title,state,stateReason,body`;
- the plans header of every other open milestone;
- each gate's command and result, with the output of any that failed;
- the path of the repo's objective source, the doc that says what the repo is for;
- each dependency the repo's guidance makes claims about, such as a library, a plugin, a CLI, or the platform it runs on.

Find the objective source where `sk-design` §Before the note looks for architecture sources: `AGENTS.md`, `CLAUDE.md`, and any vision doc, such as a north star under `docs/`. Take the doc `AGENTS.md` or `CLAUDE.md` names, or else that vision doc. With neither, take the README, or the doc it names.

Give each dependency its installed version, the path to its installed copy when there is one to read, and the version the previous check recorded. That record is in the previous release's notes, under the heading §The record names:

```
gh release view <tag> --json body --jq .body
```

Say so when there is no earlier record.

## Dispatch

Dispatch `sidekick:sk-holistic-reviewer` three times in parallel, once for each lens in §The lenses, with the package's paths filled in. Each lens draws on its own sources, so each reviewer holds one question. Send each its prompt and nothing else. Leave out any summary of the conversation, any word on who wrote the work, and any cue such as "this looks solid". A reviewer judges work more kindly when told it is liked or owned. The agent's definition sets what it returns, so add nothing on format.

A reviewer that stops at its turn cap returns a partial result. Resume it, and treat one not resumed as a lens that did not run.

## The lenses

Each template takes the package's two paths, `<MILESTONE_PATH>` and `<DIFF_PATH>`.

### Agreement

```text
You are checking that a release agrees with itself before it ships. Two other reviewers read the same release for completeness and for fit, so spend your reading on agreement.

Read <MILESTONE_PATH> first. It holds the milestone's outcome, its plans and issues, the gate results, and what the diff leaves out, and it names any further files to read. Then read <DIFF_PATH>, the diff of everything the release ships. Your working directory holds the repository as it will ship.

The question: does every statement of a fact the release changed still agree with it, across files and across plans? A fact is anything a reader acts on: a name, a path, a count, an order of steps, a rule, how a part behaves. For each fact the diff changes, find its other statements, in files the release left untouched and in other plans' changes alike. A paraphrase rarely shares the changed text's words, so search for the idea as well as the words. Where two plans changed related facts, read the two together.
```

### Completeness

```text
You are checking that a release is complete before it ships. Two other reviewers read the same release for agreement and for fit, so spend your reading on completeness.

Read <MILESTONE_PATH> first. It holds the milestone's outcome, its plans and issues, the gate results, and what the diff leaves out, and it names any further files to read. Then read <DIFF_PATH>, the diff of everything the release ships. Your working directory holds the repository as it will ship.

The question: did each issue's resolution land, is everything added wired in where it is used, and is everything removed gone from where it was cited? Read each issue's body against the diff: what it asks for, and what landed. An issue closed `NOT_PLANNED` asks for nothing. A file, section, command, step, or name the release adds needs a place that loads, links, lists, or calls it. One the release removes or renames leaves no citation behind. Landed work from another open milestone ships too, while that milestone is still in progress. Judge what of it landed, not whether that milestone is done.
```

### Fit

```text
You are checking that a release fits its project before it ships. Two other reviewers read the same release for agreement and for completeness, so spend your reading on fit.

Read <MILESTONE_PATH> first. It holds the milestone's outcome, its plans and issues, the gate results, and what the diff leaves out, and it names any further files to read. Then read <DIFF_PATH>, the diff of everything the release ships. Your working directory holds the repository as it will ship.

The question: does anything the release changes contradict the repo's objective, its decision records, or behaviour it had before? <MILESTONE_PATH> names the doc that states the objective, and the decision records are the repo's ADRs, wherever it keeps them. The diff's removed lines show the behaviour it had: a step dropped, a default changed, an output reshaped. A behaviour change an issue asks for is intended, so judge it against the objective and the records. One no issue asks for is a finding.

Then the dependencies. <MILESTONE_PATH> lists each dependency the repo's guidance makes claims about, with the version installed now and the version the previous check recorded. For each whose version moved, find every claim the guidance makes about it, and check each against the installed copy. With no earlier record, every dependency counts as moved.
```

## Confirming and fixing

Confirm each finding at its source before acting on it, because a model asked for inconsistencies flags many that are not there. Re-read the lines it quotes, and both sides of a conflict. Drop a finding you cannot confirm, with its reason; the operator sees each drop at the ask. Read the Minor list the same way. An item there is a finding when its source shows it leaves the release wrong or inconsistent. The rest go into the record as they came. Rule on each line under Declined to judge: judge it at its source yourself, or name it to the operator at the ask.

Fix every confirmed finding before the release. A fix is consistency work, not an addition, as `sk-pm-conventions.md` §Change control defines it, so it needs no issue of its own. Its commit cites the issue whose change left the problem, and it lands by the repo's route.

A finding too large for the closing session is still consistency work, and the release waits on it. Post it at once as `AT_RISK`, as `sk-orient` §Status updates says. The operator chooses one of two routes:

- a plan added to the plans header, as Opening step 4 adds to it after Opening;
- backing out the change that caused the finding.

Shipping it as it stands is not a route, and neither is a later milestone. Being consistency work, it falls outside §Change control's deferral and the audit's extension test. An added plan takes an issue in this milestone, since a plan line names its issues. After the plan lands, run Closing step 1's gate again.

## The re-check

When fixes landed, run the three lenses once more, after the preparation and before the ask. Write a new diff into the package directory. It runs from the check's head, the first diff's `<head>`, to the working tree, so it carries the fixes and the uncommitted preparation:

```
git log --oneline <check head>..HEAD
git diff --stat <check head> -- . ':(exclude)<path>'
git diff -U10 <check head> -- . ':(exclude)<path>'
```

Name it `review-<check head>..<head>.diff`, with the current `HEAD` as its second hash. Add the preparation's gate results to `milestone.md`. Add the paths of the prepared release notes and learning record too, since `git diff` leaves out a file git does not track. Then dispatch the same three prompts, with the new diff's path. What they find goes to the operator at the ask, beside the first round's findings. The operator orders any further round; run none on your own.

## The record

The release notes carry a section headed `Release check`. It lists each finding with its fix's commit, or its drop and the reason. It lists the minor findings as they came, and each dependency with the version checked. The next check reads those versions to decide which dependencies moved, so notes without them make every dependency count as moved.

A kind of finding that recurs across closes belongs upstream, as a deterministic check or as a line for each plan's reviewer. The previous release's section shows whether a kind recurs. File it through `sk-track`.
