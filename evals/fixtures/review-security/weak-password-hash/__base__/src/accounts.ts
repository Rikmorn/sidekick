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
