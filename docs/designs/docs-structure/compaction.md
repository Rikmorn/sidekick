# Sub-problem: compaction

Part of `design.md`, gate 2. Status: decided 2026-10-10, D4 as the operator amended it, D5 revised after review · 2026-10-10

## Problem

Three operator rulings set the direction, and this note settles how each is carried out. The frozen folders go once nothing is lost (goal 2). `reviews/` is rehomed and deleted (ruling of 2026-10-10). The old doctrine (F7) and the texts the deletion makes false (F10) follow from both.

Most of the work is mechanical. Five choices are real, and each has a recommendation in §Decisions.

## Constraints

- **Verified**: a record takes a repaired link and nothing else in its body (`docs/README.md` §Lifecycle classes). A link to a deleted file is repaired by pointing it at a commit that still holds the file.
- **Verified**: `pre-pivot-2026-09` holds `docs/EPIC.md` at the docs root, not under `work/`, so it cannot serve every permalink. The last commit before the deletion holds every path as it stands.
- **Verified**: aesir's `docs/README.md` names the commit that keeps its retired folders, and gives `git show 1b6d6ce9:docs/history/README.md` as the way in.
- **Verified**: `sk-pm-conventions.md` §Placement test carries the paragraph about sidekick's `docs/work/` (F3). Its last two sentences state a general record discipline: promote true-now content out, and a record keeps the identifiers it was written with.
- **Verified**: `DESIGN-PRINCIPLES.md`'s principles 1–8 are restated in live guidance. `sk-guidance-authoring.md` covers trusting reasoning and deleting what no longer earns its place. `sk-agent-prompts.md` Rules 2, 5, 6, 10, and 11 cover guardrails, verifier independence, reasoning, fan-out, and depth. `NORTH-STAR.md` covers retiring what goes unused. Principle 9, autonomy derived per task, appears in no live doc; its research was parked by ADR-0009, and #4 closed as not planned.
- **Verified**: the five research files at the `research/` root are records cited by other records. The counts are 5 for `SYNTHESIS.md`, 2 for `ACTION-PLAN.md`, 5 for `prior-art.md`, and 4 for `platform-landscape.md`, from `git grep -l "<name>.md" -- docs`.
- **Verified**: `NORTH-STAR.md` says "the audits under `docs/reviews/2026-09-18-*.md` say what the programme found".
- **Verified**: the three surveys already follow the layout's report naming, `YYYY-MM-DD-<slug>.md`.
- **Verified on 2026-10-11**: remark-validate-links flags a permalink to a file no longer in the tree, unless it runs with `repository: false`. `checks.md` takes that setting.

## Decisions

## Outcome

Decided by the operator on 2026-10-10:

- **D5 revised after review on 2026-10-11**, with the operator's yes (`design.md` §Review, answer 7). Only the sentence naming sidekick's `docs/work/` leaves `sk-pm-conventions.md`. The record discipline stays in that rule, which loads in every session, and the layout cites it.
- **Added after review:** #116's table moves into #116 before any sweep. Code-span citations of moved or deleted files are repaired along with links. A dated amendment line goes on each ADR whose standing a later ADR changed without naming it, so the index derives from the records alone.
- **D1, D2, D3, and D5 as recommended.** On D1 the operator doubts the permalinks will be needed, and prefers them to guessing.
- **D4 amended.** The four root files predate the current loop and cite machinery sidekick no longer has. Each finding still relevant today is extracted into the topic folder it belongs in, unless live guidance already covers it. It lands as a new dated report that names the file it supersedes. The root files are then deleted, and their citations take D1's permalinks. `research/README.md` is still rewritten as a plain index.

The layout calls research reports records that a later report supersedes, and it deletes none. These four are the programme's synthesis, not answers to a research question, which is why they take the exception. Whether the layout should allow deleting a superseded report in general belongs to the critical pass. A triage of the four files sizes the extraction, and its result is recorded in §Extraction triage.

## Decisions as proposed

### D1. How deleted files stay reachable

Recommend: each record's link to a deleted file becomes a GitHub permalink to the last commit before the deletion. `docs/README.md` gets one line naming that commit and the `git show <sha>:<path>` way in, as aesir's does.

The alternative is a new tag. A tag reads better than a SHA, but it is one more outward write and one more name to maintain. The SHA is enough, and aesir set the precedent.

### D2. Where the three surveys go

Recommend two new topics, each with the `README.md` index the layout asks for:

- `research/pm-layer/` takes `2026-09-18-pm-layer-survey.md` and `2026-09-19-pm-layer-research-round.md`. Its index names #93 and #109–#113 as the work they served.
- `research/guidance-authoring/` takes `2026-09-18-authoring-audit.md`, with #93 as the work it served.

The alternative for the authoring audit is the legacy `research/prompting/` topic, which also studied `sk-agent-prompts.md`. Adding to a legacy topic means writing its first index, and the audit covers `sk-guidance-authoring.md` too, so a topic of its own fits better.

The architecture review, the loop audit, and the overlap matrix are deleted, and their citations take D1's permalinks. `NORTH-STAR.md`'s sentence about the audits then points at ADR-0009, whose context summarises them.

### D3. `DESIGN-PRINCIPLES.md`

Recommend retiring it. Nothing loads it. Its principles 1–8 live in the rules and `NORTH-STAR.md`, and its principle 9 belongs to parked research. Keeping it mirrors the rules, against "No mirroring". Its citations in ADR-0001 and ADR-0007 take D1's permalinks, and `docs/adr/README.md` stops naming it as a source.

The alternative is rewriting it into `reference/` in the bundle's terms. That keeps a second statement of rules that already exist, and the two would drift.

### D4. The research programme's root files and index

Recommend leaving `SYNTHESIS.md`, `ACTION-PLAN.md`, `prior-art.md`, and `platform-landscape.md` where they are. They are records, and a record keeps the identifiers it was written with. `research/README.md`, a living index, is rewritten as a plain list: each topic with its question, then the programme-era files as records. The programme framing and the link to the EPIC go.

The alternative is moving the root files into a topic folder such as `research/programme/`, which conforms to the layout. It costs a link repair in each citing file, up to 16 file-and-target pairs by the `git grep -l` count in §Constraints, for tidiness alone.

### D5. The rule's frozen-history paragraph

Recommend deleting the paragraph from `sk-pm-conventions.md`, and moving its general record discipline into the layout, where record lifecycles live. The layout then states the lifecycle classes once (living, record, ephemeral), and a repo's `docs/README.md` cites them, per the layout decision.

The alternative is keeping a generic version of the paragraph in the rule. That states the record lifecycle in the rule and the layout both, which is the mirroring F4 found.

## Mechanical, following from the rulings

- #189 lands first: its `AGENTS.md` line keeps the one fact `backlog/` held.
- `backlog/`, `work/`, and `references/` are deleted, and their inbound links take D1's permalinks.
- `README.md:88` stops mentioning frozen work history. `docs/README.md` is rewritten to cite the layout and list only what sidekick adds or overrides.
- The four living docs move to `docs/reference/` and lose their vestigial frontmatter, per the layout decision.
- #137 rewrites the ADR index: every ADR with its status, an opening that describes the bundle, and the E# crosswalk pointer as a permalink.
- #105's remaining repairs: ADR-0005's link to `.claude/rules/sk-agent-prompts.md` points at `plugin/rules/sk-agent-prompts.md`, and ADR-0006's link to `smokes/README.md` becomes a permalink at `pre-pivot-2026-09`.

## Extraction triage

A subagent read the four root files on 2026-10-11 and checked each still-relevant finding against live guidance and the topic reports. Some of its line citations were wrong, such as lines past the end of `LIMITS.md`. So the orchestrating session re-read the lines each uncovered finding rests on.

- `SYNTHESIS.md`: 12 relevant findings, all covered, mostly by `sk-agent-prompts.md` and the verification, context, and orchestration reports.
- `ACTION-PLAN.md`: 7 relevant findings, all covered.
- `prior-art.md`: 9 relevant findings, 2 uncovered.
- `platform-landscape.md`: 8 relevant findings, 1 uncovered.

The three uncovered findings, and what happens to each:

| Finding | Source | Disposition |
|---|---|---|
| A verifier's prompt names the ways a verifier goes soft, beside an "assume not done until shown" stance | `prior-art.md:12` | Dropped. One gsd data point, and it pulls against `sk-agent-prompts.md` Rule 8, which warns against listing the surface forms a model might produce |
| gsd's eval blueprint. A human tier calibrates the judge, and a reference dataset grows from the start. An auditor checks the eval infrastructure is wired in, and generated tests never weaken an assertion | `prior-art.md:40-44` | Extracted into a dated report in `research/eval-harness/`, flagged as gsd as read in 2026-06, serving #136 |
| The 2026-06 inventory of platform primitives: Workflow caps, `/effort ultracode`, `/loop`, a PostToolUse field | `platform-landscape.md:16-20` | Dropped. Very likely stale, and copying it would make old numbers read as current. A fresh survey would be its own research |

So D4's extraction is one new report. The triage also found that `sk-agent-prompts.md` Rule 10 states the matched-budget result with no scope. `orchestration/REPORT.md:106` scopes it to text-only multi-hop reasoning, and notes the paper excludes tools. That is outside this design; it joined this plan as #190 on 2026-10-11.
