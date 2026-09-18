> Review record for #93 (ADR-0009). Conducted 2026-09-18 by the operator and Claude; frozen at birth, per `docs/README.md` §reviews.

# Sidekick vs superpowers 6.3.0 / GSD 1.42.3 — overlap audit (2026-09-18)

All rows verified by reading the files. GSD equivalents from `~/.claude/skills/gsd-*/SKILL.md` frontmatter and `~/.claude/get-shit-done/workflows/`; superpowers from the 14 SKILL.md files.

## 1. Skills and agents (22 rows)

| sidekick unit | what it does | superpowers | GSD | built-in | verdict |
|---|---|---|---|---|---|
| skills/sk-design | Research-driven design → RFC.md + RESEARCH.md, coherence quorum, deterministic gate | brainstorming + writing-plans | gsd-discuss-phase / gsd-spec-phase / gsd-plan-phase | none | DUPLICATE |
| skills/sk-build | Wave-by-wave RFC task execution, fresh gates, atomic per-task commits | subagent-driven-development / executing-plans | gsd-execute-phase | Agent tool | DUPLICATE |
| skills/sk-review | Multi-dimension diff review quorum + roll-up verdict + bounded --fix | requesting-code-review | gsd-code-review, gsd-audit-fix | /code-review plugin, /security-review | DUPLICATE |
| skills/sk-decide | MADR decision doc at .sidekick/decisions/ with checker quorum | none | gsd-extract-learnings, gsd-ingest-docs | none | EXTENDS |
| skills/sk-write-bench | Author eval metrics/corpora/cases against a validating kernel | none | gsd-eval-review (audits only) | none | EXTENDS |
| skills/sk-write-verifier | Author an operator-defined dimensional verifier + registry entry | writing-skills (adjacent) | none | skill-creator (adjacent) | EXTENDS |
| sk-architectural-advisor | Writes RFC ## Architecture grounded in repo CLAUDE.md/rules | none | gsd-ai-integration-phase / gsd-ui-phase | none | EXTENDS |
| sk-architecture-reviewer | Diff-vs-declared-architecture conformance | none | none | none | EXTENDS |
| sk-coherence-checker | Artifact self-contradiction check | none | gsd-health, gsd-import | none | UNCLEAR |
| sk-correctness-reviewer | Logic/edge-case findings on a diff | requesting-code-review's reviewer | gsd-code-review | /code-review | DUPLICATE |
| sk-security-reviewer | Security findings on a diff | none | gsd-secure-phase | /security-review | DUPLICATE |
| sk-maintainability-reviewer | Enforces sk-clean-code/sk-typescript on a diff | none | gsd-code-review | /simplify | DUPLICATE |
| sk-test-reviewer | Test depth, not presence | test-driven-development (prevents the gap) | gsd-add-tests | none | EXTENDS |
| sk-goal-verifier | Goal-backward: truths/artifacts per goal, MISSING/STUB/HOLLOW/ORPHANED | verification-before-completion (principle only) | gsd-verify-work, gsd-audit-uat | none | EXTENDS |
| sk-spec-reviewer | Per-task diff-vs-intent pass/fail | SDD task-reviewer-prompt | gsd-execute-phase | none | DUPLICATE |
| sk-executor | Per-task implementer, self-gates, typed scope deviations | SDD implementer-prompt | gsd-execute-phase | Agent tool | DUPLICATE except typed deviation |
| sk-fixer | Minimal mechanical fix for one finding | none | gsd-audit-fix | /code-review --fix, /simplify | DUPLICATE |
| sk-explorer | Repo grounding: analogues, prior decisions, scope signal | none | gsd-map-codebase, gsd-graphify | Explore agent | DUPLICATE |
| sk-researcher | One structured research brief, citation-anchored | none | gsd-explore, gsd-spike | WebSearch/WebFetch | EXTENDS |
| sk-rfc-drafter | Assembles RFC.md | writing-plans | gsd-plan-phase | none | DUPLICATE |
| sk-plan-drafter | ## Tasks with Deps + machine-parseable Files | writing-plans | gsd-plan-phase | none | EXTENDS (machine-parseable deps) |
| sk-decision-drafter | Drafts MADR doc | none | none | none | EXTENDS |

## 2. CLI helpers by family

| family | what | verdict |
|---|---|---|
| eval-* + harvest | case/suite schema, runner, metric registry, hash-pinned judge calibration, failure harvest | EXTENDS — nothing comparable; `claude plugin eval` is the rented alternative |
| graph-* | SQLite knowledge graph, lint, diff, generated STATE/MAP | DUPLICATE — gsd-graphify/map-codebase + orient cover it |
| install/init/hooks/config/capabilities/default-branch/branch-precheck | installer, per-repo config, PreToolUse deny, CC capability probe, branch verdicts | DUPLICATE for install/config; EXTENDS for capabilities + branch-precheck |
| check-artifact, wave-plan, scope-check, classify-deviation, goal-verdict, verifiers, work-dir, hash-rfc | deterministic gates lifted out of prompt prose | EXTENDS — the "heuristics as code" layer is sidekick's differentiator |

## 3. Superpowers covers, sidekick does not
systematic-debugging · test-driven-development · using-git-worktrees · finishing-a-development-branch · receiving-code-review · verification-before-completion · writing-skills (679 lines) · using-superpowers + SessionStart hook · dispatching-parallel-agents.

## 4. Genuine gaps sidekick fills (strict)
1. Eval/measurement kernel for the agents themselves (labelled cases, metric registry, hash-pinned calibration certificates, harvest).
2. Operator-authored verifiers as a mounted registry with advisory/binding tiers.
3. Judgment lifted into deterministic CLIs (deviation classification, goal verdict, wave computation, artifact/crossref gating).
4. Architecture-conformance review against a declared ## Architecture contract.
5. Portable prose rules (sk-language, sk-guidance-authoring, sk-pm-conventions).

## 5. Superpowers 6.3.0 term coverage (grep)
GitHub issues: only receiving-code-review's thread-reply mechanics. Project management / roadmap / milestone / backlog: zero hits. Research: verb only. Learnings / retrospectives: one incidental hit. Superpowers and GSD are complements; sidekick's design/build/review trunk (14 of 22 rows) is largely redundant against GSD.
