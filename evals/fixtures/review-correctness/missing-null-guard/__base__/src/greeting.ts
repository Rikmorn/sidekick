import type { User } from './profile.js';

export function greeting(user: User): string {
  return `Welcome back, ${user.email}!`;
}
