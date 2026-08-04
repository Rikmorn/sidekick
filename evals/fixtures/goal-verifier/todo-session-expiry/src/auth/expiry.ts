import type { Session } from './types.js';

/** True when the session's `expiresAt` instant is at or before `now`. */
export function isExpired(session: Session, now: Date): boolean {
  return Date.parse(session.expiresAt) <= now.getTime();
}
