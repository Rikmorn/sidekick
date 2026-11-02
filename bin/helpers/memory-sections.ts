/**
 * The two `## ` sections the memory-start hook prints, and the heading
 * helpers shared by the hook and the store lint.
 */

import { readMemoryFile } from './memory-files.js';

export const STATE_HEADING = '## State';
export const NEXT_HEADING = '## Next steps';

/** Whether a line is the heading, ignoring case and trailing whitespace. */
export function isHeading(line: string, heading: string): boolean {
  return line.trimEnd().toLowerCase() === heading.toLowerCase();
}

/** The heading as the file spells it, so `readSection` finds a differently capitalised one. */
export function headingAs(file: string, heading: string): string {
  const body = readMemoryFile(file)?.body ?? '';
  return body.split('\n').find((line) => isHeading(line, heading)) ?? heading;
}

/** `## ` headings outside fenced code, other than the two sections the hook prints. */
export function otherHeadings(file: string): string[] {
  const body = readMemoryFile(file)?.body ?? '';
  const fence = { open: false };
  return body.split('\n').filter((line) => {
    if (line.trimStart().startsWith('```')) fence.open = !fence.open;
    const heading = line.trimEnd();
    return (
      !fence.open &&
      line.startsWith('## ') &&
      !isHeading(heading, STATE_HEADING) &&
      !isHeading(heading, NEXT_HEADING)
    );
  });
}
