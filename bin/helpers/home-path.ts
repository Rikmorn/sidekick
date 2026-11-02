import * as path from 'node:path';

/** `~` or a leading `~/` expanded against `home`; any other path as given. */
export function expandHome(entry: string, home: string): string {
  return entry === '~' || entry.startsWith('~/')
    ? path.join(home, entry.slice(1))
    : entry;
}
