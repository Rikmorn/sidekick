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
