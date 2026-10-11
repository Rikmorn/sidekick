> Research for the `control-centre` design, not yet planned by PM. Conducted 2026-10-12 by the operator and Claude, on Claude Code 2.1.296. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Memory and context persistence (2026-10-12)

What "fresh context per unit of work, with files as memory" looks like in practice, and how the operator's Claude Code memory behaves today. It also covers the tools and writing on memory hygiene and scoping. It maps the problem and recommends nothing.

Provenance grades are the companion report's. **Measured** means on the operator's machine, and **docs** means read in the official docs. **Survey** means from two research subagents that fetched each page on 2026-10-11 and 2026-10-12. Survey claims about third-party tools are the tools' own descriptions; none was installed.

## Claude Code's auto memory

Docs, read 2026-10-12: [memory](https://code.claude.com/docs/en/memory).

- One memory folder per git repo, at `~/.claude/projects/<project>/memory/`, "shared across worktrees", and local to the machine.
- The first 200 lines or 25KB of `MEMORY.md` load at every session start; topic files load when read. Over the limit, a write succeeds and Claude Code tells Claude to rewrite the index.
- Notes carry a `type` of `user`, `feedback`, `project`, or `reference`, and files with frontmatter get a `modified` timestamp from v2.1.214.
- `autoMemoryDirectory` moves the folder and is honoured from any settings scope, `--settings` included. `autoMemoryEnabled: false` or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` turns it off.
- A subagent's `memory` field gives it a separate store, and the main conversation's memory is not loaded into subagents.
- The memory folder is exempt from the transcript retention sweep, so nothing in it expires.
- Facts that apply to every repo belong in the user instruction layer: "Personal rules in `~/.claude/rules/` apply to every project on your machine."

## The operator's memory, measured

Measured 2026-10-12 by reading `~/.claude/projects/*/memory/` with `wc` and `grep`.

| Repo | Files | All files, characters | Index, characters | Index lines |
|---|---|---|---|---|
| furnace | 59 | 468,038 | 9,882 | 67 |
| odin | 54 | 408,027 | 14,356 | 71 |
| sidekick | 29 | 291,681 | 12,087 | 32 |
| thor-v2 | 27 | 194,522 | 4,749 | 26 |
| aesir | 17 | 100,095 | 6,154 | 46 |
| al-business | 23 | 56,234 | 3,819 | 38 |

- No index is over the 200-line or 25KB load limit, so none is cut at load. Each costs roughly 1k to 3.5k tokens a session, at four characters a token.
- sidekick's index has 10 lines marked historical, superseded, or stale, and its longest line runs to 2,905 characters.
- Notes typed `user` number five, one in each of five repos. Notes typed `feedback` number 108, across eight repos. Each loads only in its own repo. How many apply beyond their repo was not checked.

## Anthropic's guidance

Survey; the quotes are the subagent's, not re-read by Claude:

- [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29: context is a finite "attention budget". Retrieve when needed from lightweight identifiers, and keep structured notes outside the window, such as a `NOTES.md`.
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 2025-11-26: an initializer writes a JSON feature list, all failing, plus `claude-progress.txt`, `init.sh`, and a first commit. Each later session reads the git log and progress file, does one feature, commits, and updates progress. JSON because the model "is less likely to inappropriately change or overwrite JSON files compared to Markdown files".
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices): consider a fresh context window over compaction, since models are "extremely effective at discovering state from the local filesystem".
- [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool): a `/memories` directory with a standing "ASSUME INTERRUPTION" prompt, and advice to delete files not accessed in a long time.
- [Managed Agents memory stores](https://platform.claude.com/docs/en/managed-agents/memory): up to eight stores per session, each read-only or read-write, every write versioned, and a `content_sha256` precondition against lost updates. The advice: "Use focused stores … one per user, one for shared domain knowledge, and one for project-specific context." [Dreams](https://platform.claude.com/docs/en/managed-agents/dreams) write a cleaned copy of a store for review.
- Claude Fable 5 prompting guidance: "update an existing note rather than creating a duplicate; delete notes that turn out to be wrong."

## Ralph's file layout

Survey of [Huntley's post](https://ghuntley.com/ralph/) and [Farr's playbook](https://github.com/ghuntley/how-to-ralph-wiggum):

- Huntley: `specs/` for what to build, and `fix_plan.md` as the prioritised to-do list, "I throw it out often". `AGENT.md` says how to build and run, kept brief, with "DO NOT PLACE STATUS REPORT UPDATES INTO @AGENT.md". One item per loop.
- Farr: `PROMPT_plan.md` and `PROMPT_build.md`, `IMPLEMENTATION_PLAN.md` as "disposable", and an operational `AGENTS.md` of about 60 lines: "A bloated AGENTS.md pollutes every future loop's context."

## Tools

Survey, 2026-10-11 and 2026-10-12. Corrections the survey found: beads moved to `gastownhall/beads`; mem0 shut down OpenMemory in April 2026 and dropped its update-and-delete step.

| Tool | Storage | Scope | Staleness | Parallel writes |
|---|---|---|---|---|
| [claude-mem](https://github.com/thedotmack/claude-mem) | SQLite and local Chroma | git root | off by default | one daemon |
| [agentmemory](https://github.com/rohitg00/agentmemory) | key-value with search | repo; agent, team, user IDs | hourly expiry and supersession | one local server |
| [beads](https://github.com/gastownhall/beads) | Dolt plus JSONL | repo | compacts issues closed 30+ days | single writer, or a server |
| [graphiti](https://github.com/getzep/graphiti) | graph with time ranges | group | contradicted facts marked invalid, kept | per-group queue |
| [basic-memory](https://github.com/basicmachines-co/basic-memory) | Markdown plus SQLite | named projects | archive, never delete | checksum-checked writes |
| [Letta Code](https://github.com/letta-ai/letta-code) | Markdown in git | per agent | consolidating subagents | worktrees, then merge |
| [Serena](https://github.com/oraios/serena) | Markdown files | project and global | manual | not stated |
| [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) | SQLite with vectors | tags | decay; archive after 90 days unused | one shared server |
| [segmem](https://github.com/mahuebel/segmem) | SQLite | kind × global or project | supersedes; staleness nag; global after three projects | not stated |
| [VoltAgent memory-curator](https://github.com/VoltAgent/awesome-claude-code-subagents) | Markdown, one fact per file | project | a status line: active, or closed and superseded by a slug | not stated |
| session-handoff (community marketplace) | per-session handoff files | session | a PreCompact hook blocks until a fresh handoff exists | per-session files |
| Notion Memory | About page and a database | per user | the agent's judgement | not described |

Anthropic's official marketplace adds `claude-md-management`, which audits `CLAUDE.md`, and `remember`, tiered session logs that overwrite each other under parallel runs unless `handoff_mode: per_session` is set.

## Writing on hygiene

Survey:

- [Chroma, context rot](https://www.trychroma.com/research/context-rot): performance falls as input grows, even with one distractor. Information in the middle of a long context is used worst ([Liu et al.](https://arxiv.org/abs/2307.03172)).
- [Breunig](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html) names four failures: poisoning, distraction, confusion, and clash.
- [ACE](https://arxiv.org/abs/2510.04618) names "context collapse", where iterative rewriting erodes detail, and prefers small incremental updates.
- [MemoryAgentBench](https://arxiv.org/abs/2507.05257) finds current methods "fall short", selective forgetting included.
- [arXiv 2609.13889](https://arxiv.org/abs/2609.13889) reports 81.7% cross-session attack success against Claude Code once memory is poisoned.
- [Willison](https://simonwillison.net/2025/May/21/chatgpt-new-memory/) objects to unscoped recall; the Claude app keeps a memory per project.
- Counterarguments: [Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory) measured a files-only agent at 74.0% on LoCoMo against Mem0's reported 68.5%. [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) keeps context append-only. [Cognition](https://cognition.com/blog/dont-build-multi-agents) argues isolated contexts lose implicit decisions.

## Patterns that recur

- A small always-loaded index or operating guide, with detail fetched on demand.
- How-to kept apart from status.
- Disposable work state, durable lessons.
- Structured files for status, prose for lessons, git for history.
- Cleanup as a separate reviewable pass, or curation at write time.
- A superseded fact is invalidated, deleted, ranked down, or archived; no one approach dominates.
- Almost every tool keys memory on the git repo; Anthropic's own products add several focused stores per session.
- Concurrency comes from a daemon, a lock, or a precondition; plain Markdown has none.
