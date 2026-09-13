# shipping-core

TypeScript on Node 22. A single long-running service (Fastify) with Postgres through the repository layer in `src/infra/db/`. Queue consumers run in the same process. Domain events are published to the internal bus in `src/infra/bus/`.

## Architectural decisions

- The domain layer (`src/domain/`) owns shipment state. Nothing outside it writes a shipment row.
- External I/O goes through ports declared in `src/domain/ports/`; adapters live in `src/infra/`.
- One deployment unit this phase. See `.claude/rules/architecture.md`.
