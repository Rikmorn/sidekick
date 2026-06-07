# Backlog: Cross-family verification quorum

**Status:** Parked 2026-06-07. From Track A + `docs/research/SYNTHESIS.md` (Tier 2).

**What:** Route the *verification* step of the quorum to a **different model family** than the producer, instead of the current all-Claude (same-family) quorum.

**Why:** Track A found a same-family judge is structurally compromised (self-preference bias) and that self-consistent errors correlate *within* a family — so a same-family quorum is both biased and capped. Cross-family verification is the durable fix. (Human escalation still required: even cross-model agreement is capped at ~60% shared errors under shared architecture/provider.)

**Cost / why parked:** Requires wiring in a non-Anthropic verifier (API or MCP) — a real new dependency and cost/complexity. Not worth it everywhere.

**Recommendation when picked up:** Adopt *scoped* to verification of HIGH-STAKES / IRREVERSIBLE outputs only, not every quorum step. Pair with CoVe-style independent verification (verifier does not see the draft's reasoning).

**Sources:** `docs/research/verification-autonomy/REPORT.md` (findings 4, 6); `docs/research/SYNTHESIS.md` (Tier 2).
