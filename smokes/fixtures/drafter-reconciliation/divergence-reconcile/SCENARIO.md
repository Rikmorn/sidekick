# Fixture: divergence-reconcile (decided design = a listed alternative)

**Dispatch:** sk-rfc-drafter, fresh (no feedback).

**Inputs:**
- slug: `config-sync`
- scope_statement: "Sync config to edge nodes. The team has decided on webhook push for latency reasons."
- complexity: medium
- architecture_section: `### Recommendation: long-poll the config service`; under `### Alternatives considered`, "webhook push — rejected because it adds an inbound endpoint to maintain."
- analogues: 1 entry.

**Expected:** the draft's `## Architecture` `### Recommendation` is **webhook push** (the decided design); the advisor's polling recommendation is **moved into `### Alternatives considered`** with a "diverged because…" note; the advisor's inbound-endpoint reasoning is **preserved**, not deleted. `## Decisions` states webhook push. Architecture and Decisions agree. PASS = recommendation flipped + advisor reasoning retained as a tradeoff + no re-litigation of the decision (D-02, D-03).
