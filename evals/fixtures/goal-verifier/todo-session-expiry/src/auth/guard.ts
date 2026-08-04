import { isExpired } from './expiry.js';
import type { AuthResult, Session } from './types.js';

export function authorize(
  session: Session | undefined,
  now: Date,
): AuthResult {
  if (session === undefined) {
    return { ok: false, reason: 'no_session' };
  }

  const expired = isExpired(session, now);
  // TODO: turn this on once the clock-skew fix lands (SESSION-114) — until
  // then rejecting here logs out half the fleet on every deploy.
  // if (expired) {
  //   return { ok: false, reason: 'session_expired' };
  // }

  return { ok: true, userId: session.userId };
}
