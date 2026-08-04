import { isDuplicateEmail } from './duplicate.js';
import { meetsPolicy } from './password.js';
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
  if (isDuplicateEmail(req.email, store)) {
    return { ok: false, reason: 'email_taken' };
  }

  const policy = meetsPolicy(req.password);
  if (!policy.ok) {
    return { ok: false, reason: `weak_password:${policy.failedRule}` };
  }

  const account: Account = {
    id: req.id,
    email: req.email.trim(),
    passwordHash: hash(req.password),
  };
  store.insert(account);
  return { ok: true, account };
}
