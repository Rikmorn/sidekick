export interface Invoice {
  id: string;
  customerId: string;
  amountCents: number;
  dueOn: string;
  paidOn: string | null;
}

export interface Cursor {
  after: string | null;
  limit: number;
}
