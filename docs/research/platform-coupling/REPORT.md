# Platform Coupling — Should sidekick's loops build ON Claude Code's primitives?

**Research question:** see [`FRAMING.md`](./FRAMING.md). Should sidekick's orchestration loops be built on CC's platform primitives (Workflow / hooks / /goal / /loop), kept hand-rolled in slash-command skills, or split — and what coupling posture minimizes regret?

**Method:** deep-research workflow (5 search angles → 22 sources → 101 claims extracted → top 25 adversarially verified by 3-vote quorum → 23 confirmed, 2 killed → 8 synthesized findings). 2026-06-10. **Companion:** [`sources.md`](./sources.md).

**Provenance convention:** findings marked **[run]** rest on the workflow's verification; **[first-hand]** were re-verified by the orchestrator against the live source on 2026-06-10.

---

## Headline

**Progressive enhancement: own the loop, rent the fan-out.** Keep sidekick's orchestration owned (slash-command skills + the deterministic CLI kernel) as the baseline every environment can run, and adopt Workflow primitives as an *enhancement layer* where present — not a load-bearing dependency. Three legs:

1. **The historical record is one-sided.** The only vendor with a track record of first-party agent-orchestration primitives (OpenAI) killed every one it shipped — Assistants API (~3-year life, 12-month notice, hard shutdown), Agent Builder (~6-month notice), ChatGPT plugins (~1 year launch-to-removal). Migration cost concentrated on the deepest-coupled; the proven hedge (Zapier) was owning a platform-agnostic layer, which survived two primitive swaps.
2. **The coupling decision is asymmetric.** Anthropic documents skill→workflow conversion as a one-prompt operation ("point Claude at it and ask for a workflow that does the same thing") — so *deferring* coupling costs almost nothing in option value, while coupling now inherits availability risk (version-gated, plan-gated, kill-switchable with no fallback) on a primitive stable for ~1 month.
3. **The all-in counter-case doesn't apply.** Going all-in on an advanced capability is justified when the product can't exist without it; sidekick's loops demonstrably already work hand-rolled.

**Honest limit:** the ecosystem-adoption angle (how gsd/superpowers/community actually adopted Workflows since GA) produced **zero surviving claims** — the verdict rests on platform docs, vendor precedent, and architecture principles, not observed CC-ecosystem behaviour.

---

## Confirmed findings

**F1. OpenAI hard-killed both of its first-party agent-orchestration primitives.** Assistants API: launched Nov 2023, deprecation announced 2025-08-26, full shutdown 2026-08-26 (requests stop working; ~12 months notice, ~3-year lifespan). Agent Builder: launched Oct 2025, deprecated 2026-06-03, shutdown 2026-11-30 (**~6 months notice**). Replacements (Responses + Conversations + Prompts; Agents SDK) require re-architecting; "We will not provide an automated tool for migrating Threads to Conversations." — **high** (six 3-0 claims, OpenAI primary docs) · **[run]** *(Assistants deprecation consistent with orchestrator training knowledge; Agent Builder timeline is post-cutoff, from-run only)* · *Caveats: different vendor, server-side API products vs client-side CLI features; Assistants was beta its whole life; its shutdown is announced intent (~2.5 months out), not yet accomplished fact.*

**F2. ChatGPT plugins: ~1 year launch-to-removal with a hard EOL, on the platform's initiative.** Dev email late Dec 2023 (~9 months post-launch); new plugin conversations off 2024-03-19; all existing conversations dead 2024-04-09. — **high** (three 3-0 claims; Zapier + secondary) · **[run]** · *The adjacent claim "GPTs were a strict capability downgrade" was REFUTED (1-2) — the precedent supports churn/forced migration, not capability regression.*

**F3. Migration cost distributes by coupling depth; owning an abstraction layer is the proven hedge.** Tightly-coupled systems (Threads/Runs polling, server-side state) bore the Assistants sunset cost; loosely-coupled stateless usage migrated easily. Zapier's platform-agnostic AI Actions layer survived plugins→GPTs *and* GPT Actions→MCP. — **medium** (one 3-0 + one 2-1; causal "because" is interpretive) · **[run]** · *Durable as a posture: keep sidekick's value in its own layer (CLI kernel, gates, artifacts); touch platform primitives through thin seams.*

**F4. CC dynamic workflows carry real availability gating today.** Require CC ≥ v2.1.154; paid plans only; **off-by-default on Pro** (enable via `/config`); disableable per-user (`/config` toggle, `"disableWorkflows": true`, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) and org-wide (managed settings / admin console). When disabled: bundled workflow commands unavailable, `ultracode` keyword inert — **no fallback or degradation path documented anywhere on the page**. — **high** · **[first-hand]** (all quotes re-verified verbatim 2026-06-10) · *Consequence: any workflow-dependent sidekick feature needs its own detect-and-degrade story; this is exactly the documented-limits/operator-guidance deliverable class.*

**F5. The coupling asymmetry favors deferral.** Documented one-prompt conversion path: "If you already have an orchestrator built another way, such as a folder of subagent prompts or a skill that fans work out, you can point Claude at it and ask for a workflow that does the same thing." Saved workflows are repo-distributable (`.claude/workflows/` shared with everyone who clones; runs as `/<name>`). — **high** · **[first-hand]** · *Caveats: low human friction ≠ behavioural fidelity (no guarantee the generated script preserves semantics — needs verification when exercised); distributed workflows only function where workflows are enabled (F4 gates apply).*

**F6. Anthropic's own guidance supports owning the orchestration layer.** "Building Effective Agents" (still live, updated to cover their own Agent SDK): start with direct API calls; frameworks "obscure the underlying prompts and responses, making them harder to debug"; "don't hesitate to reduce abstraction layers and build with basic components as you move to production." — **high** for the quotes (3-0 verbatim) · **[run]** · *Scope caution: this addresses API-level agent frameworks, transfers to CC Workflows by analogy only. And the "broad LangChain exodus" claim was REFUTED (1-2) — supports "own the kernel as a defensible default," not "never use platform runtime."*

**F7. The minVersion precedent (VS Code) gates at distribution time, not via runtime fallback.** `engines.vscode` is mandatory (cannot be `*`); adopting a new platform capability = raise the version floor; Marketplace withholds the new version from older hosts. Runtime API-availability detection remains an unsolved pain point there (microsoft/vscode#214294). — **high** (two 3-0 claims) · **[run]** · *Mapping is partial: a version floor cannot catch CC's runtime plan/kill-switch gating — those still need a runtime check (a CLI-kernel `capabilities` probe is the natural home).*

**F8. Progressive enhancement is the matching posture.** Baseline experience every environment provides (skills + CLI kernel), advanced layer activates where supported (Workflows). The recognized inverse case — all-in on the capability with a token basic version — applies only when the product can't exist without it; sidekick doesn't meet that condition. — **medium** (definitions verified 3-0; browser-scoped source, analogical transfer) · **[run]**.

### First-hand additions from the spot-check (not in the run's findings)

- **Staged sign-off is the documented pattern:** "No mid-run user input — only agent permission prompts can pause a run. **For sign-off between stages, run each stage as its own workflow.**" The platform's own answer to deviation routing is stage-per-workflow with the human between stages — i.e. the orchestrating *session* still owns the loop. Directly validates keeping the interactive loop in the skill even if waves ever ran as per-stage workflows.
- **Workflow subagents always run `acceptEdits` and inherit the tool allowlist, regardless of session permission mode — file edits auto-approved.** Inside a workflow, the permission-prompt safety net for writes is *gone*; deterministic hooks become the only always-on enforcement under that substrate. Feeds the enforcement-surface track directly.
- **Resume confirmed same-session only** ("If you exit Claude Code while a workflow is running, the next session starts the workflow fresh") — cross-session recovery stays sidekick's.

---

## Refuted (useful negatives)

- **"GPTs were a strict capability downgrade vs plugins"** — 1-2. Churn/forced-migration stands; capability regression doesn't.
- **"Production teams are broadly migrating off LangChain to custom orchestration"** — 1-2. The framework-skepticism narrative should not be overstated; F6 rests on Anthropic's verbatim guidance, not an exodus story.

---

## Caveats (carried from the run, plus orchestrator's)

- **Zero observed CC-ecosystem adoption data** (angle 2 produced no surviving claims) — the framing's "ecosystem too young to signal" disconfirming angle is effectively confirmed; revisit in a quarter.
- OpenAI precedents are analogies (different vendor, server-side products, beta-status primitive); CC Workflows GA ~1 month — churn risk is *projected*, not observed.
- Ragwalla source has a bias incentive (sells an Assistants-compatible product); its facts matched OpenAI primary docs.
- Three findings carry a 2-1 leg (Zapier causality, start-direct framing, hand-rolled debuggability).
- Workflows docs/plan-gating/disable semantics verified 2026-06-10; this page moves fast.

## Open questions

1. How have comparable CC toolchains (gsd, superpowers, major plugins) actually adopted/avoided Workflows since GA? (No surviving evidence found — re-probe later.)
2. What fraction of sidekick's consumers run workflow-unavailable environments (Pro without opt-in, org-disabled, CC < 2.1.154)? → pairs with the task-size instrumentation sub-decision (D6).
3. Does skill→workflow conversion preserve behavioural fidelity in practice? Worth one controlled experiment on an sk-* orchestrator before E18 is weighed.
4. Does CC's plugin manifest support a distribution-time minVersion (the guide-agent pass said plugins can declare CC `minVersion`; the run flagged it open) — and regardless, runtime plan/kill-switch gating needs a CLI-kernel capability probe.

## Implications for E2 (orchestrator's synthesis, for the brainstorm)

- **D1 (value thesis):** supported from a new direction — the platform's own docs route humans-between-stages and auto-approve edits inside workflows; oversight is structurally left to the layer above.
- **D2 (substrate):** progressive enhancement = keep sk-build's loop owned; Workflow becomes an *optional backend* for breadth fan-out (research/review), gated by a capability probe.
- **D3 (enforcement):** `acceptEdits`-inside-workflows makes deterministic hooks the only always-on write gate under that substrate — raises the enforcement track's stakes.
- **D4 (coupling posture):** thin seams + CLI capability probe + documented-limits guidance; defer coupling (F5 asymmetry); declare minVersion at distribution where supported.
- **D5 (deliverable):** nothing here contradicts ADR-0002 with a per-primitive table; F4/F5/F7 supply its coupling-posture rows.
