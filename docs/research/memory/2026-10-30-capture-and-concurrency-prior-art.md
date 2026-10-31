> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. Gathered 2026-10-30 by a research subagent for the operator and Claude. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Memory prior art: capture, selection, concurrency, lifecycle (2026-10-30)

A survey of external tools for a single-user, markdown-in-a-folder memory store used by many parallel Claude Code sessions. It adds to three sidekick records and does not repeat them: `docs/research/memory/REPORT.md` (taxonomy), `docs/research/context-memory/REPORT.md` (forcing functions), and `docs/research/control-centre/2026-10-12-memory-and-context.md` (auto memory basics, a tools table, hygiene writing). claude-obsidian and basic-memory are out of scope.

## Provenance grades

Each claim carries one grade. All were gathered on 2026-10-30.

| Grade | Meaning |
|---|---|
| **Source** | Read in the project's code, cloned at the commit named in its section |
| **Docs** | Read on the project's own docs page, downloaded as Markdown where possible |
| **README** | The project's README claims it; not checked against code |
| **Issue** | From the project's GitHub issue tracker |
| **Fetch** | A web page read through a summarising fetch; wording may be paraphrased |
| **Search** | Third-party pages seen only through web search; treat as unverified |
| **Inferred** | My reasoning from the cited facts; not tested |

Stars, push dates, and releases come from `gh api` and `gh release list`, run on 2026-10-30.

## The answer first

1. **Every tool that captures reliably writes from a hook, without asking the model.** Model-triggered designs leak. Claude Code's own docs say "Claude doesn't save something every session" (Docs). claude-diary's PreCompact trigger never reaches the model (Source, Docs, Issue).
2. **The robust shape is two-stage.** A cheap, deterministic hook keeps raw material. A later model pass distils it, and a cursor records what it has distilled so a failed pass retries. Letta Code, claude-remember, Continuous-Claude, and claude-diary each hold part of this (Source, Docs).
3. **SessionEnd is not a safe last chance.** It has a 1.5-second budget, no decision control, and documented reasons for graceful exits only. Plugin hooks cannot raise that budget. Two tools recover missed sessions at the next start, and one watches for a stale heartbeat (Docs, Source).
4. **Forced capture moves the loss from "never written" to "not found" and "rotted".** mem0's ADD-only extraction over-extracts (Issue #5730). claude-mem users report token drain (Issues #5023, #4965). A raw transcript snapshot proved too noisy to reload (Fetch). The capture lever only pays with bounded loading and supersession.
5. **Vendors are retiring the memory-bank layout.** Kilo deprecated its memory bank in favour of `AGENTS.md` plus an auto-saving Kilo Memory (Docs). Roo Code's repository was archived on 2026-05-15 (verified via `gh api`). Cline's memory bank remains a prompt with no mechanism (Docs).
6. **Serverless concurrency means one file per writer, merged by git, not locks on shared files.** Letta Code merges a reflection worktree back. Backlog.md reserves IDs by scanning every worktree. beads uses hash IDs (Source, Docs).

## Adoption snapshot (2026-10-30)

| Project | Stars | Latest release | Last push | State |
|---|---|---|---|---|
| [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | 105,861 | v15.7.0, 2026-10-30 | 2026-10-30 | active |
| [cline/cline](https://github.com/cline/cline) | 71,069 | v4.1.26, 2026-10-26 | 2026-10-30 | active; memory bank is a docs page |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 68,109 | v2.2.1 (Python), 2026-09-25 | 2026-10-29 | active |
| [getzep/graphiti](https://github.com/getzep/graphiti) | 32,371 | v0.31.2, 2026-10-20 | 2026-10-28 | active |
| [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | 30,029 | v0.9.31, 2026-10-26 | 2026-10-29 | active |
| [gastownhall/beads](https://github.com/gastownhall/beads) | 28,305 | v1.3.2, 2026-10-24 | 2026-10-30 | active |
| [eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) | 28,277 | 0.43.1, 2026-03-31 | 2026-04-28 | not examined |
| [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode) | 27,802 | v7.8.25, 2026-10-28 | 2026-10-30 | active |
| [letta-ai/letta](https://github.com/letta-ai/letta) | 25,293 | 0.16.8, 2026-05-14 | 2026-10-18 | server |
| [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | 24,253 | v3.54.0, 2026-05-15 | 2026-05-15 | **archived** |
| [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md) | 7,211 | v1.55.3, 2026-10-23 | 2026-10-29 | active |
| [parcadei/Continuous-Claude-v3](https://github.com/parcadei/Continuous-Claude-v3) | 3,947 | none | 2026-01-26 | dormant |
| [letta-ai/letta-code](https://github.com/letta-ai/letta-code) | 3,741 | v0.34.33, 2026-10-30 | 2026-10-30 | active |
| [GreatScottyMac/roo-code-memory-bank](https://github.com/GreatScottyMac/roo-code-memory-bank) | 1,667 | v0.4.0, 2025-02-10 | 2025-05-15 | superseded by ConPort |
| [hmans/beans](https://github.com/hmans/beans) | 958 | v0.4.2, 2026-03-10 | 2026-04-06 | early |
| [wedow/ticket](https://github.com/wedow/ticket) | 920 | v0.3.2, 2026-02-03 | 2026-03-16 | early |
| [GreatScottyMac/context-portal](https://github.com/GreatScottyMac/context-portal) | 765 | v0.3.13, 2025-10-29 | 2026-01-27 | quiet |
| [obra/episodic-memory](https://github.com/obra/episodic-memory) | 494 | v1.6.0, 2026-09-08 | 2026-09-10 | active |
| [rlancemartin/claude-diary](https://github.com/rlancemartin/claude-diary) | 383 | none | 2025-12-17 | dormant |
| [Digital-Process-Tools/claude-remember](https://github.com/Digital-Process-Tools/claude-remember) | 206 | v0.44.1, 2026-10-21 | 2026-10-30 | active; listed in Anthropic's official marketplace |

Stars measure attention, not fit. agentmemory's count is high for its age; I found no evidence either way on why.

## Claude Code mechanism facts that decide capture

Read in the hooks reference, downloaded 2026-10-30 from https://code.claude.com/docs/en/hooks.md (Docs). The memory and settings facts come from https://code.claude.com/docs/en/memory.md and https://code.claude.com/docs/en/settings-reference.md (Docs).

| Event | Does the model see the hook's output? | Can it block? | What the hook receives | Capture use |
|---|---|---|---|---|
| `PreCompact` | No. Stdout goes to the debug log; `systemMessage` and `continue` are discarded | Yes, exit 2 or `decision: "block"` | `transcript_path`, `trigger` (`manual`/`auto`), `custom_instructions` | Parse or copy the transcript deterministically; or block a manual `/compact` until a handoff exists |
| `PostCompact` | No | No | `trigger`, `compact_summary` | Save the summary Claude Code already generated, at no extra model cost |
| `Stop` | Yes, through `decision: "block"` with a reason, or `additionalContext` | Yes; capped at eight consecutive continuations | `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` | Nudge the model to write before the turn ends; supports `prompt` and `agent` hook types |
| `SessionEnd` | No | No | `reason`, `transcript_path` | Flush only. Default budget 1.5 s, raised to 60 s by a per-hook `timeout`, but "Timeouts set on plugin-provided hooks don't raise the budget" |
| `SessionStart` | Yes, stdout or `additionalContext` | No | `source`: `startup`, `resume`, `clear`, `compact` | Load the index; recover sessions that ended without a flush |
| `WorktreeRemove` | No | Exit code decides whether removal counts | `worktree_path` | Fires only for worktrees a `WorktreeCreate` hook made |

Four further facts bear on the loss modes:

- **Transcripts vanish silently.** `cleanupPeriodDays` (default 30) deletes transcripts "without showing a message". Any later batch pass loses its raw material unless something archives it first (Docs).
- **The transcript lags.** It "is written asynchronously and may lag the in-memory conversation"; use `last_assistant_message` at `Stop` (Docs).
- **SessionEnd's reasons are all graceful.** The table lists `clear`, `resume`, `logout`, `prompt_input_exit`, and `other`. claude-remember's docs (checked 2026-08) note the reference "is silent on a crash, a killed terminal, or a session ending by hitting its usage cap" (Docs).
- **An unnamed worktree session can be removed without a prompt.** It happens when Claude Code "finds no changed or untracked files" (Docs). Git-ignored scratch, such as `docs/superpowers/`, is neither, so a worktree holding only ignored notes may be removed silently (**Inferred**, not probed).

## Claude Code memory plugins and tools

### claude-mem (thedotmack)

Cloned at `70aa400` (2026-10-30). The largest Claude Code memory plugin by a wide margin.

1. **Capture: forced by the harness.** `PostToolUse` and `PostToolUseFailure` (matcher `*`, async) enqueue every tool call into an `observation_queue` SQLite table. A worker compresses each through the Claude Agent SDK. `Stop` (async) writes a structured summary each turn: request, investigated, learned, completed, next steps, files read and modified. `SessionEnd` only marks the session complete. Startup instructions also ask the model to call `save_memory` for preferences and decisions (Source: [`plugin/hooks/hooks.json`](https://github.com/thedotmack/claude-mem/blob/70aa400/plugin/hooks/hooks.json); Docs: [`hooks-architecture.mdx`](https://github.com/thedotmack/claude-mem/blob/70aa400/docs/public/hooks-architecture.mdx), [`native-memory-bridge.md`](https://github.com/thedotmack/claude-mem/blob/70aa400/docs/native-memory-bridge.md)).
2. **Selection: recency by project, plus file-keyed injection.** `SessionStart` on startup, clear, and compact (not resume) injects the last 10 summaries and 50 observations as an index. Opt-in extras: ACT-R ranking (`CLAUDE_MEM_REINFORCE_ALPHA`) and per-prompt semantic injection. A `PreToolUse` hook on `Read` injects that file's observation history. It also blocks whole-file reads of unchanged code files of 32 KB or more, on by default. The project key is the git root's folder name. A worktree is stored as `<repo>/<worktree>` and reads its parent's memory. Named environments group folders across repos by glob (Docs: [`configuration.mdx`](https://github.com/thedotmack/claude-mem/blob/70aa400/docs/public/configuration.mdx), [`file-read-gate.mdx`](https://github.com/thedotmack/claude-mem/blob/70aa400/docs/public/file-read-gate.mdx)).
3. **Concurrency: one writer.** Hooks only insert into the queue; one worker drains it sequentially; SQLite runs in WAL mode (Docs: `hooks-architecture.mdx` §Worker Service, §Database Performance).
4. **Lifecycle: nothing retires by default.** Raw tool I/O retention is opt-in (`CLAUDE_MEM_TOOL_USES_RETENTION_DAYS`, default `0` keeps everything). Date-less semantic search ranks only the last 90 days by default (`CLAUDE_MEM_SEARCH_RECENCY_DAYS`). A deleted worktree's memory is folded into the parent at the next worker start (Docs: `configuration.mdx`).
5. **Fit.** Borrow the scratch rescue: the `Stop` hook copies files the turn wrote outside the source tree "before the worktree or scratch folder they live in can be deleted". Borrow folding a worktree's memory into its parent, file-keyed injection at read time, and the summary schema. Skip per-tool-call model compression, the worker daemon, and Chroma. Open issues report cost: [#5023](https://github.com/thedotmack/claude-mem/issues/5023) (~100K-token observer turns per tool call draining quota), [#4965](https://github.com/thedotmack/claude-mem/issues/4965) ("consume 50% of my tokens"), and [#4931](https://github.com/thedotmack/claude-mem/issues/4931) (per-turn injection may cost focus) (Issue).

### claude-remember (Digital-Process-Tools)

Cloned at `c848c6b`. Listed as `remember` in Anthropic's official marketplace, sourced from this third-party repo (Source: [`marketplace.json`](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)).

1. **Capture: forced, with a gap the authors name.** `PostToolUse` saves "when enough tool calls have accumulated", behind cooldown and minimum-human-message gates. `SessionEnd` flushes the rest; since #647 it re-launches itself detached to escape the 1.5 s budget. The summariser is `claude -p` on Haiku with no tools, MCP, or hooks, in an isolated temp directory. The README claims under $0.01 per save. The handoff note is written only by the `/remember` skill, because "there is no model turn running at `SessionEnd`" (README; Docs: [`docs/hooks.md`](https://github.com/Digital-Process-Tools/claude-remember/blob/c848c6b/docs/hooks.md)).
2. **Selection: time tiers.** `SessionStart` injects `now.md`, `today-*.md`, `recent.md` (seven days), and `archive.md`; rotated slices are searchable but not injected. Memory is keyed to the main checkout, so "nothing is lost on `git worktree remove`" (README). An unchanged handoff delivered three times is then listed by path instead of re-injected (`handoff_max_redeliveries`) (Docs: [`docs/configuration.md`](https://github.com/Digital-Process-Tools/claude-remember/blob/c848c6b/docs/configuration.md)).
3. **Concurrency: a lock, and opt-in per-session files.** Saves take `save.lock` with a bounded wait. Per-process records cap concurrent summariser calls. The default `handoff_mode: "single"` shares one `remember.md` across sessions; `per_session` writes `remember.<session_id>.md`, which is "not pruned automatically" (Docs: `docs/hooks.md`, [`docs/data-files.md`](https://github.com/Digital-Process-Tools/claude-remember/blob/c848c6b/docs/data-files.md)).
4. **Lifecycle: compression by age.** Raw exchanges become `now.md`, then hourly and daily summaries, then `recent.md` and `archive.md`. An oversized archive rotates into dated slices (README).
5. **Fit.** Borrow next-session recovery of missed sessions, the detach-and-exit `SessionEnd`, the redelivery cap, and keying to the main checkout. Skip the shared single handoff default. Skip age tiers as the only structure: they organise by date, not by topic, so "not found" grows with time (**Inferred**).

### episodic-memory (obra)

Cloned at `7e06519` (2026-09-10). Ships through the superpowers marketplace.

1. **Capture: forced and total, of raw episodes only.** The only hook is `SessionStart` running `sync --background`. It copies new or changed transcripts from `~/.claude/projects` and other agents' folders into its own archive, then indexes them. The README says it "indexes conversations at the end of each session"; the shipped hook runs at the next start, so the two disagree. I followed the code (Source: [`hooks/hooks.json`](https://github.com/obra/episodic-memory/blob/7e06519/hooks/hooks.json); README).
2. **Selection: search only.** An MCP tool takes a semantic query or two to five concepts ANDed, with an exact `project` filter. Its description tells the model to "Use BEFORE every task" (Source: [`src/mcp-server.ts`](https://github.com/obra/episodic-memory/blob/7e06519/src/mcp-server.ts)).
3. **Concurrency: a file lock.** Sync is "safe to run concurrently" and idempotent; a summariser timeout stops a wedged call from blocking later syncs "on the lock" (README; Source: `src/file-lock.ts` exists).
4. **Lifecycle: none.** The archive is permanent. Its value is outliving Claude Code's 30-day transcript sweep (**Inferred** from the `cleanupPeriodDays` docs). Summaries only decorate results and are never searched (README).
5. **Fit.** Borrow transcript archiving outside the retention sweep: deterministic, no model, and it keeps raw material for later passes. Skip local embeddings and sqlite-vec; at one user's scale, `rg` over Markdown is probably enough (**Inferred**, untested).

### Continuous-Claude-v3 (parcadei)

Cloned at `d07ff4b` (2026-01-26). No commits for nine months.

1. **Capture: forced at three points.** On auto-compaction only, `PreCompact` parses the transcript without a model into a YAML handoff under `thoughts/shared/handoffs/<session>/`. On manual compaction it only reminds. A daemon notices a session whose heartbeat is stale (over five minutes), runs headless Sonnet over its thinking blocks, and stores learnings. A within-session ledger is updated by the model on "save state" (Source: [`.claude/hooks/src/pre-compact-continuity.ts`](https://github.com/parcadei/Continuous-Claude-v3/blob/d07ff4b/.claude/hooks/src/pre-compact-continuity.ts); README §Memory System).
2. **Selection.** `SessionStart` loads the ledger and latest handoff; a `UserPromptSubmit` hook surfaces relevant learnings (README).
3. **Concurrency.** Postgres tables `sessions` and `file_claims` give cross-terminal awareness and file locking (README).
4. **Lifecycle.** The README states none.
5. **Fit.** Borrow stale-heartbeat detection: it covers crashed and killed sessions that never fire `SessionEnd`. Borrow the deterministic `PreCompact` handoff. Skip Postgres, pgvector, and Docker. Its reminders use `systemMessage`, which current Claude Code discards at `PreCompact`, so they are now invisible (**Inferred** from the hooks reference).

### claude-diary (rlancemartin)

Cloned at `af5f652` (2025-12-16). The [blog post](https://rlancemartin.github.io/2025/12/01/claude_diary/) frames it on CoALA and Generative Agents (Fetch).

1. **Capture: meant to be forced, in practice manual.** The `PreCompact` hook is `echo "/diary"`. Claude Code sends `PreCompact` stdout to the debug log, so the model never sees it. [Issue #2](https://github.com/rlancemartin/claude-diary/issues/2) has three users reporting the hook does not trigger; one calls the README "misleading" (Source: [`hooks/pre-compact.sh`](https://github.com/rlancemartin/claude-diary/blob/af5f652/hooks/pre-compact.sh); Docs; Issue). Manual `/diary` writes `~/.claude/memory/diary/YYYY-MM-DD-session-N.md` from the live context.
2. **Selection.** None for diaries. `/reflect` promotes recurring patterns into `~/.claude/CLAUDE.md`: two occurrences make a pattern, three a strong one (README).
3. **Concurrency.** None stated.
4. **Lifecycle.** A `processed.log` lets reflection skip analysed entries; CLAUDE.md edits are reviewed by hand (README; Fetch).
5. **Fit.** Borrow the processed log as a cursor, and promotion by recurrence count. The count echoes sidekick's own admission rule of three or four data points. Skip `PreCompact` stdout as a trigger.

### agentmemory (rohitg00)

README only; not cloned.

1. **Capture: forced.** Twelve Claude Code hooks feed a local server, with a "durable capture inbox, offline spool when unavailable"; `agentmemory capture --drain` replays it (README).
2. **Selection.** Scoped recall and skills such as `/recall` and `/handoff` (README).
3. **Concurrency.** One memory server shared by every agent (README).
4. **Lifecycle.** The README claims "4-tier memory consolidation", Ebbinghaus decay, auto-eviction, and contradiction resolution; superseded versions leave the index while a version chain keeps history (README).
5. **Fit.** Borrow the spool: capture writes locally first and processes later, so a failed processor loses nothing. Skip the server.

## Anthropic's own memory

### Claude Code auto memory

From https://code.claude.com/docs/en/memory.md, downloaded 2026-10-30 (Docs). Only what is newer or more specific than the 2026-10-12 record.

1. **Capture: left to the model.** "Claude doesn't save something every session. It decides what's worth remembering." It skips anything derivable from the code or already in CLAUDE.md. An explicit "remember X" goes to auto memory.
2. **Selection.** Unchanged since the earlier record. One addition: `CLAUDE_CODE_PROJECT_DIR_NAME` beside `CLAUDE_CONFIG_DIR` makes every repo launched with that config share one memory directory (v2.1.234 or later). That is a cross-repo option.
3. **Concurrency.** The docs say nothing. Parallel sessions in worktrees write one folder with ordinary file tools, so the last write to `MEMORY.md` wins (**Inferred**).
4. **Lifecycle.** After a write near the 200-line or 25 KB limit, Claude Code reminds Claude to "keep one line per entry, move detail into topic files, and merge or drop stale entries". Over the limit, the write succeeds with an error asking for a rewrite. In a background session, or one another Claude Code session started, the `/memory` toggle can turn auto memory off but not back on.
5. **Fit.** It is the baseline, and its write-time size feedback is worth copying. It closes none of the four loss modes: no forced capture, no concurrency control, no rescue for scratch.

### Memory tool, context editing, and Dreams (API)

From the [memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md), [context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing.md), and [Dreams](https://platform.claude.com/docs/en/managed-agents/dreams.md) docs, downloaded 2026-10-30 (Docs).

1. **Capture: the harness picks the moment and the model writes.** The API injects a protocol: "ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE" and "ASSUME INTERRUPTION". With context editing, "When your conversation context approaches the configured clearing threshold, Claude receives an automatic warning to preserve important information."
2. **Selection.** The model views the directory at the start, as the protocol tells it to.
3. **Concurrency.** The memory tool leaves storage to your handler and does not address concurrent writes. Managed Agents memory stores add `content_sha256` preconditions (covered in the earlier record).
4. **Lifecycle.** "Periodically delete memory files that haven't been accessed in a long time"; cap file sizes and `view` output. Dreams, in research preview, take a store plus 1 to 100 sessions and write a new store. "The input store is never modified, so you can review the output and discard it." Cost scales with the number and length of sessions.
5. **Fit.** Borrow the threshold-timed nudge, and consolidation that writes a reviewable copy. The docs also recommend a multisession pattern: an initializer session, a read at each start, and a progress update before each end.

## Memory-bank patterns

### Cline Memory Bank

A docs page and a custom-instructions block, not code: https://docs.cline.bot/features/memory-bank.md (Docs).

1. **Capture: the model or the user.** The instructions list four triggers: new patterns, significant changes, the phrase "update memory bank" ("MUST review ALL files"), and unclear context. When the window fills, the docs say to ask for an update, then start a new conversation.
2. **Selection: everything.** "I MUST read ALL memory bank files at the start of EVERY task - this is not optional."
3. **Concurrency.** None.
4. **Lifecycle.** None beyond advice: update "after significant milestones", and let Auto Compact handle routine context.
5. **Fit.** Borrow the split between slow files (`projectbrief.md`, `systemPatterns.md`) and one fast file (`activeContext.md`: focus, recent changes, next steps). Skip read-everything loading; it is the "not found" failure in reverse, since everything is loaded and nothing is ranked.

### Roo Code memory bank and ConPort

Roo Code's repository was archived on 2026-05-15, with v3.54.0 the same day (verified via `gh api`). Third-party pages say the team announced on 2026-04-21 that it was moving to Roomote (Search: [Kilo's comparison page](https://kilo.ai/compare/roo-code-shutdown-roomote)).

1. **Capture: mode prompts.** The community [roo-code-memory-bank](https://github.com/GreatScottyMac/roo-code-memory-bank) README promises "Real-time Updates", but these are per-mode instructions. "UMB" is the manual fallback "when ending a session unexpectedly" (README).
2. **Selection.** The first message in Architect or Code mode scans for `memory-bank/` and reads it. The files add `decisionLog.md` to Cline's set (README).
3. **Concurrency.** None stated.
4. **Lifecycle.** None stated.
5. **Fit.** Borrow a decision log kept apart from progress. The author's successor, [ConPort](https://github.com/GreatScottyMac/context-portal), moved to "SQLite per workspace" with vector search (README). That suggests flat memory banks hit retrieval limits (**Inferred**).

### Kilo Memory, which replaced Kilo's memory bank

From https://kilo.ai/docs/customize/context/memory, read 2026-10-30 (Docs; quotes checked against the page HTML).

1. **Capture: forced.** "When memory is enabled and auto-save is on, Kilo reviews completed turns and saves project facts and session digests automatically. Auto-save is on by default." It is throttled, so "not every turn triggers a save". Secret-like content is filtered. `/memory remember` and `/memory correct` are the explicit routes.
2. **Selection.** "At the start of a session, Kilo injects a compact memory index"; `kilo_memory_recall` fetches detail. Memory is per repository, and "linked git worktrees share the same project memory" (Docs; first quote via Fetch).
3. **Concurrency.** Not documented.
4. **Lifecycle.** "Automatic saves only add or update memory. They never delete it." Three source files: `project.md`, `environment.md`, and `corrections.md` ("Corrections to earlier memory"). `/memory forget`, `/memory purge confirm`, and `/memory rebuild` regenerate or remove. The memory bank under `.kilo/rules/memory-bank/` "is replaced by" `AGENTS.md`.
5. **Fit.** The product closest to this design. Borrow the separate corrections file, auto-save that never deletes, and an index rebuilt from source files.

## Agent-facing task and state stores

### beads

Cloned at `f7b9465` (2026-10-30). The repo moved to `gastownhall/beads`.

1. **Capture: the model, through a CLI.** `bd remember "insight"` stores a durable fact; `--key` updates one in place. `--deps discovered-from:<id>` records found work. The end-of-session `bd dolt push` is an instruction ("ALWAYS run at session end"), not a hook (README; Docs: [`docs/integrations/claude-code.md`](https://github.com/gastownhall/beads/blob/f7b9465/docs/integrations/claude-code.md), [`docs/cli-reference/remember.md`](https://github.com/gastownhall/beads/blob/f7b9465/docs/cli-reference/remember.md)).
2. **Selection: a primer injected by hook.** `SessionStart` runs `bd prime --hook-json`, about 1k to 2k tokens of workflow plus every memory. It fires again after compaction, so "No `PreCompact` hook is needed". `bd ready` lists claimable work. Worktrees share one database "via git common directory discovery" (Docs: `claude-code.md`, [`worktree.md`](https://github.com/gastownhall/beads/blob/f7b9465/docs/cli-reference/worktree.md)).
3. **Concurrency: single writer by default.** Embedded Dolt is "single-writer (enforced via file lock)"; contention shows as "database is locked". Server mode allows many writers. Hash IDs avoid merge collisions (Docs: [`architecture/dolt.md`](https://github.com/gastownhall/beads/blob/f7b9465/docs/architecture/dolt.md)). Parallel worktree sessions in the default mode contend for one lock (**Inferred**).
4. **Lifecycle.** `bd admin compact` tier 1 summarises issues closed 30 or more days (claimed 70% reduction); tier 2 is "planned, not yet implemented". Its analyse and apply modes let the agent write the summary, with no API key. It is "permanent graceful decay - original content is discarded". `bd stale` flags issues untouched for 30 days; `bd forget <key>` removes a memory (Docs: [`admin.md`](https://github.com/gastownhall/beads/blob/f7b9465/docs/cli-reference/admin.md), `stale.md`, `forget.md`).
5. **Fit.** Borrow keyed memories that update in place, the agent-writes, tool-applies compaction, and `discovered-from` links. Skip Dolt. Skip discarding originals; git history keeps them for free (**Inferred**).

### Backlog.md, beans, and ticket

Backlog.md cloned at `3a296c0` (2026-10-29).

1. **Capture: the model, through a CLI or MCP.** `AGENTS.md` points agents at `backlog instructions overview`; the workflow is one task per session (README).
2. **Selection: explicit, and across branches.** Agents work by task ID and search tasks, docs, and decisions. The MCP server "re-resolves when you switch workspace or worktree". `checkActiveBranches`, on by default, checks "task states across active branches", where `activeBranchDays` (default 30) sets how long a branch counts as active (README; Docs: [`ADVANCED-CONFIG.md`](https://github.com/MrLesk/Backlog.md/blob/3a296c0/ADVANCED-CONFIG.md)).
3. **Concurrency: one file per task, IDs reserved across worktrees.** The next ID is computed from task files "in the same folders of every other worktree", so "worktrees share the task ID namespace before their files are committed" (Source: [`src/core/backlog.ts`](https://github.com/MrLesk/Backlog.md/blob/3a296c0/src/core/backlog.ts), around line 1994). A `duplicate-task-repair.ts` module exists, so collisions still happen (**Inferred**).
4. **Lifecycle.** `backlog task archive` moves done or cancelled work off the board; "An archived task keeps its ID" (README).
5. **Fit.** Borrow the sibling-worktree scan: it is the serverless answer to "written in another worktree, not found here". Borrow archiving to a folder instead of deleting.

[beans](https://github.com/hmans/beans) keeps Markdown in `.beans/` and has hooks run `beans prime`. It archives completed beans as "project memory" an agent can query (README). [ticket](https://github.com/wedow/ticket) keeps Markdown with YAML frontmatter in `.tickets/`, in one bash script, with `add-note` appending timestamped notes (README). Neither adds a mechanism beyond Backlog.md.

## Consolidation research and practice

### Letta Code and sleep-time compute

Letta Code cloned at `ce35133` (2026-10-30). Docs: https://docs.letta.com/letta-code/memory (Fetch). Background: [Context Repositories](https://www.letta.com/blog/context-repositories), 2026-02-12 (Search).

1. **Capture: the agent, plus forced background reflection.** The agent edits memory when it learns something durable; `/remember` is explicit. A reflection ("dreaming") subagent reads recent transcripts and updates memory. The default trigger is the compaction event; the alternative fires every 25 steps (Source: [`src/cli/helpers/memory-reminder.ts`](https://github.com/letta-ai/letta-code/blob/ce35133/src/cli/helpers/memory-reminder.ts)). Its priorities run: mistakes and corrections, preferences, new facts, contradictions, then reusable procedures. "If nothing survives, make no changes and do not commit" (Source: [`reflection-v2.md`](https://github.com/letta-ai/letta-code/blob/ce35133/src/agent/subagents/builtin/reflection-v2.md)).
2. **Selection: core files in the prompt, deferred files behind indexes.** Root Markdown files compile into the system prompt. Deferred memory lives in directories, each with its own `MEMORY.md`. "A directory is memory only when it has its own `MEMORY.md`. The agent will not discover a directory without one." Each file's frontmatter `description` shows when the agent lists the directory (Source: [`maintaining-deferred-memory/SKILL.md`](https://github.com/letta-ai/letta-code/blob/ce35133/src/skills/builtin/maintaining-deferred-memory/SKILL.md)).
3. **Concurrency: git worktrees and merge, with retry.** Reflection runs in its own worktree of the memory repo and merges back. On a conflict it aborts the merge, cleans up, and leaves the transcript unconsumed so it can retry. Only `merged` or `no_changes` consume a transcript, and the unreflected range is tracked (Source: [`src/agent/memory-worktree.ts`](https://github.com/letta-ai/letta-code/blob/ce35133/src/agent/memory-worktree.ts), [`src/cli/helpers/reflection-transcript.ts`](https://github.com/letta-ai/letta-code/blob/ce35133/src/cli/helpers/reflection-transcript.ts)).
4. **Lifecycle: revise, don't append, with hard caps.** Core memory is "a revision of that prompt, not an append to a log". A pre-commit hook enforces caps: 65,536 characters of core memory and 20,000 per file by default, plus `readOnlyFiles`. Reasons for a change go in the commit message, not in memory. `/doctor` audits placement, duplication, and token use (Source: [`maintaining-core-memory/SKILL.md`](https://github.com/letta-ai/letta-code/blob/ce35133/src/skills/builtin/maintaining-core-memory/SKILL.md); Fetch).
5. **Fit.** The most to borrow of any tool: the transcript cursor with retry, reflection in a worktree merged by git, caps enforced at commit, the rule that an unindexed directory is invisible, and reasons in commit messages. Skip the Letta server.

The research behind it, [Sleep-time Compute](https://arxiv.org/abs/2504.13171) (Lin et al., 2025-04-17), reports "~5x" less test-time compute for the same accuracy. It reports accuracy gains "up to 13%" on Stateful GSM-Symbolic and "18%" on Stateful AIME, and "2.5x" lower cost per query when amortised. Benefit correlates with how predictable the user's queries are (Fetch, abstract). A single developer's repos are a predictable domain, which favours offline consolidation (**Inferred**).

### mem0 and OpenMemory

1. **Capture.** mem0's Claude Code plugin (v0.3.3) hooks `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop`, but needs a hosted Mem0 Platform API key (Source: [`integrations/claude-code-plugin/hooks/hooks.json`](https://github.com/mem0ai/mem0/blob/main/integrations/claude-code-plugin/hooks/hooks.json), [`plugin.json`](https://github.com/mem0ai/mem0/blob/main/integrations/claude-code-plugin/.claude-plugin/plugin.json)). Out of scope as a store.
2. **Selection.** The plugin offers a `search_scope` of `repo`, `dir`, or `mine` (Source: `plugin.json`).
3. **Concurrency.** Issue [#6243](https://github.com/mem0ai/mem0/issues/6243) reports a TOCTOU race in the entity store (Issue).
4. **Lifecycle: ADD-only since April 2026.** The new algorithm is "ADD only: nothing is overwritten or deleted". When a fact changes, "both facts are preserved with temporal context", and retrieval ranks the current one higher (Docs: [v2 to v3 migration](https://docs.mem0.ai/migration/platform-v2-to-v3.md)). Issue [#5730](https://github.com/mem0ai/mem0/issues/5730) reports the additive prompt "over-extracts", with no way to dial it down when self-hosted (Issue).
5. **Fit.** Borrow append-with-dates and ranking at read time. Skip unbounded ADD-only: #5730 is the hoarding failure the first sidekick report predicts. OpenMemory's folder is gone from the repo (verified: `openmemory/` returns 404). The sunset date is reported only by third parties (Search).

### Graphiti and Zep

1. **Capture.** The client calls `add_episode`; Graphiti is a library, not a harness (README).
2. **Selection.** Hybrid search, partitioned by `group_id` (Docs: [MCP server README](https://github.com/getzep/graphiti/blob/main/mcp_server/README.md)).
3. **Concurrency.** Queue-based episode processing, `SEMAPHORE_LIMIT` default 10 (Docs: MCP server README).
4. **Lifecycle: invalidate, never delete.** Each fact edge carries `valid_at`, `invalid_at` ("when the fact stopped being true"), `expired_at` ("when the node was invalidated"), and `reference_time`. It also lists the `episodes` that produced it (Source: [`graphiti_core/edges.py`](https://github.com/getzep/graphiti/blob/main/graphiti_core/edges.py), lines 265 to 290).
5. **Fit.** Borrow the field set as frontmatter: when a fact became true, when it stopped, when the store learned it was stale, and which sessions it came from. Skip the graph database and per-episode extraction.

## Write-ups on forcing capture from the harness

- **Zenn, "context snapshot" (2026-02-15).** A `PreCompact` Node script keeps the last 200 transcript lines. It keeps user text, assistant text, and tool names, drops thinking and tool results, and caps the result at about 20 KB. `SessionStart` with `source: compact` restores the snapshot and deletes it. The raw JSONL "didn't work at all", because its noise filled the slot (Fetch: [article](https://zenn.dev/ryuka_lucas/articles/1e50ed03029b49?locale=en)).
- **claude-remember's `docs/hooks.md`.** It is the most careful write-up found on `SessionEnd`'s limits: budget, missing crash coverage, and why no handoff is written there (Docs).
- **session-handover and claude-code-context-handoff.** Both add `PreCompact` handoff hooks; session-handover fails open so it never blocks compaction (Search: [PyPI](https://pypi.org/project/session-handover/0.4.0/), [GitHub release](https://github.com/who96/claude-code-context-handoff/releases/tag/v1.0.0)). Not read further.

No Anthropic page found describes forcing capture at session end. The closest is the context-editing warning in "Memory tool, context editing, and Dreams (API)".

## The four loss modes against the evidence

| Loss mode | Mechanisms seen | Where |
|---|---|---|
| Never written | Hook appends raw observations every tool call | claude-mem, agentmemory, claude-remember |
| | Hook copies or parses the transcript, no model | episodic-memory, Continuous-Claude, Zenn |
| | Save PostCompact's `compact_summary` | Claude Code hooks reference (no tool found using it) |
| | Background pass with a cursor, retried on failure | Letta Code, claude-diary's `processed.log` |
| | Recover missed sessions at next start, or by stale heartbeat | claude-remember, Continuous-Claude |
| | Harness-timed nudge, model writes | API context editing; a `Stop` hook could do it |
| Written to scratch, then deleted | Copy deliverables before the worktree can be deleted | claude-mem |
| | Key memory to the main checkout; fold worktree memory into the parent | claude-remember, claude-mem, Kilo, beads |
| | Archive transcripts outside the retention sweep | episodic-memory |
| Written but not found | Small always-loaded index, detail on demand | Claude Code, Letta Code, Kilo |
| | Index per directory; unindexed means invisible | Letta Code |
| | Inject by file at read time | claude-mem |
| | Scan sibling worktrees and active branches | Backlog.md |
| | Group several repos into one project | claude-mem named environments, `CLAUDE_CODE_PROJECT_DIR_NAME` |
| Written but rotted | Supersede with dates; keep history | Graphiti, mem0, Kilo `corrections.md`, beads `supersedes` |
| | Size caps enforced at write or commit | Letta Code pre-commit, Claude Code near-limit reminder |
| | Stop re-injecting an unchanged note | claude-remember redelivery cap |
| | Consolidate into a reviewable copy | Dreams, Letta reflection commits, claude-diary `/reflect` |
| | Flag untouched items | beads `bd stale` |

## What to borrow and what to skip for Markdown with no server

Borrow, in rough order of leverage:

1. **Two-stage capture with a cursor.** Hooks write raw material deterministically; a later model pass distils it. A per-session "distilled up to" mark makes a failed pass retry instead of losing data (Letta Code, claude-diary).
2. **Recovery that does not trust `SessionEnd`.** At each `SessionStart`, find sessions with undistilled raw material and queue them (claude-remember). A stale-heartbeat sweep covers sessions that never restart (Continuous-Claude).
3. **Free raw material.** Save `PostCompact`'s `compact_summary`, and copy transcripts out of the 30-day sweep (hooks reference, episodic-memory).
4. **One file per writer, merged by git.** Per-session capture files, entry IDs reserved by scanning sibling worktrees, and consolidation in a worktree merged back (claude-remember `per_session`, Backlog.md, Letta Code).
5. **Scratch rescue.** Copy what a turn wrote outside the tree before the worktree can go, and key memory to the main checkout (claude-mem, claude-remember).
6. **Supersede, don't rewrite.** Date fields and source sessions in frontmatter, plus a separate corrections file (Graphiti, Kilo).
7. **Indexes as the only discovery path.** One `MEMORY.md` per directory with `description` frontmatter, and caps checked by a pre-commit hook (Letta Code).

Skip:

- Daemons, vector databases, and hosted APIs: claude-mem's worker and Chroma, agentmemory's server, mem0's platform, Continuous-Claude's Postgres.
- A model call per tool call (claude-mem's cost issues).
- `PreCompact` stdout as a trigger; the model never sees it (claude-diary).
- Reading every memory file at every start (Cline).
- `SessionEnd` as the only capture point, especially from a plugin, whose hook timeouts cannot raise the 1.5 s budget.
- Reloading raw transcripts into context (Zenn).

## Assumptions and disconfirming evidence

The recommendations rest on four assumptions. If one is wrong, the borrow list changes.

- **One user, one machine.** Claude Code's auto memory is machine-local (Docs). Cross-machine sync would reopen concurrency.
- **Claude Code hook semantics hold as read on 2026-10-30.** Several tools above broke on version changes, such as Continuous-Claude's `systemMessage`.
- **The store is Markdown in git, and every worktree has git.** Backlog.md's scan and Letta Code's merge both depend on it.
- **"Capture is the main lever" is partly true.** Model-triggered capture does leak, as the Claude Code docs and claude-diary's issue show. Against it: every tool that forces capture reports noise or cost (#5730, #5023, #4965, Zenn). Forcing capture is necessary but moves the load onto selection and rot. A design that forces capture without bounded loading and supersession repeats claude-mem's and mem0's problems.

## Corrections to the 2026-10-12 record

- It lists `remember` among "Anthropic's official marketplace" additions. That is accurate as a listing, but the plugin comes from the third-party `Digital-Process-Tools/claude-remember` (verified in `marketplace.json`).
- It gives claude-mem's staleness as "off by default". Retention is off by default, but date-less semantic search excludes matches older than 90 days by default (Docs: `configuration.mdx`).
- beads' "compacts issues closed 30+ days" holds for tier 1 only; tier 2 is planned, and compaction discards originals (Docs).

## Not covered

Cursor's and Codex's memory features; Task Master's internals; Serena and mcp-memory-service beyond the earlier record; Cline SDK plugin hooks beyond confirming they are generic run, model, and tool hooks. I did not install or run any tool. Every behavioural claim is read, not observed.

## Sources

Repositories and code, cloned 2026-10-30:

- claude-mem `70aa400`: https://github.com/thedotmack/claude-mem — `plugin/hooks/hooks.json`, `docs/public/hooks-architecture.mdx`, `docs/public/configuration.mdx`, `docs/public/file-read-gate.mdx`, `docs/native-memory-bridge.md`
- claude-mem issues: https://github.com/thedotmack/claude-mem/issues/5023, https://github.com/thedotmack/claude-mem/issues/4965, https://github.com/thedotmack/claude-mem/issues/4931
- claude-remember `c848c6b`: https://github.com/Digital-Process-Tools/claude-remember — `README.md`, `docs/hooks.md`, `docs/configuration.md`, `docs/data-files.md`
- Anthropic official marketplace: https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json
- episodic-memory `7e06519`: https://github.com/obra/episodic-memory — `hooks/hooks.json`, `src/mcp-server.ts`, `README.md`
- Continuous-Claude-v3 `d07ff4b`: https://github.com/parcadei/Continuous-Claude-v3 — `.claude/hooks/src/pre-compact-continuity.ts`, `README.md`
- claude-diary `af5f652`: https://github.com/rlancemartin/claude-diary — `hooks/pre-compact.sh`, `README.md`; issue https://github.com/rlancemartin/claude-diary/issues/2
- agentmemory README: https://github.com/rohitg00/agentmemory
- beads `f7b9465`: https://github.com/gastownhall/beads — `README.md`, `docs/integrations/claude-code.md`, `docs/architecture/dolt.md`, `docs/architecture/index.md`, `docs/cli-reference/{admin,compact,remember,forget,stale,worktree}.md`, `docs/CLI_REFERENCE.md`
- Backlog.md `3a296c0`: https://github.com/MrLesk/Backlog.md — `README.md`, `ADVANCED-CONFIG.md`, `src/core/backlog.ts`
- beans README: https://github.com/hmans/beans; ticket README: https://github.com/wedow/ticket
- Letta Code `ce35133`: https://github.com/letta-ai/letta-code — `src/reflection-settings.ts`, `src/cli/helpers/memory-reminder.ts`, `src/cli/helpers/reflection-transcript.ts`, `src/agent/memory-worktree.ts`, `src/agent/subagents/builtin/reflection-v2.md`, `src/skills/builtin/maintaining-core-memory/SKILL.md`, `src/skills/builtin/maintaining-deferred-memory/SKILL.md`
- mem0: https://github.com/mem0ai/mem0 — `README.md`, `.claude-plugin/marketplace.json`, `integrations/claude-code-plugin/hooks/hooks.json`, `integrations/claude-code-plugin/.claude-plugin/plugin.json`; issues https://github.com/mem0ai/mem0/issues/5730, https://github.com/mem0ai/mem0/issues/6243
- Graphiti: https://github.com/getzep/graphiti — `README.md`, `mcp_server/README.md`, `graphiti_core/edges.py`
- Roo Code memory bank README: https://github.com/GreatScottyMac/roo-code-memory-bank; ConPort README: https://github.com/GreatScottyMac/context-portal

Docs, downloaded or read 2026-10-30:

- Claude Code hooks: https://code.claude.com/docs/en/hooks.md
- Claude Code memory: https://code.claude.com/docs/en/memory.md
- Claude Code settings reference: https://code.claude.com/docs/en/settings-reference.md
- Memory tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md
- Context editing: https://platform.claude.com/docs/en/build-with-claude/context-editing.md
- Managed Agents Dreams: https://platform.claude.com/docs/en/managed-agents/dreams.md
- Managed Agents memory: https://platform.claude.com/docs/en/managed-agents/memory.md
- Cline Memory Bank: https://docs.cline.bot/features/memory-bank.md
- Cline hooks pointer and SDK plugins: https://docs.cline.bot/customization/hooks.md, https://docs.cline.bot/sdk/plugins.md
- Kilo Memory: https://kilo.ai/docs/customize/context/memory
- Letta Code memory: https://docs.letta.com/letta-code/memory
- Letta sleep-time page (returned "Dreaming"): https://docs.letta.com/guides/agents/architectures/sleeptime
- mem0 v2 to v3 migration: https://docs.mem0.ai/migration/platform-v2-to-v3.md

Papers and articles:

- Lin et al., Sleep-time Compute, arXiv:2504.13171: https://arxiv.org/abs/2504.13171
- Lance Martin, Claude Diary: https://rlancemartin.github.io/2025/12/01/claude_diary/
- Letta, Context Repositories (via search): https://www.letta.com/blog/context-repositories
- Zenn, context snapshot hooks: https://zenn.dev/ryuka_lucas/articles/1e50ed03029b49?locale=en

Third-party, via search only:

- Roo Code shutdown: https://kilo.ai/compare/roo-code-shutdown-roomote, https://vibecodehq.pages.dev/blog/roo-code-shuts-down-roomote-cloud-agent-may-2026
- OpenMemory deprecation: https://deepwiki.com/mem0ai/mem0/15-openmemory-deprecated
- session-handover: https://pypi.org/project/session-handover/0.4.0/
- claude-code-context-handoff: https://github.com/who96/claude-code-context-handoff/releases/tag/v1.0.0
