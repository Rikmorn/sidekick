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
): DeleteResult {
  return { removed: store.remove(accountId) };
}
