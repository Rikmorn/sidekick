import type { Notification } from './types.js';

/** Unread notifications for one user, newest first. */
export function listUnread(
  all: Notification[],
  userId: string,
): Notification[] {
  return all
    .filter((n) => n.userId === userId && n.readAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
