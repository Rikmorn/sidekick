import type { AuditLog } from '../audit/log.js';
import { recordAccountDeletion } from '../audit/record.js';

export interface AccountStore {
  /** True when a row was removed, false when the account did not exist. */
  remove(accountId: string): boolean;
}

export interface DeleteResult {
  removed: boolean;
}

export function deleteAccount(
  actorId: string,
  accountId: string,
  store: AccountStore,
  log: AuditLog,
  at: Date = new Date(),
): DeleteResult {
  const removed = store.remove(accountId);
  recordAccountDeletion(
    log,
    actorId,
    accountId,
    removed ? 'deleted' : 'not_found',
    at,
  );
  return { removed };
}
