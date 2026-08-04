import { query, type Row } from '../db/client.js';
import { parseCursor } from '../handlers/invoices.js';
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

export async function listOverdue(
  rawCursor: string | undefined,
): Promise<Invoice[]> {
  const cursor = parseCursor(rawCursor);
  const rows = await query(
    'select * from invoices where paid_on is null and due_on < now() and id > ? order by id limit ?',
    [cursor.after, cursor.limit],
  );
  return rows.map(toInvoice);
}
