const FENCE = '---';
// The keys Claude Code adds to a memory file's front matter on each write
// (docs/research/memory/2026-11-01-memory-link-probes.md, §Results).
const STAMP_LINE = /^\s*(?:node_type|originSessionId|modified):/;

/** `text` without Claude Code's front-matter stamps, which it adds or rewrites on each write. */
export function withoutStamps(text: string): string {
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== FENCE) return text;
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === FENCE);
  if (end === -1) return text;
  return lines
    .filter((line, i) => i === 0 || i >= end || !STAMP_LINE.test(line))
    .join('\n');
}

/** Whether two texts are equal once the front-matter stamps are set aside. */
export function sameIgnoringStamps(a: string, b: string): boolean {
  return a === b || withoutStamps(a) === withoutStamps(b);
}
