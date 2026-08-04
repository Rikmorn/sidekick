---
slug: promo-pricing
pins-rfc: 0000000000000000000000000000000000000000
created: 2026-07-16
---

## Checklist

- [x] T-01 [g1] — add the `applyPromo` discount function
- [x] T-02 [g1] — apply the discount inside `checkoutTotal`

## Tasks

### T-01 — add the `applyPromo` discount function

**Deps:** (none)
**Files:** src/cart/promo.ts

Percent and fixed discounts over a gross total in cents, rounding down and
clamping at zero (D-01, D-02).

### T-02 — apply the discount inside `checkoutTotal`

**Deps:** T-01
**Files:** src/cart/total.ts

Sum the line amounts as today, then pass the sum through `applyPromo` when the
cart carries a promo so every caller of `checkoutTotal` gets the net amount.
