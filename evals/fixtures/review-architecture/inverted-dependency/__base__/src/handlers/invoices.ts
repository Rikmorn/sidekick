import { findById } from '../repositories/invoice-repository.js';
import type { Cursor } from '../types.js';

/** Decode the opaque cursor the dashboard hands back to us (D-01). */
export function parseCursor(raw: string | undefined): Cursor {
  if (raw === undefined || raw.length === 0) return { after: null, limit: 50 };
  const decoded = Buffer.from(raw, 'base64').toString('utf-8');
  const [after, limit] = decoded.split(':');
  return { after, limit: Number(limit) || 50 };
}

export async function getInvoice(id: string): Promise<Response> {
  const invoice = await findById(id);
  if (invoice === null) return new Response('not found', { status: 404 });
  return Response.json(invoice);
}
