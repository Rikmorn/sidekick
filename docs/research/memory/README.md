# memory

What is memory for an AI assistant, and how should it be represented, related, consolidated, retrieved, and inspected?

## Reports

- [REPORT.md](./REPORT.md): a base for a later decision that recommends no tool, scoring approaches against the user pains it lists.
- [sources.md](./sources.md): the primary sources behind the findings that survived verification.
- [2026-10-30-claude-code-mechanisms.md](./2026-10-30-claude-code-mechanisms.md): what Claude Code 2.1.314 offers a store outside any repo: `autoMemoryDirectory`, the session hooks, imports, write checks, and transcripts.
- [2026-10-30-capture-and-concurrency-prior-art.md](./2026-10-30-capture-and-concurrency-prior-art.md): how external memory tools capture, select, share writes, and retire entries, and what fits a Markdown store.
- [2026-10-30-trial-method.md](./2026-10-30-trial-method.md): the sandboxed trial of three memory tools on the operator's cases: its scenarios, brief, fixture, and the settings incident it caused.
- [2026-10-30-trial-basic-memory.md](./2026-10-30-trial-basic-memory.md), [2026-10-30-trial-claude-obsidian.md](./2026-10-30-trial-claude-obsidian.md), and [2026-10-30-trial-episodic-memory.md](./2026-10-30-trial-episodic-memory.md): each tool's results, per scenario.
- [2026-10-31-auto-memory-location-probes.md](./2026-10-31-auto-memory-location-probes.md): which routes keep a repo's auto-memory in an outside folder for the main checkout and its worktrees.
- [2026-11-01-memory-link-probes.md](./2026-11-01-memory-link-probes.md): what Claude Code 2.1.316 does with a repo `sidekick memory link` has linked, in interactive sessions: worktrees, trust, permission saves, running sessions, and profiles. It also holds the paired replay of `sk-memory.md` on five of the trial's scenarios.

## Served

The research programme that ADR-0009 parked. The 2026-10-30 and 2026-10-31 reports serve #269 and the issues its design became: #270 to #281. The 2026-11-01 report serves #271 and #272.
