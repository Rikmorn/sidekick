export interface DeliveryPayload {
  id: string;
  url: string;
  body: string;
}

export interface DeliveryResult {
  status: number;
  attempts: number;
}

export type Send = (payload: DeliveryPayload) => Promise<number>;

/** One attempt; resolves to the response status. */
export async function deliverOnce(
  payload: DeliveryPayload,
  send: Send,
): Promise<number> {
  return send(payload);
}
