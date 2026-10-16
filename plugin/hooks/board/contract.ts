// What the board's two halves share: the start hook's first line, by which the
// board mod finds sidekick's entry, and the pickup's timeout. This file imports
// nothing: `bin/` imports it under NodeNext, and the module loader allows
// relative files only.

/** The first line of the start hook's context, by which the board mod finds sidekick's entry. */
export const BRIEF_HEADER =
  "sidekick: this repo is tracked. The board's pickup follows; load the sk-orient skill to read it and pick up work.";

/** How long one pickup may take, the start hook's own timeout (`plugin/hooks/hooks.json`). */
export const PICKUP_TIMEOUT_MS = 20_000;
