> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. A sandboxed trial run on 2026-10-30 by a subagent, on Claude Code 2.1.314. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists. Paths under `<S>` name a session-local sandbox that was not kept; [the trial method](./2026-10-30-trial-method.md) rebuilds its fixture.

# claude-obsidian: memory spike results

Trial run on 2026-10-30, against design `docs/designs/memory/design.md` (#269). `<C>` below is `<S>/claude-obsidian/`. Every claim here was checked in this trial unless it is marked *believed*. The evidence for each run is in `<C>/runs/<id>.report`, `<id>.json` and the before/after store snapshots.

## Verdict first

- **Out of the box, the tool was almost never used.** With `CLAUDE_OBSIDIAN_VAULT` set, all 8 "save" prompts from the repos went to Claude Code's auto-memory. The plugin's `save` skill fired only when the prompt named it. Every out-of-box row passed, but auto-memory and file browsing did the work.
- **Directed, it works from any checkout.** `/claude-obsidian:save` wrote the vault from `alpha`, the worktree and `beta`. Sessions in all three read it back, either through the opt-in hot cache or from the vault folder.
- **It is expensive and slow per save.** A tool save averaged $1.24 and 205 s, against $0.50 and 64 s for an auto-memory save. Two of seven saves ran out of the 20-turn cap. The ingest took 3 sessions and $3.29.
- **Its concurrency guard is real.** Two saves to the same note at the same moment produced an exit 75 conflict. The loser re-read, rebuilt, and kept both facts.
- **It never captures unasked**, by design. S4's decision reached auto-memory only, so the vault went stale and gave the wrong answer.

## Setup

| Item | Value |
|---|---|
| Tool | claude-obsidian, `github.com/AgriciDaniel/claude-obsidian`, commit `2e545563172f97f02ecaaaab376ceea1246a0583` (`v3.0.1-9-g2e54556`, 2026-10-22), cloned to `<C>/vendor/claude-obsidian` |
| Host | Claude Code 2.1.314, Python 3.11.5 (`/opt/homebrew/anaconda3/bin/python3`), default model (Opus 5.5) |
| Load | `--plugin-dir <C>/vendor/claude-obsidian` only. No install, marketplace, or MCP. |
| Vault | `<C>/store/vault/`, created by the core's own two-step `init` (plan, then `--approved-plan-sha256 … --apply`) from my shell. This is a **manual step**: the README routes it through `/claude-obsidian:wiki`, which runs the same command. |
| Vault selection from repos | `CLAUDE_OBSIDIAN_VAULT=<C>/store/vault` in each child's environment. Vault-folder runs set nothing and relied on cwd discovery. |
| Auto-memory | `--settings '{"autoMemoryDirectory":"<C>/store/auto-memory/<repo>"}'`: `alpha` for both alpha checkouts, `beta` for beta. Tool-only reads used an empty `isolated-N` folder each. |
| Child flags | `claude -p`, `--permission-mode acceptEdits`, `--allowedTools` of `Read,Write,Edit,Glob,Grep,Skill` plus `Bash(python3|shasum|sha256sum|ls|cat|mkdir|date|find|grep|head|wc|echo|printenv|test|jq:*)`, plus `Agent` for S6w only. Also `--add-dir <C>/store --add-dir <C>/tmp`, `--max-turns 20`, `--output-format json`. Tool-only reads passed `--add-dir <C>/store/vault` instead of the whole store. |

### Every path the tool writes, and where it went

I read `hooks/hooks.json`, `claude_obsidian/hook_adapter.py`, `claude_obsidian/paths.py`, the entry script, and grepped the core for home, temp, cache and network use.

| Path | What | Redirected to |
|---|---|---|
| Selected vault | Pages, inbox, `.raw/`, `.obsidian/`, `.claude-obsidian.json` | `<C>/store/vault` |
| `<vault>/.vault-meta/` | Transaction journals and bundles, mutation lock, capture queue, BM25 and chunk caches, address counter | Inside the vault |
| System temp (`tempfile`) | Transaction inspection and checkpoint scratch | `TMPDIR=<C>/tmp` |
| Python bytecode | The entry script sets `sys.dont_write_bytecode`; I also set `PYTHONDONTWRITEBYTECODE=1` | See §Safety: one child bypassed both |
| Plugin root | Never a vault: `assert_not_plugin_tree` refuses it | n/a |

The hooks write nothing. `SessionStart` is silent unless `CLAUDE_OBSIDIAN_SESSION_CONTEXT=1`; with it, it prints `wiki/hot.md` in an untrusted-data envelope. `Stop` only reports stuck transactions. No path needed redirecting beyond these.

### Network

The core makes no network calls in any flow this trial ran. Two optional retrieval scripts can: `scripts/contextual-prefix.py` posts to `api.anthropic.com` only with `--allow-egress` and `ANTHROPIC_API_KEY`, and the rerankers call a local Ollama at `127.0.0.1:11434`. No run invoked either.

## What loads at session start

| Source | Size | Notes |
|---|---|---|
| claude-obsidian skill listing | 5,730 chars (15 skills) | Of a 29,869-char listing that includes the operator's other plugins |
| claude-obsidian agent listing | about 1,030 chars (3 agents) | |
| claude-obsidian SessionStart hook | 0 by default | 3,649 chars with `CLAUDE_OBSIDIAN_SESSION_CONTEXT=1` (`hot.md`, 484 words at the end) |
| Auto-memory `MEMORY.md` | grew from 0 to 7 index lines in alpha | Loaded by Claude Code, not the tool |
| The operator's user rules and plugins | about 29 KB of instructions, plus superpowers and Postman hooks | Present in every child, same as the operator's real sessions |

## Scenario results

**Out of box** is the scenario as written: `CLAUDE_OBSIDIAN_VAULT` set, session context off, and auto-memory pointed into the store. **Tool-only** is my variant, which isolates the base. Writes name `/claude-obsidian:save`. Reads run with `CLAUDE_OBSIDIAN_SESSION_CONTEXT=1` from a repo, or from the vault folder, with auto-memory emptied.

| Id | Out of box: outcome and where | Tool-only: outcome | Tool verdict |
|---|---|---|---|
| S1w | Saved 3 notes and `MEMORY.md` to auto-memory, 14 turns. The plugin was not invoked. | Hit the 20-turn cap at `workflow inspect` after reading the tool's own references. A "Continue." resume applied `wiki/sessions/Alpha webhook retry design 2026-10-30.md`. 2 sessions, $1.36. | **Partial**: saved, but not inside one capped session |
| S1r | Pass from auto-memory: "3 times with exponential backoff starting at 30 seconds, then … dead-letter", 410 open, "next step is the dead-letter handler". | S1r-t, from the worktree with context: pass from the vault note. S1r-n, with no context: pass, by globbing the `--add-dir` vault. S1r-v, from the vault folder: pass. | **Pass** |
| S2w | Saved to auto-memory only. | One session saved `wiki/sessions/Duplicate refunds from a retried refund call 2026-10-30.md` from the worktree; 28 tool calls, a model-written `build_bundle.py`, $1.10. | **Pass** |
| S2r | Pass: "a refund call timed out and was retried, but the first call had actually succeeded … sends no idempotency key". It drew on auto-memory and on the vault note, which it found with a Grep over `<C>`. | Not rerun tool-only. | **Partial**: found by Grep, not by the tool |
| S3a, S3b | Both went to auto-memory at the same moment. S3b saw S3a's edit and re-read; both facts and S1 survived. | Both stopped before apply to ask approval for replacing an existing note. Both were resumed at once with "Yes, apply it." S3b applied first. S3a got `exit 75 EXPECTED_HASH_MISMATCH`, re-read, rebuilt, and applied with a new hash without re-asking. The merged note holds the 10-minute cap, the event id, and all of S1. | **Partial**: G7 holds, but only after a manual approval |
| S4w | Auto-memory updated 3 files unasked: 410 is now "a decision". The tool captured nothing. | No tool variant: the `save` skill says "Never run automatically". | **Fail** for C2: the vault is silent |
| S4r | Pass from auto-memory: "You decided that 410 responses skip retries". | S4r-t: **wrong answer** from the vault, "Not decided yet", quoting "Undecided as of 2026-10-30". | **Fail**: stale |
| S5w | Saved to `auto-memory/beta/`. | One session created `wiki/entities/beta.md` from beta, 34 turns, $1.12. | **Pass** |
| S5r | Pass: "cursor pagination: up to 100 items per page … `next`". It globbed the `--add-dir` store and read both `auto-memory/beta/` and `wiki/entities/beta.md`. | S5r-t: pass from the vault; its first call was `Glob **/*beta*`, and the injected hot cache names `entities/beta`. S5r-v: pass. | **Pass** |
| S6w | Not applicable; see the tool-only column. | `/claude-obsidian:wiki-ingest` from the vault folder. Session 1 hit the cap after 42 tool calls, most of them reading `ledgers.py` and `transaction.py`. Session 2 ("Continue.") drafted it, rehearsed it on a copy of the vault in `tmp/`, and stopped for approval. Session 3 ("Yes, apply it.") applied a `capture` and then an `ingest`: 2 raw captures, 2 entity pages, 2 source records, 8 provisional claims. 3 sessions, $3.29, 564 s. | **Partial**: in the store, after 2 continues and 1 approval |
| S6r | Pass: "5 requests per second per API key … retried 3 times, at 1, 5, and 25 minutes". Found with a Grep over `<C>`. | S6r-t: pass from `wiki/entities/ParcelCo.md`, checked against the captured PDF. | **Pass** |
| S7w | Saved to auto-memory. | One session created `wiki/entities/alpha bulk-close script.md`, $1.08. | **Pass** |
| S7r | Pass from auto-memory: dry run with `--merchant <slug>`, then `--live`; "run it from the main checkout". | S7r-v, from the vault folder: pass from the vault note. | **Pass** |
| S8w | Saved to auto-memory. | Hit the cap at `inspect`; a "Continue." resume applied `wiki/concepts/alpha release procedure.md`. 2 sessions, $1.47. | **Partial**: as for S1w |
| S8r | Pass from auto-memory: the four steps in order. | S8r-t: pass from the vault note. | **Pass** |

**Counts.** Out of box, all 15 rows met the "passes when" column, with S4w counted as observed. Auto-memory carried 12 of them; S2r also found the vault note by Grep. Browsing the store found vault pages for S5r and S6r, and the tool itself did only S6w. Tool-only gives 8 pass (S1r, S2w, S5w, S5r, S6r, S7w, S7r, S8r), 5 partial (S1w, S2r, S3, S6w, S8w) and 2 fail (S4w, S4r).

**A layout caveat.** The fixture puts `store/` beside `family/`, under one folder the children could Grep. S2r and S6r found the vault that way, and S5r and S1r-n by globbing the `--add-dir` path. A real vault elsewhere on disk would not turn up this way unless a session is pointed at it.

## The approval step, and what it costs

The README says changes are "shown as a plan before … applied". The mechanism is a hash, not a person. `inspect` returns `approval_sha256`, and `apply` refuses any other hash. A model with Bash rights reads the hash and passes it on.

- **Creates went through unattended.** S2w-f, S5w-f, S7w-f, and S1w/S8w after a neutral "Continue." each applied their own plan in `-p`, with no human.
- **Replacing or ingesting stopped the session.** The `save` skill requires approval before replacing a canonical note, and `wiki-ingest` requires review before apply. S3a-f, S3b-f and S6w-2 each ended with "Shall I apply it?". In `-p` nobody answers, so nothing is written. The operator has to resume each session, which costs a context switch and one more session.
- **The rebuilt plan was self-approved.** After its conflict, S3a-f2 applied a plan with a different hash from the one approved, and said so: "I didn't ask again because the change itself was identical."
- **Parallel cost.** Whether a save stops depends on the model's choice, create or replace, which the operator cannot predict. Saves that hit the same note conflict and rebuild. In S3, the rebuild cost $0.53 and 123 s.

## Store tree

At the end of the trial, with transaction folders summarised:

```
store/
├── auto-memory/
│   ├── alpha/  MEMORY.md, bulk-close-stale-returns.md, refund-duplicate-no-idempotency-key.md,
│   │           release-procedure.md, webhook-410-skip-retries.md, webhook-dead-letter-handler-next.md,
│   │           webhook-event-id-dedup.md, webhook-retry-policy.md
│   ├── beta/   MEMORY.md, beta-api-pagination.md
│   └── isolated-1 … isolated-9/   (empty; tool-only reads)
└── vault/
    ├── .claude-obsidian.json, .gitignore
    ├── .obsidian/  app.json, appearance.json, graph.json, snippets/vault-colors.css
    ├── .raw/  .manifest.json, captured/1069b590….pdf, captured/b90d0f0f….md
    ├── .vault-meta/  address-counter.txt, transactions/ (10 operations: init, 7 saves, capture, ingest)
    ├── inbox/  .gitkeep, parcelco-api-v3.pdf, returns-portal-notes.md   (originals left for the user to clear)
    └── wiki/
        ├── hot.md, index.md, log.md, overview.md
        ├── concepts/alpha release procedure.md
        ├── entities/ParcelCo.md, Returns portal.md, beta.md, alpha bulk-close script.md
        ├── sessions/Alpha webhook retry design 2026-10-30.md, Duplicate refunds from a retried refund call 2026-10-30.md
        └── meta/ledgers/claim-ledger.json, source-ledger.json
```

The sessions also left 624 KB of scratch in `<C>/tmp`: drafts, model-written `build.py` scripts, bundles, and a full copy of the vault from S6w's rehearsal. The tool never cleans these up.

### One note in full

`wiki/sessions/Alpha webhook retry design 2026-10-30.md`, after S1 and both S3 writes merged:

```markdown
---
type: session
title: "Alpha webhook retry design 2026-10-30"
created: 2026-10-30
updated: 2026-10-30
status: active
tags:
  - session
  - alpha
  - webhooks
---

# Alpha webhook retry design 2026-10-30

On 2026-10-30 the user set alpha's webhook retry policy, left one question
open, and named the next piece of work. Later that day the user added a
finding about duplicate webhooks and a cap on the backoff. Each section
restates what the user said.

## Decision

Retry a failed webhook 3 times with exponential backoff, starting at 30
seconds. The backoff caps at 10 minutes. When the retries run out, send the
webhook to dead-letter.

The decision does not state the backoff multiplier or jitter.

## Finding: vendor event id

The vendor sends an event id on every webhook. Use it to discard duplicate
webhooks.

The finding does not record which field carries the id, or whether the vendor
reuses an event's id when it redelivers that event.

## Open question

Should a `410` response skip the retries and go straight to dead-letter?
Undecided as of 2026-10-30.

## Next step

Write the dead-letter handler.

## Provenance

The user's statements in conversations of 2026-10-30 are the only basis for
this page. The retry policy and its backoff cap are decisions. The event-id
finding is a claim about the vendor that nobody had checked against vendor
documentation or a sample payload as of 2026-10-30. The page adds no source or
claim records.
```

The "Undecided" line under **Open question** is the stale fact behind S4r-t's wrong answer.

### As an Obsidian vault

- **Front matter** is on every page: `type`, `title`, `status`, `created`, `updated`, and `tags`. Ingested entities add `address` (`c-000001`) and `claim_ids`.
- **Links** are path-qualified wikilinks such as `[[entities/ParcelCo|ParcelCo]]`. The tool's own lint found 0 issues: 11 pages, 42 links, no dead links and no orphans.
- **Index**: `wiki/index.md` is a catalog with Sources, Concepts, Entities, Questions and Sessions. Each entry carries a one-line summary.
- **Navigation**: `wiki/log.md` lists operations newest first, and `wiki/hot.md` is a 500-word cap of recent facts and open threads. It reached 484 words after 8 knowledge operations (7 saves and 1 ingest), so each save now spends effort trimming it.
- **Hidden from Obsidian**: `.obsidian/app.json` filters out `.raw/` and `.vault-meta/`, and the graph view filters to `path:wiki`. Raw captures are named by SHA-256, not by title.
- **The PDF**: the core extracts no text, but the model read the PDF with Claude Code's Read tool and quoted it. Provenance records it as "authority unknown" because the PDF metadata shows a local macOS render.

## Cost and time

Totals for all 38 child sessions, the cap being 40: **$23.92** and **3,374 s** of summed wall time. Some runs were parallel. Costs are the per-run increment; a resumed session reports a cumulative `total_cost_usd`, which `bin/metrics.py` subtracts.

| Kind | Runs | Mean cost | Mean wall time |
|---|---|---|---|
| Auto-memory save (out of box) | 8 | $0.50 | 64 s |
| claude-obsidian save, including resumes | 7 | $1.24 | 205 s |
| claude-obsidian ingest (S6w, 3 sessions) | 1 | $3.29 | 564 s |
| Read, out of box | 7 | $0.43 | |
| Read, tool-only | 9 | $0.55 | |

A tool save spends its turns relearning the bundle format each time. It reads `operation-transactions.md`, `workflow-acceptance.md`, `provenance.md`, `page_schema.py` and `WIKI.md`, then hashes four files and often writes a Python builder.

## What the base did alone, and the gap per case

| Case | What claude-obsidian did alone | Gap a wrapper would fill |
|---|---|---|
| C1, G1: context in any checkout | Out of the box, nothing reached the session, because session context is off by default. With `CLAUDE_OBSIDIAN_SESSION_CONTEXT=1` and `CLAUDE_OBSIDIAN_VAULT`, every repo session got `hot.md` (3,649 chars) and found the right page. | Set the vault and the opt-in for every session (a hook or env). A workstream key: `hot.md` is one global pile capped at 500 words, not per workstream. |
| C2, G2: nothing lost, with a receipt | Captures only on an explicit `save`, by design. S4's decision never reached the vault, and the vault then answered wrong. Each save does report its operation ID and changed paths, which is a good receipt. | Session-end capture that routes into the vault, and a check that auto-memory and the vault agree. They diverged on the 410 decision and, for a while, on the cap. |
| C3, G3, G8: family knowledge | Works once saved: `wiki/entities/beta.md`, written from beta, was read from alpha. Any repo reaches the vault by env var with no tooling of its own. | Scope fields (operator, family, repo) on notes. The tool has types and tags, but no scope. |
| C4, G4: procedures | Saved and found (S8), as a `concept` page. | A procedure type and a trigger that offers it at the right moment. |
| C5, G5: scripts and outside docs | The inbox, raw capture and ingest worked, with provenance and claim ledgers. The model read the PDF itself. Script notes worked via `save` (S7). | Make ingest headless: it took 3 sessions, 2 of them only to clear the turn cap and the approval. Clear the inbox once captured. Catalogue a script automatically. |
| C6, G6: one home per decision | `index.md` is the one index. Decisions live in session or concept pages. | A decision type. A rule that auto-memory points into the vault rather than duplicating it: every tool-directed save warned that "these facts are now stored in two places". |
| C7, G7: parallel sessions | Optimistic hashes and a mutation lock. A concurrent write conflicted with exit 75 and was rebuilt with both facts. | A headless approval policy. Replace-mode saves stop for a human, which parallel `-p` sessions cannot give. |
| C8: support work off-branch | Stored with no branch key (S2). It is reachable from any checkout. | Route support findings to debt files or runbooks; the tool has no such destination. |

The wrapper would also need to cut the per-save cost. Two options are a prebuilt bundle helper and a looser turn budget for saves. The underlying point is that the skills make the model learn the transaction format from source every time.

## Safety findings

- **User-level state.**
  - Claude Code created an empty `~/.claude/plugins/data/claude-obsidian-inline/` at 21:49:51, the exact start of my first `--plugin-dir` session. That is Claude Code's behaviour for inline plugins, not the tool's, and it holds no data.
  - `~/.claude/settings.json` changed twice during the trial: 3490 bytes at 21:54:06, then 3534 bytes at 22:25:00. The baseline was 3534 bytes, modified Oct 27 20:51:31.
  - `~/.claude/plugins/installed_plugins.json` kept 32796 bytes, with a new mtime of 21:51:06.
  - None of my sessions' tool inputs referenced either file. Neither file mentions this tool or the spike, which I grepped read-only. The times fall inside S1w, S1w-f and S6w-2, while other stacks were also running, and my 37 later sessions did not touch them again. Attribution is **unknown**. I believe, without having checked, that the `installed_plugins.json` touch is Claude Code's own plugin bookkeeping at some session's start.
  - `~/.claude.json` changed, as expected.
  - `~/.basic-memory`, `~/basic-memory`, `~/.config/superpowers`, `~/.config/episodic-memory` and `~/.episodic-memory` remain absent.
- **A write into the product tree.** S6w imported the core directly with `python3 -I -c "…sys.path.insert(0, '<vendor>')…"`. `-I` ignores `PYTHONDONTWRITEBYTECODE`, so it wrote `claude_obsidian/__pycache__/` into the plugin folder. Here that folder is my vendor clone, so the write stayed inside the stack. Under a marketplace install the same command would write into the plugin cache.
- **No egress** by the tool. One child (S4w) tried WebFetch on rfc-editor.org; the allowlist denied it.
- **Containment.** Every child Grep and Glob root stayed inside `<C>`, apart from one system man page. One `find` over the parent `spike/` folder was blocked by Claude Code before it ran.

## Scripts used

`<C>/bin/`: `run.sh` and `go.sh` run one scenario and snapshot the store; `run2.sh` and `go2.sh` are the tool-only variant with `ADD_DIR`; `tools.py` summarises a sandbox transcript; `metrics.py` totals cost and time; `snap.sh` hashes the store. The prompts are in `<C>/prompts/`.
