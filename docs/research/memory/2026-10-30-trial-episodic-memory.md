> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. A sandboxed trial run on 2026-10-30 by a subagent, on Claude Code 2.1.314. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists. Paths under `<S>` name a session-local sandbox that was not kept; [the trial method](./2026-10-30-trial-method.md) rebuilds its fixture.

# episodic-memory spike: results

Stack: `episodic-memory` (github.com/obra/episodic-memory), run 2026-10-30 between 21:45 and 22:20 UTC. `<E>` below is `/private/tmp/claude-501/-Users-roberto-sousa-Documents-Projects-sidekick/40d9a6bd-0d61-4255-988c-db47d3a71c55/scratchpad/spike/episodic-memory`.

**Headline.** The archive recovered what earlier sessions decided, with no save, in 5 of 7 scenarios: 5 pass, 1 partial, 1 fail. One run caused a safety breach: the summarizer's bundled Claude Code 2.1.141 removed `"model": "opus"` from `~/.claude/settings.json`. See §Safety findings.

## Setup

### Tool and commit

- Cloned into `<E>/vendor/episodic-memory/` at `7e06519357777badd7a115d2014a7ef845904310` (2026-09-10, v1.6.0), the commit the survey read.
- `npm install` pulled 242 packages in 20 s, with `npm_config_cache=<E>/cache/npm` and `npm_config_devdir=<E>/cache/node-gyp`. `dist/` ships prebuilt, so nothing was compiled.
- The pieces that run are the following:
  - `hooks/hooks.json`: a SessionStart hook (`startup|resume|clear`) runs `episodic-memory.js sync --background`.
  - The MCP server has two tools, `search` and `read`.
  - The agent `search-conversations` is a haiku agent that calls `search` and `read`.
  - The skill `remembering-conversations` says the model "MUST" search before saying it doesn't know.
- Child sessions loaded the plugin with `--plugin-dir <E>/vendor/episodic-memory`. Plugin, hook, MCP server, agent, and skill all loaded, as verified in the `init` event of `runs/probe-plain.jsonl`.

### Redirected paths

Every write path, from `src/paths.ts`, `src/logging.ts`, `src/sync.ts`, `src/summarizer.ts`, and `@huggingface/transformers/src/env.js`:

| Path the tool writes or reads | Default | Redirected to | How |
|---|---|---|---|
| Source of transcripts | `~/.claude/projects`, `~/.claude/transcripts`, Codex, Cursor, OMP, and opencode dirs | `<E>/store/projects/`, a fake projects folder | `TEST_PROJECTS_DIR`. It returns that one folder and skips every other harness (`paths.ts:getConversationSourceDirs`) |
| Archive | `~/.config/superpowers/conversation-archive/` | `<E>/store/em/conversation-archive/` | `EPISODIC_MEMORY_CONFIG_DIR=<E>/store/em` |
| Index (SQLite and sqlite-vec) | `~/.config/superpowers/conversation-index/db.sqlite` | `<E>/store/em/conversation-index/db.sqlite` | same |
| Logs and sync lock | `~/.config/superpowers/logs/` | `<E>/store/em/logs/` | same |
| opencode DB read | `~/.local/share/opencode/opencode.db` (absent on this machine) | `<E>/store/none/opencode.db` (absent) | `EPISODIC_MEMORY_OPENCODE_DB_PATH`, `EPISODIC_MEMORY_OPENCODE_DATA_DIR` |
| Codex, Cursor, OMP homes | `~/.codex`, `~/.cursor`, `~/.omp` | `<E>/store/none/*` | `CODEX_HOME`, `CURSOR_HOME`, `OMP_HOME`. These are moot under `TEST_PROJECTS_DIR`, set as a backstop |
| Embedding model (`Xenova/bge-small-en-v1.5`, q8, 33 MB) | `node_modules/@huggingface/transformers/.cache/` | the same path, already inside `<E>/vendor/` | No redirect needed (`env.js:157`) |
| npm cache, node-gyp headers | `~/.npm`, `~/Library/Caches/node-gyp` | `<E>/cache/` | `npm_config_cache`, `npm_config_devdir` |
| **Summarizer's Claude Code runtime** | the user's `~/.claude/` | **not redirectable without breaking auth** | See §Safety findings |

Isolation of the source: no supported variable narrows the source to chosen folders. `CONVERSATION_SEARCH_EXCLUDE_PROJECTS` is a deny-list, and `TEST_PROJECTS_DIR` is a test hook. I used `TEST_PROJECTS_DIR` on a fake folder holding three symlinks, one per sandbox transcript folder (`alpha`, `alpha-wt-retry`, `beta`). `syncConversations` follows a top-level symlink through `statSync`, so the hook saw each session as Claude Code wrote it, with no copy step. The symlinks were dangling until each folder existed, and `statIfExists` skips a dangling link.

### How children ran

```
cd <E>/family/<repo> && claude -p "<prompt>" --plugin-dir <E>/vendor/episodic-memory \
  --permission-mode acceptEdits \
  --allowedTools "mcp__plugin_episodic-memory_episodic-memory__search,mcp__plugin_episodic-memory_episodic-memory__read,Skill,Agent" \
  --disallowedTools "Write,Edit,NotebookEdit,Bash" --add-dir <E>/store/em \
  --max-turns 20 --output-format json --settings '{"autoMemoryEnabled":false}' < /dev/null
```

The harness is `<E>/bin/run.sh`, the environment `<E>/bin/env.sh`, and the per-run summariser `<E>/bin/report.py`.

Departures from the brief, and why:

- **No `--strict-mcp-config`.** Verified in `runs/probe-strict.jsonl`: strict mode drops the plugin's own MCP server too, leaving zero episodic tools. Supplying the server through `--mcp-config` renames its tools to `mcp__episodic-memory__*`. The plugin's agent names the `mcp__plugin_…` form, so it would lose them. So the operator's own MCP servers (Gmail, Notion, Linear, Claude Docs) loaded in children. They were outside `--allowedTools`, and no child called one.
- **`Write`, `Edit`, `NotebookEdit`, and `Bash` disallowed.** Recall had to come only from the archive, per the override. `acceptEdits` would otherwise accept a notes file in the repo. Every repo's `git status` stayed clean in every run.
- **`--add-dir <E>/store/em`, from the brief.** This gave the models direct `Read`, `Grep`, and `Glob` access to the archive, a route the tool does not offer by itself. S3b and S4r used it.

### Manual steps

- **Install:** `npm install` by hand. The MCP wrapper would otherwise run it on first launch.
- **Sync:**
  - **The operator would rely on the SessionStart hook.** Every read in this trial ran on the hook alone, except S1r.
  - I ran `episodic-memory sync` by hand twice. The first, before S1r, timed the first sync, model download included. The last, after S8r, completed the inventory.
  - If a read starts while a sync holds the lock, the fallback is to run `episodic-memory sync` by hand (S7r).

## Scenarios

The store loads nothing about past work at session start. The plugin adds the hook's stdout, `Sync started in background. Log: <path>` (209 characters). It also adds a skill listing entry (288-character description) and an agent listing entry (237). The two MCP tool schemas (583 and 303 characters of description) are deferred until `ToolSearch` loads them. That holds for every run, so the table leaves it out.

| Id | Case | Result | Evidence (key lines) | Tools and turns | Wall, cost |
|---|---|---|---|---|---|
| S1w | C1 | archived | Prompt indexed at line 7 (no Skill call before text). The session searched first and found nothing | Direct MCP `search`, Glob, Read; 15 turns | 95 s, $0.57 |
| S1r | C1 | **pass** | "Retry 3 times with exponential backoff starting at 30 seconds, then dead-letter: Decided… Next step: write the dead-letter handler… Should a 410 response skip retries?: Open" | Skill, then the `search-conversations` agent (9 searches, 1 read), then Grep of the archive; 2 turns | 95 s, $0.55 |
| S2w | C8 | archived, **prompt not indexed** | Opened with `superpowers:systematic-debugging`, so its prompt exchange was dropped. Only the exchange starting at the second skill's text is indexed | 2 Skills, agent (7 searches, 4 reads); 12 turns | 138 s, $0.64 |
| S2r | C8 | **fail** | "No. Nothing in your past sessions records a duplicate refund actually happening". In S2r's own results, the top hit was S2w's search-subagent prompt (74%). In my replay of "duplicate refunds" after the run, the S2w session ranked 5th at 42%. The agent read four files, none of them S2w's main transcript | Skill, agent (9 searches, 4 reads); 7 turns | 63 s, $0.42 |
| S3a, S3b | C7 | **pass** | Both prompts are in the archive (`0e023be3…`, `a8405cf2…`), and S1w is intact. The two hooks fired 74 ms apart; the second logged `sync already running…; skipping`. S4w's main session then found S3b's event-id finding. Caveat: S3a's prompt is not indexed (Skill first), and its exchange ranks 6th for "backoff cap 10 minutes" | S3a: Skill and agent, 14 turns. S3b: direct archive Read and Grep, then MCP, 18 turns | 125 s and 111 s, in parallel; $0.56 and $0.75 |
| S4w | C2 | archived | No save asked or made. The session said "I've noted the decision but not written it anywhere yet". Prompt indexed at line 7 | MCP search and read; 18 turns | 102 s, $0.70 |
| S4r | C2 | **pass** | "No. You decided that a 410 is permanent and skips retries entirely… Your decision in session `baf24f4c`" | Skill, agent (5 searches, 5 reads), archive Grep and Read; 10 turns | 107 s, $0.52 |
| S5w | C3 | archived | "This session has no memory directory, so I haven't saved the fact anywhere". Prompt indexed | Glob, Read; 4 turns | 27 s, $0.34 |
| S5r | C3 | **pass** | "Cursor pagination: 100 items per page, with the next cursor in a `next` field… from one past conversation in beta, `ded97711`". Reads of beta's repo were denied | Skill, agent (5 searches, 1 read); 9 turns | 62 s, $0.41 |
| S7w | C5 | archived | Prompt indexed | Glob, Read; 3 turns | 31 s, $0.34 |
| S7r | C5 | **fail on the hook; pass on rerun** | First run: S7r's hook logged `sync already running (pid 31325); skipping`, because the sync from S7w's start was still summarizing. So S7w was not archived: "I couldn't find a bulk-close script". Rerun after the lock freed: "Dry run `run.ts --merchant <slug>`… Live `run.ts --live --merchant <slug>`", from the archive; the read of `../alpha/playground` was denied | Skill and agent: 8 searches the first time, 6 searches and 3 reads on the rerun | 50 s, $0.34; rerun 84 s, $0.17 |
| S8w | C4 | archived | Prompt indexed | Glob, Read; 7 turns | 55 s, $0.37 |
| S8r | C4 | **pass** | "The only version is one you gave in a session earlier today: bump the version in `package.json`, run `make check`, tag `vX.Y.Z`, then write release notes" | Skill, agent (4 searches, 2 reads); 12 turns | 126 s, $0.56 |

Grades: S1 pass, S2 fail, S3 pass, S4 pass, S5 pass, S7 partial (it fails on the path the operator would use), S8 pass. **5 pass, 1 partial, 1 fail.** S6 was skipped, per the override.

Per-run file changes, from `runs/<id>.changes.txt`:

- **Repos:** none.
- **Auto-memory:** none. It was disabled, and no `memory/` folder appeared.
- **Store:** each session's start hook wrote the store: archive copies, `-summary.txt` files, `db.sqlite`, and the log. A session never wrote it itself.
- **Elsewhere:** 9 summarizer stubs and `~/.claude/settings.json` (§Safety findings).

## What the runs showed

### 1. Starting with a skill drops the operator's prompt from the index

Verified in `src/parser.ts:186-188` and `:286-300`, and across all 15 sessions in the audit:

- The parser keeps an exchange only if the assistant wrote text before the next user-role text message.
- The Skill tool injects its body as a user-role message.
- So when the model calls a skill before writing any text, the exchange holding the operator's opening prompt is silently dropped.
- The rule held in all 15 sessions: the prompt was indexed if and only if no Skill call came before the first text.
- 9 of 15 opening prompts were lost, two of them write runs' stated facts (S2w, S3a).

The plugin's own skill tells the model to search before anything else, so the tool's recommended flow triggers this loss. The raw transcript stays in the archive, so a `read` of the right file still recovers the prompt. Search can rank that file only by its later exchanges, and their embedding is the first 2,000 characters of `User: <skill body>`, so the content barely registers.

### 2. The tool's own searches crowd out the findings

The search agent's transcripts are archived and indexed too. They are filed under the project `subagents`, from `path.basename(path.dirname(file))`, not under the repo. At the end, 9 of 24 indexed conversations were search-agent runs.

The agent's prompt restates the question, such as "Search past conversations for anything about duplicate refunds". So that prompt becomes the top vector hit for the same question next time, and its body says "nothing found". That is how S2r concluded no incident had happened.

### 3. Freshness depends on a lock that summarization holds

- A sync copies and indexes within about 1 s of session start when the lock is free. S2w's exchanges were indexed 9 s before S2r's first search.
- After indexing, the same process summarizes up to 10 conversations, one Claude call each, with a timeout of up to 120 s each (`summarizer.ts:177`). It holds the single-instance lock throughout.
- A session that starts in that window skips its sync, so the newest work stays unarchived until a later session start. S7r missed this way.
- Summaries are display-only: `sync.ts` says they are never embedded or searched. `search.ts:342` shows one only when it is under 300 characters, and 1 of 24 was.
- `EPISODIC_MEMORY_SKIP_SUMMARIES=1` would remove the lock hold, the extra Claude runtime, and the settings breach, without changing recall.

### Other observations

- **Worktrees are separate projects.** The project key is the dashed cwd, so `alpha` and `alpha-wt-retry` never match each other in the `project` filter. No session used the filter, which is why cross-checkout (C1) and cross-repo (C3) recall worked.
- **Tool results are not indexed.** Several sessions read `playground/bulk-close/run.ts`, but the script's text sat only in tool results. A search for `bulk-close` therefore found nothing until S7w's prose was archived.
- **Restatements pile up.** S1w's decision text appears in 10 archived transcripts, because every later session quoted it back. That helps recall now, but a superseded decision would echo just as loudly.
- **The read sessions labelled their sources well.** They said which claims they had read in a transcript and which the subagent reported. They also marked the assistant's past proposals as "never adopted". That is the model's behaviour, not the tool's.

## Store

The tree, 50 files and 13 MB (11 MB archive, 2 MB index), is recorded in `<E>/runs/store-tree.txt`. Its shape, with the sandbox prefix shortened:

```
store/em/
  conversation-archive/
    <sandbox>-family-alpha/            7 sessions: <uuid>.jsonl, <uuid>-summary.txt,
                                       <uuid>/subagents/agent-<hex>.jsonl and -summary.txt
    <sandbox>-family-alpha-wt-retry/   7 sessions, the same layout
    <sandbox>-family-beta/             1 session
  conversation-index/db.sqlite         24 conversations, 25 exchanges, 384-dim vectors
  logs/episodic-memory.log, episodic-memory-sync.lock
```

The store holds no notes, only raw transcripts (about 550 KB each, mostly system-reminder attachments) and generated summaries. The closest thing to a note is the summary of S4w, `baf24f4c-ceb4-4bab-a64a-c59a85cb97fd-summary.txt`, in full:

> Recorded decision for webhook retry work in "alpha" (a service that receives carrier webhooks and issues refunds): a 410 response is permanent and skips retries entirely. Identified gaps in the decision: where 410s are handled downstream (dead-letter queue vs. subscription disable), and whether the rule should extend to other 4xx responses (400, 404, 422) rather than special-casing 410 alone. Found prior session's decision to retry 3 times with 30s exponential backoff, and a separate finding that the vendor sends event IDs for deduplication. Recommended documenting all three decisions in a design doc before implementation.

As an Obsidian vault, the store is close to unusable:

- no Markdown files, only `.jsonl` and `.txt`;
- no front matter, links, or index;
- folder names that are dashed absolute paths;
- files named by UUID.

The CLI's `show --format html` renders one conversation at a time.

## Cost and time

- **Child sessions:** 17, of which 2 were probes and 1 was the S7r rerun. The cap was 40.
- **Session cost:** $7.61 in total, as reported by `--output-format json`.
- **Scenario wall time:** 1,272 s (21 min).
- **Summarizer:** 24 extra Claude runs (haiku) through the Agent SDK's bundled CLI, billed to the subscription. Their cost is not reported anywhere.
- **First sync:** 15 s, including the 33 MB model download. Later syncs copied and indexed in about 1 s, then spent 15 to 60 s summarizing.

## Safety findings

1. **Breach: `~/.claude/settings.json` was rewritten.**
   - **Observed:** the file is now 3,490 bytes, modified Oct 30 21:54:06, against the baseline 3,534 bytes, Oct 27 20:51:31. The top-level `"model": "opus"` key is gone, and `modelSettings` moved position. The old value comes from the operator's own `settings.json.bak-2026-10-27-*` backups. Every other key I printed at 21:49 is unchanged.
   - **Cause (inferred from timing and code, not watched directly):**
     - The summarizer runs the Agent SDK's bundled Claude Code, version **2.1.141** (`claude-agent-sdk@0.2.141`), against the operator's `~/.claude`.
     - `settingSources: []` stops it reading settings, but its startup migrations still write them.
     - The binary contains `if(V6("userSettings")?.model!=="opus")return;let _="opus[1m]",q=wK(_)===wK(JP())?void 0:_;m8("userSettings",{model:q})`. That code deletes `model: "opus"` when `opus[1m]` is the default, the exact diff observed.
     - The write happened inside the first by-hand sync, the first summarizer launch: the sync ran from about 21:53:59 to 21:54:15, when the summary was written.
     - The installed 2.1.314 had run many times on the same file without making the change.
   - **Not fixed:** I made no edit, since the brief forbids editing `settings.json`. To restore, re-add `"model": "opus",` at the top level.
   - **Possible further effects (believed, not checked):** the same old runtime may also have set migration flags in `~/.claude.json` and refreshed OAuth tokens.
2. **Unattributed: `~/.claude/plugins/installed_plugins.json` was modified** at Oct 30 21:51:06, with the size unchanged at 32,796 bytes. No summarizer had run yet, and my only Claude processes had exited by 21:50:53. Another session on the machine may have written it. I can't attribute it.
3. **`~/.claude.json`** changed, as expected (22:18:48).
4. **Baseline directories:** `~/.basic-memory`, `~/basic-memory`, `~/.config/superpowers`, `~/.config/episodic-memory`, and `~/.episodic-memory` are all still absent. `~/.cache/huggingface` is absent too.
5. **Summarizer stubs:** nine 126-byte `{"type":"ai-title"}` transcripts landed in the sandbox projects folders, despite `persistSession: false`. They come from the non-resume path, used for subagent transcripts. That path runs in the hook's cwd, so a stub titled about alpha landed in beta's folder. On a real install these land in real project folders. None landed outside the sandbox: I found 0 small `.jsonl` files newer than S1w in any other folder.
6. **The MCP `read` tool opens any absolute path** (`mcp-server.ts`, `fs.readFileSync(params.path)`), with no limit to the archive. One child guessed a non-archive path; it did not exist. Over 222 tool calls in 35 transcripts, that was the only path outside the sandbox.
7. **Data leaving the machine:**
   - The summarizer sends transcript content to Anthropic, separately from the session's own model calls.
   - The model download from `huggingface.co` sends only the request.
   - `npm install` uses the registry.
   - I found no other network code in `src/`.

## What the base did alone, and the gap per case

| Case | What the base did alone | Gap a wrapper would fill |
|---|---|---|
| C1, worktree context | Recalled the decision from the other checkout (S1r), because search ignores the project | A workstream key across checkouts. The `project` filter splits worktrees, so the wrapper must not use it, or must map checkouts to one repo. Nothing loads at start; recall depends on the model choosing to search |
| C2, "did we lose anything" | Captured everything with no save; S4r recovered the 410 decision. The archive is a copy, so it outlives Claude Code's 30-day transcript sweep (`sync.ts` never deletes) | A receipt: S4w and S5w each told the operator nothing was saved, unaware the archive would keep it. The wrapper also needs a fix for the skill-first indexing loss (§1). An index of the *operator's* text, prompts included, would do it, whatever the injected messages |
| C3, family repos | Worked (S5r): the archive is one global pile | Scoping by family, and a way to promote a fact to something more durable than a transcript |
| C4, procedures | Recalled the four release steps (S8r) | Promotion to a Playbook. The procedure lives only as a turn in a transcript, among restatements |
| C5, scripts | Recalled the flags once archived; missed on the hook path (S7r) | Freshness: sync without summaries, or at SessionEnd, so the lock isn't held for minutes. Tool results (the script's own text) are not indexed |
| C7, parallel sessions | No lost write. The archive is per-session files, and the lock serialised syncs | Nothing for capture. The lock's skip-and-defer is a freshness gap, not a loss |
| C8, support off-branch | Archived the finding, but the read failed (S2r). The prompt was dropped (§1), and the tool's own search prompts outranked it (§2) | Keep the search agent's own transcripts out of the index (it has a `DO NOT INDEX` marker the agent doesn't use). Index the operator's prompts. A support workstream to file findings under |

**Recommendation for the base decision.** episodic-memory is a sound *safety net* for C2: the archive is complete, durable, and found the decisions it indexed. Two assumptions limit that conclusion: the next session has to search, and the lock has to be free. As shipped, it needs three changes before the operator relies on it:

- run with `EPISODIC_MEMORY_SKIP_SUMMARIES=1`, for the settings breach and the lock hold;
- keep its search agent's transcripts out of the index;
- work around the skill-first indexing loss.

The first is an environment variable. The other two need a patch upstream or a wrapper, which I did not test.
