> Review record for #93 (ADR-0009). Conducted 2026-09-18 by the operator and Claude; frozen at birth, per `docs/README.md` §reviews.

# Audit: sk-agent-prompts.md and sk-guidance-authoring.md vs ecosystem (2026-09-18)

Verified: both artefacts, superpowers 6.3.0 writing-skills bundle, skill-creator (SKILL.md, schemas, three agent prompts, script headers), claude-code-setup 1.0.0 recommender, four docs pages fetched 2026-09-18. rules/ and .claude/rules/ copies byte-identical.

## 1. What each prescribes
sk-agent-prompts.md (362 lines; paths: agents/**, skills/**): R1 identity states purpose not procedure (L21-33); R2 constraints as boundary, "never" for a safety tier (L35-65); R3 few-shot with reasoning, 3-5 (L67-103); R4 minimise strong directives, density is a smell, safety > correctness > style (L105-123); R5 producer/verifier separate invocations, verifier sealed, quorum (L125-141); R6 CoT for orchestrators only, reasoning ≠ constraint guarantee; R7 structured output only where parsed, one-JSON-fence; R8 trust intent detection, constrain only after tested failure (L143-206); R9 orchestrator owns writes; R10 single-agent default, writes single-threaded; R11 frame first, cap every loop (L208-234); anti-patterns (L236-296); 9-item checklist (L298-310); escalation to structural enforcement (L312-320); orchestrators must be slash commands because "subagents cannot spawn other subagents" (L322-342); rewrites reconcile every dispatched agent (L344-362).
sk-guidance-authoring.md (31 lines): admission = ruled convention, mechanism fact, or failure pattern at 3-4 data points (L5-11); accepted tradeoffs never exemplars (L13); failure mode + why; "prefer" vs "always" by the constraint test; no per-incident examples; no volatile counts (L15-20); placement ladder enforcement → memory → tracker → rules; CLAUDE.md only what every session needs (L22-29); delete neighbours (L31).

## 2. Coverage matrix (C covers, P partial, N no, ¬ opposite position)
| Topic | sk-agent-prompts | sk-guidance | SP writing-skills | skill-creator | docs |
|---|---|---|---|---|---|
| Identity/role framing | C | N | N | N | P |
| Constraints vs step lists | C | C | P | P | P |
| Few-shot with reasoning | C | P | P | P | P |
| Directive density | C | C | ¬ | C | N |
| Structured output at boundaries | C | N | N | P | N |
| Orchestrator placement | C (stale) | N | N | N | C |
| Admission tests | N | C | P | N | P |
| Principle over procedure | C | C | ¬ | C | P |
| Placement ladder | P | C | N | N | P |
| Testing with subagents | N | N | C | C | C |
| Description triggering | N | N | ¬ | C | C |
| Progressive disclosure | N | P | C | C | C |
| Evals | N | N | P | C | C |

## 3. Better / worse / redundant
Better (absent elsewhere): R5 sealed producer/verifier + quorum; R9 orchestrator-owns-writes; R10 single-threaded writes; R7 one-fence contract; R6 reasoning ≠ constraint guarantee. R4/R8 now Anthropic's stated stance (skill-creator SKILL.md:139, :302; anthropic-best-practices :22); superpowers persuasion-principles.md:15 prescribes the opposite. sk-guidance-authoring's ladder matches memory.md :23/:446 and adds admission tests. Blast-radius reconciliation (L344-362) has no equivalent.
Worse/stale: L324 false as of v2.1.219 — sub-agents.md: "a subagent can spawn subagents of its own, up to three layers" (CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH); L340-342 cites sk-ui-auditor, no longer in agents/. Skills now have disallowed-tools (:341) and context: fork + agent: (:681). "Slash command" is retired vocabulary. Omits frontmatter that enforces its concerns: model/effort (frontier assumption unpinned; no sk agent sets model), maxTurns (structural cap for R11), omitClaudeMd and skills preload (every custom subagent loads all CLAUDE.md, rules, git status), frontmatter hooks (ignored for plugin subagents). R1/R2 are a house ruling presented as fact: official exemplar subagents open with numbered steps (sub-agents.md :1215); anthropic-best-practices :59-131 prescribes low freedom for fragile operations. Size 362 vs memory.md :81 under-200 guidance; checklist and standing checks are procedures → skill. Genuine disagreement with superpowers "Match the form to the failure" (SKILL.md:459-474) on discipline failures; sk's evidence is one agent (L17), an anecdote by its own L11.
Redundant: R3's example-count duplicates anthropic-best-practices :651-691 and skill-creator :129; checklist 4-5 restate R3/R4; L13 restates sk-guidance-authoring L3.

## 4. Recommendation
sk-guidance-authoring.md: keep as is; add one rung — a procedure becomes a skill (memory.md :50).
sk-agent-prompts.md: keep, trim to R4-R11 + anti-patterns; rewrite L322-342 as two mechanism facts (nesting depth defaults to 3; plugin subagents lose hooks/mcpServers/permissionMode); move checklist + reconciliation into a skill or checker; delete R3's how-many; add a paragraph on frontmatter as enforcement (model, effort, maxTurns, omitClaudeMd, skills, tools); label R1/R2 a ruling.
Do not replace with superpowers:writing-skills (TDD for discipline skills; contradicts R4 and Anthropic's stance; its description rule :150 contradicts skills.md :334 and skill-creator :67). Do not replace with skill-creator (evals + descriptions, not orchestration/verifier design). Use skill-creator or `claude plugin eval` as the missing eval rung for R8.
Placement: sk-guidance-authoring → rule installed into consumer .claude/rules/ (guarantees loading) or a user-invocable: false reference skill; trimmed sk-agent-prompts → path-scoped (agents/**, skills/**) so it loads only when authoring; standing checks → hook or checker; evals → claude plugin eval; keep superpowers:writing-skills for discipline skills, not sk agents.
