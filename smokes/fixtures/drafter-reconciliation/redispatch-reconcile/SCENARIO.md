# Fixture: redispatch-reconcile (coherence checker bounced it back)

**Dispatch:** sk-rfc-drafter, re-dispatch.

**Inputs:**
- slug: `config-sync`
- feedback: "sk-coherence-checker: `## Architecture` recommends long-poll but D-01 decides webhook push — reconcile."
- (the seed `RFC.md` in this directory is the on-disk artifact the drafter reads)

**Expected:** the drafter reconciles `## Architecture` → `### Recommendation: webhook push`, demotes long-poll into `### Alternatives considered` with a divergence note, updates the `### Structured return` Recommendation line to match, and leaves Goals, Decisions, Questions, Risks **byte-equal**. PASS = Architecture now consistent with D-01 + untargeted sections unchanged (D-06).
