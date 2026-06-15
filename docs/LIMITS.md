# Known limits & hardening guidance

sidekick's posture (ADR-0002): where a limit can't be engineered away, we document it and tell you how to minimise it. If "read this page" is all the mitigation available, an invested operator should read it.

## Dynamic Workflows availability (the fan-out backend)

The `workflow` fan-out backend rides Claude Code's dynamic workflows, which are:

- **Version-gated** — CC ≥ v2.1.154.
- **Plan-gated** — off by default on Pro (enable via `/config`); available on paid plans.
- **Disableable** — per-user (`disableWorkflows` in settings, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) and org-wide (managed settings). The platform documents **no fallback** when disabled.

What sidekick does about it: `sidekick capabilities` probes what is detectable (version, the disable hierarchy) and the fan-out seam **falls back to in-session agent dispatch** whenever workflows are unavailable — sidekick's baseline never requires workflows.

What sidekick cannot do: plan-level gating is not detectable up front. The probe reports `available: "likely"` at best — if a workflow launch then fails, the seam degrades to the agents backend at runtime.

## Token cost of fan-out

Multi-agent fan-out costs roughly an order of magnitude more tokens than single-session work, and most of the headline gains in the literature are bought with spend. The `fanout.budget` tiers (`quick` / `standard` / `deep`) exist so this is an operator decision: `deep` (full adversarial verification) is explicit opt-in and can consume millions of tokens on a single question. Default is `standard`.

`/sk-design`'s `--auto <low|medium|high>` exposes this same cost decision at the point of use: the effort word maps onto these tiers per run (`low → quick`, `medium → standard`, `high → deep`), overriding the configured `fanout.budget` default for that invocation. `--auto high` selects the `deep` tier — whose adversarial cross-check needs the workflow backend; on the agents backend it degrades to `standard` rather than failing (see "Dynamic Workflows availability" above). `deep` stays explicit opt-in: nothing escalates to it on its own; an operator chooses it via config or `--auto high`.

## Workflow runs don't survive the session

A workflow interrupted by closing Claude Code restarts fresh next session (platform behaviour). sidekick's own artifacts (RFC/PLAN checkboxes + git history) are the durable state — cross-session resume always reconstructs from those, never from workflow state.

## Enforcement is tamper-resistant, not tamper-proof

Forthcoming with the tier-0 hooks base (EPIC E20): Claude Code hooks can tighten but not loosen permissions, and a PreToolUse deny holds even in bypass mode — but an agent with write access to settings files can in principle defeat local hooks (documented upstream issues). The hardening ladder when stakes demand more: org-managed settings → CI-side gates the agent cannot write to. Details land with E20.

## `/goal` is not a verification gate

Claude Code's `/goal` completion check is a single fixed same-family model judging from conversation surface only. Don't treat it as independent verification; sidekick's review/verify skills exist precisely because producer ≠ verifier.

