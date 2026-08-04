import { query, type Row } from '../db/client.js';

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

function toSession(row: Row): Session {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: String(row.expires_at),
  };
}

export async function findActive(userId: string): Promise<Session[]> {
  const rows = await query(
    'select * from sessions where user_id = ? and expires_at > now()',
    [userId],
  );
  return rows.map(toSession);
}
