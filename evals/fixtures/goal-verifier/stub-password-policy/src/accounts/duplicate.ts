import type { AccountStore } from './store.js';

/** Case-insensitive on the trimmed address (D-01). */
export function isDuplicateEmail(email: string, store: AccountStore): boolean {
  const normalised = email.trim().toLowerCase();
  if (normalised === '') return false;
  return store.findByEmail(normalised) !== undefined;
}
