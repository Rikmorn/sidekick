---
applies-to: [evals/cases, bin/helpers/eval-case.ts]
---

# Failure-capture pipeline — real-world issues as importable eval cases

Operator idea at the measurement-program design (2026-07-23): treat real failures "like a stack trace that we can upload." The measurement program's corpus strategy (seeded bootstrap + failure-harvest) needs a capture surface for the harvest half — this is that surface, staged by appetite:

- **v1 (local, no infra):** sk-* orchestrators log a real-world issue to a local file (structured: subject, fixture-able input, what went wrong, expected-vs-actual) at the moment of failure — when the label is cheapest — and an import step turns a logged entry into a case skeleton under `evals/cases/` for operator adjudication. No servers, no privacy exposure beyond the repo itself.
- **Horizon (hosted):** upload/aggregation across machines or users — explicitly flagged a potential privacy nightmare needing servers and infrastructure; only worth it if the appetite for real-world data at scale materialises. Not designed here.

**Resolution direction:** v1 rides the measurement program epic (the harvest ritual needs it); the hosted variant stays parked until appetite is explicit. "Loads of ways to enhance with real world data if we have the appetite for it" — the design constraint is that capture cost at failure time stays near zero, or it won't happen.
