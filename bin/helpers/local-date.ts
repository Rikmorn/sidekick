const pad = (n: number): string => String(n).padStart(2, '0');

const dateOf = (at: Date): string =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

/** The local date as YYYY-MM-DD. */
export function localToday(): string {
  return dateOf(new Date());
}

/** `at` in local time as YYYY-MM-DD HH:MM. */
export function localMinute(at: Date): string {
  return `${dateOf(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
