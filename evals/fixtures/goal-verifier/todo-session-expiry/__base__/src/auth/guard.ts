import type { AuthResult, Session } from './types.js';

export function authorize(
  session: Session | undefined,
  now: Date,
): AuthResult {
  if (session === undefined) {
    return { ok: false, reason: 'no_session' };
  }
  return { ok: true, userId: session.userId };
}
