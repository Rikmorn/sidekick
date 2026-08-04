import { db } from './db.js';

export interface Order {
  id: string;
  merchant_id: string;
  customer_name: string;
  total_cents: number;
}

/** Built by the router from the authenticated session. */
export interface Ctx {
  merchantId: string;
}

const MAX_PAGE = 100;

export async function listOrders(ctx: Ctx, limit: number): Promise<Order[]> {
  const { rows } = await db().query<Order>(
    `select id, merchant_id, customer_name, total_cents
       from orders
      where merchant_id = $1
      order by created_at desc
      limit $2`,
    [ctx.merchantId, Math.min(limit, MAX_PAGE)],
  );
  return rows;
}

/** GET /orders/search?q= — support tooling over the merchant's own orders. */
export async function searchOrders(
  ctx: Ctx,
  req: { query: Record<string, string> },
): Promise<Order[]> {
  const term = req.query.q ?? '';
  const { rows } = await db().query<Order>(
    `select id, merchant_id, customer_name, total_cents
       from orders
      where merchant_id = $1
        and customer_name ilike '%${term}%'
      order by created_at desc
      limit ${MAX_PAGE}`,
    [ctx.merchantId],
  );
  return rows;
}
