# Fixture: divergence-surface (advisor and dialogue diverge on a load-bearing axis)

**Dispatch:** `/sk-design`, default exploration mode (no `--auto`).

**Setup:**

The user runs `/sk-design event-driven-notifications`. The explorer proceeds with `slug: event-driven-notifications`, `complexity: medium`. The dialogue converges on **async event bus** as the delivery mechanism (low coupling, fan-out to multiple consumers). Then `sk-architectural-advisor` runs and returns a `### Recommendation` of **direct HTTP webhook dispatch** (tight, synchronous, simpler to operate). The two differ on the storage/ownership model — async bus vs synchronous push — which is a load-bearing axis: it changes the message persistence model, failure semantics, and whether consumers are decoupled.

Illustrative advisor output snippet:

```markdown
## Architecture

### Recommendation: direct HTTP webhook dispatch

Each notification event triggers an immediate POST to registered webhook URLs.
No broker required; the sending service owns the dispatch loop and retry logic.

### Alternatives considered

- **Async event bus (e.g. Redis Streams / NATS)** — decouples producers from
  consumers and supports fan-out, but adds operational overhead and requires a
  broker. Rejected here as disproportionate for a small consumer count.

### Structured return
Recommendation: direct HTTP webhook dispatch
Off-stack rejection: (none)
```

**Expected:**

Before dispatching `sk-rfc-drafter`, the orchestrator reasons through the divergence and surfaces **both approaches by substance and real tradeoff**, not as bare labels ("Option A / Option B") and not as "the advisor disagrees". A conforming surface states what each buys and costs — for example:

> **Async event bus** — decouples producers and consumers; supports fan-out; tolerates consumer unavailability (messages queue); costs a broker and operational overhead.
> **Direct HTTP webhook dispatch** — simpler to operate; no broker; tight coupling; dispatch retry lives in the sender; fan-out scales poorly.

The user (operator) decides. Their choice is authoritative. `sk-rfc-drafter` is dispatched with the decided design; it reconciles `## Architecture` so the `### Recommendation` reflects the chosen approach and the overridden approach is demoted to `### Alternatives considered` with a "diverged because…" note.

PASS = divergence surfaced with substance (both approaches named with what each buys/costs) + operator decides + drafter's `## Architecture` matches the decision + overridden approach preserved in alternatives.

FAIL = orchestrator proceeds straight to the draft without surfacing the divergence; or surfaces only "the advisor recommends X but the dialogue settled on Y" without stating the tradeoff; or uses bare labels.

> **Session-registry note:** `sk-architectural-advisor` and `sk-rfc-drafter` are dispatched from the `/sk-design` main-session skill, not from a subagent, so no fresh-session requirement applies here. If `sk-architectural-advisor` or other agents were recently installed/updated, dispatch from a session that has received the "new agent types available" notification.
