import { query, type Row } from '../db/client.js';
import type { User } from '../types.js';

function toUser(row: Row): User {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
  };
}

export async function findById(id: string): Promise<User | null> {
  const rows = await query('select * from users where id = ?', [id]);
  return rows.length === 0 ? null : toUser(rows[0]);
}

export async function updateDisplayName(
  id: string,
  displayName: string,
): Promise<void> {
  await query('update users set display_name = ? where id = ?', [
    displayName,
    id,
  ]);
}
