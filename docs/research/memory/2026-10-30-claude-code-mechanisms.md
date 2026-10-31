> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. Gathered 2026-10-30 by a research subagent for the operator and Claude. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Claude Code mechanisms for a personal memory store

Build: `claude --version` printed `2.1.314 (Claude Code)`, not 2.1.312 as expected. Answers apply to 2.1.314 and to the docs fetched on 2026-10-30.

Labels used below:
- **[docs]** confirmed in the official docs; the URL and section are given.
- **[local]** observed on this machine; the command is shown.
- **[unconfirmed]** neither the docs nor local observation settled it.

The docs pages read are hooks, memory, settings-reference, tools-reference, sessions, claude-directory, env-vars, and permissions, under https://code.claude.com/docs/en/, fetched 2026-10-30. Line numbers below refer to session-local copies of those pages, which were not kept; cite the section names instead.

---

## 1. `autoMemoryDirectory`

**Scopes that accept it.** [docs] https://code.claude.com/docs/en/settings-reference (index row and `### autoMemoryDirectory`): Scope is "Any file", meaning user, project, local, and managed. Memory page, "Storage location": "It is read from any settings scope: user, project, local, policy, or `--settings`."

**Refused for security?** No scope is refused outright. [docs] settings-reference `### autoMemoryDirectory`: "From project or local settings, Claude Code honors this key under the same workspace trust rule as hooks."

Two passages conflict and I could not resolve it:
- The trust-rule sentence above.
- [docs] settings-reference, under `blockReadsOutsideWorkingDirectories` (hooks copy line 1067): "When `autoMemoryDirectory` comes from the project's `.claude/settings.json`, or from a `.claude/settings.local.json` treated as repository-supplied, Claude Code loads no auto memory from that directory and saves none to it."

The trust table in https://code.claude.com/docs/en/permissions (section "What runs before you trust a folder") does not list `autoMemoryDirectory`. [unconfirmed] which rule applies. Test before relying on a repo-supplied path.

**Path form.** [docs] settings-reference: "Type: string, an absolute or `~/`-prefixed directory path." Tilde is expanded. Relative paths are not listed as valid. Default is unset, which gives `~/.claude/projects/<project>/memory/`.

**Per repo.** [docs] settings-reference: local settings apply to "You, in this one project only." Setting the key in `<repo>/.claude/settings.local.json` therefore affects only that repo. There is no variable expansion in the docs, so each repo needs its own absolute path to get its own folder. [unconfirmed] whether the folder is used flat or gets a `<project>` subfolder when this key is set. The docs say only "store auto memory in a directory of your choice instead of the per-project default."

**Switch off.**
- Setting: `autoMemoryEnabled` (Boolean, default `true`, any scope). When `false`, Claude neither reads nor writes the auto memory directory. [docs] settings-reference `### autoMemoryEnabled`.
- Env var: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` disables it. `0` forces it on, even when `--bare` or `autoMemoryEnabled: false` would turn it off. The env var wins over the key for one session, in either direction. [docs] env-vars table row, and settings-reference.
- `/memory` toggle writes `autoMemoryEnabled` to `~/.claude/settings.json`. It cannot turn memory on in a background session or in a session started by another Claude Code session. [docs] memory page, "Enable or disable auto memory."

---

## 2. Keying, worktrees, non-git folders

**Key.** [docs] https://code.claude.com/docs/en/memory "Storage location": "The `<project>` path is derived from the git repository, so all worktrees and subdirectories within the same repo share one auto memory directory. Outside a git repo, the project root is used instead." [unconfirmed] whether the key is the git common dir or the repo root. The docs do not say.

**Worktrees, with local evidence.**
- [docs] memory page, summary table: auto memory is "Per repository, shared across worktrees."
- [local] `ls ~/.claude/projects/` shows `-Users-roberto-sousa-Documents-Projects-sidekick/memory/` (MEMORY.md plus about 40 topic files).
- [local] The sidekick worktree project folders, such as `-Users-roberto-sousa-Documents-Projects-sidekick--claude-worktrees-p7-desk/`, hold transcripts (for example `…/e21776e8-6527-4c57-9c2b-6746549c54c2.jsonl`) and no `memory/` folder. Ten such folders were checked with `test -d`.
- [local] `…-scratchpad-desk-probes-repo/memory/` exists, and its child `…desk-probes-repo--claude-worktrees-dk-wt1/` has none.
- Reading: this fits the docs. Absence of `memory/` in a worktree folder is also what you would see if those sessions wrote no memory, so it is not proof.
- `claude --worktree <name>` creates `.claude/worktrees/<name>/` on branch `worktree-<name>`, and EnterWorktree moves a session into that tree. [docs] https://code.claude.com/docs/en/worktrees "Start Claude in a worktree" and "Ask Claude to create a worktree."
- Plain `git worktree add`: the memory docs key by "the git repository", so they should apply. [unconfirmed] locally, because no plain-`git worktree add` session was checked.

**Non-git folder.** [docs] "Outside a git repo, the project root is used instead." [local] No current non-git example was observed. `~/.claude/projects/-Users-roberto-sousa-Documents-CV/memory/` and `…-AI-DPA/memory/` exist, but `cd` to those source paths fails. They are orphaned folders, not evidence.

---

## 3. What loads at session start, and what Claude is told

**Load limit.** [docs] https://code.claude.com/docs/en/memory "Storage location" and "How auto memory works": "The first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first, are loaded at the start of every conversation. Content beyond that threshold is not loaded at session start." Topic files are read on demand.

**Write-time enforcement.** [docs] memory page: after Claude writes `MEMORY.md`, Claude Code checks it against the limits. Near a limit, Claude is reminded to shorten it. Over a limit, the write succeeds, but Claude gets an error telling it to rewrite the index.

**What Claude is told about writing.** [docs] the memory page describes behaviour: Claude decides what is worth saving and skips anything derivable from the codebase. The system prompt is not published; https://code.claude.com/docs/en/settings "Change a setting for one session" says so. [unconfirmed] the exact wording given to the model.

**Retention.** [docs] claude-directory "Cleaned up automatically" and the memory page: the memory directory is excluded from the `cleanupPeriodDays` sweep. `MEMORY.md` and topic files stay until edited or deleted.

**Machine-local.** [docs] memory page: "Files are not shared across machines or cloud environments."

**Relation to `/memory`.** [docs] memory page, "View and edit with `/memory`": `/memory` lists CLAUDE.md, CLAUDE.local.md, and other memory locations; toggles auto memory (writing `autoMemoryEnabled`); and opens the auto memory folder. `/context` lists which CLAUDE.md and rules files loaded at launch.

---

## 4. CLAUDE.md imports

**External paths.** [docs] https://code.claude.com/docs/en/memory "Import additional files": an import is external "when its path resolves outside your working directory, like the home directory import above." Example from the docs: `@~/.claude/my-project-instructions.md`. So `@~/store/project/hot.md` is an external import.

**Approval.** [docs] same section, warning block: "The first time Claude Code encounters external imports in a project, it shows an approval dialog listing the files. If you decline, the imports stay disabled and the dialog doesn't appear again." The approval is remembered per project. The docs do not say where it is stored. [unconfirmed] the storage location.

User-scope imports, meaning `~/.claude/CLAUDE.md` and `~/.claude/rules/`, load without the dialog, except in Cowork sessions on desktop. [docs] same warning block.

**CLAUDE.local.md.** [docs] memory page, "Project instructions": still supported. It loads alongside CLAUDE.md. The docs say to add it to `.gitignore`. If you use several worktrees, "a gitignored `CLAUDE.local.md` only exists in the worktree where you created it." The docs recommend importing a home-directory file instead.

**Worktrees.** [docs] https://code.claude.com/docs/en/worktrees "What worktrees share with the main checkout": CLAUDE.md and `.claude/rules/` still load from the worktree. Home-directory imports resolve from `~`, so they are the same in every worktree. [unconfirmed] that import resolution inside a worktree behaves as the docs' wording implies. I did not test it.

Imports are expanded into the context of the file that imports them, so they cost context. [docs] memory page, "Size."

---

## 5. Hooks

**Common input fields.** [docs] https://code.claude.com/docs/en/hooks "Common input fields" (hooks.md:726): `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`, `prompt_id`, `scratchpad_dir`, `effort`. `transcript_path` "is written asynchronously and may lag the in-memory conversation."

**SessionStart** (hooks.md:1232, "SessionStart input").
- `source`: `startup`, `resume`, `clear`, `compact`, `fork`. Matchers use the same values.
- `cwd` and `transcript_path`: common fields.
- Also `model`, `agent_type`, `session_title`, and, for resume or fork, `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`.
- `additionalContext` cap: [docs] hooks.md:1050. A hook's `additionalContext`, `systemMessage`, `initialUserMessage`, and plain stdout are each capped at 10,000 characters. Over the cap, Claude Code saves the text to a file in the session directory and gives Claude the path plus a 2,000-character preview. Claude is not asked to read the file. There is no setting to raise the cap.
- Timing: SessionStart hooks run in the background at launch, but Claude's first response waits for them.

**SessionEnd** (hooks.md:3548).
- `reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other`. `bypass_permissions_disabled` was removed in v2.1.234.
- `transcript_path`: yes, as a common field.
- Timeout: the budget is 1.5 seconds by default. It applies on exit, on `/clear`, and on switching with `/resume`. A per-hook `timeout` raises the budget to the highest per-hook value in settings, up to 60 seconds. Timeouts set on plugin-provided hooks do not raise it. `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` sets the budget, and is the default for each hook (v2.1.268+).
- Killed on exit? The docs say a hook that reaches its timeout is canceled. They do not say whether a hook still running after exit is killed. [unconfirmed] beyond the timeout rule.
- Implication: a `claude -p` summary is viable only with a per-hook timeout in user or project settings, at most 60 seconds. A plugin cannot raise the budget.
- No decision control: `systemMessage` and other JSON output are discarded.

**PreCompact** (hooks.md:3280).
- Matcher: `manual` (`/compact`) or `auto` (auto-compact and idle compaction).
- Input: `trigger`, `custom_instructions` (null for auto, and when `/compact` has no argument), plus the common fields, which include `transcript_path`.
- Block: exit code 2, or `"decision": "block"` with a `reason`. For manual compaction, stderr is shown to the user. For proactive auto-compaction, the compaction is skipped. If it was triggered by a context-limit error, the error surfaces.
- Inject: no. The PreCompact decision row lists only `decision` and `reason`. `systemMessage` and `continue` are discarded.
- Alternative: PostCompact (hooks.md, "PostCompact input") receives `compact_summary`, which is the generated summary. That is the hook to capture a summary.

**Stop** (hooks.md:2732).
- Fires when the main agent finishes responding. Not on a user interrupt. API errors fire StopFailure.
- Input: `stop_hook_active` (true when the hook is already continuing the turn), `last_assistant_message`, `background_tasks`, `session_crons`.
- Continue: `decision: "block"` with `reason`, or exit code 2 with stderr. `hookSpecificOutput.additionalContext` gives non-error feedback labelled "Stop hook feedback."
- Loop prevention: check `stop_hook_active`. Claude Code also caps consecutive continuations at 8. The count resets when Claude calls a tool. `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises the cap.

**SubagentStop** (hooks.md:2585). Same decision format. Input includes `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path` (in the nested `subagents/` folder), `transcript_path` (the main session's), and `last_assistant_message`.

**Plugin hooks.** [docs] https://code.claude.com/docs/en/plugins/components "Hooks": a plugin's `hooks/hooks.json` has the same shape as the `hooks` object in settings. Its scope is "When plugin is enabled" (hooks.md:247). I read no per-event exclusion for plugins. [unconfirmed] that every event in this report works from a plugin, because I did not test each one.

**CLAUDE_PLUGIN_DATA.** [docs] https://code.claude.com/docs/en/plugins/components "Reference plugin paths and store data": a directory "that survives updates, for `node_modules`, virtual environments, and caches. It resolves to `~/.claude/plugins/data/<id>/` and is created when first referenced." `<id>` is the plugin identifier with characters other than letters, digits, `_`, and `-` replaced by `-`. Hook processes receive it as an env var.
- [local] `ls ~/.claude/plugins/data/` lists `accesslint-accesslint`, `deskprobe-inline`, `envprobe-inline`, `hookify-claude-plugins-official`, `planprobe-inline`.
- [unconfirmed] what uninstall does to this folder.

---

## 6. Plugin settings

[docs] https://code.claude.com/docs/en/plugins/components "Default settings": a plugin's `settings.json` (or the `settings` manifest key) takes effect only for `agent` and `subagentStatusLine`. "Every other key is dropped." A plugin therefore cannot set or default `autoMemoryDirectory`, `autoMemoryEnabled`, or `cleanupPeriodDays`.

`pluginConfigs` is "User or managed" scope (settings-reference index). It stores answers to a plugin's configuration dialog. It is not a path for overriding settings.

---

## 7. Edit and Write staleness and concurrency

**Edit** [docs] https://code.claude.com/docs/en/tools-reference "Edit tool behavior":
- Read-before-edit. Opus 4.6, Haiku 4.5, and older models always require a read. Newer models can edit an unread file when reading it would not need a permission prompt.
- A file changed on disk after the last read is not refused outright. It can still be edited when `old_string` matches the current content exactly and once. Otherwise Claude must re-read the file.

**Write** [docs] tools-reference "Write tool behavior":
- For Opus 4.6, Haiku 4.5, and older models, a Write to an existing file that was not read fails.
- Newer models can overwrite an unread file under the same conditions as Edit.
- Jupyter notebooks and partially read files always need the read.
- New files never need a read.
- The docs describe no check that a file changed on disk since the last read. [unconfirmed] whether the implementation has one.

**Two sessions appending to one file.** No file lock or merge is documented for Edit or Write. Write replaces the whole file. Edit replaces an exact string. [docs] sessions.md "Branch a session": resuming the same session in two terminals without forking makes messages "interleave into one transcript." [unconfirmed] behaviour when two sessions write one memory file. Inference from the tool rules: a last-writer-wins overwrite is possible. Unique filenames per session avoid it.

---

## 8. Session transcripts

**Location and naming.** [docs] https://code.claude.com/docs/en/sessions "Where transcripts are stored": `~/.claude/projects/<project>/<session-id>.jsonl`. `<project>` is the working directory path with non-alphanumeric characters replaced by `-`. Paths longer than 200 characters are truncated and suffixed with a hash. `CLAUDE_CONFIG_DIR` moves the root. `CLAUDE_CODE_PROJECT_DIR_NAME` names the folder (v2.1.234+, set beside `CLAUDE_CONFIG_DIR`).

**Format.** [docs] same section: JSONL. "The entry format is internal to Claude Code and changes between versions, so scripts that parse these files directly can break." Use `/export` or the `claude -p --output-format json` interfaces instead.

**Subagent and tool output.** [docs] claude-directory "Cleaned up automatically": subagent transcripts are in `<project>/<session>/subagents/`, and large tool outputs are in `<project>/<session>/tool-results/`.

**Retention.** [docs] settings-reference `### cleanupPeriodDays`: default `30`, minimum `1`. Claude Code deletes old transcripts in a background sweep after a session starts. Memory files are excluded (memory page). `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1` stops transcript writes (env-vars).

**Worktree sessions.** [local] Transcripts sit under the worktree's own folder, for example `-Users-roberto-sousa-Documents-Projects-sidekick--claude-worktrees-p7-desk/e21776e8-….jsonl`. [docs] worktrees "Resume a worktree session": "When Claude enters or exits a worktree that Claude Code created with git, the transcript follows." So a worktree session's transcript is in its own project folder, not the main checkout's.

---

## Implications for the design (inference, not documented)

- A single user-level `autoMemoryDirectory` points every project at one folder. Whether project subfolders get added is [unconfirmed]. Test it with two repos before you build on it.
- Per-repo folders need a distinct absolute path in each repo's `.claude/settings.local.json`. Whether a repo-supplied path is honored is unresolved (section 1).
- Hook writers must use unique filenames per session. Nothing documented prevents two sessions from overwriting one file.
- A SessionEnd summary needs a per-hook `timeout` in user or project settings, up to 60 seconds, and cannot use a plugin's timeout.
- PreCompact cannot inject context. Use PostCompact's `compact_summary` instead.

## Not checked

- Exact model-facing wording of the auto memory instructions.
- Where the external-import approval is stored.
- Behaviour of plain `git worktree add` sessions for memory.
- Non-git folder behaviour in practice.
- Two-session write races.
- Whether every hook event works from a plugin.
