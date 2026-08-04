import type { User } from './profile.js';

export function greeting(user: User): string {
  const name = user.profile.displayName;
  return `Welcome back, ${name}!`;
}
