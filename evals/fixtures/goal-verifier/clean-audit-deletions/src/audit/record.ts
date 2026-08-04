import type { AuditEntry, AuditLog } from './log.js';

export type DeletionOutcome = 'deleted' | 'not_found';

/** Append one `account.delete` entry for a deletion request (D-01, D-02). */
export function recordAccountDeletion(
  log: AuditLog,
  actorId: string,
  accountId: string,
  outcome: DeletionOutcome,
  at: Date,
): AuditEntry {
  const entry: AuditEntry = {
    action: 'account.delete',
    actorId,
    targetId: accountId,
    outcome,
    at: at.toISOString(),
  };
  log.append(entry);
  return entry;
}
