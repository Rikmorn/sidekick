export interface CartLine {
  sku: string;
  quantity: number;
  unitAmountCents: number;
}

export type PromoKind = 'percent' | 'fixed';

export interface Promo {
  code: string;
  kind: PromoKind;
  /** Percent points for `percent`, cents for `fixed`. */
  value: number;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  promo?: Promo;
}
