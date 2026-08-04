export type AttributeValue = string | number | boolean;

export interface EventEnvelope {
  name: string;
  at: number;
  attributes: Record<string, AttributeValue>;
}

export function createEnvelope(
  name: string,
  attributes: Record<string, AttributeValue>,
): EventEnvelope {
  return { name, at: Date.now(), attributes };
}

export interface EventSink {
  write(envelope: EventEnvelope): void;
}

/** Record a domain event on the configured sink. */
export function recordEvent(
  sink: EventSink,
  name: string,
  attributes: any,
): void {
  sink.write(createEnvelope(name, attributes));
}
