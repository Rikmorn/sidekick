> Review record for milestone R6 (#109–#113). Conducted 2026-09-19 by the operator and Claude; frozen at birth, per `docs/README.md` §reviews. Extends `2026-09-18-pm-layer-survey.md`, which it does not repeat.

# PM layer research round — what exists, what to take (2026-09-19)

Provenance: four subagent lanes (GitHub-native tracking skills; grooming, scope discipline, and learning records; Anthropic-official and Claude Code built-ins; prior art outside Claude skills), each told to read the actual skill, agent, or source file and to record `pushed_at` and stars from the API. Items marked **re-read** were read by me afterwards; the mechanics under "Verified this session" I ran myself. Two lane claims were wrong and are corrected below. UNVERIFIED is marked.

## Verdict

Nothing to adopt whole: every candidate uses a different label or column model, or keeps a local file that mirrors the tracker. Six sources reshape details; the five R6 issues and their order are unchanged. The per-issue consequences are in the issue bodies; this record holds the evidence.

## Candidates

| Candidate | Does | Tool model | Local state | pushed / stars | Verdict | Feeds |
|---|---|---|---|---|---|---|
| gringolito/github-backlog-management-skill (**re-read** `bin/select-item`) | initialize · add-item · pick-item · audit · health · plan-release · close-release; bash bins with bats tests; SessionStart preflight; own ADRs and a GitHub-MCP spike | `gh` + `gh api`, jq | `.claude/backlog-project.json` (owner, repo, project number), checked against live | 2026-08-27 / 1, MIT | BORROW heavily | #109 #111 #112 #113 #110 |
| modelcontextprotocol/inspector `.claude/skills/{board-ops,issue-create,issue-triage}` (**re-read** the board audit) | Two-pass triage; board audit as eleven invariants, "every check should print `0`" | `gh project` + `gh api`, jq | none; board and field ids dated in the skill | 2026-09-19 / 10.9k | BORROW | #109 #112 #110 |
| EveryInc/compound-engineering-plugin `ce-compound`, `ce-compound-refresh` (**re-read** the bar and template) | One learning per run behind a counterfactual bar; refresh classifies every doc Keep / Update / Consolidate / Replace / Delete | orchestrator + subagents | `docs/solutions/`, `CONCEPTS.md`, config | 2026-09-19 / 25.2k | BORROW bar + template; SKIP mechanism | #112 |
| forcedotcom/salesforcedx-vscode `.claude/skills/backlog-grooming` | Grooming sweep: readiness, orphans, merged-not-closed, done-but-open in two evidence tiers; "every finding is a proposal — never auto-write" | Salesforce GUS CLI | gitignored report | 2026-09-19 / 1.0k | BORROW the check taxonomy | #113 #109 |
| agentdecksdk/agentdeck `.claude/skills/milestone-retro` | Milestone-close retro of the machinery, scoped to merged PRs between tags; verdict = filed issues | `gh pr list` + scripts | script output | 2026-09-14 / 4 | BORROW | #113 |
| niklam/iracedeck `.claude/rules/issue-workflow.md` (**re-read**) | Written guidance: milestone and assignee are set at pickup, not at filing; hooks refuse `gh issue create --milestone` | `gh`, hooks | none | 2026-09-19 / 41 | BORROW the argument | #112 |
| JetbroIn/jetbro-skills | work-board / triage / write-issues; board discovered from items' `repository.nameWithOwner`; ask-or-park | `gh api graphql` | per-session flag file | 2026-09-09 / 1 | BORROW | #109 #112 |
| SatcherInstitute/health-equity-tracker `.claude/skills/{next,tackle}` | Scored pickup over board × milestone × assignee; off-board detection | GraphQL via python | none; org ids hardcoded | 2026-09-19 / 23 | BORROW | #111 |
| udecode/plate `.agents/skills/task` | Pre-solution issue challenge with verdict vocabulary `valid` / `not reproduced` / `invalid` or `wont-fix` / `partially valid` / `platform limitation` | `gh`, Linear | none | 2026-09-19 / 16.6k | BORROW | #112 |
| wp-media/wp-rocket `.claude/skills/orchestrator` | Four-point anti-scope-creep gate: "zero additions not traceable to an acceptance criterion" | multi-agent, `gh` | run log | 2026-09-18 / 767 | BORROW | #112 #111 |
| umputun/cc-thingz `workflow:backlog` | Deferred items with `worth: yes/no/later`; a `later` must name the unknown that settles it | files, `git rm` | `docs/backlog/*.md` — a mirror | 2026-09-08 / 477 | BORROW wording; SKIP mechanism | #112 #113 |
| richkuo/rk-skills `create-release` | Preconditions → bump → annotated tag → `gh release create --generate-notes` | git + `gh` | none | 2026-09-19 / 49 | BORROW | #113 |
| yannikzz/next-issues | Deterministic dependency-ordered pickup; clarity gate | python → `gh` | none | 2026-06-11 / 4 | BORROW | #111 |
| valeriobelli/gh-milestone | `gh milestone` extension; core has none | Go, GraphQL | none | 2026-02-15 / 83 | BORROW the query shape; skip the dependency | #113 |
| semantic-release/github | Release step comments "resolved in version X" on each resolved issue | node | none | 2026-09-19 / 534 | BORROW the comment | #113 |
| actions/stale | Stale sweep with windows, exempt labels, `close-issue-reason: not_planned` | Action | none | 2026-09-13 / 1.7k | BORROW the policy shape, not the action | #113 |
| gitkraken/vscode-gitlens `.claude/skills/update-issues` | Close-reason mapping; pre-flight state re-check before any write | `gh` | none | — / 9.9k | BORROW | #112 |
| NSExceptional/gh-projects, ozzy-labs/gh-tasks, van-riper/gh-triage, carlwestman/gh-project-workflow | `gh project` wrappers with by-name item refs, YAML field templates, id resolution scripts | bash / Go | config files, some committed | 2026-03 to 2026-07 / 0–2 | BORROW small mechanics | #109 #110 |
| Anthropic `knowledge-work-plugins/productivity` | `/start`, `/update`, `TASKS.md`; `/update` syncs `gh issue list --assignee=@me` and triages stale items (past due, 30+ days, no context) | `gh`, MCP | `TASKS.md`, `CLAUDE.md`, `memory/` in cwd — a mirror | 2026-09-19 / 25.0k | SKIP; lift the triage rules | #113 |
| Anthropic `knowledge-work-plugins/product-management` | write-spec · roadmap-update · stakeholder-update · synthesize-research · competitive-brief · metrics-review · brainstorm · sprint-planning; `.mcp.json` wires Linear, Asana, Jira, Notion, Slack, Figma — no GitHub | MCP | none | same | SKIP for R6; candidate for aesir's product layer | — |
| VoltAgent business-product (18 agents, **re-read** two) | Personas; `tools: Read, Write, Edit, Glob, Grep, WebFetch, WebSearch`, `model: haiku`; enterprise checklists | none | none | 2026-09-14 / 25.2k | SKIP (survey verdict holds) | — |
| snyk "7 Claude skills for product managers" | Article; six of seven are knowledge templates, consumer-product frameworks, or Ralph | — | — | — | SKIP; its one substantive pointer is the plugin above | — |

Skipped with the same reason — a local mirror of tracker state: ccpm (`.claude/epics/`), gittower `sync-repo-status` (`REPO_STATUS.md`), hoyeon, cairn, optimiziramsi, koolamusic retro, dillingham/project. Skipped as a different job: steipete agent-scripts triage (owner-bound), glebis retrospective (transcript mining), pytorch `scrub-issue` and deno `issue-triage` (repro minimisation), majiayu000 `groom` (creates issues with four external LLMs — the opposite of the pain).

## Verified this session

- **`gh` by-name board writes land at v2.98.0.** `pkg/cmd/project/item-edit/item_edit.go` at that tag has `--owner`, `--url`, `--field`, `--value` (lines 205–208); at v2.96.0 (installed) none exist. brew stable is 2.100.0. Still one field per call. Consequence: #109 pins a minimum instead of resolving field and option ids.
- **A repo's linked boards are queryable.** `repository.projectsV2` on `Rikmorn/sidekick` returns #2 `sidekick` and #1 `@Rikmorn's untitled project`; on `furnace`, none. Discovery in #109 is linked ∩ title equals repo ∩ owner is me; the stray is a lint finding.
- **`gh project copy` carries the board shape.** Copied #2 to a throwaway (#4, deleted afterwards): Status with all four options, all three views including `Focus` with its filter, all six workflows, zero items. `CreateProjectV2ViewInput.configuration` exposes only `visibleFieldIds`, so copy is the only route to a filtered view. `mark-template` is org-only; copy does not need it.
- **Workflows: delete only.** The schema has `deleteProjectV2Workflow` and no create or update mutation. Whether it accepts a built-in workflow id is UNVERIFIED (a write; not executed) — a task in #110. Board #2 has all six on; aesir's #3 has five off, set by hand.
- **`gh issue close --reason`** accepts `completed|not planned|duplicate` on 2.96.0.
- **Plugin `SessionStart` hooks.** `hooks/hooks.json`; plain stdout becomes context; matchers `startup|resume|clear|compact|fork`; default timeout 600 s; runs in cwd; "when a plugin is enabled, its hooks merge with your user and project hooks" — every enabled repo (`code.claude.com/docs/en/hooks.md`).
- **The official `github` plugin exists.** `claude-plugins-official/external_plugins/github/.mcp.json` points at `https://api.githubcopilot.com/mcp/` with a PAT header. The survey's verdict stands.

## Corrections to lane reports

- Lane 3 said the official marketplace has no `github` plugin. It does (above). Its findings on hooks and skill frontmatter checked out against the docs.
- Lane 1, citing the inspector skill, said `--reason` takes only `completed` and `not planned` and that `duplicate` needs the API. That was true of an older `gh`; 2.96.0 accepts `duplicate`.
- Lane 4 cited cli/cli PR #13927 as the by-name `item-edit` change; that PR is the docs pass ("present by-name item-edit as the first-class flow", merged 2026-07-23). The feature itself landed between v2.96.0 and v2.98.0; the tag comparison is the evidence, not the PR.

Reported by lanes and not re-verified: `claude plugin eval` sandboxes Bash with network limited to granted domains; cloud routines can run `gh` on a schedule or on GitHub events. Both are noted in #109 and #113 as "check at use".

## Borrow list, by issue

**#109 `sidekick pm`**
- Three-tier pickup: In Progress assigned to me → Backlog in the active milestone → Backlog with no milestone; blocked-by via the Issue Dependencies API, disabled on 404 ← gringolito `bin/select-item` §1–5
- Active milestone = open, sorted `due_on` null-last → semver → number; exit 2 = none, an ordinary state ← gringolito `bin/resolve-milestone`
- Audit as jq predicates that must print `0`; "count the labels; don't test for presence"; "do not 'fix' a Done card … the audit exists to stop new drift" ← inspector `issue-triage/SKILL.md` §The board audit
- `--limit` above the item count or silent truncation; unboarded = open issues minus board items; drafts have no `.content.repository` ← inspector `board-ops`, `issue-triage`
- Done-vs-open mismatch, no Status, exactly-one per label group; stale In Progress = `updatedAt` > 7 d ← gringolito `agents/backlog-auditor.md` §2b, `skills/health/SKILL.md` §2e
- Item ref by `#12`, node id, or unique title substring; `OptionByName` errors listing valid options ← NSExceptional/gh-projects `internal/projects/items.go:210-229`, `project.go:33-43`
- Milestone progress in one GraphQL call ← valeriobelli/gh-milestone `internal/pkg/domain/github/root.go:16-23`
- "Never `updateProjectV2Field` without every option id — ids regenerate, cards orphan" ← inspector `board-ops` §hazard

**#111 `sk-orient`**
- Token-scope preflight (`project`; `read:org` for orgs) and stored id vs live ← gringolito `scripts/session-start-check.sh`
- Score: In Progress +40, milestone with one open issue +30, other assignee −30; flag an open PR on the current branch ← health-equity `next/SKILL.md` §3–5
- `order_basis: tie` — never present issue-number order as meaning ← next-issues `SKILL.md` §1
- "When WIP drops below the control … that can be a signal to select new work" ← kanbanguides.org 2025.5 §Actively Managing Items in a Workflow
- No-upstream branch = unpushed ← gittower `sync-repo-status` §1
- Start gate: "which of the three does this displace?" ← mohitagw15856/pm-claude-skills `personal-wip-limits/SKILL.md:14`

**#112 `sk-track`**
- Durable bar: "if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation?"; "One learning per run" ← compound-engineering `skills/ce-compound/SKILL.md` (`ce-durable-bar` block)
- Knowledge-track headings `## Context` · `## Guidance` · `## Why This Matters` · `## When to Apply` · `## Examples` · `## Related`; bug-track `## Problem` · `## Symptoms` · `## What Didn't Work` · `## Solution` · `## Why This Works` · `## Prevention` · `## Related Issues` ← same, `assets/resolution-template.md`
- "Filing an issue does not assign it or milestone it … Milestoning it at that moment makes a promise about a release nobody has planned yet" ← iracedeck `issue-workflow.md` §Milestone and assignee wait for implementation. R6's answer: at filing, the active milestone or `backlog` with a condition — never a future milestone.
- Close-reason mapping (stale, duplicate, wont-fix → `not planned` + rationale) and a pre-flight state re-check before any write ← gitlens `update-issues/SKILL.md:38-70`
- `wont-fix`: "hard stop. Do not code"; "Nice ambiguity is how bad patches land" ← plate `task/SKILL.md:173-186`
- Completion comment on the issue before moving the card; parked comment written for a cold reader ← jetbro `ship.md` §6, `park.md`
- A `later` "must name the unknown or the condition that would settle it; without that it is a yes or a no in disguise" ← cc-thingz `backlog/SKILL.md:40-51`
- Seed shape `Pinned:` / `Current context:` / `Revisit when:`; prefer a condition to a date ← jcklpe/configs `pin-issue/SKILL.md:47-63`
- "Don't duplicate a native field in the title or body"; "a manual checklist only drifts" ← beekeepingit `backlog-management/SKILL.md:51,87`
- Self-contained brief: names files and interfaces, states what is out of scope, ends with a verification step ← `code.claude.com/docs/en/best-practices`
- `Closes #N` in the PR body, never `--project` (duplicate PR card) ← gringolito `docs/adr/0003`
- "ROUTE over CREATE": reflections become comments on existing issues ← vamseeachanta/workspace-hub `extract-learnings-to-issues/SKILL.md:50-81`
- "Empty or inconclusive analysis is valid … manufacture neither certainty nor a lesson" ← boshu2/agentops `postmortem/SKILL.md:59-60`

**#113 `sk-milestone`**
- Close ceremony: disposition every open issue → generate notes → draft release → push annotated tag → PATCH milestone closed ← gringolito `skills/close-release/SKILL.md` §2–6
- Audit with `passed | gaps_found` gates completion ← GSD `audit-milestone.md`, `complete-milestone.md`
- "Each gets an issue or it did not matter"; "every claim carries its query … never estimate it"; "no agent's own report is evidence"; a metric that changed zero decisions across two milestones is flagged for deletion ← agentdeck `milestone-retro/SKILL.md:44-52`, `references/judging.md:11,70`
- Groom outcome set Keep / Update / Consolidate / Replace / Delete; "a contradiction misleads actively, so it outranks individual staleness" ← compound-engineering `ce-compound-refresh/SKILL.md:52,62`
- "Code-presence alone is Verify, not Close"; "never silent-close"; log the drop count ← salesforcedx-vscode `backlog-grooming/checks.md:64-66`, `SKILL.md:49`
- Stale policy: 60 d stale, 7 d close, `not_planned`, `exempt-issue-labels`, unstale on activity ← actions/stale `action.yml:21-55,119-122`
- Extend only when "the outstanding tasks must be true must-haves that withstood every attempt to scope hammer them" and "the outstanding work must be all downhill" ← basecamp.com/shapeup ch.14 §When to extend a project
- "Our default response to any idea that comes up should be: 'Interesting. Maybe some day.'" ← shapeup ch.3
- "If you do not get a response within 20 days, close the issue with an appropriate comment" ← kubernetes/community `issue-triage.md`
- "This issue has been resolved in version X" + `released` label ← semantic-release/github `lib/success.js:193-239`
- Bump-and-commit before the tag ← rk-skills `create-release` step 4
- Seed scan at milestone start ← GSD `new-milestone.md` §2.5
- Retro honesty: banned euphemisms ("partially achieved", "scope refinement") ← koolamusic/claudefiles `retro/SKILL.md:110`
- Stale triage rules: past due, 30+ days active, no context ← Anthropic `productivity/skills/update/SKILL.md` §3

**#110 bootstrap**
- `gh label create --force`; stop if Status options are customised ← gringolito `skills/initialize/SKILL.md` §2–3
- Field template with `init --dry-run`; iteration cadence is UI-only ← ozzy-labs/gh-tasks `templates/projects-v2/user.yaml`, `cmd/projects.go:98-114`
- Re-discover ids each run; `sleep 1` per mutation ← kubernetes-sigs/agent-sandbox `triage-issues`

## Learning-record formats considered

| Format | Headings | Per-issue fit |
|---|---|---|
| Nygard ADR (house form; ADR-0009 adds Assumptions, Revisit when, Links) | Title · Context · Decision · Status · Consequences | Yes — with `Decision` → `Lesson` |
| MADR 4.0.0 minimal | Context and Problem Statement · Considered Options · Decision Outcome · Consequences | Barely — options scaffolding a lesson rarely has; its `superseded by` status line is worth keeping |
| GSD extract-learnings | Decisions · Lessons · Patterns · Surprises, each with Source; `Graduated:` | Partly — right taxonomy, but per-phase and it overwrites |
| compound-engineering knowledge track | Context · Guidance · Why This Matters · When to Apply · Examples · Related | Yes, if Nygard proves too thin |
| Google SRE postmortem, AWS COE | Incident-shaped | No; the "what went well / wrong / where we got lucky" trio is reusable |

#112 takes Nygard with `Lesson`, a `Status: promoted to …` line, and the issue number near the top.

## Dead ends

- awesome-claude-code (main and alternatives): only claude-code-action, OSS Autopilot, per-repo `/fix-issue` commands.
- obra/*: nothing GitHub-native; `kata` is local-first; superpowers `dev` matches `main` (fifteen skill dirs).
- claude-plugins-official: nothing for GitHub PM beyond `github`; asana, atlassian, linear are connectors.
- Code search for `"gh project copy"` in any SKILL.md: none. `"what should I work on"`, "parking lot / someday / icebox": none relevant.
- release-please: "milestone" hits only test fixtures. PMBOK lessons register: UNVERIFIED (403), and a growing register fails per-issue cadence anyway. keep-a-changelog: classifies code per version, not knowledge per issue.
- GitHub's own docs on milestones and closing issues carry no scoping or closure guidance.
- Corvalon/skill-github-projects-v2: source removed, UNVERIFIED.
