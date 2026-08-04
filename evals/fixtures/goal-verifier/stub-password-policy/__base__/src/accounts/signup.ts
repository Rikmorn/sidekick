import type { Account, AccountStore } from './store.js';

export interface SignupRequest {
  id: string;
  email: string;
  password: string;
}

export type SignupResult =
  | { ok: true; account: Account }
  | { ok: false; reason: string };

export function signup(
  req: SignupRequest,
  store: AccountStore,
  hash: (password: string) => string,
): SignupResult {
  const account: Account = {
    id: req.id,
    email: req.email.trim(),
    passwordHash: hash(req.password),
  };
  store.insert(account);
  return { ok: true, account };
}
