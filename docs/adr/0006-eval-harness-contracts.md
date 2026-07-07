# ADR-0006 — Eval harness: case convention, subscription runner, graduation by certificate

**Status:** Proposed (2026-07-07, from the approved `3.3` design session; operator acceptance pending). Implements the eval keystone EPIC `3.3` (this body uses post-re-baseline-3 IDs throughout). Consumes ADR-0005's verifier seam (`3.1`); supplies the calibration path ADR-0005 deferred. The contracts here are what `3.4` (sizing signal), `3.7` (cross-family), `3.9` (zoo reduction), Phase 4's write-gate, and `5.1` (generated gates) build on.

## Context

1. **The toolchain is coherence-swept, not behaviourally verified.** Phase 1 closed (2026-06-18) with its integration smokes unrun, folded into `3.3` as its first eval cases; the `1.1` SHA bug (a load-bearing check silently inverted) is the standing proof of what unverified prose wiring costs. Every live orchestrator run to date has surfaced real defects. The smokes that exist are a manual README procedure (`smokes/README.md`) a human executes in a live session — unrepeatable, unaggregated, never run since authored.

2. **Graduation is promised but undefined.** `3.1` ships `tier: binding` rejection for operator verifiers ("graduated through calibration, never asserted" — `config.ts` skips the entry with a warning). Nothing defines what calibration *is*, so the advisory→binding path is theoretical.

3. **Research grounding is settled** ([`eval-harness/REPORT.md`](../research/eval-harness/REPORT.md), 2026-06-18): prior art converges on *known input + a list of typed assertions, mechanical and judge mixed per case*; the 3-layer model (deterministic shell · structured-value · sealed-judge) crossed with a trajectory-vs-outcome axis biased to outcomes; judge verdicts statistical (pass@k "can it", pass^k "is it reliable"); judges sealed and calibrated; start small (20–50 cases from real failures).

4. **gsd's blueprint has no runner** [verified 2026-07-06 against the live agent definitions]: `gsd-eval-planner` writes eval-strategy sections for a consumer AI app; `gsd-eval-auditor` retroactively audits coverage — and is unsealed (it reads producer SUMMARY.md files as evidence). Neither executes cases. What sidekick's downstream items need — dispatch a known fixture at an sk-* agent/skill, check typed assertions, aggregate over runs — is precisely the missing piece.

5. **Headless Claude Code covers the runner's needs** [claude-code-guide fact-check against official docs, 2026-07-06]: `--agent <name>` runs a headless session as a named subagent; user-invoked skills work in `-p` mode; `--output-format json` carries cost data; `--max-turns`, `--model`, `--resume` all work in print mode. One UNCLEAR: whether the installed agents registry resolves in print mode identically to interactive — docs don't state it explicitly.

6. **Operator constraints (stated at design):** no Agent SDK dependency and no metered API spend — the runner must drive the installed `claude` binary under the existing Claude Code subscription auth. Config stays operator-owned (the `0.5` guard); the kernel never flips authority.

## Decision

**1. Case convention — substrate-independent manifests, typed assertions, outcome-biased.** A case is a directory `evals/cases/<suite>/<case-id>/`: a manifest naming the **subject** (an agent, or a skill invocation — kernel CLIs stay in the unit-test suite), a **fixture** (generalising `smokes/fixtures/`; materialised into a fresh tmpdir workspace per run), and a list of **typed assertions** mixed per case: `code` (deterministic kernel checks), `structured` (expectations over the subject's ONE-JSON deliverable), `judge` (rubric + threshold, N runs). Each assertion declares a target — `artifact`/`workspace` (outcome) or `transcript` (trajectory) — outcome-graded by default. Cases the substrate can't honestly reach (dialogic flows) carry `manual: true` and remain in the README procedure: honest non-coverage, never fake coverage. The manifest is deliberately substrate-independent — any conforming runner executes the same corpus.

**2. Runner — a TDD'd kernel CLI driving the `claude` binary under subscription auth.** `sidekick eval run` prepares the workspace, dispatches agent cases via `claude -p --agent <name>` and skill cases via `claude -p "/sk-… <args>"` (with `--output-format json`, `--max-turns`, per-case `--model`), and appends one raw **per-run record** per invocation to an append-only `records.jsonl`. A separate `sidekick eval report` derives aggregate verdicts (pass@k / pass^k) from records — derive-then-check, and the raw records are the substrate `3.4`'s comparative experiments and `3.8`'s gate-absorption instrumentation consume. **Judge assertions are separate sealed headless calls**: the kernel passes artifact + rubric only — never producer transcript, reasoning, or identity — with an explicit insufficient-evidence exit. Sealing is process-structural, not prompt-behavioural. The runner's deterministic core (manifest parsing, workspace prep, record handling, assertion evaluation, aggregation) is unit-tested kernel code.

**3. Graduation — a hash-pinned certificate, mechanically checked, operator-flipped, resolve-time-validated.** Per dimension, a labelled **calibration corpus** (fixture artifacts with seeded defects or known-clean; labels operator-owned) lives as an eval suite. `sidekick eval calibrate <verifier>` runs the verifier over the corpus k times and compares its structured verdicts against labels mechanically; passing precision-leaning thresholds writes a **certificate** (`.sidekick/calibrations/<verifier>.json`): stats, thresholds, corpus content hash, and the SHA-256 of the verifier's agent file *as resolved by `sidekick verifiers`* — the installed file the runtime actually dispatches (the `hash-rfc` mechanic generalised). The operator then flips `tier: binding` in config. **Validation moves from parse-time to resolve-time:** `parseConfig` accepts `binding` syntactically; `resolveVerifiers` — which has filesystem access and already resolves agent files — degrades a binding entry to advisory, loudly, when the certificate is missing, its thresholds unmet, or its hash no longer matches the live agent file. Editing a graduated prompt automatically revokes binding until re-calibration. Certificates govern **operator entries only**: bundled kernel-invariant members (structural/crossref) stay binding by design fiat per ADR-0005's non-displaceability.

**4. Scope — harness only; the gsd port folds into `5.1`.** `3.3` builds the harness for sidekick's own prompt/agent/skill layer. The planner/auditor product port (per-project eval generation) moves to `5.1` beside per-project gate generation, carrying two requirements: borrow gsd's discipline (PASS/FAIL rubrics; Code/LLM-judge/Human tiering), and any auditor-equivalent must be sealed — gsd's is not.

**5. v1 corpus — keystone-minimal.** (a) The owed Phase-1 smokes ported as cases (Smokes 13/14/15 + the redesign-loop and CLI-wiring checks), interactive segments marked manual. (b) One worked calibration corpus for a single judgment dimension — `sk-coherence-checker`, whose Smoke 13 Part A fixture table is already a six-case labelled seed — demonstrating the graduation protocol end-to-end. Further corpora accrete per-dimension when graduation is actually wanted; no full calibration sweep in-item.

## Options considered

- **Agent SDK harness** — programmatic sessions, transcript access. Rejected: a new dependency the operator declined, metered API cost, and the verified `-p` surface covers the needs; the SDK remains available later without contract changes (the case convention is substrate-independent).
- **In-session runner skill** — maximum runtime fidelity, cheapest build. Rejected as primary (the runner would itself be a model; statistical N-runs painful; no unattended path) but **retained as the named fallback**: it reads the same manifests, so a substrate swap never forks the corpus.
- **Full calibration sweep** (corpora for all bundled judgment dimensions in-item) — rejected: multiplies fixture-authoring severalfold before any evidence the corpus shape is right; the over-engineering guard applies.
- **Shadow-mode live graduation** (graduate on live-run agreement stats) — deferred, not rejected: it needs `3.8`'s observability, and the record format is designed so live shadow stats can become a *second* evidence source later.
- **Parse-time certificate checking** — rejected on factoring: `parseConfig` is pure; certificate validation needs the filesystem, and `resolveVerifiers` already owns agent-file resolution and loud degradation.

## Consequences

**Positive.** The owed Phase-1 validation debt becomes executable and repeatable; `3.1`'s advisory→binding path becomes real (defined, mechanical, revocable); raw records give `3.4` and `3.8` their substrate for free; sealing becomes process-structural; the corpus outlives any substrate choice; eval spend rides the existing subscription rather than metered API.

**Costs and risks.** The headless-fidelity UNCLEAR is load-bearing — the plan's first task is the empirical spike, and its failure mode is the in-session fallback (autonomy lost, corpus kept). Calibration is session-hungry (~60 short headless runs per 20-case k=3 corpus) — mitigated by append-only resumable runs and small k defaults, bounded by subscription rate limits rather than dollars. `manual: true` cases remain honestly unexecuted by the runner. Certificate revocation on every prompt edit adds friction by design — that friction *is* the guarantee. Corpus authoring is real ongoing cost, accepted per-dimension on demand.

## Assumptions (revise the decision if these are wrong)

- `claude -p --agent <name>` resolves agents installed in `~/.claude/agents/` / `.claude/agents/` (the spike verifies; the fallback absorbs failure).
- Subscription usage limits tolerate calibration-scale bursts of short headless sessions.
- Verifier verdict stability at low temperature makes small k (≈3) meaningful for certificate stats.
- The coherence fixture set extends honestly to a ~20-case labelled corpus.
- The `claude` binary is present wherever evals run (operator machines; CI explicitly out of scope for v1).

## Revisit when

- The spike fails or print-mode fidelity proves partial → swap primary substrate to the in-session runner (same corpus).
- `3.7` lands → judge and quorum families diversify; the certificate gains a family axis.
- `3.8` lands → live shadow stats as a second graduation evidence source; CI tiering decision returns.
- `5.1` starts → generated verifiers calibrate through this same protocol (F9 recursion).
- Phase 4's write-gate instantiates the producer≠verifier pattern on memory writes and consumes the harness for its own calibration.

## Links

- EPIC [`3.3` row](../EPIC.md) · [`EPIC-STATE.md`](../EPIC-STATE.md)
- Research: [`eval-harness/REPORT.md`](../research/eval-harness/REPORT.md) · [`verification-autonomy`](../research/verification-autonomy/REPORT.md) · [`agentic-loops`](../research/agentic-loops/REPORT.md) · [`prior-art`](../research/prior-art.md)
- [ADR-0005](./0005-operator-authored-verifiers.md) (the seam this consumes) · [ADR-0001](./0001-harness-shape.md) (execution gated on the eval layer)
- Owed smokes inventory: [`smokes/README.md`](../../smokes/README.md) (Smokes 13–15 + not-covered list)
- Headless verification: Claude Code docs — [headless mode](https://code.claude.com/docs/en/headless.md), [subagents](https://code.claude.com/docs/en/sub-agents.md), [CLI reference](https://code.claude.com/docs/en/cli-reference.md) (fact-checked 2026-07-06)
- Design provenance: 2026-07-06 brainstorm session; local design spec under `docs/superpowers/specs/` (gitignored by convention)
