import { query, type Row } from '../db/client.js';

export interface OrderRecord {
  id: string;
  subtotalCents: number;
  weightGrams: number;
}

function toOrder(row: Row): OrderRecord {
  return {
    id: String(row.id),
    subtotalCents: Number(row.subtotal_cents),
    weightGrams: Number(row.weight_grams),
  };
}

export async function findById(id: string): Promise<OrderRecord | null> {
  const rows = await query('select * from orders where id = ?', [id]);
  return rows.length === 0 ? null : toOrder(rows[0]);
}
