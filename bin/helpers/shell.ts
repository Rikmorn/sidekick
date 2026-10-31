/**
 * Quoting for the commands the CLI prints for the operator to paste into a POSIX shell.
 */

// POSIX single quoting: a quote inside closes the string, adds an escaped quote, and reopens.
/** Wraps `value` in single quotes, so a POSIX shell reads it back as that one word. */
export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

// Characters a POSIX shell never treats specially inside a word.
const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Returns `value` bare when every character is shell-safe, else quoted with
 * `shellQuote`. An empty string is quoted, since bare it would vanish.
 */
export const shellArg = (value: string): string =>
  SAFE_WORD.test(value) ? value : shellQuote(value);
