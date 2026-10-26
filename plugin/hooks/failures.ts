/** A call that rejected gives its reason instead of its value. */
export type Settled<T> = { value: T } | { reason: string };

/** The message of an error, or the string of any other thrown value. */
export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The first line of the text that holds anything, trimmed. */
export function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
}

/** Awaits a call and gives its value, or the reason it rejected. */
export async function settle<T>(call: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await call };
  } catch (error) {
    return { reason: reasonOf(error) };
  }
}
