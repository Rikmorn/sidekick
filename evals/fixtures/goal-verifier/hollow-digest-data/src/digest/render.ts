import type { Notification, Recipient } from '../notifications/types.js';

export function renderDigest(
  recipient: Recipient,
  items: Notification[],
): string {
  const greeting = `Hi ${recipient.displayName},`;
  if (items.length === 0) {
    return `${greeting}\n\nNothing new this week.`;
  }
  const lines = items.map((n) => `- ${n.title} (${n.createdAt.slice(0, 10)})`);
  return `${greeting}\n\nYou have ${items.length} unread:\n${lines.join('\n')}`;
}
