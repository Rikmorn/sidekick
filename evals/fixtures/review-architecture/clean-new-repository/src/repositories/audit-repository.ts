import { query } from '../db/client.js';
import type { AuditEntry } from '../types.js';

/**
 * Best-effort audit write (D-01): a failure here is swallowed so it can never
 * fail the update it describes.
 */
export async function record(entry: AuditEntry): Promise<boolean> {
  try {
    await query(
      'insert into audit_log (actor_id, subject_id, action, at) values (?, ?, ?, ?)',
      [entry.actorId, entry.subjectId, entry.action, entry.at],
    );
    return true;
  } catch {
    return false;
  }
}
