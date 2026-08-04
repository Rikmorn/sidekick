export type Role = 'member' | 'admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  role: Role;
}

export interface UserStore {
  get(id: string): Promise<User | null>;
  patch(id: string, fields: Partial<User>): Promise<User>;
}

let store: UserStore | null = null;

export function setUserStore(next: UserStore): void {
  store = next;
}

export function users(): UserStore {
  if (store === null) {
    throw new Error('user store not initialised — call setUserStore() at boot');
  }
  return store;
}
