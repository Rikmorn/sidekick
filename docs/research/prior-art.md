# Prior art — superpowers & gsd vs our research

*How the two neighbouring toolchains compare against our findings. 2026-06-07. **Grounding:** read `gsd-verifier`, `gsd-execute-phase`, `gsd-graphify`, `gsd-eval-{planner,auditor}`, `gsd-nyquist-auditor`, `gsd-ai-integration-phase`, the full `superpowers:using-superpowers` skill + superpowers contributor philosophy. NOT a full audit — gsd's planner/workflow internals and superpowers' individual skill bodies are unread; some claims are inference, flagged.*

## The shapes
- **superpowers** — lightweight, eval-tuned **discipline** layer (brainstorm-first, TDD, debugging, verify-before-completion, parallel-for-independent). Zero-dependency, leans on the reasoning engine.
- **gsd** — heavyweight **methodology-as-software**: a phase lifecycle (discuss→plan→execute→verify→ship), ~33 specialist agents, an SDK/CLI (`gsd-sdk`, `gsd-tools.cjs`), persistent `.planning/` artifacts, a knowledge graph, threads, config gates.
- **ours** — in between; currently the authoring discipline (`sk-agent-prompts.md`) + sk-* agents/skills + a planning CLI, now derived from research.

## Convergence with our findings (validation by independent practice)
- **Research/framing-first as a structural default** — superpowers auto-triggers `brainstorming`; gsd has discuss/spec phases + dedicated researcher agents. ✓ research-first.
- **Producer ≠ verifier / don't-trust-self-report** — `gsd-verifier`: *"SUMMARYs document what Claude SAID it did; you verify what ACTUALLY exists,"* FORCE stance, named "how verifiers go soft." superpowers `verification-before-completion`. ✓ Track A + Track B.
- **Context isolation / lean orchestrator** — `gsd-execute-phase`: "~15% orchestrator, 100% fresh per subagent." ✓ Track B/C.
- **Human escalation as structural** — gsd "Escalation Gate." ✓ Track A.
- **Eval-driven prompt tuning + anti-rationalization** — superpowers tunes skills via adversarial eval; uses Red-Flags/rationalization lists (same enemy as `sk-agent-prompts.md`).
- **Few-shot WITH reasoning** — gsd agents load few-shot calibration examples. ✓ Rule 3.

## Divergences / tensions
- **Procedural vs emergent.** gsd skill prompts are heavily imperative (banners, "STOP do X," literal-flag rules ×3) — nearer the "agents-as-programs" pattern our discipline warns against. *But* gsd offloads determinism into its SDK/CLI (our "escalate to structural enforcement / put determinism in code" fix), and our prompting research found procedure *wins* for high-stakes determinism — so it's a defensible different point on the spectrum, not wrong.
- **Parallel writes.** gsd parallelizes writes via dependency-ordered "waves" (plan granularity); Track C leans single-threaded writes (parallel writers → conflicting implicit decisions, ≈37% of MAS failures). gsd mitigates with dependency analysis; residual style/pattern conflict risk remains.
- **Weight / over-engineering.** gsd is heavy by default — the over-application risk the reasoning research flagged. It has `gsd-fast`/`gsd-quick` escape hatches (knows the dial) but defaults heavy.

## Where they're AHEAD of us
- **gsd memory** (confirms the blind-spot): `gsd-graphify` = a real knowledge graph (`.planning/graphs/`) with confidence-tiered edges (EXTRACTED/INFERRED/AMBIGUOUS) + a `query` interface; plus `gsd-thread` (persistent context), pause/resume (handoff), `extract-learnings`. Token-level corpus + relationship graph + navigability + handoff — much of what our memory research said is needed, **built**. Study before E10/E14/E15.
- **gsd eval** — see deep-dive below. The keystone (verification), built.
- **gsd determinism-in-code** — `gsd-sdk`/`gsd-tools.cjs`: the right home for deterministic logic.
- **superpowers craft** — lightweight reasoning-leveraging discipline (our durability winner) + eval-tuned, rationalization-resistant skill content.

## Shared gaps (all three, us included)
- **Cross-family quorum** — all same-family (Claude). None addresses self-consistent errors / self-preference via a different-family verifier. (Track A's biggest gap is industry-wide.)
- **CoT faithfulness** of decision traces — none verifies the "why" is real.
- **Operator-dial / autonomy-from-NFRs** — gsd has coarse modes; neither has the fine knob-setting.

---

## Deep-dive: gsd's eval layer (Track A, built)

A four-part instantiation, invoked for "AI phases" via `/gsd:ai-integration-phase` (orchestrates framework-selector → ai-researcher → domain-researcher → eval-planner):

1. **AI-SPEC.md (the contract)** — eval designed *before* implementation. §1 failure modes, §1b domain rubric ingredients (from a domain researcher / SME pass), §5 Evaluation Strategy, §6 Guardrails, §7 Production Monitoring.
2. **`gsd-eval-planner` (designer)** — core question *"How will we know this AI system is working correctly?"* Maps system_type (RAG/Multi-Agent/Conversational/Extraction/Autonomous/Content/Code) → required eval dimensions (always incl. **safety** + **task-completion**). Writes **PASS/FAIL rubrics** with **Measurement = Code / LLM-judge / Human** + priority (Critical/High/Medium). LLM-judge "requires calibration"; human reserved for edge cases, *LLM-judge calibration*, and high-stakes sampling. Detects existing eval tooling then defaults (Phoenix tracing, RAGAS, Promptfoo). Specs a **reference dataset** (10 min/20 prod; critical paths + edge + failure + adversarial; "start during implementation, not after"). Splits guardrails **online** (catastrophic, every request, fast) vs **offline flywheel** (sampled, feeds improvement).
3. **`gsd-eval-auditor` (separate adversarial verifier)** — *"Did the implemented system actually deliver its planned eval strategy?"* FORCE stance ("assume not implemented until codebase proves otherwise"), named "how eval auditors go soft." Scores each dimension COVERED/PARTIAL/MISSING + 5 infra components (tooling actually-called, dataset, CI/CD, guardrails in-request-path, tracing wrapping real calls); weighted score (0.6 coverage + 0.4 infra) → verdict tiers. Writes EVAL-REVIEW.md.
4. **`gsd-nyquist-auditor` (verifier-manufacturer)** — for each requirement validation gap, **generates a real behavioral test that can fail**, runs it, debugs ≤3 iters, ESCALATES impl bugs (never weakens the assertion; impl is read-only). "Nyquist" = sample requirements densely enough to validate them.

**Why this is our Track A, realized:**
- Eval designed up-front = *frame-before-verify* (can't verify what you didn't frame).
- planner ≠ auditor = **no-self-validation / producer≠verifier**.
- FORCE stance + "how it goes soft" = **adversarial verify + anti-rationalization**.
- **Measurement = Code / LLM-judge / Human** with calibration + human-for-high-stakes = our **"manufacture verifiers in non-code domains"** (code where possible, LLM-judge where not — calibrated, human where neither holds).
- `nyquist-auditor` = literally **"manufacture verifiers where none exist"** for code requirements.
- online/offline guardrails = **forcing-functions + safety tier**.

**Honest gaps in gsd's eval (ours to add):**
- Scoped to building **AI apps** (Python/AI tooling defaults: Phoenix/RAGAS) — not "aim it at anything."
- LLM-judge is **same-family** (Claude judging Claude) — no cross-family (our shared gap; partly mitigated by routing calibration to humans).
- Doesn't touch **CoT faithfulness** or **self-consistent errors** (the Track A frontier).

**For us:** we have the Track A *theory*; gsd has a working *blueprint*. A sidekick eval track should **study/borrow gsd's structure** (the Code/LLM-judge/Human rubric tiering, the planner/auditor split, nyquist-style test generation), then **add cross-family verification** and **generalise beyond AI-apps**.

---

## Net
Our research is largely **validated by convergent evolution**. We're plausibly *ahead* on the newer findings neither encodes (bidirectional over-engineering guard, positive-guardrail/negation, cross-family, the durability filter). We're *behind* exactly on the stated blind spots — **memory and eval — and gsd has built credible versions**. The smart move on those epic items is **study gsd first, don't reinvent**.
