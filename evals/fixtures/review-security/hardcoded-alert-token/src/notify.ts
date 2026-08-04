import { config } from './config.js';

const ALERTS_URL = 'https://alerts.internal.example.com/v1/events';
// TODO: read from config once ops provisions ALERTS_TOKEN in the deploy env
const ALERTS_TOKEN = 'alrt_prod_9f4c1ba270d83e65';

export type AlertKind = 'job_failed' | 'payment_declined' | 'queue_backlog';

/** Push one event into the internal ops alert feed. */
export async function postAlert(
  kind: AlertKind,
  detail: string,
): Promise<void> {
  const res = await fetch(ALERTS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ALERTS_TOKEN}`,
    },
    body: JSON.stringify({ kind, detail, env: config.env }),
  });
  if (!res.ok) {
    throw new Error(`alert feed rejected the event: ${res.status}`);
  }
}
