import { randomUUID } from 'node:crypto';
import { hashPassword } from './password.js';

export interface Account {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

export interface AccountStore {
  findByEmail(email: string): Promise<Account | null>;
  insert(account: Account): Promise<void>;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const MIN_PASSWORD_LENGTH = 12;

/** POST /signup — registers a new account. */
export async function signUp(
  store: AccountStore,
  email: string,
  plaintextPassword: string,
): Promise<Account> {
  if (plaintextPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  const normalised = normaliseEmail(email);
  if ((await store.findByEmail(normalised)) !== null) {
    throw new Error('email already registered');
  }
  const { salt, hash } = hashPassword(plaintextPassword);
  const account: Account = {
    id: randomUUID(),
    email: normalised,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  };
  await store.insert(account);
  return account;
}
