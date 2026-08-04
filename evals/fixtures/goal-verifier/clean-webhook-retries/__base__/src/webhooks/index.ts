import {
  deliverOnce,
  type DeliveryPayload,
  type DeliveryResult,
  type Send,
} from './deliver.js';

export async function dispatchWebhook(
  payload: DeliveryPayload,
  send: Send,
): Promise<DeliveryResult> {
  const status = await deliverOnce(payload, send);
  return { status, attempts: 1 };
}
