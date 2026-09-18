> Review record for #93 (ADR-0009). Conducted 2026-09-18 by the operator and Claude; frozen at birth, per `docs/README.md` §reviews.

# Sidekick loop vs superpowers 6.3.0 — audit (2026-09-18)

Every claim verified by reading the named file unless marked (inferred).

## 1. Sidekick's loop as built
All four skills: user-invocable, disable-model-invocation: true — human-only entry.

| Stage | Inputs | Artifacts | Gates | Verifier | Exit / escalation |
|---|---|---|---|---|---|
| /sk-design <issue> | GH issue; existing .sidekick/work/<issue>-*/ = redesign re-entry (SKILL:114-118) | committed RFC.md (7 sections, g_n/D-NN/T-NN) + RESEARCH.md | Deterministic: branch-precheck, check-artifact. Judged: coherence quorum twice, sealed, parallel, cap 3 (SKILL:190-217) | separate agent + advisory operator verifiers | AskUserQuestion Approve/Tweak/Cancel; hard-stops on cap, missing CLAUDE.md, ambiguous dir |
| /sk-build <issue> | RFC ## Tasks; gates config | source; checklist tick + A-NN same commit; gitignored build.json | Deterministic: wave-plan, FRESH typecheck/lint/test from main session, scope-check. Judged: sk-spec-reviewer on diff + task text | orchestrator runs gates itself; reviewer sealed from executor notes (SKILL:324) | one retry then gate_failed_twice; every typed deviation → classify-deviation → user picks amend/redesign/skip/decide/pause (SKILL:178-181) |
| /sk-review [issue] | diff range; RFC if present | report + gitignored trail; --fix commits per finding | Deterministic: goal-verdict rollup. Judged: 4 code dims + goal + architecture, parallel, sealed | dimensional agents; fixes gated by FRESH typecheck/test + scope-check, rollback | fixable→fix; MISSING/STUB→finish-build; HOLLOW/ORPHANED→redesign; INCONCLUSIVE→human |
| /sk-decide [topic] | top-3 recent RFCs | .sidekick/decisions/<slug>.md | check-artifact --type decision, coherence quorum, cap 3 | separate checker | user edit loop, uncapped |

Re-entry: build's redesign prompt or review's HOLLOW/ORPHANED gap → /sk-design <issue> re-reads RFC + git log [T-NN], appends R-NN, re-drafts affected sections (design SKILL:132-138); frozen sections byte-equal (build SKILL:22, 497).
Drift: ADR-0004 §5 supersedes --auto-as-design-mode; sk-design still ships it (SKILL:14, 154-160). hash-rfc.ts:7-8 says pins-rfc pin retired with #29; sk-agent-prompts.md:135 still describes it.

## 2. Superpowers 6.3.0 as shipped
All skills carry only name/description frontmatter → model-invocable.

| Stage | Skill | Artifacts | Gates | Verifier | Human |
|---|---|---|---|---|---|
| Design | brainstorming | committed spec docs/superpowers/specs/ (architectural only) | classify spike/bounded/architectural, one-way ratchet; HARD-GATE approval | SELF-review inline (SKILL:219); shipped spec-document-reviewer-prompt.md is unwired | approves intent; reviews spec |
| Plan | writing-plans | committed plan: Spec pointer, Global Constraints, per-task Files + Interfaces (Consumes/Produces) + TDD steps + commit step | "No placeholders" | SELF-review, "not a subagent dispatch" (SKILL:143) | picks SDD vs inline |
| Execute | subagent-driven-development | .superpowers/sdd/<plan>/ self-ignored: ledger, briefs, reports, diff packages; deleted at finish | pre-flight conflict table; implementer commits, then task reviewer with Global Constraints verbatim; controller never re-runs tests; reviewer told "Do not re-run the suite" (task-reviewer-prompt:76) | separate reviewer fed the implementer report as "unverified claims" | none between tasks; four stop classes (SKILL:27-31), else ruling + continue |
| Fix loop | SDD | ledger | 5 rounds: 1-3 resume implementer, 4-5 fresh on stronger model; scoped re-review; breaker → controller adjudicates and parks | re-review prompt | none |
| Batching | SDD | — | same-shape tasks in one dispatch; reviewer checks every listed file | — | — |
| Final review | requesting-code-review | one fix dispatch + one re-review | most capable model; plan alignment + quality + architecture critique | separate | "Rulings I made" in final message |
| Finish | finishing-a-development-branch | — | fresh full suite; base-branch confirm | — | merge/PR/keep |
| Isolation | using-git-worktrees | .worktrees/ | baseline tests | — | consents |

code-review plugin: PR-only via gh, 5 Sonnet reviewers, Haiku confidence scoring, filter <80. Orthogonal to the local loop.

## 3. Gap analysis
(a) Sidekick → superpowers. R = real mechanism; C = ceremony; A = absorbed by 6.x.

| Candidate | Verdict | Why |
|---|---|---|
| Issue-number identity | R (pointer only) | #NN in the spec joins to the tracker |
| Work directory | C | SP already commits spec + plan; a second tree is the noise |
| g_n/D-NN IDs | R | make goal verification and deviation size computable. Frozen sections, 7-section schema, A-NN/R-NN ledgers: C |
| Coherence quorum | R (one pass) | SP self-reviews both documents. Registry, tiers, two passes: C |
| check-artifact gate | R, narrowly | placeholder + dangling-ID lint is cheap; the schema it enforces (check-artifact.ts:70-90) is the contract to escape — FLAG |
| Goal-backward MISSING/STUB/HOLLOW/ORPHANED | R | SP task reviews "do not crawl the broader codebase" (task-reviewer-prompt:45) |
| Typed deviation + classify-deviation | R (threshold only) | ≥2-decisions/goal-change is a sealed stop-vs-rule signal; SP's is self-assessed. Five-verb pause on every deviation: C |
| FRESH gate from main session | R | SP never re-runs tests per task |
| scope-check | R, small | deterministic declared-vs-actual files |
| Wave planning | C | writes sequential anyway (build SKILL:14, 139); M4 never landed |
| Atomic per-task commits | A | SP implementer commits per task |
| Branch precheck | mostly A | worktrees cover it |
| Redesign re-entry | R (trigger), C (machinery) | keep re-entering design seeded by the gap; drop R-NN byte-equal re-drafts |
| --auto dial | A | path classification + continuous execution |
| Architecture section + conformance review | C for the advisor; conformance lens = one bullet in the final-review prompt |
| MADR decisions | R (capture), C (quorum) | SP rulings die with the workspace (SDD:479). Capture to docs/adr/ |
| Operator verifiers | C | speculative until a second exists (inferred); Global Constraints is SP's operator lever |

(b) Superpowers → sidekick, verified absent: TDD with RED/GREEN per task; systematic-debugging; worktrees; a finish stage; receiving-code-review; resume-the-implementer with model escalation and breaker; explicit model per dispatch; batching; per-task Interfaces block; briefs/reports/diffs as files; pre-flight conflict scan; rulings with cost-if-wrong.

## 4. Critical read
Over-engineered for one developer: (1) a quorum of one, run twice, with registry, tiers, two capped loops (design SKILL:22, 190-217); (2) human pause on every deviation, five verbs (build SKILL:178, 224-235, 370-419) vs ADR-0004 §5 / DESIGN-PRINCIPLES #9 sparse escalation; (3) wave, checkpoint, cache machinery for parallelism that does not exist (build SKILL:14, 137-139, 198-206, 343-362); (4) a committed artifact contract: 7-section schema, byte-equal frozen sections, A-NN/R-NN ledgers (build SKILL:22, 477-497; design SKILL:373-389) — the md-sprawl ADR-0001 says gsd was dropped for.
Better than superpowers: (1) controller-run fresh gate + scope-check per task (build SKILL:18-19, 141-163); (2) goal-backward verification with computable vocabulary and route (goal-verifier:63-66, goal-verdict.ts, review SKILL:27-29); (3) sealed review of design and plan (design SKILL:198); (4) structural stop-vs-continue threshold (classify-deviation.ts:8-12).

## 5. Proposed flow: superpowers trunk + sk extensions
Plugins cannot hook each other's skills → an extension is a separate skill run before/after, or a rule line the trunk reads.

| Stage | Trunk | sk extension | Carries | Contract risk |
|---|---|---|---|---|
| Design | brainstorming | after: /sk-spec-check <spec>, one sealed coherence reviewer | #NN pointer; g_n/D-NN naming inside SP's spec | light convention; no new tree |
| Plan | writing-plans | after: deterministic lint (placeholders, dangling IDs) ± same reviewer | check-artifact's crossref half only | FLAG: do not port the section schema |
| Execute | subagent-driven-development | rules only: on DONE run typecheck+test fresh before dispatching the reviewer; BLOCKED/CONCERNS touching ≥2 D-NN or a goal = redesign, stop; otherwise rule | FRESH gate; scope-check on the review package; the threshold | none |
| Verify | SDD final review | after: /sk-goal-verify <spec> <range> = goal-verifier + goal-verdict | goal-backward verdict; route finish-build / redesign / human | needs enumerable goals → ID convention |
| Redesign | brainstorming on the existing spec | seeded by the gap | re-entry trigger | drop R-NN |
| Decide | after SDD's "Rulings I made" | /sk-decide-lite: MADR to docs/adr/, lint only | durable rulings | reuses ADR dir |
| Finish / isolation | finishing-a-development-branch, using-git-worktrees | none; retire branch-precheck | — | — |

Dropped outright: wave-plan, build.json, buildCheckpoints, --auto, the architectural advisor, the verifier registry, the review trail dir.
