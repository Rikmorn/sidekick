---
slug: promo-pricing
created: 2026-07-16
status: locked
---

## Goals & non-goals

- g1: a cart carrying an active promo code is charged the discounted total —
  the checkout total returned to the caller is the amount after the discount.
- Non-goal: stacking more than one promo code on a single cart.

## Architecture

`applyPromo` is a pure function in `src/cart/promo.ts` taking a gross total in
cents plus the promo record, and returning the net total. `checkoutTotal` in
`src/cart/total.ts` sums the line amounts and then hands the sum to `applyPromo`
when the cart carries a promo, so the discount is applied in exactly one place.

## Decisions

- D-01: promos are either `percent` or `fixed`; percent discounts round down to
  the nearest cent.
- D-02: a discount never takes the total below zero.

## Risks

- A promo applied twice (once in the cart, once at the payment step) would
  double-discount, so the discount stays inside `checkoutTotal`.
