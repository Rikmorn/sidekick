import { backoffMs } from './backoff.js';

export interface Transport {
  send(message: string): Promise<boolean>;
}

/** Hand a message to the transport once and report whether it landed. */
export async function notify(
  transport: Transport,
  message: string,
): Promise<boolean> {
  return transport.send(message);
}

/**
 * Retry a rejecting transport up to `attempts` times, waiting the backoff
 * delay between tries. Reports whether the message landed at all.
 */
export async function notifyWithRetry(
  transport: Transport,
  message: string,
  attempts = 3,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await notify(transport, message)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
  }
  return false;
}
