> Review record for #93 (ADR-0009). Conducted 2026-09-18 by the operator and Claude; frozen at birth, per `docs/README.md` §reviews.

# PM layer survey — adopt / borrow / write (2026-09-18)

Provenance: `gh` mechanics, docs, the official plugin, GSD, and search hits verified by me; the nine third-party candidates read file-by-file by three subagents this session, with the two jared quotes I cite re-read by me. UNVERIFIED is marked.

## Candidates

| Candidate | Does | Install | Work model | Local state | Commit / stars | Verdict |
|---|---|---|---|---|---|---|
| `github` (claude-plugins-official `external_plugins/github`) | `plugin.json` + `.mcp.json` only, no skills; points at `https://api.githubcopilot.com/mcp/` | plugin → remote MCP, PAT via env | Default toolsets `context, repos, issues, pull_requests, users`; `projects` exists but is not default (`/x/projects` URL or `X-MCP-Toolsets: default,projects` header). `issue_write` takes `milestone` and `parent_issue_number`; `projects_write.update_project_items` sets Status by name, 50 per call; releases read-only, no create | none | plugin 2025-12-02 / 36.5k; server 2026-09-16 / 33.0k | SKIP as shipped; see Adopt |
| trailofbits/skills `github-triage` | Periodic sweep: gated merges, close issues already fixed with a citing comment, cross-link issues↔PRs | plugin, 1 skill, `disable-model-invocation: true` | `gh issue/pr` only; no milestones, boards, releases, label writes | opt-in reports in cwd | 2026-09-16 / 7.1k (monorepo) | BORROW |
| brockamer/jared | Projects v2 as source of truth; 9 commands + Python CLI (`file set move close audit …`); session notes as issue comments | plugin + scripts | issues, Projects v2 (`gh project`, `updateProjectV2ItemFieldValue`, `addBlockedBy`), milestones (`gh issue edit --milestone`, REST PATCH close). Columns hardwired Backlog/Up Next/In Progress/Blocked/Done + required Priority | `docs/project-board.md` required; `.git/jared/*.lock` | 2026-09-18 / 1 | BORROW |
| wshobson `team-collaboration` | `/issue` bug-fix playbook with `gh` calls; `/standup-notes` needs Jira + Obsidian; a DX persona | plugin | issues/PRs only | none | 2026-09-13 / 39.8k | SKIP |
| wshobson `conductor` | Tracks/spec/plan files; status parsed from `conductor/tracks.md` checkboxes | plugin | none — zero `gh` | `conductor/**` committed | same | SKIP |
| VoltAgent `project-manager`, `scrum-master`, `product-manager` | Persona prompts; no Bash tool granted | agents | none | none | 2026-09-14 / 25.2k | SKIP |
| VoltAgent `backlog-grooming` | Persona with Definition of Ready, Now/Next/Later/Won't Do, "no zombie stories >90 days" | agent | none | none | same | BORROW one idea |
| dillingham/project | `project/{status}-{name}.md` board, rename = status change; worktree per ticket | plugin + bash | `gh issue list` read-only backfill into files | `project/*.md` | 2026-09-13 / 1 | SKIP |
| GhostlyGawd/engineering-board | Markdown board + 19-tool MCP server + per-turn capture hooks | plugin + MCP | none — zero `gh` | `engineering-board/**` committed | 2026-09-15 / 0 | SKIP |
| bitwarden `claude-retrospective` | Session retro from git log + JSONL transcripts; edits CLAUDE.md on approval | plugin, 3 skills | none | `.claude/skills/retrospecting/reports/*.md` | 2026-03-13 / 149 | BORROW template only |
| `claude-md-management` | Scores CLAUDE.md on a 100-point rubric; `/revise-claude-md` reflect → diff → apply | plugin, skill + command | none | edits CLAUDE.md in place | 2026-02-20 / 36.5k | SKIP (one checklist worth lifting) |
| GSD: inbox, new/complete/audit-milestone, review-backlog, extract-learnings, capture | Milestone lifecycle over `.planning/`; audit gates completion; learnings in 4 categories; inbox = template compliance; seeds with `trigger_when` | skills + workflows | `gh` only in inbox (issues/PRs, labels); milestone = `git tag -a` only, no GH milestone or Release | `.planning/**` everywhere | local copy 2026-05-26 | BORROW structure |
| sachioross/claude-gh-project-sync (search hit) | Reconciles markdown stories ↔ board Status via `reconcile.mjs` | plugin + node | issues + Projects v2 Status | `Issue: #NNN` header in every doc, config JSON | 2026-08-02 / 0 | SKIP — the mirroring the model forbids |

Other search hits: CloudAI-X/claude-workflow-v2 (1.4k, pushed 2026-08-25) has no PM/board content; shipshitdev/project-board-skills returns 404, UNVERIFIED; anthropics/claude-code#77971 (open, updated 2026-09-04) says the cloud Routines GitHub connector has no Projects v2 — relevant only if you run this from Routines.

## Mechanics

**(a) `gh project` is enough for the board.** Verified against `users/Rikmorn/projects/2`: `view --format json` gives the project id; `field-list --format json` gives the Status field id and its four option ids (Backlog, In Progress, Verify, Done); `item-list --format json --query "-status:Done"` returns item id, status, and issue number (28 items today); `item-add --url` adds; `item-edit --id <item> --project-id <proj> --field-id <status> --single-select-option-id <opt>` sets Status. There is no "move" verb — a column move is that one call, one field per invocation. Projects v2 has no REST API; `gh project` wraps GraphQL (docs: "You can use the GraphQL API to automate your projects"). Raw GraphQL is only needed for blocked-by relations (`addBlockedBy`, which jared uses) or multi-field batch edits; built-in workflow configuration has no API (believed, not verified). Token scope `project` is present.

**(b) Release and milestone.** `gh release create <tag>` creates the tag from the default branch if it is missing; for an annotated tag, `git tag -a vX -m …`, push, then `gh release create vX --verify-tag --notes-from-tag` (or `--generate-notes`). There is no `gh milestone` command (verified: "unknown command"); use `gh api -X POST repos/{owner}/{repo}/milestones -f title=…` to create, `gh issue edit N --milestone "…"` to assign, and `gh api --method PATCH repos/{owner}/{repo}/milestones/{n} -f state=closed` to close (REST docs: `state` is `open` or `closed`). Read on `Rikmorn/sidekick` works (R3: 7 open / 13 closed). GitHub relates a milestone to a release nowhere; that link is prose you write. On the board, "item closed → Done" is enabled by default; nothing built-in sets Verify.

## Recommendation

**Adopt: no plugin.** The dependency is `gh` (2.96 here) with the `project` scope, already present. The official `github` plugin earns a place only with your own `.mcp.json` sending `X-MCP-Toolsets: default,projects`; its one advantage is `update_project_items` (50 items by issue number and field name, versus `item-edit` by node ids). For one board per repo that is not worth an MCP server and a PAT.

**Borrow (idea ← source):**
- Close = `gh issue close`, then set Status=Done explicitly, because the auto-move is eventually consistent ← jared `references/jared-cli.md:117`.
- Disable the "Pull request linked to issue" board workflow; it resets Status to In Progress retroactively ← jared `assets/project-board.md.template:73`.
- Filing refuses without `--milestone` or `--no-milestone` ← jared `jared-cli.md:198`.
- Every close comment cites its evidence (`Resolved by #PR`); `closingIssuesReferences` plus a `git log --grep` on the default branch as proof ← trailofbits `github-triage/SKILL.md`.
- An audit with `passed | gaps_found` gates milestone completion ← GSD `audit-milestone.md`, `complete-milestone.md`.
- Learning record shape: decisions, lessons, patterns, surprises, each with a Source line ← GSD `extract-learnings.md`.
- Seed scan at milestone start ← GSD `new-milestone.md` §2.5; in your model it becomes a query over `label:backlog` issues whose stated condition now holds.
- "Won't Do with reason noted" and the stale-item sweep ← VoltAgent `backlog-grooming.md`.
- Red-flags staleness audit for rules files ← `claude-md-management/…/quality-criteria.md`.
- Quick retro skeleton (Highlights, Challenges, Key Learnings, Action Items) ← bitwarden `retrospective-templates.md`.

**Write, because nothing covers it:**
1. Pickup query in `orient`: `item-list --query "-status:Done"` joined with `gh issue list --milestone <active>`.
2. Filing: issue + exactly one `area:*` + milestone-or-none + Status=Backlog. Auto-add can do the board add (one workflow on Free, prospective only), so the skill may only need to set Status.
3. Closing: `--reason`, a close comment linking the `docs/` record whose header names `#NN`, then explicit Done.
4. Milestone → release: check `open_issues == 0` via REST, annotated tag, `gh release create`, PATCH the milestone closed, and write the milestone↔release link yourself. None of the board candidates calls `gh release`; GSD only tags.
5. Hygiene lint: one `area:*`, no position-code titles, `change-request` triage before absorption — GSD inbox's shape, against your rules rather than templates.
