> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. A sandboxed trial run on 2026-10-30 by a subagent, on Claude Code 2.1.314. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists. Paths under `<S>` name a session-local sandbox that was not kept; [the trial method](./2026-10-30-trial-method.md) rebuilds its fixture.

# basic-memory trial results

Stack: basic-memory, run on 2026-10-30 between 21:44 and 22:30 local time, on Claude Code 2.1.314 with uv 0.6.12.

`<S>` is `/private/tmp/claude-501/-Users-roberto-sousa-Documents-Projects-sidekick/40d9a6bd-0d61-4255-988c-db47d3a71c55/scratchpad/spike`. `<B>` is `<S>/basic-memory`.

**Score: 13 pass, 1 partial, 1 fail** across 15 scenario rows, with S3a and S3b as one row. Four of the passes ran in the worktree. They passed by the model's own inference, not through the tool's mapping (§Scenarios).

## Setup

### Source read

- Repo: `https://github.com/basicmachines-co/basic-memory`, cloned to `<B>/vendor/basic-memory/`.
- Commit: `d7b16128351e8eb6570fe38f7b006d433f5e8d62` (2026-10-30, `v1.0.0-8-gd7b16128`).
- Runtime: `uvx --prerelease=allow basic-memory` resolved `basic-memory 1.0.0` from PyPI. The hook scripts resolved the same version.
- Plugin: `<B>/vendor/basic-memory/plugins/claude-code`, loaded with `--plugin-dir`.

### What `bm install claude-code` would set up

Read in `src/basic_memory/cli/commands/install.py`, `install_claude_code`. The installer writes nothing itself. It shells out to Claude Code and prints one follow-up.

| Step | Command it runs or prints | Sandbox equivalent |
|---|---|---|
| 1 | `claude plugin marketplace add basicmachines-co/basic-memory --scope user --sparse .claude-plugin plugins/claude-code` | none needed |
| 2 | `claude plugin install basic-memory@basicmachines-co --scope user` | `--plugin-dir <B>/vendor/basic-memory/plugins/claude-code` |
| 3 (printed only) | `claude mcp add basic-memory -- uvx --prerelease=allow basic-memory mcp` | `--mcp-config <B>/mcp.json --strict-mcp-config` |

The plugin ships no `.mcp.json` of its own (`install.py` says so in a comment). It holds:

- a `SessionStart` hook and a `PreCompact` hook, each a PEP 723 `uv run --script` shim calling `basic-memory hook <verb>`;
- an output style, `output-styles/basic-memory.md`;
- eight skills: `bm-setup`, `bm-orient`, `bm-checkpoint`, `bm-decide`, `bm-remember`, `bm-share`, `bm-status`, and `bm-writing`;
- four seed schemas: `session`, `coding_session`, `decision`, and `task`.

### Redirected paths

Each one is set in `<B>/env.sh`, which is sourced before every call, and repeated in the `env` block of `<B>/mcp.json`. The sources are `config_models.py:63-101`, `utils.py:549-554`, `hooks/inbox.py:40-43`, and `config_models.py:186-190`.

| What | Default | Redirected to | How |
|---|---|---|---|
| Config, SQLite index (`memory.db`), log, hook inbox | `~/.basic-memory` | `<B>/state/bm-config` | `BASIC_MEMORY_CONFIG_DIR` |
| Default project `main` | `~/basic-memory` | `<B>/store/main` | `BASIC_MEMORY_HOME` |
| New projects created by a session | anywhere; `bm-setup` proposes `~/basic-memory/<name>` | forced under `<B>/store/<name>` | `BASIC_MEMORY_PROJECT_ROOT` (`project_service.py:287-310`) |
| Embedding model `Qdrant/bge-small-en-v1.5-onnx-Q`, 64 MB | `<config dir>/fastembed_cache` | `<B>/cache/fastembed` | `FASTEMBED_CACHE_PATH` |
| Hugging Face hub state | `~/.cache/huggingface` | `<B>/cache/hf` | `HF_HOME`, plus `HF_HUB_DISABLE_TELEMETRY=1` |
| uv cache, including the hook script environments | `~/.cache/uv` | `<B>/cache/uv` | `UV_CACHE_DIR` |
| uv tools | `~/.local/share/uv/tools`, `~/.local/bin` | `<B>/cache/uv-tools`, `<B>/cache/uv-tools-bin` | `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR` |
| uv-managed Python | `~/.local/share/uv/python` | `<B>/cache/uv-python` | `UV_PYTHON_INSTALL_DIR` |
| Notes | per project | `<B>/store/{main,alpha,beta}` | project paths |
| Auto-memory | `~/.claude/projects/<dashed>/memory` | `<B>/store/auto-memory/{alpha,beta}` | `--settings '{"autoMemoryDirectory": …}'` |

Two more paths stay unredirected, and both are read-only:

- **The hooks read `~/.claude/settings.json`** for a `basicMemory` block (`hook.py:277-333`). Redirecting `CLAUDE_CONFIG_DIR` would move Claude Code's whole profile, so I left it. It held no block, which `grep -c basicMemory` confirmed at 0.
- **uv reads `~/.config/uv/`.**

Every redirect held. On 2026-10-30 after the last run, all of these were absent: `~/.basic-memory`, `~/basic-memory`, `~/.cache/huggingface`, `~/.local/share/uv/python`, a `session-start` environment in `~/.cache/uv`, and `/tmp/fastembed_cache`.

### Deviations and manual steps

| # | What | Why |
|---|---|---|
| D1 | `UV_PYTHON=3.12` added | Without it, `uv run --script` built the hook environment on a downloaded CPython 3.14.0a6. On that build, `import fastmcp` segfaults (exit 139), and the fail-open shim swallows it, so sessions got no brief and no error. Verified in this sandbox. I infer an unsandboxed install would do the same, because `~/.local/share/uv/python` holds no managed Python, but I didn't verify that. `uvx` itself had already picked Homebrew's 3.12. |
| D2 | `"outputStyle": "basic-memory:basic-memory"` instead of the documented `"basic-memory"` | Two probe sessions on 2.1.314 with `--plugin-dir` showed the documented name loads no style, and the namespaced name does. A marketplace install is untested. I changed it so the scenarios test the reflexes the tool intends. |
| D3 | I wrote `.claude/settings.local.json` in `alpha` and `beta` myself | Both `bm-setup` sessions composed the block, but Claude Code refused their `Write` to `.claude/` under `acceptEdits`. I copied each refused tool input byte for byte. An interactive operator would approve a prompt here. |
| D4 | The shared `memory-*` skills were skipped | `bm-setup` installs them with `npx skills add basicmachines-co/basic-memory/skills -g`, which writes `~/.claude/skills/`. |
| D5 | `BASIC_MEMORY_PROJECT_ROOT`, `BASIC_MEMORY_NO_PROMOS=1`, and `BASIC_MEMORY_AUTO_UPDATE=false` set | Safety guards, covered in §Safety findings. |
| D6 | I created projects `alpha` and `beta` with `bm project add` before running `bm-setup` | This kept `bm-setup` from creating them at `~/basic-memory/<name>`. The interview was otherwise pre-answered: coding profile, repository `family/<repo>`, light placement suggested, schemas seeded, capture events on, output style on, personal settings. |
| D7 | `alpha-wt-retry` was not set up | `bm-setup` maps one checkout through its own `.claude/settings*.json`. The worktree has neither file, and on this machine a global git exclude ignores `.claude/` (`git status --ignored` shows `!! .claude/`). That is the out-of-the-box state an operator meets. |

Recall needs no manual sync step. Each session's MCP server indexes a note when it writes it, and a separate CLI search found new notes straight away.

## Scenarios

What loaded at session start, measured from each run's transcript:

- basic-memory's `SessionStart` brief; the "Brief" column gives its size in characters.
- Auto-memory: none, because both auto-memory folders stayed empty all trial.
- The operator's user-level plugins and rules. Child sessions inherit `enabledPlugins`, `~/.claude/CLAUDE.md`, and `~/.claude/rules/`, which adds superpowers' and postman's start-up hooks and the `sk-*` rules.

Where each run's notes went: every save went to basic-memory, and nothing went to auto-memory in any run. Several sessions said they skipped auto-memory to keep a single copy. That echoes the operator's own §No mirroring rule, which loads in these sessions.

| Id | Where | Result | Evidence | Brief | Save or find calls | Turns | Wall | Cost | Store changes |
|---|---|---|---|---|---|---|---|---|---|
| S1w | alpha | **pass** | Wrote `decisions/Webhook retry policy - 3 retries…` (`type: decision`, `status: open`) and a `coding_session` checkpoint with branch, SHA, and `[next_step] Write the dead-letter handler` | 1,206 | Skills `bm-decide`, `bm-checkpoint`, `bm-writing`; `bm_search`, `bm_find`, `bm_read`×3, `bm_write`×2, `bm_schema validate`×2 | 28 | 170 s | $0.968 | +2 notes |
| S1r | alpha-wt-retry | **pass, by inference** | "Retry a failed webhook 3 times, with exponential backoff starting at 30 s. If the last retry fails, send it to dead-letter … Should a 410 skip retries? … Next step: Write the dead-letter handler." The brief pointed at the empty default project and said "Basic Memory isn't set up for this project yet". The model chose `alpha` "because its name matches the repo". | 754 | Skill `bm-orient`; `bm_project list`, `bm_search`×3 on `alpha`, `bm_read`×2 | 22 | 86 s | $0.617 | none |
| S2w | alpha-wt-retry | **pass** | Wrote `alpha/bm-remember/Duplicate refunds - refund retried after timeout, no idempotency key`. The project was again chosen by inference. The note isn't linked to anything, has no type, and sits in no support workstream. | 754 | Skills `bm-remember`, `bm-writing`; `bm_project list`, `bm_search`, `bm_write` | 14 | 62 s | $0.496 | +1 note |
| S2r | alpha | **pass** | "**Cause:** the refund call was retried after a timeout even though the first call had already succeeded. The refund call sends no idempotency key." | 1,488 | `bm_search`, `bm_read` | 7 | 44 s | $0.343 | none |
| S3a + S3b | alpha and alpha-wt-retry, started together at 22:09:40 | **pass** | S3a wrote `decisions/webhook-retry-backoff-caps-at-10-minutes.md` and `bm_edit`ed the policy note. S3b wrote `bm-remember/Webhook duplicates - vendor sends an event id…`. Both facts and all of S1w's facts are present (`grep` and `bm tool search "backoff cap"`). The log shows no lock errors. The two never wrote the same file, so no write guard was exercised. | 1,488 / 754 | S3a: `bm-decide`, `bm_read`×2, `bm_write`, `bm_edit`. S3b: `bm-remember`, `bm_search`, `bm_read`×2, `bm_write`. | 18 / 21 | 121 / 115 s | $0.742 / $0.675 | +2 notes, 1 edit |
| S4w | alpha | **pass** (captured unprompted) | `bm-decide` fired with no save asked, wrote `decisions/webhook-retries-skip-a-410-response.md`, and closed the policy note's 410 question with two `bm_edit`s. The reply named the permalink. That reply is the only receipt; no end-of-session capture exists. | 1,590 | Skills `bm-decide`, `bm-writing`; `bm_search`×3, `bm_read`×2, `bm_write`, `bm_edit`×2 | 24 | 133 s | $0.811 | +1 note, 1 edit |
| S4r | alpha-wt-retry | **pass, by inference** | "**No — a 410 is not retried.** … `alpha/decisions/webhook-retries-skip-a-410-response`". Found with `bm_search(all_projects=true)`; the model also flagged that the checkpoint still lists 410 as open. | 754 | `bm_search` across all projects, then `Glob`/`Read` of store files | 12 | 37 s | $0.423 | none |
| S5w | beta | **pass** | Wrote `beta/bm-remember/beta public API pagination` with the operator's sentence word for word | 1,144 | Skills `bm-remember`, `bm-writing`; `bm_project list`, `bm_search`, `bm_write` | 14 | 59 s | $0.429 | +1 note |
| S5r | alpha | **pass** | "cursor pagination: 100 items per page, with the cursor for the next page in a field called `next`". It searched `alpha` first, then `beta`, because the prompt named beta. | 1,682 | `bm_project list`, `bm_search` on `alpha`, then ×2 on `beta`, `bm_read` | 11 | 55 s | $0.381 | none |
| S6w | alpha, by asking a session | **partial** | Claude Code's `Read` opened the PDF, and the session transcribed it in full into `alpha/reference/ParcelCo Carrier API v3.md`, and likewise for the Markdown file. The **original PDF was not stored** ("I didn't copy the original PDF into the store"). The tool's own PDF path, `bm import document`, was never found: `bm_man` searches for "import", "pdf", and "binary" returned nothing about it. It landed in alpha's repo project, not a family area. | 1,682 | `bm_man`×7, `bm_project list`, `bm_list`, `bm_find`, `bm_read`×5, `bm_search`×3, `bm_write`×2, `bm_context`; `Read` of both sources. `WebFetch` to `docs.basicmemory.com` was refused. | 32 | 199 s | $1.120 | +2 notes |
| S6r | beta | **fail** | "ParcelCo isn't recorded in this project (`beta`) … a filesystem search found a note in a different project, `alpha` … I stay inside the session's active project unless you name another one." The output style's rule held it back: "Keep working in the project's active Basic Memory project unless the user explicitly asks for another". | 1,144 | `bm_search` on `beta`; `Grep` of the store | 4 | 30 s | $0.290 | none |
| S7w | alpha | **pass** | Wrote `bm-remember/Bulk-close stale returns - dry run, then -live with -merchant.md` with a command table, and warned that the script only prints | 1,682 | Skills `bm-remember`, `bm-writing`; `bm_project list`, `bm_search`×2, `bm_write` | 19 | 83 s | $0.584 | +1 note |
| S7r | alpha-wt-retry | **pass, by inference** | "`<runner> playground/bulk-close/run.ts --merchant <slug>  # dry run` … `--live --merchant <slug>  # live`", and it explained that the worktree has no `playground/` | 754 | `Glob` of the store, `bm_search`×2 with no project, `bm_read` on `alpha` | 12 | 36 s | $0.355 | none |
| S8w | alpha | **pass** | Wrote `reference/alpha release procedure.md` with the four steps and their open questions | 1,682 | Skill `bm-writing`; `bm_search`, `bm_list`×2, `bm_read`, `bm_write` | 13 | 78 s | $0.516 | +1 note |
| S8r | alpha-wt-retry | **pass, by inference** | Gave the four steps in order: bump `version` in `package.json`, run `make check`, tag `vX.Y.Z`, write release notes. It added that the Makefile is missing. | 754 | `Glob`/`Read` of the store, `bm_search`×2, `bm_read`×2 | 16 | 110 s | $0.635 | none |

Every run also changed the same `state/` files: `memory.db` and its WAL, `basic-memory.log`, `watch-status.json`, and one lifecycle envelope in `inbox/`. Each also wrote its own transcript under `~/.claude/projects/<dashed fixture path>/`. The fixture repos' tracked files never changed (`git status --short --ignored`).

The worktree passes overstate the tool. `--add-dir <B>/store` gave sessions direct file access to the store, and S4r, S7r, and S8r each used `Glob`/`Read` on it. A normal install keeps the store at `~/basic-memory`, outside every session's working directories. Only S1r's and S2w's `alpha` came purely from MCP calls the model chose.

The brief grows with typed notes only. Alpha's brief went from 1,206 to 1,682 characters. It lists open decisions and the latest checkpoint, by title and permalink. It never listed the `bm-remember/` or `reference/` notes, so S2, S5, S6, S7, and S8 recall rested on the model choosing to search. This is the brief at S8w:

```text
**Project:** alpha
## Open decisions (3)
- Webhook retry policy - 3 retries with exponential backoff from 30s, then dead-letter — alpha/decisions/…
- Webhook retry backoff caps at 10 minutes — alpha/decisions/webhook-retry-backoff-caps-at-10-minutes
- Webhook retries skip a 410 response — alpha/decisions/webhook-retries-skip-a-410-response
## Recent sessions (1) — where you left off
- Claude checkpoint - webhook retry design — alpha/sessions/claude-checkpoint-webhook-retry-design
```

That block is followed by the placement conventions and the recall prompt. The hook took 4.8 to 4.9 seconds warm and 15 seconds on its first run, against a 20-second timeout and DESIGN.md's budget of "under 1 second". `PreCompact` never fired, because no `-p` session compacted.

## Store

### Tree after the last run

```text
store/
├── main/                      (default project, empty: no session wrote here)
├── auto-memory/alpha/         (empty)
├── auto-memory/beta/          (empty)
├── alpha/
│   ├── bm-remember/
│   │   ├── Bulk-close stale returns - dry run, then -live with -merchant.md
│   │   ├── Duplicate refunds - refund retried after timeout, no idempotency key.md
│   │   └── Webhook duplicates - vendor sends an event id, discard repeats on it.md
│   ├── decisions/
│   │   ├── Webhook retry policy - 3 retries with exponential backoff from 30s, then dead-letter.md
│   │   ├── webhook-retries-skip-a-410-response.md
│   │   └── webhook-retry-backoff-caps-at-10-minutes.md
│   ├── reference/
│   │   ├── alpha release procedure.md
│   │   ├── ParcelCo Carrier API v3.md
│   │   └── Returns portal integration notes.md
│   ├── schemas/  (Coding Session.md, Decision.md, Task.md)
│   └── sessions/
│       └── Claude checkpoint - webhook retry design.md
└── beta/
    ├── bm-remember/
    │   └── beta public API pagination.md
    └── schemas/  (Coding Session.md, Decision.md, Task.md)
```

That is 17 files and 72 KB, measured with `find` and `du` on 2026-10-30. Outside the store, `state/` held 5.4 MB and `cache/` 1.6 GB: the uv environments, two Python stacks, onnxruntime, and the model.

### One note in full

`store/alpha/decisions/webhook-retries-skip-a-410-response.md`, captured in S4w with no save asked:

```markdown
---
title: Webhook retries skip a 410 response
type: decision
permalink: alpha/decisions/webhook-retries-skip-a-410-response
status: open
decided: '2026-10-30'
project: alpha
tags:
- webhooks
- retries
- dead-letter
---

# Webhook retries skip a 410 response

## Decision

alpha treats a 410 response as permanent and never retries it. None of the 3 backoff retries run for that failure. The operator stated this on 2026-10-30 during the webhook retry work. It answers the first open question in the retry policy decision.

## Context

The retry policy is 3 retries with exponential backoff from 30 s, then dead-letter, with backoff capped at 10 minutes. At commit `3650753` on `main`, `onWebhook` in `src/webhooks.ts` is still a stub carrying `// TODO: retries`. Nothing implements any of these decisions yet, and the dead-letter handler is the next piece of work.

## Rationale

The operator's reason is that a 410 is permanent, so a retry cannot succeed. That matches HTTP's meaning of 410 Gone: the resource is no longer available, and the condition is likely permanent. The HTTP reading is Claude's general knowledge of RFC 9110; nobody checked it against the RFC text on 2026-10-30.

## Alternatives considered

None were discussed. The obvious alternative is to retry a 410 like any other failure. Under the current policy that spends about 3.5 minutes and three more calls before the failure reaches dead-letter anyway.

## Consequences

Skipping retries settles how often alpha calls again, not where the failure ends up. Two questions the retry policy decision already raised now decide what a 410 actually does:

- **Dead-lettered at once, or dropped?** Undecided, and the dead-letter handler needs the answer before it is written. In Claude's view dead-lettering is the safer default. alpha issues refunds, so a 410 dropped silently on that path is a refund that never happens and leaves no trace. A dead-letter entry at least leaves something to act on.
- **Which call returns the 410?** Undecided. alpha receives carrier webhooks, so the 410 comes from a call alpha makes: a downstream carrier or refund API call during processing, or an outbound webhook alpha sends. If it is an outbound subscriber, a 410 may mean that subscriber is gone for good, which raises whether alpha should stop sending to it at all.

This decision covers 410 alone. Whether other 4xx responses, such as 404, also skip retries stays open under "Which failures retry?" in the retry policy decision.

## Observations

- [decision] A 410 response is permanent, so alpha skips all webhook retries for it #webhooks #retries
- [rationale] Retrying a permanent failure cannot succeed (operator, 2026-10-30)
- [question] Is a 410 that skips retries dead-lettered at once or dropped? Open as of 2026-10-30
- [question] Which call returns the 410, a downstream carrier or refund API or an outbound webhook, is still unknown
- [risk] Dropping a 410 on the refund path loses the refund without a trace
- [context] `onWebhook` in `src/webhooks.ts` is a stub with `// TODO: retries` at `3650753`
- [branch] main

## Relations

- refines [[Webhook retry policy - 3 retries with exponential backoff from 30s, then dead-letter]]
```

### As an Obsidian vault

Opening `store/` as a vault would show one folder per project, plus the empty `main/` and `auto-memory/`. Obsidian itself was not opened; the link behaviour below is my understanding of how it resolves links, not a test.

- **Front matter:** every note has YAML front matter with `title`, `type`, `permalink`, and `tags`, and `status` where its schema has one. Coding checkpoints add `repository`, `repo_root`, `cwd`, `branch`, `git_sha`, `username`, and `hostname`.
- **Links:** `[[Title]]` wikilinks appear in the notes, eight in all, with four distinct targets. basic-memory resolves a link by title. Obsidian resolves by file name, so I expect 2 of the 4 targets to show as unresolved. Those two notes were written by `identifier` and have kebab-case file names, such as `webhook-retries-skip-a-410-response.md`, while the links use their titles. Each `Coding Session.md` schema also carries a placeholder `[[Previous checkpoint title]]`.
- **Observations:** these are list items in the form `- [category] text #tag`. Obsidian shows the `#tag`s as tags and the categories as plain text.
- **Index:** none. No project has a home, index, or MOC note. The only index is the SQLite database and the hook's brief.

## Cost and time

Totals, from `result.json` and `meta.txt` per run:

| Group | Sessions | Cost | Wall-clock, summed per run |
|---|---|---|---|
| Scenarios | 16 | $9.39 | 1,418 s |
| Setup (`bm-setup` ×2) and output-style probes ×2 | 4 | $1.97 | 251 s |
| **Total** | **20 of the 40-session cap** | **$11.36** | **1,669 s, or about 26 min elapsed** |

The elapsed figure allows for S3a and S3b overlapping. Before the first session, the tool also cost:

- 18 s for the `uvx` resolve of 159 packages;
- 10 s for the model download;
- 8.5 s per hook environment.

## What the base did alone, and the gap per case

### The three scopes

The design's scopes are the operator, the product family, and each repo.

| Scope | What basic-memory offers | How well it fits |
|---|---|---|
| Repo | One primary project per checkout, mapped by `basicMemory.primaryProject` in `.claude/settings*.json`. `bm-setup` proposes the repo's directory name. | Works in the main checkout. Doesn't reach a worktree, because the mapping file is per checkout and git-ignored on this machine, so the worktree brief fell back to the default project. |
| Family | No noun for it. Three nearby features: `secondaryProjects`, read-only, whose brief adds only open decisions, capped at 6 projects (`bm-setup` §Cloud / teams). `bm_search(all_projects=true)` or `projects=[…]`. Or the fan-out model in DESIGN.md §5.2, one project spanning repos with `repository` metadata as the filter. | Weak by default. S6r shows the output style's "stay in the active project" rule fencing off a sibling's knowledge. No write path routes anything to a shared project, since checkpoints and remembers write to `primaryProject` only. |
| Operator | The default project `main`, at `BASIC_MEMORY_HOME` | Exists, but nothing writes to it. Unmapped sessions only read it, and it stayed empty. |

### Per case

| Case | What the base did alone | Gap a wrapper would fill |
|---|---|---|
| C1 (S1) | Typed decision and coding checkpoint. In the mapped checkout the brief lists open decisions and the last checkpoint. | Map by repo identity or workstream, not per-checkout settings, so worktrees and branchless sessions resolve the same project. The brief's 3-day `recallTimeframe` also drops older checkpoints. |
| C8 (S2) | A quick capture in `bm-remember/`, findable by search | No support workstream. The finding sits untyped in a capture folder that the brief never lists, and nothing routes it to a debt file or runbook. |
| C7 (S3) | Concurrent sessions wrote separate notes, and both MCP servers shared one SQLite index without errors | Same-note contention untested. `bm_write` documents an `expected_checksum` parameter, which `bm_man` shows but this trial never exercised. |
| C2 (S4) | `bm-decide` captured a decision unprompted, with D2 applied | There is no end-of-session capture: the plugin has no `Stop` or `SessionEnd` hook, and `PreCompact` fires only on compaction. The only receipt is the model's reply. Unprompted capture depended on D2, since without the namespaced style name the reflexes don't load. |
| C3 (S5) | Answered only because the prompt named beta | A family area reachable by default, in the brief and in search, and a rule override for the output style's fence |
| C5 (S6, S7) | No inbox. A session transcribed the PDF into a repo note and dropped the original. Scripts became `bm-remember` notes. | An inbox that keeps originals and runs `bm import document`. The tool has a PDF extractor (`document_ingestion/`), but it is CLI-only, needs the file copied into a project first, and is documented only in the uninstalled `memory-ingest` skill. A script catalogue with last-run dates. |
| C4 (S8) | Procedure saved to `reference/` and recalled | No procedure or playbook type, so the brief never shows procedures |
| C6 | Typed decisions with `status`, listed in the brief per project | One index across projects. Decisions are listed only for the session's own project. |
| G8 | A sibling repo needs its own `bm-setup` and settings file | Otherwise it falls back to the default project, as the worktree did |

## Safety findings

### Network

| Code path | Destination | When | State in this trial |
|---|---|---|---|
| uv resolve | PyPI | First run; documented in the plugin README | Ran, into the sandbox cache |
| fastembed | Hugging Face, `Qdrant/bge-small-en-v1.5-onnx-Q` | First semantic index or query | Ran, into `<B>/cache/fastembed` |
| `cli/analytics.py:28` | Umami analytics, `https://api-gateway.umami.dev` | When a cloud promo shows, which is only in an interactive terminal | Disabled with `BASIC_MEMORY_NO_PROMOS=1` |
| `cli/auto_update.py`, started by `mcp.py:102-116` | PyPI version check, then `uv tool upgrade` or `brew upgrade` | In a background thread on every stdio MCP start | Skipped under `uvx` by design, and disabled with `BASIC_MEMORY_AUTO_UPDATE=false`. `auto_update_last_checked_at` stayed `null`. |
| Cloud commands | `cloud.basicmemory.com` | Only when a cloud command is used | Unused |

The models in child sessions tried `WebFetch` to `docs.basicmemory.com` and `rfc-editor.org`, and `WebSearch`. Permissions refused all three. That is model behaviour, not tool code.

### Writers outside the sandbox

These paths would have written outside the sandbox if run, and none ran:

| Path | Default destination | Source |
|---|---|---|
| `bm hook install --harness claude` and `bm hook remove` | Rewrite `~/.claude/settings.json` | `hook.py:1427-1436`, `1607`, `1660` |
| `bm-setup` shared skills, `npx skills add … -g` | `~/.claude/skills/` | `bm-setup` SKILL.md §Install the shared skills |
| `bm-setup` new project | `~/basic-memory/<name>/` | `bm-setup` SKILL.md §Interview |

`BASIC_MEMORY_PROJECT_ROOT` blocked the third, and `--allowedTools` blocked `npx`.

### Baseline check after the last run

Checked on 2026-10-30 at about 22:30:

- **Absent and unchanged:** `~/.basic-memory`, `~/basic-memory`, `~/.config/superpowers`, `~/.config/episodic-memory`, and `~/.episodic-memory`.
- **`~/.claude/settings.json` was still 3,534 bytes, but its modification time changed** from Oct 27 20:51:31 to Oct 30 22:25:00. That falls inside S7r, which ran 22:24:33–22:25:09. None of S7r's tool calls touched the file.
  - Across every sandbox transcript, the only tool calls naming the file were `Read` or `Grep`. Bash attempts to `cat` it were refused.
  - The only basic-memory code that writes it is `bm hook install` and `bm hook remove`, and no transcript mentions either.
  - Not attributed to this stack, though I could not diff it, since there was no baseline copy.
- **`~/.claude/plugins/installed_plugins.json` was still 32,796 bytes, but its modification time changed** from Oct 28 12:15:36 to Oct 30 21:51:06. That was before this stack's first Claude session started at 21:53:45, while only `uvx basic-memory project add` was running, and that command has no code touching `~/.claude/plugins/`.
- **Other sessions were active.** The claude-obsidian and episodic-memory stacks, and a session in another repo, were active at the same time, judging by the modification times of their `~/.claude/projects/` folder names. I did not read their transcripts.
- **`~/.claude.json`** went from 254,262 to 255,757 bytes. That is Claude Code's own bookkeeping.

### Other observations

- **Child sessions read the operator's `~/.claude/settings.json`.** Six runs used `Read` or `Grep` on it while hunting for a `basicMemory` block. The tool's design points the model at that file.
- **Child sessions loaded the operator's user-level plugins and rules.** These include sidekick's mods, so these sessions may have briefly appeared on the operator's desk.
- **Checkpoint notes store `username` and `hostname`** in front matter. That stays local.
