# Fixture: divergence-agreement (advisor and dialogue agree — common path stays frictionless)

**Dispatch:** `/sk-design`, default exploration mode (no `--auto`).

**Setup:**

The user runs `/sk-design cache-layer-for-user-profiles`. The explorer proceeds with `slug: cache-layer-for-user-profiles`, `complexity: low`. The dialogue converges on **Redis key-value cache with TTL expiry** as the caching mechanism. `sk-architectural-advisor` runs and its `### Recommendation` is also Redis with TTL — the wording differs slightly (advisor says "Redis hash per user, 15-minute TTL"; the dialogue said "Redis key-value with TTL expiry") but the load-bearing axis is identical: same mechanism (Redis), same ownership model (application-side cache, no broker), same failure semantics.

Illustrative advisor output snippet:

```markdown
## Architecture

### Recommendation: Redis hash per user, 15-minute TTL

Store each user profile as a Redis HASH keyed `user:<id>`. The application layer
hydrates on cache miss and writes through on profile update. TTL of 15 minutes
balances freshness against read amplification.

### Alternatives considered

- **In-process LRU cache** — zero-latency but not shared across instances;
  evicted on restart. Rejected for multi-instance deployments.

### Structured return
Recommendation: Redis hash per user, 15-minute TTL
Off-stack rejection: (none)
```

**Expected:**

The orchestrator reasons through the comparison — Redis hash/TTL vs the settled Redis key-value/TTL — and concludes the difference is cosmetic (naming and configuration detail, not a different mechanism or ownership model). It proceeds **straight to the draft without surfacing a choice to the user**. `sk-rfc-drafter` receives the advisor's `## Architecture` verbatim as `architecture_section`; the draft's `## Architecture` is inserted byte-identical to the advisor's section.

PASS = no AskUserQuestion or inline "please choose" prompt between the advisor return and the RFC draft dispatch + `## Architecture` in the draft matches the advisor's section verbatim + Decisions derive from and agree with Architecture.

FAIL = the orchestrator treats cosmetic wording differences as divergence and asks the user to choose; or pauses unnecessarily; or rewrites the advisor's Architecture text without a decision mismatch driving the rewrite.

> **Session-registry note:** `/sk-design` runs in the main session; no fresh-session requirement applies. If agents were recently reinstalled, dispatch from a session notified of the update.
