/**
 * What the loop verb modules share: the line printers, a refusal's exit code
 * and the printer that returns it, and a thrown value's message.
 */

/** Prints one line. */
export type Out = (line: string) => void;

/** A verb's two printers. */
export type Io = { out: Out; err: Out };

/** The exit code of a refusal. */
export const REFUSED = 1;

/** Prints each issue to `err`, and returns `REFUSED`. */
export const refuse = (err: Out, issues: string[]): number => {
  for (const issue of issues) err(issue);
  return REFUSED;
};

/** An error's message, or the thrown value as text. */
export const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
