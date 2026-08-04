import { query, type Row } from '../db/client.js';
import type { Invoice } from '../types.js';

function toInvoice(row: Row): Invoice {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    amountCents: Number(row.amount_cents),
    dueOn: String(row.due_on),
    paidOn: row.paid_on === null ? null : String(row.paid_on),
  };
}

export async function findById(id: string): Promise<Invoice | null> {
  const rows = await query('select * from invoices where id = ?', [id]);
  return rows.length === 0 ? null : toInvoice(rows[0]);
}
