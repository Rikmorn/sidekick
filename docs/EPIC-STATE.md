# EPIC State — live snapshot (2026-07-02)

The "where are we right now" view. Complements [`EPIC.md`](./EPIC.md): the **roadmap, phase ordering, and crosswalk live there**; this doc holds the live status, the current architecture, the open coherence debt, and the pending decisions. IDs are `{phase}.{item}` (see EPIC.md for the legacy `E#` crosswalk). Regenerate when the picture blurs.

---

## TL;DR

**Architecture is settled** (five accepted ADRs — latest: ADR-0005 accepted 2026-07-02, operator-authored verifiers — quorum membership becomes data, appending `3.9`, narrowing `5.1`, and subsuming the ui-audit gap; ADR-0004 accepted 2026-06-18: loop identity + redesign re-entry + the autonomy seam, implemented by `1.2`). **The toolchain is built and works** — 6 orchestrator skills + 23 agents + 11 CLI helpers + a tier-0 hook. **Phase 0 complete**; **Phase 1 closed 2026-06-18** (items `1.1`–`1.6` done; end-to-end smokes folded into `3.4` as its first eval cases — operator elected to close on progress; kernel unit-tested, prose/agent wiring coherence-swept, not yet behaviourally smoked). **Re-baselined 2026-06-18** off a whole-architecture review → *foundations-then-memory*: the eval keystone was pulled forward (`3.4`), memory consolidated into a dedicated **Phase 4**, the Rules group dropped.

**Two threads drove the re-baseline.** (1) The drift sweep: ~10/24 agents drifted when `0.4` moved the ground under the agents it dispatches (`1.1` cleared it — §4). (2) The **whole-architecture review** ([`reviews/2026-06-18-architecture-review.md`](./reviews/2026-06-18-architecture-review.md)): the harness is a strong *open-loop pipeline* but not yet the *closed-loop ratchet* the north-star describes — the two layers that close it (**eval**, **memory**) are unbuilt, and several seams snapped (the **redesign loop**, the pre-`1.1` pin-hash). The respec sequences those fixes: foundations (incl. eval) → memory.

---

## 1. The frame

This EPIC applies the research-program learnings to the harness itself. Durability filter: **build the oversight harness, rent the wording** — own the loop/gates/verification/escalation; treat prompt phrasings as rentable and re-checkable per model generation. Product surface: `agents/`, `skills/`, `bin/` (CLI kernel), and `.claude/rules/sk-agent-prompts.md`.

---

## 2. Architecture as it stands — the ADRs

| ADR | Decision | Status |
|---|---|---|
| **0001** | **Harness shape** — behavioural-leaning; the lifecycle is a thin skeleton, not a rigid state machine. Execution gated on the eval layer (`4.1`). | Accepted as direction (2026-06-07) |
| **0002** | **Own the loop, rent the fan-out** — the write-path loop (sk-build) stays hand-rolled and *shrinks*; read-only breadth fan-out (research) rents Workflow behind a seam + probe + budget tiers; hooks are the tier-0 base. | Accepted (2026-06-10) |
| **0003** | **Design = dialogue-by-default** — `/sk-design` explores *with* the user; `--auto` is hands-off; complexity is a *surfaced signal, not a silent gate*. | Accepted (2026-06-15) |
| **0004** | **Loop identity, re-entry, autonomy seam** — identity *derived*-not-demanded; an existing plan is *re-entry*, not `slug_collision`; redesign re-enters dialogic `/sk-design` on a sealed externalized gate (`classify-deviation` / `sk-goal-verifier`), appending `## Redesigns` R-NN, capped; `sk-explorer` dissolves + F3 dropped; autonomy-dial *seamed* (supersedes ADR-0003's `--auto`-as-mode, built at `3.5`/`3.3`). | Accepted (2026-06-18); impl `1.2` |
| **0005** | **Operator-authored verifiers** — quorum membership becomes *data* (verifier contract + registry + authoring skill = new item `3.9`, the `5.1` seam pulled forward); judgment verifiers *advisory-until-calibrated* (via `3.4`), deterministic checks may bind, kernel invariant checkers non-displaceable; **subsumes the bundled UI-audit layer** — UI dimensions ship as the authoring skill's example pack, taste stays advisory (fuzzy-gate gap). | Accepted (2026-07-02); impl `3.9` (seam) + `5.1` (generation) |

**ADR-0003 (`0.4`) is the load-bearing recent change** — it rewrote `/sk-design` and is the source of both the coherence debt in §4 and the broken redesign loop. That architecture question — loop identity + redesign re-entry + the autonomy seam — is resolved by **ADR-0004** (accepted 2026-06-18); item `1.2` implements it. A from-evidence loop sanity-check (re-grounded against the research corpus, not its distillation) confirmed the *skeleton* is vindicated — the drift is at the seams: the up-front slug is a best-in-class outlier (derive, don't demand), autonomy belongs on a cross-cutting dial (ADR-0001 #4), and every loop transition must ride a **sealed externalized gate**, never the orchestrator's self-assessment (self-confidence is near-random: 73% predicted vs 35% true).

### The shipped toolchain (the lifecycle)

```
/sk-design   (dialogic)  → explorer · pattern-mapper · architectural-advisor   (+ branch-precheck · hash-rfc CLIs)
                            · researcher-{impl,decision,context} → research-synthesiser
                            · rfc-drafter · plan-drafter  +  RFC/PLAN quorum
                            (structural · crossref · coherence)        → writes RFC.md / PLAN.md / RESEARCH.md
/sk-build                → executor · spec-reviewer   (+ branch-precheck · classify-deviation CLIs)  → executes PLAN tasks
/sk-review               → correctness · security · maintainability · test · architecture · goal-verifier  (+ goal-verdict CLI; fixer on --fix)
/sk-decide               → decision-drafter  +  decision quorum (structural · coherence)              → .sidekick/decisions/<slug>.md
/sk-goal-verify          → goal-verifier   (+ goal-verdict CLI)
/sk-regen-plan           → plan-reconciler   (+ reconcile-plan · wave-plan CLI)
tier-0 enforcement       → config-guard hook (hooks.ts), installed opt-in by `sidekick init`
```

- **6 orchestrator skills** (slash commands — orchestrators must live here; subagents can't dispatch subagents).
- **23 agents** (subagents, tool-restricted), grouped by role in §4 / EPIC.md. (Was 24; `sk-branch-precheck` retired in `1.4` — the orchestrators call the `branch-precheck` CLI directly.)
- **11 CLI helpers** (the "own the loop" kernel, TDD'd): `branch-precheck`, `capabilities`, `check-drift`, `classify-deviation`, `config`, `goal-verdict`, `hash-rfc`, `hooks`, `init`, `reconcile-plan`, `wave-plan`.

---

## 3. Where we are in the roadmap

**Re-baselined 2026-06-18 → foundations-then-memory.** New phase shape: **0** foundations/toolchain ✅ · **1** coherence/consistency/loop ✅ (closed 2026-06-18) · **2** codified patterns · **3** verification & capability foundations (incl. the pulled-forward eval keystone `3.4` + cross-family `3.6` + the appended operator-verifier seam `3.9`, which has no hard deps and is intended early — before/with `3.2`) · **4** Memory (the dedicated focus) · **5** generative/advanced. Full roadmap + crosswalk: [`EPIC.md`](./EPIC.md). **Next up: Phase 2.**

Phase 1 (closed 2026-06-18) at a glance:

| Item | Work | Status |
|---|---|---|
| **1.1** | Coherence reconciliation (the §4 debt) + blast-radius guard | ✅ done 2026-06-18 |
| **1.2** | Implement **ADR-0004** — identity-as-derived + redesign re-entry; `sk-explorer` dissolves; F3 dropped; autonomy-dial seamed (built later) | ✅ done 2026-06-18 |
| **1.3** | Research-quality F4/F7 → Researchers group done | ✅ done 2026-06-18 |
| **1.4** | Branch-precheck F2 (create-and-continue) + agent/CLI consolidation (`sk-branch-precheck` retired → CLI) → audit complete | ✅ done 2026-06-18 |
| **1.5** | Consistency cleanup: verdict-matrix → new `goal-verdict` CLI (both orchestrators call it) · `commands/` vestige removed · `architect-review` external coupling dropped · tool-drift verified no-op (files already narrow) | ✅ done 2026-06-18 |
| **1.6** | Shared pin-hash CLI subcommand (`sidekick hash-rfc`) — new `hash-rfc.ts` owns the canonical hash; `check-drift` imports it; `/sk-design` + `sk-crossref-checker` switched off `shasum`/ad-hoc to the CLI (10→11 helpers) | ✅ done 2026-06-18 |

Rules group **dropped** (rules retired; the need → `5.1`). Owed validation **folded into `3.4`** (its first eval cases); Phase 1 closed 2026-06-18 on the unit-tested kernel + coherence sweeps, issues surfaced ad hoc until then.

---

## 4. Coherence debt — drift sweep (2026-06-18)

A three-auditor sweep checked all 24 agents against the **current orchestrators** (not the discipline doc). The per-slice audits were blind to this dimension. **~10 agents drifted; one dominant root cause — the `0.4` `/sk-design` rewrite moved the ground under the agents it dispatches and they were never reconciled.** Most is contract-hygiene/cosmetic; two are real functional issues. This is the `1.1` work-list.

| Agent | Class | Drift |
|---|---|---|
| **sk-explorer** | VESTIGE | Pre-`0.4` cold scoper front-running the now-dialogic sk-design; emits the broken `low\|medium\|high` self-rating. *(Started this whole thread → `1.2`.)* |
| **sk-pattern-mapper** | VESTIGE + stale-ref | Self-describes a `--resume`/amend dispatch sk-design no longer has; **reads `./docs/decisions/*.md`** (toolchain uses `.sidekick/decisions/`) → **silent no-op, loses analogue grounding**. |
| **sk-rfc-drafter** | latent-incoherence | Keys "omit Research notes" off `complexity: low`, **contradicting its own line** that keys off `synthesis_output`. `complexity` otherwise inert. **Real bug.** |
| **sk-researcher-{context,decision,impl}** | stale-ref ×3 | "Dispatched by /sk-design **Step 5**" + a ghost "Researchers-T-08" contract; no Steps exist post-`0.4`. |
| 3 researchers + **synthesiser** | latent-incoherence | `duration_ms` self-timing is **fabricated telemetry** (an LLM can't measure wall-clock); flows through contracts, nothing reasons on it. |
| **sk-research-synthesiser** | latent-incoherence | 2 of 3 `synthesis_target` modes unreachable; cites `## Comparative analysis` (RFC now `## Research notes`); `short_synthesis` computed, never consumed. |
| **sk-spec-reviewer** | stale-ref | Hard-codes "Step 5"; current sk-build runs it in **Step 6** (the sk-executor off-by-one, un-propagated to its sibling). |
| **sk-decision-drafter** | latent-incoherence | Names only `sk-structural-checker`; sk-decide now runs a structural **+ coherence** quorum. |
| sk-plan-drafter | stale-ref (minor) | Calls `rfc_hash` "SHA-256"; it's `git hash-object` (SHA-1). Cosmetic. |

**~14 agents are clean** — every dimensional reviewer, the checkers, advisor, executor (the earlier fix held), fixer, goal-verifier, plan-reconciler. (`branch-precheck`, also clean at the time of this audit, was later retired to a CLI in `1.4`.)

**Process lesson (→ the `1.1` guard):** a big-bang orchestrator rewrite (`0.4`) left reconciliation debt because nothing reconciled its blast radius atomically, and the follow-on audits used the wrong lens. Candidate guard: *when an orchestrator's flow/contracts change, reconcile every agent it dispatches in the same change* — and/or a cheap standing check (no agent cites a "Step N"; every agent's named dispatcher/verifier matches the live orchestrator). Landed as the **"Rewrites reconcile their blast radius"** section in `.claude/rules/sk-agent-prompts.md`.

### 1.1 reconciliation outcome (2026-06-18) — corrections to the sweep

`1.1` fixed the table above — and in doing so found the sweep itself was incomplete, which is the whole case for the guard. Reconciling against the **live orchestrators and the tested CLI kernel** (not prompt-vs-prompt) gives the corrected picture:

**Fixed (the enumerated debt):** `Step-N` / `Researchers-T-08` refs → role-relationship language (3 researchers + spec-reviewer); rfc-drafter's `## Research notes` keyed off `synthesis_output` only (the `complexity: low` proxy is gone); the dead `synthesis_target` modes dropped; the fabricated `duration_ms` telemetry dropped (3 researchers + synthesiser input + sk-design contracts #5/#6); `docs/decisions/` → `.sidekick/decisions/`; decision-drafter names both quorum checkers; pattern-mapper's `--resume`/amend dispatch claim removed. Per the Q2 call, `short_synthesis` was removed and the RFC `## Research notes` reduced to a **pointer** — the synthesis lives only in RESEARCH.md.

**One sweep item was backwards.** The table calls the `pins-rfc` hash "cosmetic — plan-drafter says SHA-256 but it's `git hash-object`." The **tested CLI is ground truth** (`bin/helpers/check-drift.ts` computes SHA-256 of file content) and `sk-crossref-checker` already computes SHA-256 — so plan-drafter's "SHA-256" was *correct*. The real bug was **`/sk-design` producing the pin via `git hash-object` (SHA-1)**, which can never equal a SHA-256. That is **functional, not cosmetic**: every PLAN crossref quorum and every `/sk-build` drift check would report perpetual `pins_rfc_drift` → quorum loop-exhaustion → `/sk-design` can't finish. Masked only because the integration smokes are unrun. Fixed by aligning `/sk-design` to SHA-256; the four hashing sites (CLI, crossref-checker, plan-drafter doc, sk-design) now agree.

**The sweep under-counted** (it checked the 24 agents against the orchestrators, but didn't grep the strings against the tested kernel or check the orchestrators against each other):
- The `docs/decisions/` path bug was also in **sk-executor** (the table marked it "clean") and two researchers — not just pattern-mapper.
- The stale `## Comparative analysis` heading (0.4 renamed it `## Research notes`) was also in the **sk-build** frozen-sections list, not just the synthesiser.

**New finding — redesign re-entry is broken (deferred to `1.2`).** The 0.4 rework removed sk-design's resume/redesign re-entry but left two orchestrators pointing at invocations sk-design now rejects: `sk-goal-verify` routes redesign to `/sk-design --resume` (unsupported flag), and `sk-build`'s redesign prompts say `/sk-design <slug>` (which hard-stops on `slug_collision` for an already-designed plan). Both documented redesign loops are user-facing-broken. Fixing it needs a design call on how redesign re-enters the now-dialogic sk-design, so it belongs with the **`1.2` explorer/sk-design rework** (the explorer owns slug-collision + scoping) — parked there, not patched blindly.

**Explicitly deferred to `1.2`:** rfc-drafter's `complexity` input is now inert (validated, otherwise unused) — left as-is because F3/ADR-0004 redesigns that signal; and sk-explorer's `low|medium|high` self-rating is untouched (F3).

---

## 5. Open decisions & recent calls

**Decided in the 2026-06-18 re-baseline** (from the whole-architecture review):
- **Eval keystone pulled forward** → `3.4`, a Phase 3 foundation (the old Phase 2→3 checkpoint is resolved).
- **Memory consolidated into a dedicated Phase 4**, after the foundations (hard-deps `3.2` + `3.4`).
- **Rules group dropped** — rules are being retired. `sk-maintainability-reviewer` falls back to mainstream conventions short-term; the real answer is **`5.1` per-project generated gates** (the reviewer-enforcing-bespoke-rules was the seed/demonstration of that pattern — the recovered "helpers to author gates on the target repo" thread).
- **New Phase 1 items** for the review's cross-cutting findings: `1.5` consistency cleanup, `1.6` pin-hash CLI; the broken redesign loop folded into `1.2`/ADR-0004.
- **ADR-0004 accepted (2026-06-18)** — loop identity + redesign re-entry + the autonomy seam, from a from-evidence loop sanity-check. Identity is *derived*-not-demanded; an existing plan is *re-entry*, not a collision; redesign re-enters dialogic `/sk-design` on a **sealed externalized gate** (`classify-deviation` / `sk-goal-verifier`), capped + best-so-far; `sk-explorer` dissolves; autonomy moves to a cross-cutting dial (**supersedes ADR-0003's `--auto`-as-mode**), *seamed now, built at `3.5`/`3.3`*. Item `1.2` implements it.

**Decided 2026-07-02 (ADR-0005) — operator-authored verifiers; ui-audit gap closed by decision:**
- **Quorum membership becomes data** — a verifier contract (dimensional identity, ONE-JSON deliverable, `advisory|binding` tier, model/family field for `3.6`) + registry (candidate home `.sidekick/config.json`, inside the `0.5` guard) + orchestrator loaders + a verifier-authoring skill. Appended as **`3.9`** (append-only, *not* a third re-baseline); `5.1` narrows to the *generative* half and gains `3.9` as a dep.
- **The bundled UI-audit layer is not built** — the research rejects six bundled taste-gates (rubric refutation; fuzzy-goal gate gap), the repo is generic now; UI dimensions ship as the authoring skill's worked example pack, advisory-only.
- **Binding is graduated, never asserted** — deterministic checks may bind; judgment verifiers enter advisory and graduate through `3.4` calibration (enforcement-surface F9); kernel invariant checkers (structural/crossref) are non-displaceable.

**Still open:**
- **F3 — explorer's sizing signal** — *resolved by ADR-0004*: the `low\|medium\|high` self-rating is **dropped** (self-assessed complexity is an unreliable basis for the dial — F3/F6; models overthink trivial input). Any surviving signal is at most an *evidence-grounded, overridable soft prior under an operator cap* (analogues / prior decisions / new libraries), never an authoritative gate; the authoritative routing/sizing signal is `3.1`'s job.
- **Frozen-`PLAN.md` vs meta-skeleton** — *parked by ADR-0004* (relates `5.2`): the loop research calls a frozen object-level DAG the "half-right-wrong-half bet" (static plans overfit / invert out-of-distribution). The `1.2` redesign-as-append loop is a step *toward* a revisable plan, not a resolution. Taken up at `5.2`.
- **F4 / F7** (`1.3`) — F4 explicit brief construction + thin-repo grounding (now satisfied by `4.5` codebase-map); F7 mark interchangeable specifics substitutable.
- **Cross-family dependency** (`3.6`) — needs the non-Anthropic-verifier decision.
- **Memory substrate** (`4.4`) — do NOT pre-pick.
- **Work-item documentation format** — the meta-gap behind two re-baselines; backlogged at [`backlog/work-item-doc-format.md`](./backlog/work-item-doc-format.md).

---

## 6. Where to look

- **Roadmap, phase ordering, crosswalk, execution log:** [`EPIC.md`](./EPIC.md)
- **Whole-architecture review (drove the re-baseline):** [`reviews/2026-06-18-architecture-review.md`](./reviews/2026-06-18-architecture-review.md)
- **Architecture decisions:** [`adr/`](./adr/) (0001 shape · 0002 platform · 0003 design-interaction · 0004 loop-identity + redesign-re-entry + autonomy-seam · 0005 operator-authored-verifiers, accepted 2026-07-02)
- **Pilot findings F1–F10:** [`backlog/platform-primitives-scoping.md`](./backlog/platform-primitives-scoping.md)
- **Open backlog:** work-item-doc-format · cross-family-quorum (`3.6`) · operator-dial-tooling (`3.5`) · gate-command-defaults · install-config-dir-divergence (usage-instrumentation promoted to `3.8`)
- **Research program:** [`research/README.md`](./research/README.md) — most cross-cutting are `agentic-loops` and `reasoning-capability`
- **Authoring discipline:** [`.claude/rules/sk-agent-prompts.md`](../.claude/rules/sk-agent-prompts.md)
