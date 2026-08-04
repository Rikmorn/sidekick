export interface Account {
  id: string;
  email: string;
  passwordHash: string;
}

export interface AccountStore {
  findByEmail(email: string): Account | undefined;
  insert(account: Account): void;
}

export function inMemoryStore(seed: Account[] = []): AccountStore {
  const byEmail = new Map(seed.map((a) => [a.email.trim().toLowerCase(), a]));
  return {
    findByEmail: (email) => byEmail.get(email.trim().toLowerCase()),
    insert: (account) => {
      byEmail.set(account.email.trim().toLowerCase(), account);
    },
  };
}
