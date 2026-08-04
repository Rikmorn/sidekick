export interface Session {
  id: string;
  userId: string;
  lastSeenAt: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  put(session: Session): void {
    this.sessions.set(session.id, session);
  }

  find(id: string): Session | undefined {
    return this.sessions.get(id);
  }
}

export function getSession(
  store: SessionStore,
  id: string,
  now: number,
): Session | undefined {
  const session = store.find(id);
  if (session === undefined) {
    return undefined;
  }
  store.put({ ...session, lastSeenAt: now });
  return session;
}
