export interface Profile {
  displayName: string;
  locale: string;
}

export interface User {
  id: string;
  email: string;
  /** Null until the user completes onboarding. */
  profile: Profile | null;
}

export function loadUser(
  id: string,
  users: Map<string, User>,
): User | undefined {
  return users.get(id);
}
