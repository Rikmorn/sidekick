# Whole-architecture review — 2026-06-18

The pre-1.2 step-back: does the toolchain still cohere end-to-end after a long build? Drove the [EPIC re-baseline](../EPIC.md) (foundations-then-memory). Sections are referenced by `review §…` source tags in EPIC.md.

**Method.** Read all 6 orchestrator skills, all 24 agents, the 9-helper CLI kernel + `cli.ts`, the 3 ADRs, DESIGN-PRINCIPLES, LIMITS, AGENTS, and the research corpus (via a distiller subagent); ran a dispatch-graph/orphan mapper and a best-in-class comparison (web-grounded). Findings tagged **[verified]** (read the source this session) or **[knowledge]** (general, not re-grounded).

## Verdict

The **skeleton is sound and vindicated by the research** — design→build→verify, the deterministic CLI kernel, producer≠verifier sealing, single-threaded writes + parallel read-only verification. The architecture is not lost. What drifted is at the **seams and the closing of the loop**:

1. It's a strong **open-loop pipeline**, not yet the **closed-loop ratchet** the north-star describes. The two layers that close it — an **eval layer** (to measure, and thus safely *thin*) and a **memory layer** (to learn) — are both unbuilt. (→ eval `3.4`, memory Phase 4.)
2. Several **seams snapped or were never wired** (the redesign re-entry; the pre-1.1 pin-hash). Cheap to fix, high-value.
3. ADR-0001 forbids answering "useless agents?" by taste — thinning is **eval-gated** (→ `3.7`).

## §flow — the journeys, and where they break

| Journey | Status |
|---|---|
| `design → build → review` (happy path) | works [verified] |
| mid-build deviation → `amend`/`decide`/`skip`/`pause` | works [verified] |
| `build → verify` (holistic goal-achievement) | **manual & optional** — per-task spec-review is mandatory; `/sk-review` + `/sk-goal-verify` only run if invoked. The loop doesn't force its own outcome check (→ eval `3.4`). |
| anything → **learn/remember** | **absent** — no memory layer (→ Phase 4) |

## §loop — the broken redesign re-entry

The 0.4 rework removed sk-design's resume/redesign re-entry but left two orchestrators pointing at invocations sk-design now rejects [verified]:
- `sk-goal-verify` routes redesign → `/sk-design --resume` (flag removed in 0.4).
- `sk-build` (5 redesign prompts) → `/sk-design <slug>` (hard-stops on `slug_collision` for an already-designed plan).

Both documented redesign loops are **user-facing-broken**: the design↔build cycle can't actually cycle. Fixing it needs the design call on how redesign re-enters dialogic sk-design → **1.2 / ADR-0004** (the explorer owns slug-collision). Not patched blind — substituting one broken ref for another would only *look* fixed.

## §inconsistencies [all verified]

1. **`branch-precheck`: agent vs CLI.** sk-design/sk-build/sk-regen-plan/sk-review dispatch the *agent*; sk-decide calls the *CLI* directly. Same logic, two call paths. → `1.4`.
2. **Verdict matrix duplicated** verbatim in `/sk-review` ↔ `/sk-goal-verify` `<reasoning>` — "value computed in two places" smell. → `1.5`.
3. **`commands/` vestige** in `cli.ts` `MANAGED_DIRS` (dir doesn't exist; install skips it). → `1.5`.
4. **`architectural-advisor`** inherits `claude-code-workflows:architect-review` — undeclared cross-plugin coupling. → `1.5`.
5. **Registry-vs-file tool drift** (`sk-decision-drafter`, `sk-rfc-drafter`): harness registry lists wider tools than the files declare; files (narrower) govern at runtime — cosmetic. → `1.5`.

## §useless-agents — value-per-boundary (eval-gated, → `3.7`)

No orphans, no dangling dispatches [verified — dispatch-graph map]. ADR-0001 forbids thinning by taste. Candidates for the eval-gated reduction:
- **`sk-branch-precheck` (agent)** — zero reasoning ("never override the CLI's verdict"); a formatting wrapper over a CLI sk-decide already calls inline. Strongest merge candidate (the agent→CLI half is doable now, in `1.4`).
- **`sk-structural-checker`** — near-deterministic (section presence, frontmatter regex); arguably kernel work like `check-drift`.
- **The 3-way RFC/PLAN quorum split** — independence matters for the *code* reviewers (real reasoning); for these near-mechanical checks, separate agents may be over-decomposition.

Evidence the boundary count is a coherence tax: the drift sweep found ~10/24 agents drifted from one orchestrator change (DPI fidelity loss + contract drift). Rule 5 (dimensional, not artifact-bound) points the way.

**Missing agents:** eval-planner/auditor (→ `3.4`); memory gate/curator (→ Phase 4); cross-family verifier (→ `3.6`); UI pillar reviewers (backlog).

## §missing-tools

- **Shared pin-hash CLI** (`sidekick hash-rfc`) — the 1.1 SHA bug existed because the hash was computed in 3 places that disagreed. One subcommand all callers use turns a prose promise into one code path. → `1.6`. **Highest-leverage small tool.**
- Agent tool grants are otherwise appropriate [verified].

## §gaps — missing capabilities (mostly already roadmapped)

| Gap | Roadmap |
|---|---|
| Eval / rubric layer (THE keystone; gates the ratchet) | `3.4` (pulled forward) |
| Cross-family quorum (quorum is all-Claude — "biggest substantive gap") | `3.6` |
| Memory (episodic + navigability + validate-before-persist) | Phase 4 |
| Context/escalation forcing-function + durable interrupt | `3.3` |
| Externalised sizing signal | `3.1` (+ `1.2`/F3) |
| Operator-dial (unified) | `3.5` |
| Code-rules at generation time | moot (rules retired → `5.1`) |
| UI design/review dimension | backlog |

## §observability [verified thin]

- No per-run cost/token telemetry despite acute cost-sensitivity (`deep` can cost millions).
- **No gate-absorption/inversion instrumentation** despite "instrument gates for inversion" being central to the ratchet doctrine — you can't currently detect a scaffold that flipped net-negative. → `3.8` (promoted from backlog).
- 1.1 correctly removed *fabricated* `duration_ms` telemetry (an LLM can't measure wall-clock) — good instinct, but it leaves no real timing data.

## §best-in-class

Cohort: GSD (read from disk), Aider, OpenHands/SWE-agent, Devin, Kiro, GitHub Spec Kit, LangGraph/CrewAI/AutoGen, Anthropic's published guidance. Per-dimension lead named (the comparison is category-mismatched — sidekick/GSD are oversight harnesses; the others are solvers/products/libraries).

| Dimension | Lead | Sidekick: ahead / behind / missing |
|---|---|---|
| Research / codebase understanding | Anthropic multi-agent; Aider repo-map | **Ahead** on read-only fan-out discipline; **missing** a precomputed codebase index (→ `4.5`) |
| Design / spec | Kiro (SMT contradiction + semantic-entropy ambiguity); Spec Kit | RFC+PLAN quorum is **ahead on independence** (sealed producer≠verifier); **behind Kiro** on deterministic rigour (→ backlog Kiro-linter) |
| Planning | Spec Kit / GSD (`must_haves` traceability) | `pins-rfc` drift-pin is a differentiator; **behind GSD** on declared goal-wiring (→ fold `must_haves` into `3.4`) |
| Execution | OpenHands CodeAct / SWE-agent ACI | **Ahead** — FRESH-gate "subagent output is a claim", sequential-write/parallel-verify, atomic commit. Best in cohort. |
| **Verification / eval** | **GSD** (eval-planner/auditor + Nyquist) | **Ahead on architecture** (sealed quorum — *no other system seals the verifier, incl. GSD*); **missing the eval *layer*** GSD has built → port it **but keep it sealed** (`3.4`) |
| Memory | Devin (Knowledge/Playbooks); GSD (graphify/thread); OpenHands condenser | **Missing entirely** — GSD well ahead (→ Phase 4) |
| Orchestration | Anthropic; LangGraph | **Ahead** on the subagents-can't-nest constraint (flat orchestrator=slash-command); the 24-agent zoo is a coherence tax (→ `3.7`) |
| HITL gates | LangGraph (`interrupt/resume`); Devin | **Ahead** on escalation doctrine + the anti-rubber-stamp advisor-divergence gate; **behind** on durable mid-dialogue interrupt (→ `3.3`) |
| Recovery / resume | Devin; GSD `.continue-here.md` | Build resumes correctly from git; **behind** on handoff doc + forensics; redesign re-entry broken (→ `1.2`) |
| Observability | LangSmith/AgentOps; SWE-agent `.traj` | **Behind** — no cost telemetry, no gate-absorption instrumentation (→ `3.8`) |

**One correction the BIC pass under-credited:** `sk-goal-verifier` *already* implements the 4-level Exists/Substantive/Wired/Data-Flows artifact matrix GSD has — that's not a gap.

**One-sentence verdict.** Sidekick is the most rigorous *verification architecture* in the cohort (sealing, fresh-gate execution, durability doctrine — ahead of GSD and the external tools) but is **missing the two layers GSD has built (eval, memory)** and carries a **coherence tax from too many agents + an unverified integrity surface**; highest-leverage moves: port GSD's eval layer (sealed), add a cached codebase map, **run the integration smokes**, and execute the eval-gated zoo reduction.

## Strengths — do not churn [verified]

- The deterministic CLI kernel (wave-plan topo+file-overlap, classify-deviation, check-drift, branch-precheck's 10-rule policy, capabilities probe) — clean, TDD'd, correct.
- Producer≠verifier sealing, stated and structural (sk-fixer has no Bash; spec-reviewer never sees the executor's notes).
- The research program itself — the architecture is traceable to evidence. The real moat.

## Provenance

External-system facts in §best-in-class are web-grounded ([knowledge] where noted); GSD facts read from `~/.claude/{skills,agents}/gsd-*` this session; sidekick facts read from the repo this session. Dated caveats: AutoGen is maintenance-mode (→ Microsoft Agent Framework); Kiro/CrewAI specifics reflect 2026-06-18 state.
