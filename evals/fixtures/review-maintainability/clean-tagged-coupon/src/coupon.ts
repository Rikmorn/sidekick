const PERCENT_SCALE = 100;
const MIN_PERCENT_OFF = 1;
const MAX_PERCENT_OFF = 90;

export interface Coupon {
  code: string;
  percentOff: number;
}

export function applyCoupon(amountCents: number, coupon: Coupon): number {
  return Math.round(amountCents * (1 - coupon.percentOff / PERCENT_SCALE));
}

export type CouponResult =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: string };

/** Both arguments come off the checkout query string, so neither is trusted. */
export function readCoupon(code: string, rawPercent: string): CouponResult {
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode === '') {
    return { ok: false, reason: 'coupon code is empty' };
  }
  const percentOff = Number(rawPercent);
  if (!Number.isInteger(percentOff)) {
    return { ok: false, reason: `"${rawPercent}" is not a whole percentage` };
  }
  if (percentOff < MIN_PERCENT_OFF || percentOff > MAX_PERCENT_OFF) {
    return {
      ok: false,
      reason: `discount must be within [${MIN_PERCENT_OFF}, ${MAX_PERCENT_OFF}]`,
    };
  }
  return { ok: true, coupon: { code: normalizedCode, percentOff } };
}
