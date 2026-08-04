import { findActive } from '../repositories/session-repository.js';

export async function listSessions(userId: string): Promise<Response> {
  if (userId.length === 0) {
    return new Response('user_id required', { status: 400 });
  }
  const sessions = await findActive(userId);
  return Response.json({ sessions });
}
