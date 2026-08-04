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
