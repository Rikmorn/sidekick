# ADR-0013 — sidekick writes the one settings key it owns

**Status:** Accepted (2026-11-01), as the operator decided it on 2026-11-01. Amends ADR-0009's Decision 3. Issue #271, milestone R10.

## Context

R10 moves each repo's auto-memory into one shared store. Claude Code finds a repo's memory folder through the `autoMemoryDirectory` setting. That key can only live in a repo's gitignored `.claude/settings.local.json`, for three reasons:

- A plugin cannot set it. A plugin's settings file takes only `agent` and `subagentStatusLine` ([memory design](../designs/memory/design.md) K8).
- The local route worked in probes on 2026-10-31, for the main checkout and for a plain worktree, which took the main checkout's file. The committed `settings.json` route also worked headless. The local route is used either way: it stays out of git and belongs to the operator ([probes report](../research/memory/2026-10-31-auto-memory-location-probes.md)).
- A user-level value is one folder for every repo, which the memory design rejected for the index cap. The first source that sets the key wins, and a local key overrides a user one (Claude Code 2.1.316 binary, read on 2026-11-01).

So `sidekick memory link` has to write a repo's settings file. ADR-0009's Decision 3 says rules delivery is non-destructive: the installer writes and prunes only `sk-*.md` files. The pre-plugin installer wrote entries into repos' `settings.local.json` and left them broken (#126). #126 closed on the operator's reading that removing entries from a settings file needs an amendment to Decision 3 ([memory design](../designs/memory/design.md) records that reading).

## Options considered

- **A user-level key.** One write, outside any repo. It points every repo at one folder, so it cannot give each repo its own memory.
- **The committed `settings.json`.** It works headless, but it puts the operator's local path in git for colleagues. Rejected: the local file stays out of git.
- **A symlinked `memory/` folder.** Claude Code blocked it in the 2026-10-31 probes.
- **Print the key and have the operator paste it.** It writes nothing, but it leaves a repo unlinked whenever the paste is forgotten, and nothing detects the loss.
- **Write the key, with the narrow ownership rule in §Decision.** Chosen.

## Decision

In the context of moving each repo's auto-memory into one store, facing a settings key that only a repo's gitignored local file can carry, we decided for sidekick writing the one key it can prove it wrote. A marker in each repo's store folder proves it, and one re-runnable `link` writes both. This achieves one command per repo and a detectable lost key. We accept two records of one link that a lint reconciles.

1. **sidekick writes only what it owns, and reads everything else.** Ownership shows as a prefix, a namespace, or a marker. ADR-0009's `sk-*.md` prefix is one case of the same principle.
2. **In a repo's `.claude/settings.local.json`, at the main checkout's root, sidekick owns one key: `autoMemoryDirectory`, and only when a store marker proves sidekick wrote it.** It may change or remove that key. It leaves every other entry's value as it found it. It refuses a key it did not write.
3. **Every write is reported, and `--dry-run` shows it first.**
4. **The principle for sessions that write the shared store** lives in `plugin/rules/sk-memory.md`. This ADR records it for sidekick's code, and that rule records it for sessions.

This narrows #271's first wording, "never removes or rewrites entries", on the operator's word of 2026-11-01. The earlier wording followed #126's reading. Ownership by marker gives the same safety for the one key.

## Consequences

**Positive:** removing the key reverses a link. A key the operator or Claude Code wrote stays untouched. The store's layout needs no guesses about which repos are linked.

**Negative, accepted:**

- A fresh clone starts unlinked, since the file is gitignored. #274 adds the warning.
- Claude Code writes the same file, so sidekick re-reads it before each write, and a change between read and write retries.
- The key and the marker are two records of one link. A lint reconciles them.
- A move between families is done by hand from the store's README. The ADR already permits a move command, and nothing needs one yet.

## Assumptions

- The marker proves authorship. A person who copies a marker into another folder defeats it. The cost is a refused write, not a wrong one, because `link` refuses a key it cannot match to its marker.
- Claude Code keeps reading `autoMemoryDirectory` from the local file with the precedence in §Context. The probes ran on 2.1.316; a later build can change it.
- The operator is sidekick's only user, as ADR-0012 assumes.

## Revisit when

- Claude Code lets a plugin set `autoMemoryDirectory`, which removes the need to write a repo's file.
- A second settings key needs the same treatment. Each key then needs its own ruling, since a key can change what a tool does.
- Claude Code changes where `autoMemoryDirectory` is read from, or how its sources rank.

## Links

ADR-0009 · ADR-0012 · [probes report](../research/memory/2026-10-31-auto-memory-location-probes.md) · [memory design](../designs/memory/design.md) · `plugin/rules/sk-memory.md` · #126 · #271 · #274
