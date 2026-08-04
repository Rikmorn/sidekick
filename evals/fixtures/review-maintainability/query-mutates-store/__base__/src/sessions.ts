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
