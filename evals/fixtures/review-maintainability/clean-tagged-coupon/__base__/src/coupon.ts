const PERCENT_SCALE = 100;

export interface Coupon {
  code: string;
  percentOff: number;
}

export function applyCoupon(amountCents: number, coupon: Coupon): number {
  return Math.round(amountCents * (1 - coupon.percentOff / PERCENT_SCALE));
}
