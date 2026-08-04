export interface Session {
  token: string;
  userId: string;
  /** ISO-8601 instant after which the session is no longer valid. */
  expiresAt: string;
}

export type AuthFailureReason = 'no_session' | 'session_expired';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: AuthFailureReason };
