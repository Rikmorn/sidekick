import type { Role } from './users.js';

export interface Session {
  userId: string;
  role: Role;
}

export interface Request {
  body: unknown;
  params: Record<string, string>;
  session: Session | null;
}

/** Every mounted handler runs behind the session middleware. */
export function requireSession(req: Request): Session {
  if (req.session === null) {
    throw new Error('unauthenticated');
  }
  return req.session;
}
