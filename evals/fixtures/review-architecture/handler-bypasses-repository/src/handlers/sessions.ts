import { query, lastAffected } from '../db/client.js';
import { findActive } from '../repositories/session-repository.js';

export async function listSessions(userId: string): Promise<Response> {
  if (userId.length === 0) {
    return new Response('user_id required', { status: 400 });
  }
  const sessions = await findActive(userId);
  return Response.json({ sessions });
}

/** Operator-triggered sweep of sessions past their expiry (D-01). */
export async function sweepExpiredSessions(): Promise<Response> {
  await query('delete from sessions where expires_at <= now()', []);
  return Response.json({ deleted: lastAffected() });
}
