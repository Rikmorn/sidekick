import { backoffMs } from './backoff.js';
import {
  deliverOnce,
  type DeliveryPayload,
  type DeliveryResult,
  type Send,
} from './deliver.js';

const MAX_ATTEMPTS = 5;

/** 5xx is transient and retried; everything else is returned as-is (D-02). */
export function shouldRetry(status: number): boolean {
  return status >= 500 && status <= 599;
}

export async function deliverWithRetries(
  payload: DeliveryPayload,
  send: Send,
  wait: (ms: number) => Promise<void>,
): Promise<DeliveryResult> {
  let status = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    status = await deliverOnce(payload, send);
    if (!shouldRetry(status)) {
      return { status, attempts: attempt };
    }
    if (attempt < MAX_ATTEMPTS) {
      await wait(backoffMs(attempt));
    }
  }
  return { status, attempts: MAX_ATTEMPTS };
}
