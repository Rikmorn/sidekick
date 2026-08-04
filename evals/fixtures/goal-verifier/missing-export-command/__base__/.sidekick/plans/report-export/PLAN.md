---
slug: report-export
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-18
---

## Checklist

- [x] T-01 [g1] — add the CSV serialiser
- [x] T-02 [g1] — add the `bin/export-orders.ts` command entry point

## Tasks

### T-01 — add the CSV serialiser

**Deps:** (none)
**Files:** src/reports/csv.ts

Header row plus one row per order, quoting and escaping per D-01 and D-02.
Wire it into the reports module so a month's orders can be rendered as CSV.

### T-02 — add the `bin/export-orders.ts` command entry point

**Deps:** T-01
**Files:** bin/export-orders.ts

Parse `<YYYY-MM>` from argv, load that month's orders, and write the serialised
CSV to stdout so an operator can redirect it to a file.
