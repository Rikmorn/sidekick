export interface OrderRequest {
  idempotencyKey: string;
  customerId: string;
  amountCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  amountCents: number;
}
