# Fixture: unanalysed-flag (decided design absent from the advisor's section)

**Dispatch:** sk-rfc-drafter, fresh (no feedback).

**Inputs:**
- slug: `event-store`
- scope_statement: "Adopt an event-sourced store for the orders domain (team decision)."
- complexity: high
- architecture_section: analyses only a CRUD-over-Postgres approach; never mentions event sourcing, not even as a rejected alternative.

**Expected:** the draft states the event-sourced approach in `## Architecture` only as far as the decision specifies it, and adds a `## Questions` bullet flagging that the event-store architecture (projections, event schema, replay) was not analysed. PASS = **no fabricated** event-sourcing architecture + an explicit Questions flag (D-05). FAIL = the drafter invents projection/replay design the advisor never provided.
