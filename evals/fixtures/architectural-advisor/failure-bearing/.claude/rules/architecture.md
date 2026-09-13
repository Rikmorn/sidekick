# Architecture

## Layering
`src/domain/` must not import from `src/infra/`. External I/O crosses a port interface in `src/domain/ports/`; the adapter in `src/infra/` implements it.

## No new services
No new deployment units this phase. New capabilities are modules inside the existing service.

## Delivery guarantees
Every inbound webhook provider and every internal queue delivers **at least once**. Duplicate deliveries and out-of-order arrival are normal operation, not incidents. The provider's own event id is present on every payload.
