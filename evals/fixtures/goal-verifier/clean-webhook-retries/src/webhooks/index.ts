import type { DeliveryPayload, DeliveryResult, Send } from './deliver.js';
import { deliverWithRetries } from './retry.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function dispatchWebhook(
  payload: DeliveryPayload,
  send: Send,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<DeliveryResult> {
  return deliverWithRetries(payload, send, wait);
}
