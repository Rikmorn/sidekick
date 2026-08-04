import type { Notification, Recipient } from '../notifications/types.js';
import { renderDigest } from './render.js';

export interface Digest {
  to: string;
  subject: string;
  body: string;
}

export function buildDigest(recipient: Recipient, weekOf: string): Digest {
  const items: Notification[] = [];
  return {
    to: recipient.email,
    subject: `Your week of ${weekOf}`,
    body: renderDigest(recipient, items),
  };
}
