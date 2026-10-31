> Research for the `parallel-sessions` design, not yet planned. A research subagent gathered it on 2026-10-31 for the operator and Claude. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Claude Code's native worktree and parallel-session features

This report says what Claude Code itself offers for worktrees and for sessions running side by side. It proposes no design.

Build: `claude --version` printed `2.1.316 (Claude Code)`. The probes ran on 2.1.316, as each probe transcript's `version` field records. The research session that loaded the `EnterWorktree`, `ExitWorktree`, and `SendMessage` tool descriptions ran 2.1.312, found with `lsof` on its process.

Labels:

- **docs**: read in a page fetched on 2026-10-31. The link names the page and its section.
- **probe**: run on 2026-10-31 in a scratch repository. The run's ID, such as P-A, names its command in §Probes. A fact an earlier sidekick record measured carries **probe** and names that record.
- **inferred**: reasoned from docs or probes. Nothing tested it.

## Sources

Each page was fetched on 2026-10-31 as Markdown, by appending `.md` to the URL.

- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/common-workflows
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/tools-reference
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/claude-directory
- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/changelog
- https://json.schemastore.org/claude-code-settings.json, the schema the settings page links. That page warns it "can lag behind the newest CLI releases".
- `claude --help`, and `--help` for `rm`, `agents`, `attach`, `stop`, `respawn`, `logs`, and `purge`, run on 2.1.316.
- The `EnterWorktree`, `ExitWorktree`, and `SendMessage` tool descriptions as the 2.1.312 research session loaded them. They are the text the model reads.

Earlier records this one cites rather than repeats:

- [`../memory/2026-10-30-claude-code-mechanisms.md`](../memory/2026-10-30-claude-code-mechanisms.md), on memory, transcripts, and worktree keying.
- [`../memory/2026-10-31-auto-memory-location-probes.md`](../memory/2026-10-31-auto-memory-location-probes.md), on a `git worktree add` worktree and local settings.
- [`../control-centre/2026-10-14-dispatched-worker-probes.md`](../control-centre/2026-10-14-dispatched-worker-probes.md), on a background worker's worktree, messages, and `claude rm`.
- [`../control-centre/2026-10-14-dispatched-worker-bench.md`](../control-centre/2026-10-14-dispatched-worker-bench.md), on the isolation guard and stopping a finished worker.
- [`../control-centre/2026-10-15-desk-probes.md`](../control-centre/2026-10-15-desk-probes.md), on listing, deleting, and `ListAgents`.
- [`../control-centre/2026-10-22-main-and-worker-probes.md`](../control-centre/2026-10-22-main-and-worker-probes.md), on backgrounding a main and attaching.

## Summary

| Feature | What it does | Label |
|---|---|---|
| `claude --worktree <name>`, `-w` | Starts the session in `<repo root>/.claude/worktrees/<name>/` on a new branch `worktree-<name>` | docs; probe P-A |
| Exit from a `--worktree` session | Removes a clean, unnamed worktree. Prompts to keep or remove one that has work, is named, or can't be verified | docs |
| `-p --worktree` | Asks nothing at exit. The worktree and its git lock stay | docs; probe P-A |
| Resume into a worktree | `--resume` and `--continue` return the session to its worktree after checking it is still a separate checkout | docs |
| Isolation guard | Refuses edits, command directories, and git redirects aimed at the main checkout. It doesn't see what a shell command writes | docs |
| `EnterWorktree` | Creates `.claude/worktrees/<name>` on `worktree-<name>`, or enters an existing worktree by `path`. Its result carries the path and branch | docs; probe P-B |
| `ExitWorktree` | `keep` or `remove`. `remove` refuses over uncommitted files or unmerged commits unless `discard_changes` is true | docs; probe P-B |
| `.worktreeinclude` | Copies files that both match it and are gitignored into every worktree Claude Code creates with git. A `WorktreeCreate` hook skips it | docs; probe P-A, P-B, P-C |
| Agent `isolation: "worktree"` | Runs the subagent in `.claude/worktrees/agent-<agentId>` on `worktree-agent-<agentId>`. Removes it if unchanged. Returns the path and branch if kept | docs; probe P-C |
| `worktree.*` settings | `baseRef`, `bgIsolation`, `symlinkDirectories`, `sparsePaths`, and the desktop-only `location` | docs |
| `WorktreeCreate`, `WorktreeRemove` hooks | The first replaces git creation entirely. The second runs only for worktrees that hook made | docs |
| `claude --bg` and agent view | A background session moves into its own worktree before its first edit, commits, and pushes its branch | docs; probe in 2026-10-14 records |
| `claude rm` | Deletes a background session and its worktree when that is safe, or refuses and prints a flag to force it | docs; probe in 2026-10-14 records |
| Project resolution in a worktree | Transcripts follow the worktree. Auto memory and `settings.local.json` resolve to the main checkout. `CLAUDE.md` loads from the worktree | docs; probe P-A, P-B |
| Several repos | `--add-dir` grants file access and loads a few config types. `/cd` moves the session. A non-git parent folder can hold nested repos | docs |
| Cross-session messaging | `SendMessage` and `ListAgents` pass plain text between sessions on the machine. `notify_when_idle` sends one idle notice | docs |
| Agent teams | Experimental and off by default. Teammates share a task list and work in the lead's directory, without worktrees | docs |

## `claude --worktree`

**Location and branch.** `--worktree <name>` or `-w <name>` creates the worktree under `.claude/worktrees/<name>/` at the repository root, on a new branch `worktree-<name>`. Without a name, Claude Code generates one, such as `bright-running-fox` (docs: [worktrees §Start Claude in a worktree](https://code.claude.com/docs/en/worktrees#start-claude-in-a-worktree)). P-A's `-p --worktree pa` ran its first command in `.claude/worktrees/pa` on `worktree-pa` (probe P-A).

The docs place the folder "at your repository root" (docs: [worktrees](https://code.claude.com/docs/en/worktrees#start-claude-in-a-worktree)). That settles, on paper, where a session started in a subfolder puts it, which the 2026-10-14 probes left open.

**Base.** `worktree.baseRef` decides it, with two values (docs: [worktrees §Choose the base branch](https://code.claude.com/docs/en/worktrees#choose-the-base-branch)):

- `"fresh"`, the default, branches from `origin`'s default branch. Claude Code fetches that branch when the repository hasn't been fetched in 24 hours, with a five-second cap.
- With no remote, or no cached `origin/HEAD`, `"fresh"` falls back to the local `HEAD`. P-A's repository had no remote, and its worktree started at the main checkout's `HEAD` (probe P-A).
- `"head"` branches from the current local `HEAD`. Inside a worktree, that means the worktree's `HEAD`.
- The setting can't name a branch. To start from an existing branch, the docs say to run `git worktree add` yourself.

**From a pull request.** `--worktree "#1234"`, or a GitHub or GitLab URL, fetches that change's head from `origin` into `.claude/worktrees/pr-<number>` (docs: [worktrees §Branch from a pull request](https://code.claude.com/docs/en/worktrees#branch-from-a-pull-request)).

**Reusing a name.** An existing worktree of that name opens again. With `"fresh"`, it resets to the default branch only if all three hold (docs: [worktrees §Reuse a worktree name](https://code.claude.com/docs/en/worktrees#reuse-a-worktree-name)):

- it has no uncommitted or untracked files;
- it is still on the branch Claude Code made;
- it has no commits of its own, or its pull request merged with its remote branch deleted.

Claude Code reads the merged case from git alone: the remote branch is gone, and every commit is already on the default branch.

**Trust, tmux, and the marker.**

- An interactive `--worktree` run needs workspace trust. `claude -p --worktree` skips the check (docs: [worktrees](https://code.claude.com/docs/en/worktrees#start-claude-in-a-worktree)).
- `--tmux` opens a tmux session for the worktree, or iTerm2 panes where available (probe: `claude --help`).
- Claude Code marks each worktree it creates in the worktree's git metadata. The cleanup sweep keeps any worktree without that marker (docs: [worktrees §Clean up subagent and background-session worktrees](https://code.claude.com/docs/en/worktrees#clean-up-subagent-and-background-session-worktrees)).
- P-A's `.git/worktrees/pa/CLAUDE_BASE` held the base commit's sha (probe P-A). That this file is the marker is inferred.

**Exit.** Claude Code checks for changed or untracked files, uncommitted work in submodules, and new commits (docs: [worktrees §Clean up worktrees](https://code.claude.com/docs/en/worktrees#clean-up-worktrees)):

| State at exit | What Claude Code does |
|---|---|
| Clean, session unnamed | Removes the worktree and its branch without asking |
| Clean, session named | Prompts to keep or remove |
| Has work | Prompts. Keeping prints the `claude --worktree <name> --resume` line to return with |
| On another branch with commits past the start | Prompts. Either answer keeps that other branch |
| State can't be verified | Prompts, naming what it couldn't check |
| A `-p` run | Asks nothing and removes nothing. Its creation lock stays until a later session's stale-lock sweep |

P-A's worktree stayed after the run, locked as `claude session pa (pid 54911 start …)` (probe P-A). Version 2.1.304 fixed an exit that removed a worktree without asking while `HEAD` was detached or on another branch (docs: changelog).

**Resume.** A session that ended inside its worktree returns to it on `--resume` or `--continue`, interactive or `-p` (docs: [worktrees §Resume a worktree session](https://code.claude.com/docs/en/worktrees#resume-a-worktree-session)).

- Claude Code first checks that the worktree is still a checkout separate from the main one, and refuses one that fails.
- Launching from the main checkout always works for a worktree under `.claude/worktrees/`. Launching from inside some other worktrees is refused.
- `--fork-session` starts in the launch directory and leaves the worktree alone.
- A deleted worktree resumes in the launch directory, and Claude Code clears the binding.

## The isolation guard

Claude Code applies four checks while a session is isolated in a worktree. They cover the session and every subagent it spawns (docs: [worktrees §How Claude Code enforces isolation](https://code.claude.com/docs/en/worktrees#how-claude-code-enforces-isolation)):

- **File edits:** an `Edit`, `Write`, or `NotebookEdit` aimed at the main checkout is refused.
- **Command directory:** a Bash, PowerShell, or Monitor command is refused when its directory resolves to the main checkout. It is also refused when that can't be verified.
- **Git redirects:** `git -C`, `--git-dir`, `GIT_DIR`, `GIT_WORK_TREE`, or a `cd` into the main checkout before git is refused.
- **Command shape:** a command whose git use can't be verified from its text is refused, and the check can't be turned off.

The guard reads paths and command text only. A `cp` or a shell redirect that writes into the main checkout without running git there passes it (docs: same section). The guard covers the repository Claude Code was launched from, and the main checkout of a linked worktree.

The 2026-10-14 records measured the guard refusing `git -C . push`, `sh -c "git …"`, and a chained line mixing git with a shell variable. They also measured a worktree session reading the main checkout's gitignored files (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md) and [the bench record](../control-centre/2026-10-14-dispatched-worker-bench.md)).

## `EnterWorktree` and `ExitWorktree`

**When the model calls `EnterWorktree`.** Its description tells the model to call it "ONLY when explicitly instructed": the user says "worktree", or `CLAUDE.md` or memory directs it. A request for a branch, a bug fix, or a feature doesn't qualify (docs: the tool description, 2.1.312).

A background session is the exception. Its `worktree.bgIsolation` default blocks edits until it calls the tool. The 2026-10-14 probes saw one call it unprompted before its first edit (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md)).

**Where it puts the worktree.** A `name` creates `.claude/worktrees/<name>` on `worktree-<name>`, branched by `worktree.baseRef` (docs: the tool description). P-B's call with `{"name": "pb"}` returned `worktreePath`, `worktreeBranch` `worktree-pb`, and a message (probe P-B).

**Entering an existing worktree.** A `path` enters one instead (docs: [tools-reference](https://code.claude.com/docs/en/tools-reference) and the tool description):

- On first entry, the path must appear in `git worktree list` for the current repository, or for a repository nested inside a multi-repo workspace.
- A path outside `.claude/worktrees/` asks for approval. A permission rule doesn't suppress that prompt; only `bypassPermissions` skips it ([worktrees §Ask Claude to create a worktree](https://code.claude.com/docs/en/worktrees#ask-claude-to-create-a-worktree)).
- Inside a worktree session, a new `name` is refused. Only a `path` under the same repository's `.claude/worktrees/` works.
- Switching leaves the previous worktree on disk. Worktrees visited earlier stop being writable until the session enters them again.

The tools-reference table marks `EnterWorktree` as needing permission and `ExitWorktree` as not (docs: [tools-reference](https://code.claude.com/docs/en/tools-reference)).

**What `ExitWorktree` does with changes.** It takes `action`, `keep` or `remove`, and an optional `discard_changes` (docs: the tool description; [Agent SDK TypeScript reference §ExitWorktree](https://code.claude.com/docs/en/agent-sdk/typescript)):

- It acts only on a worktree that `EnterWorktree` created in this session. It never touches a `git worktree add` worktree or one from an earlier session, and is a no-op otherwise.
- `remove` refuses when the worktree has uncommitted files or commits not on the original branch, unless `discard_changes` is `true`.
- It restores the original directory and clears directory-dependent caches: system prompt sections, memory files, and the plans directory.
- A tmux session attached to the worktree dies on `remove` and survives `keep`.
- The model is told not to call it unless the user asks.
- Subagents with `isolation: worktree` don't get it.

P-B's `remove` without the flag returned: "Worktree has 1 uncommitted file. Removing will discard this work permanently. Confirm with the user, then re-invoke with discard_changes: true — or use action: "keep" to preserve the worktree." The one file was a `node_modules` symlink, as §Settings explains (probe P-B).

**At session end.** A session still inside the worktree prompts to keep or remove it on exit (docs: the tool description). A `-p` session asks nothing. P-B's `pb` stayed on disk, locked as `claude session pb (pid 56152 …)` (probe P-B).

**The transcript follows.** P-B's session started in the main checkout and entered `pb`. Its transcript sits in `pb`'s own project folder, not the main checkout's (probe P-B). The docs say the transcript moves on entering and on exiting (docs: [worktrees §Resume a worktree session](https://code.claude.com/docs/en/worktrees#resume-a-worktree-session)).

**Hooks.** After entry, `${CLAUDE_PROJECT_DIR}` stays at the launch root, and a hook's `cwd` input follows Claude into the worktree (docs: [worktrees](https://code.claude.com/docs/en/worktrees#ask-claude-to-create-a-worktree)). P-B's `CwdChanged` hook logged nothing when `EnterWorktree` moved the session. P-C's same hook fired for a Bash `cd sub` (probe P-B, P-C, one headless run each).

## `.worktreeinclude`

**Semantics.** `.worktreeinclude` sits at the project root and uses `.gitignore` syntax (docs: [worktrees §Copy gitignored files into worktrees](https://code.claude.com/docs/en/worktrees#copy-gitignored-files-into-worktrees)). Claude Code copies a file only when it both matches a pattern and is gitignored, so it never duplicates a tracked file.

A `**/` pattern reaches into a wholly ignored directory only when that directory matches, or the first name after `**/` is in its path. The fix for that case landed in 2.1.239.

**Which creation paths honour it.** The docs say "every worktree Claude Code creates with git". They name `--worktree`, subagent worktrees, and the desktop app's parallel sessions. A `WorktreeCreate` hook skips it, so the hook must copy the files (docs: same section; [hooks §WorktreeCreate](https://code.claude.com/docs/en/hooks#worktreecreate)).

| Creation path | `.env` copied | Label |
|---|---|---|
| `claude -p --worktree` | Yes | probe P-A |
| `EnterWorktree` from a `-p` session | Yes | probe P-B |
| Agent `isolation: "worktree"` | Yes | probe P-C |
| A background session, by `EnterWorktree` and by `--bg --worktree` | Yes, on 2.1.299 | probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md) |
| A `WorktreeCreate` hook | No | docs |

## Agent `isolation: "worktree"`

**How it is set.** Per call, as `isolation: "worktree"` on the Agent tool, or as `isolation: worktree` in a subagent's frontmatter (docs: [worktrees §Isolate subagents with worktrees](https://code.claude.com/docs/en/worktrees#isolate-subagents-with-worktrees)). The SDK's `AgentInput` also allows `"remote"`, which dispatches a cloud session (docs: [Agent SDK TypeScript reference §Agent](https://code.claude.com/docs/en/agent-sdk/typescript)).

**Location and branch.** The docs say only "a temporary worktree", in the default location under `.claude/worktrees/`. P-C's two subagents ran in `.claude/worktrees/agent-<agentId>` on `worktree-agent-<agentId>`, such as `agent-ab9b546f535a6dfab` (probe P-C).

**Base.** The same as `--worktree`: the default branch unless `worktree.baseRef` is `"head"`. It is not the parent session's `HEAD` by default (docs: [sub-agents §Supported frontmatter fields](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)).

**Cleanup.** A subagent that finishes without changes has its worktree removed. One with changes keeps it until the sweep can remove it without losing work (docs: [worktrees](https://code.claude.com/docs/en/worktrees#isolate-subagents-with-worktrees)).

- In P-C, the subagent that made no change left no worktree and no branch.
- The one that committed left its worktree, unlocked, with its branch at its commit `35220c0` (probe P-C).
- Claude Code holds a `git worktree lock` while the agent runs and releases it when the agent finishes (docs: [worktrees §Worktree locks and manual removal](https://code.claude.com/docs/en/worktrees#worktree-locks-and-manual-removal)).

**What returns to the parent.** The Agent result's `completed` variant carries `worktreePath` and `worktreeBranch` when Claude Code kept the worktree (docs: [Agent SDK TypeScript reference §Agent](https://code.claude.com/docs/en/agent-sdk/typescript)).

- In P-C, the committing subagent's result held both fields, and the unchanged one's held neither (probe P-C).
- The result's text is the subagent's final report inside a `[Subagent hand-back]` frame (probe P-C).
- No page describes Claude Code merging the branch back. Integration is left to the parent (inferred).

**What it loads.** A subagent in its own worktree takes its instruction files from the main conversation. In the default location, it doesn't load the worktree's `CLAUDE.md` or `.claude/rules/` as it reads files there, even if the branch's copies differ (docs: [worktrees](https://code.claude.com/docs/en/worktrees#isolate-subagents-with-worktrees)).

**Hooks and files.** P-C's `SubagentStart` and `SubagentStop` hooks received the subagent's worktree as `cwd` (probe P-C). The parent's transcript folder held `subagents/agent-<id>.meta.json`. It recorded `worktreePath` and `worktreeBranch` for the kept worktree, and `"worktreeCleanlyRemoved": true` for the other (probe P-C). The docs call transcript files internal, so these files are not an interface (docs: [sessions §Where transcripts are stored](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored)).

**With agent teams on.** A call that passes `isolation` launches a subagent, never a teammate. Frontmatter `isolation` doesn't stop a named call becoming a teammate, which then runs in the main session's directory (docs: [sub-agents](https://code.claude.com/docs/en/sub-agents)). `/batch` runs 5 to 30 worktree-isolated background subagents (docs: [commands](https://code.claude.com/docs/en/commands)).

## Settings

| Key | Values and scope | What it does | Label |
|---|---|---|---|
| `worktree.baseRef` | `"fresh"` (default) or `"head"`; any file | Base for `--worktree`, `EnterWorktree`, isolated subagents, and background sessions | docs |
| `worktree.bgIsolation` | `"worktree"` (default) or `"none"`; any file | `"worktree"` blocks `Edit` and `Write` in the main checkout until a background session calls `EnterWorktree`. `"none"` lets it edit in place | docs |
| `worktree.symlinkDirectories` | Paths relative to the repo root; any file | Symlinks those directories from the main repository into each worktree | docs; probe P-A |
| `worktree.sparsePaths` | Paths relative to the repo root; any file | Sparse-checks out only those paths plus root files. Turns on `extensions.worktreeConfig` while a sparse worktree exists | docs |
| `worktree.location` | Absolute or `~/` path; user settings on the remote machine | Desktop SSH sessions only. `--worktree`, `EnterWorktree`, subagents, and background sessions ignore it | docs |
| `cleanupPeriodDays` | Integer, default 30 | Age past which the sweep removes subagent and background-session worktrees that hold no work | docs |
| `crossSessionInbound` | `accept`, `hold`, `refuse` | What a session does with messages from other sessions | docs |
| `dialogExpiry` | Duration or `"never"`; five minutes by default | How long a held message's approval waits | docs |
| `permissions.additionalDirectories` | Paths | File access only, with no configuration loaded | docs |
| `disableAgentView`, `leftArrowOpensAgents` | Boolean | Turn off background sessions and agent view; turn off `←` opening agent view | docs |
| `teammateMode` | `auto`, `in-process`, `tmux`, `iterm2` | How agent-team teammates display | docs (schema) |

Sources: [settings-reference §Agents, sessions, and worktrees](https://code.claude.com/docs/en/settings-reference#worktree), [worktrees §Clean up subagent and background-session worktrees](https://code.claude.com/docs/en/worktrees#clean-up-subagent-and-background-session-worktrees), and [cross-session-messaging §Control inbound messages](https://code.claude.com/docs/en/cross-session-messaging#control-inbound-messages).

**The JSON schema lags.** Its `worktree` object sets `additionalProperties: false` and lists `baseRef`, `bgIsolation`, `symlinkDirectories`, and `sparsePaths`. It has no `location`, and no `crossSessionInbound` at all (docs: the schema, fetched 2026-10-31). An editor validating against it would flag `worktree.location` (inferred).

**A symlinked directory can read as untracked work.** P-A set `symlinkDirectories: ["node_modules"]` in a repository whose `.gitignore` held `node_modules/`.

- The worktree got a link to the main checkout's `node_modules` (probe P-A).
- `git status --short`, run in the worktree from outside Claude Code, printed `?? node_modules` (probe P-A).
- A trailing-slash pattern matches only directories, and git treats the link as a file. `git check-ignore` matched a bare `node_modules` and not `node_modules/` (probe P-D).
- P-B's `ExitWorktree` `remove` refused over that one file (probe P-B).
- `git worktree remove --force` deleted the link and left the main checkout's `node_modules/dep.txt` in place (probe P-D).

With a trailing-slash pattern, every symlinked worktree therefore looks dirty to the exit prompt, the sweep, and `claude rm` as well (inferred).

## The `WorktreeCreate` and `WorktreeRemove` hooks

**`WorktreeCreate` replaces git creation entirely** (docs: [hooks §WorktreeCreate](https://code.claude.com/docs/en/hooks#worktreecreate)).

- It fires for `--worktree`, `EnterWorktree`, subagent isolation, workflow agents, background-session isolation, and `claude remote-control` in `worktree` mode.
- It doesn't fire for a `git worktree add` run through Bash.
- A plugin's copy doesn't fire with `--worktree --tmux`, and fired with `--worktree` alone only from 2.1.300.
- Input adds `name`. Output is the path, as stdout's last non-empty line or as `hookSpecificOutput.worktreePath` over HTTP.
- `.worktreeinclude` isn't processed, and the transcript stays at the launch directory.
- The returned path must not pass through a symlink inside the repository.

**`WorktreeRemove` runs only for worktrees that `WorktreeCreate` made** (docs: [hooks §WorktreeRemove](https://code.claude.com/docs/en/hooks#worktreeremove)).

- It fires on a remove at exit, an automatic remove at exit, a background-session delete, an `ExitWorktree` remove, and a `remote-control` cleanup.
- It doesn't fire when a subagent or workflow agent finishes. Their hook-made worktrees stay for you to remove.
- A non-zero exit with the directory still present fails the removal. Its JSON output is discarded, so it can't block in any other way.
- Claude Code never deletes a hook-made worktree's branch. The hook must.

**Nothing fires after a git-created worktree appears.** `WorktreeCreate` replaces creation, and `WorktreeRemove` covers only hook-made worktrees (inferred from the two sections).

- The nearest observers measured are `SessionStart`'s `cwd` under `--worktree` (probe P-A) and `SubagentStart`'s `cwd` (probe P-C).
- `CwdChanged` did not fire on `EnterWorktree` (probe P-B).
- A `PostToolUse` hook on `EnterWorktree` would see the tool's result (inferred, not probed).

**`DirectoryAdded`** fires after `/add-dir` adds a directory mid-session, in the background, with a 600-second timeout. The docs suggest it for "installing its dependencies". It doesn't fire for `--add-dir` at startup (docs: [hooks §DirectoryAdded](https://code.claude.com/docs/en/hooks#directoryadded)).

## Background sessions and agent view

**Starting one** (docs: [agent-view §Dispatch an agent from your shell](https://code.claude.com/docs/en/agent-view#dispatch-an-agent-from-your-shell)):

- `claude --bg "<prompt>"` starts a session in the background, with `--name` for its row and `--agent` for a subagent definition.
- `--resume <id> --bg` continues that session under its own id, from 2.1.257, or starts a copy and says so.
- `--bg --exec '<command>'` runs a shell job with no model.
- `--bg` with `-p` is refused.
- An untrusted folder shows the trust dialog, or exits with `Workspace not trusted` from a script.
- `/background`, `/bg`, and `←` move the current session. `/fork` copies it into a new background session.

**How a background session is isolated.** It starts in the working directory. Before editing, Claude moves it into a worktree under `.claude/worktrees/` (docs: [agent-view §How file edits are isolated](https://code.claude.com/docs/en/agent-view#how-file-edits-are-isolated)). The 2026-10-14 probes saw that move happen through `EnterWorktree` (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md)). Claude skips the worktree in five cases:

- the session was moved to the background with `←` or `/background`, and keeps editing where it was;
- it already runs inside a linked worktree, made by Claude or by `git worktree add`;
- the file being edited is inside a linked worktree;
- the folder isn't a git repository and no `WorktreeCreate` hook is set;
- the write is outside the working directory.

Until the move, `Edit`, `Write`, and `NotebookEdit` are refused on the shared checkout (docs: same section). The four guard checks apply "once the session is in its worktree". So a background session's Bash is unguarded before its move (inferred). `claude --bg --worktree <name>` isolates it from its first command (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md), on 2.1.299).

**Git defaults** for a session that made changes in a worktree it entered (docs: [agent-view §How file edits are isolated](https://code.claude.com/docs/en/agent-view#how-file-edits-are-isolated)):

- it commits without asking, and pushes the branch when the repository has a remote;
- it opens a draft pull request when the task calls for one;
- it never pushes to `main` or `master`, never force-pushes, and never merges;
- git instructions in the task, `CLAUDE.md`, or memory take precedence;
- a session editing a checkout it didn't isolate itself still asks before committing or switching branches;
- it ends with a report naming where the work is: a path, a branch, a pull request, or the answer.

**What a delete removes** (docs: [agent-view §What deleting a session removes](https://code.claude.com/docs/en/agent-view#what-deleting-a-session-removes)):

| Worktree state | Agent view, `Ctrl+X` twice | `claude rm <id>` |
|---|---|---|
| Uncommitted changes | Removes them with the worktree | Keeps the session and worktree |
| Another running session uses or locks it | Keeps both, row reads `not deleted` | Keeps both, names the other process |
| Commits not saved elsewhere | Refuses, naming the branch and count. Deleting again discards | Refuses and prints `--discard-unpushed <commit>@<worktree-id>` (2.1.260 and later) |
| Git or the hook can't remove it | Refuses, names the cause. Deleting again removes the directory | Refuses and prints `--force-remove-worktree <worktree-id>` (2.1.268 and later); the branch stays |
| A worktree you made and started the session in | Left in place | Left in place |

Commits on a remote don't block a delete. Neither do commits on the local copy of `origin`'s default branch, while the main checkout has that branch checked out. The second rule dates from 2.1.248 (docs: same section and its version history).

`claude rm` exited 0 whether it removed or kept, in every 2026-10-14 run (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md), not re-run on 2.1.316).

**Shell commands** (docs: [agent-view §Manage sessions from the shell](https://code.claude.com/docs/en/agent-view#manage-sessions-from-the-shell); probe: each `--help`):

| Command | Purpose |
|---|---|
| `claude agents`, `--cwd <path>`, `--json [--all]` | Open agent view, scoped to a folder, or print sessions as JSON |
| `claude attach <id\|name>` | Open a session in this terminal. A name, or part of one, works only while its process runs (2.1.290 and later) |
| `claude logs <id\|name>` | Print recent output |
| `claude stop <id>`, `kill` | Stop it. The transcript and the worktree stay |
| `claude respawn <id>`, `--all` | Restart onto the current binary |
| `claude rm <id>` | Delete it, and its worktree when safe. Works on sessions that already exited |
| `claude daemon status`, `logs`, `stop --any` | Inspect or stop the supervisor |

**Hosting.** A supervisor process runs every background session. The supervisor stops an unattached session that finished or waits on you after about an hour, unless it is pinned with `Ctrl+T`. The session resumes on attach or reply (docs: [agent-view §The supervisor process](https://code.claude.com/docs/en/agent-view#the-supervisor-process)).

A backgrounded session holds its worktree's lock while it runs, from 2.1.248. The sweep then leaves the worktree alone, and `git worktree remove` refuses it (docs: [worktrees §Worktree locks and manual removal](https://code.claude.com/docs/en/worktrees#worktree-locks-and-manual-removal)).

**The sweep.** It removes subagent and background-session worktrees older than `cleanupPeriodDays` (docs: [worktrees](https://code.claude.com/docs/en/worktrees#clean-up-subagent-and-background-session-worktrees)). It keeps a worktree in these cases:

- it holds changed or untracked files, or unpushed commits;
- a submodule in it holds work, or can't be inspected;
- it belongs to a `--worktree` session that was never backgrounded;
- you made it with `git worktree add`.

Agent view's troubleshooting section says leftover directories can still pile up in `.claude/worktrees/`. A directory git no longer recognises must be removed by hand (docs: [agent-view §`.claude/worktrees/` is filling up](https://code.claude.com/docs/en/agent-view)).

## How a worktree session resolves its project

| What | Resolves to | Label |
|---|---|---|
| Transcripts | `~/.claude/projects/<path-derived name>/`, so each worktree path gets its own folder | docs: [sessions §Where transcripts are stored](https://code.claude.com/docs/en/sessions#where-transcripts-are-stored); probe P-A, P-B |
| Transcript on entering or exiting | Moves to the new directory's folder. A hook-made worktree's transcript stays at the launch directory | docs: [worktrees](https://code.claude.com/docs/en/worktrees#resume-a-worktree-session); probe P-B |
| Isolated subagents' transcripts | Stay under the parent session's folder, in `subagents/` | probe P-C |
| Auto memory | One folder per repository, shared across worktrees | docs: [memory](https://code.claude.com/docs/en/memory) |
| Auto memory, measured | P-A's `--worktree` session created an empty `memory/` under the main checkout's path key, before any main-checkout session ran | probe P-A |
| `.claude/settings.local.json` | The main checkout's root, except outside git, at a home-directory root, on Windows, or under foreign ownership | docs: [settings §Where Claude Code keeps the local file](https://code.claude.com/docs/en/settings#where-claude-code-keeps-the-local-file-in-a-git-repository) |
| "Don't ask again" approvals | Saved to the main checkout's local file, so they apply in every worktree | docs: [worktrees §What worktrees share](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout) |
| `.claude/settings.json` | Read from the session's primary working directory: for a CLI worktree session, the worktree's committed copy | docs: [settings](https://code.claude.com/docs/en/settings); the worktree part inferred |
| Desktop-app worktree sessions | Settings, hooks, skills, agents, commands, and `.mcp.json` from the main checkout's root | docs: [worktrees](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout) |
| `CLAUDE.md`, `.claude/rules/` | Load from the worktree | docs: [worktrees](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout) |
| `CLAUDE.local.md` | Exists only in the worktree where it was made | docs: [memory](https://code.claude.com/docs/en/memory) |
| Skills, agents, commands | The worktree's own `.claude/skills` if it has one. Otherwise the main checkout's, read through (skills from 2.1.277) | docs: [worktrees](https://code.claude.com/docs/en/worktrees#what-worktrees-share-with-the-main-checkout) |
| Project-scope plugins | Load in every worktree of the repository | docs: same section |
| Hook paths | `${CLAUDE_PROJECT_DIR}` stays at the launch root; `cwd` follows Claude | docs: [hooks §Reference scripts by path](https://code.claude.com/docs/en/hooks) |
| Resume picker | The current worktree by default. `Ctrl+W` widens to all the repository's worktrees. `--resume <id>` and a name search the repository and its worktrees first | docs: [sessions §Where the session picker looks](https://code.claude.com/docs/en/sessions#where-the-session-picker-looks) |

The memory record of 2026-10-30 left open whether the memory key is the git common directory or the repository root. P-A's folder name is the main working tree's path, not the path of `.git` (probe P-A). The 2026-10-31 record measured a `git worktree add` worktree reading the main checkout's local `autoMemoryDirectory`, `additionalDirectories`, and `env` ([the auto-memory location record](../memory/2026-10-31-auto-memory-location-probes.md)).

`claude purge <path>` deletes one project's transcripts, auto memory, tasks, debug logs, file history, history lines, and its `~/.claude.json` entry. `--dry-run` lists the plan (docs: [claude-directory §Clear local data](https://code.claude.com/docs/en/claude-directory); probe: `claude purge --help`). Purging the main checkout's path would delete the repository's shared memory with it, since memory lives under that key (inferred).

## Several repositories in one session

**Additional directories grant file access, not configuration** (docs: [permissions §Additional directories](https://code.claude.com/docs/en/permissions#additional-directories-grant-file-access-not-configuration)):

| Loaded from the directory | `--add-dir`, `/add-dir` | `permissions.additionalDirectories` |
|---|---|---|
| File access | Yes | Yes |
| `.claude/skills/` | Yes, with live reload | No |
| `.claude/commands/`, `.claude/agents/` | Yes, without live reload | No |
| `.claude/settings*.json` | `enabledPlugins` and `extraKnownMarketplaces` only | No |
| `CLAUDE.md`, `.claude/rules/`, `CLAUDE.local.md` | Only with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` | No |

The 2026-10-31 memory record measured this split from a worktree. A settings-listed folder was writable but its `CLAUDE.md` didn't load, while `--add-dir` loaded it ([the auto-memory location record](../memory/2026-10-31-auto-memory-location-probes.md)).

**`/cd <path>`** moves the session's primary working directory and keeps the conversation (docs: [permissions §Move the session to another directory](https://code.claude.com/docs/en/permissions#move-the-session-to-another-directory)):

- From 2.1.246 it applies the new directory's settings, hooks, `.mcp.json` servers, plugins, skills, and subagents at once.
- It moves the session's storage, so `--resume` finds it from the new directory.
- `Cd` permission rules restrict or disable it. The model can't call it.

**A multi-repo workspace** is a non-git folder that holds several repositories.

- On first entry, `EnterWorktree` can target a worktree of a repository nested inside it, from 2.1.203 (docs: [tools-reference](https://code.claude.com/docs/en/tools-reference); changelog 2.1.203).
- A background session dispatched from such a folder can isolate in a nested repository's worktree (docs: [agent-view](https://code.claude.com/docs/en/agent-view) version history, 2.1.214).

**The guard names one repository.** It covers the launch repository and a linked worktree's main checkout (docs: [worktrees](https://code.claude.com/docs/en/worktrees#how-claude-code-enforces-isolation)). A second repository added with `--add-dir` gets no worktree checks (inferred).

Cloud sessions and Projects at claude.ai can hold several repositories (docs: [agents](https://code.claude.com/docs/en/agents)). They run off this machine, and this report doesn't cover them.

## Cross-session coordination

**Reach.** `ListAgents` and `SendMessage` need 2.1.224 or later (docs: [cross-session-messaging](https://code.claude.com/docs/en/cross-session-messaging)).

- `ListAgents` lists subagents, teammates, and the other local sessions with an inbox socket, background ones included.
- It also lists cloud and Remote Control sessions while this session is connected to Remote Control.
- Same-machine messages travel over a per-session socket, never through Anthropic servers.
- A `-p` session binds a socket and can receive. A `--bare` session can't.

**Delivery.** A message reaches the receiver between tool calls, or starts a turn when the receiver is idle. It counts as usage like a typed prompt (docs: [cross-session-messaging §Message delivery](https://code.claude.com/docs/en/cross-session-messaging)).

A subagent's send goes out under its parent's address, and replies reach the parent (docs: the `SendMessage` description).

**Inbound control.** `crossSessionInbound` sets `accept`, `hold`, or `refuse` (docs: [cross-session-messaging §Control inbound messages](https://code.claude.com/docs/en/cross-session-messaging#control-inbound-messages)).

- Unset, the default splits sessions into those that bypass permission prompts and those that don't. A message crossing the split is held for approval.
- A held dialog expires after `dialogExpiry`, five minutes by default. In an unattached background session, the dialog stays open until someone attaches.
- To let a `-p` worker take messages unattended, give it `crossSessionInbound: "accept"` in `--settings`.

The 2026-10-14 probes measured a default-mode worker holding a bypassing sender's message until it expired (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md)).

**`notify_when_idle`** asks a session for one notice when it next goes idle or exits (docs: [cross-session-messaging §Get a notice when another session goes idle](https://code.claude.com/docs/en/cross-session-messaging#get-a-notice-when-another-session-goes-idle)):

- it is one-shot, from 2.1.236 in both sessions;
- only the main conversation can subscribe, and only to sessions on this machine;
- without a message, it costs the watched session nothing;
- an unanswered subscription is dropped after 12 hours;
- `refuse` on either side means no notice, and `hold` strips the one-line status.

**What a message cannot do** (docs: [cross-session-messaging §How a session treats an incoming message](https://code.claude.com/docs/en/cross-session-messaging#how-a-session-treats-an-incoming-message); the `SendMessage` description):

- it can't answer a permission prompt or count as the user's consent;
- the receiver is told never to change permissions, `CLAUDE.md`, or other configuration because a peer asked;
- a slash command in it arrives as text and never runs;
- an `@` path or resource attaches nothing;
- the sender is told never to ask a peer for an action its own session denied, which the docs call permission laundering;
- it carries plain text only, up to about a million characters. Bursts are refused, loops are throttled, and at most 50 accepted and 100 held messages queue (docs: [§Limitations](https://code.claude.com/docs/en/cross-session-messaging#limitations)).

The desktop app has its own cross-session surface, which sees only the sessions the desktop app runs (docs: [desktop §Work across sessions](https://code.claude.com/docs/en/desktop)). It misses terminal sessions, even in worktrees of the same project. From a mod, `ListAgents` took 609 ms and returned no `state` or `waitingFor` (probe in [the desk record](../control-centre/2026-10-15-desk-probes.md)).

**Agent teams exist but are experimental** (docs: [agent-teams](https://code.claude.com/docs/en/agent-teams)):

- They are off unless `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set.
- The lead starts teammates through the Agent tool with a `name`, and doesn't ask for confirmation.
- Teammates share a task list under `~/.claude/tasks/<team>/`, and exchange mailbox files under `~/.claude/teams/<team>/inboxes/`.
- A session has one team. Teammates can't spawn teammates, and the lead is fixed.
- Teammates aren't isolated in worktrees. The docs advise splitting the work so each owns different files (docs: [agents §Choose an approach](https://code.claude.com/docs/en/agents)).

## Changelog, 2.1.226 to 2.1.316

Selected entries from 8 August to 31 October 2026 that bear on worktrees and parallel sessions (docs: [changelog](https://code.claude.com/docs/en/changelog)).

| Version, date | Change |
|---|---|
| 2.1.233, 14 Aug | `--worktree` takes GitLab merge-request URLs |
| 2.1.236, 19 Aug | `SendMessage` gains `notify_when_idle` |
| 2.1.239, 21 Aug | `ListAgents` names the session itself and lists teammates. Fixed `**/` patterns in `.worktreeinclude` matching nothing inside an ignored directory |
| 2.1.246, 25 Aug | The sweep no longer removes worktrees you made under `.claude/worktrees/` that an old record named |
| 2.1.248, 27 Aug | A backgrounded worktree session holds the worktree's lock. `claude rm` accepts commits merged into a checked-out local default branch |
| 2.1.251, 28 Aug | Background sessions can edit inside a worktree they made with `git worktree add` |
| 2.1.257, 1 Sep | `--resume <id> --bg` continues in place. `/add-dir` and `additionalDirectories` refuse network paths. The guard stops refusing loops, `$VAR` reads, and heredocs that never touch git |
| 2.1.260, 3 Sep | A refused delete names branch and count, and a second delete discards |
| 2.1.265, 8 Sep | `--worktree` checks out in parallel on large repositories (git 2.32 and later) |
| 2.1.268, 10 Sep | A stuck delete names its cause; a second `Ctrl+X` removes the directory |
| 2.1.271, 14 Sep | Held messages leave a trace for headless senders |
| 2.1.274, 17 Sep | Submodule checks before removing an agent worktree. The guard refuses certain nested shell expansions |
| 2.1.277, 18 Sep | Untracked project skills load in `--worktree` sessions |
| 2.1.281, 23 Sep | `/batch` runs where a `WorktreeCreate` hook makes the worktrees. `--setting-sources` reaches `/bg`, agent view, teammates, and `--worktree --tmux` sessions |
| 2.1.286, 30 Sep | Isolated subagents stop loading the project `CLAUDE.md` a second time from the worktree copy |
| 2.1.290, 5 Oct | Background subagents keep write access after the main session enters or exits a worktree |
| 2.1.295, 8 Oct | Subagents in their own worktree see that worktree's git status, not the parent's |
| 2.1.299, 14 Oct | The exit's resume line uses `-w` and `-r` when the long form doesn't fit |
| 2.1.300, 14 Oct | Plugin `WorktreeCreate` and `WorktreeRemove` hooks run with `--worktree`. Several reftable and bare-repository fixes |
| 2.1.301, 15 Oct | Quitting no longer removes a hook-made worktree that may hold unpushed commits without asking |
| 2.1.304, 19 Oct | `--worktree` no longer removes the worktree without asking when `HEAD` is detached or on another branch |
| 2.1.305, 20 Oct | Unchanged subagent worktrees are cleaned up reliably |
| 2.1.309, 22 Oct | Worktree creation stops on-demand object fetches. The guard refuses some locale-prefixed commands |
| 2.1.311, 26 Oct | A subagent's worktree is no longer removed while a background subagent it started still works there |
| 2.1.314, 30 Oct | Sandbox protections apply to a worktree entered by `-p --resume` or `--continue` |

One older entry qualifies a gap in §Gaps. 2.1.105, 13 April, reads "Improved stale agent worktree cleanup to remove worktrees whose PR was squash-merged instead of keeping them indefinitely" (docs: changelog).

## Where the current docs differ from earlier records

- **A stopped session's state.** The 2026-10-14 bench and the 2026-10-15 desk record measured a session that had finished its turn listing as `done` after `claude stop`. The docs still say `stopped` ([agent-view §Read session state from a script](https://code.claude.com/docs/en/agent-view)). Not re-measured.
- **`blocked` after a finished turn.** The 2026-10-22 record saw a backgrounded main read `blocked` after a one-word reply. The docs now say a finished turn reads `done`, and `blocked` "always means the session needs something from you". Not re-measured.
- **What counts as unpushed.** The 2026-10-14 probes inferred that `claude rm` counts commits no `refs/remotes/*` ref reaches. The docs add a second exemption from 2.1.248: commits on the local copy of `origin`'s default branch, checked out in the main checkout. Integration into any other branch, such as a `milestone/<name>` branch, gets no such exemption (inferred).
- **The memory key.** The 2026-10-30 record left it open. P-A shows the main working tree's path (probe P-A).
- **A subfolder launch.** The 2026-10-14 probes left open where the worktree goes. The docs say the repository root, which no probe here tested.

## Gaps: what the native features don't do

Each line is inferred from the pages read, unless it names a probe.

1. **No overlap detection.** Nothing detects two parallel branches touching the same files. A search of the fetched pages for "conflict", "overlap", "same files", and "collide" found only advice. The advice is to partition the work, or to keep parallel sessions off the same files. Cross-session messages warn only when a Claude decides to send one.
2. **No recognition of rebase or squash integration.** `claude rm`, agent view's delete, and the `--worktree` reuse reset test whether commits are reachable from a remote ref or the checked-out local default branch. A rebase or squash makes new commits, so the old branch reads unpushed and needs `--discard-unpushed`. The 2.1.105 entry claims squash-merge recognition for the stale sweep, and the current worktrees page lists only "unpushed commits". Neither was probed.
3. **No merge back.** A background session never merges, and an isolated subagent returns a path and a branch. Nothing integrates a worktree's branch into the parent.
4. **No cross-repo coordination.** Worktrees, the guard, `baseRef`, and the sweep act on one repository. Messages reach sessions in any repository on the machine, but only as text. Agent teams are one per session, in the lead's directory.
5. **No hook for preparing or cleaning a git-made worktree.** `WorktreeCreate` replaces creation, losing `.worktreeinclude` and branch deletion. `WorktreeRemove` fires only for hook-made worktrees. `CwdChanged` didn't fire on `EnterWorktree` (probe P-B).
6. **Shared dependencies can block cleanup.** `symlinkDirectories` avoids a second install, but a trailing-slash ignore pattern leaves the link untracked, and the worktree reads dirty (probe P-A, P-B, P-D). A real install inside a worktree is ignored rather than untracked, so removal deletes it without asking.
7. **Fixed location and naming in the CLI.** Worktrees go under `<repo>/.claude/worktrees/` on `worktree-<name>`, unless a `WorktreeCreate` hook replaces creation. `worktree.location` and the desktop's branch prefix don't apply to the CLI. `baseRef` can't name a branch.
8. **Leftovers.** A `-p` worktree stays locked (probe P-A, P-B). Each worktree path leaves a project folder under `~/.claude/projects/` after the worktree goes (probe P-A, P-B). `claude purge <path>` clears one.
9. **Writes the guard can't see.** The guard doesn't see a shell command writing into the main checkout (docs). Before its move, a background session's Bash isn't guarded at all.
10. **A silent `claude rm` result.** Its exit status doesn't tell a removal from a refusal (probe in [the probes record](../control-centre/2026-10-14-dispatched-worker-probes.md)).

## Probes

**Setup.** Git 2.50.1. A scratch repository `wt-repo` sat under the session's scratchpad, on `main` with one commit and no remote.

- Its `.gitignore` held `node_modules/`, `.env`, and `.claude/worktrees/`, and its `.worktreeinclude` held `.env`.
- The main checkout held a gitignored `node_modules/dep.txt` and `.env`.
- Every run used a wrapper that unset the parent session's `CLAUDE*` and `SIDEKICK*` variables, then ran `claude -p --model haiku --permission-mode bypassPermissions`.
- Hooks in `--settings` appended their input JSON to a log in the scratchpad.
- `-p` skips the trust check, so no trust entry was written.
- No background session ran, and nothing under `~/.claude` was edited by hand.

**P-A**, a `--worktree` session, with `SessionStart` and `CwdChanged` logging and `"worktree":{"symlinkDirectories":["node_modules"]}`:

```sh
run.sh -p --model haiku --worktree pa --permission-mode bypassPermissions --settings '<json>' \
  "Run each of these as a separate Bash call and report each output verbatim: pwd ; git branch --show-current ; git status --short ; ls -la node_modules .env ; cat .env"
git -C wt-repo/.claude/worktrees/pa status --short
git -C wt-repo worktree list --porcelain
cat wt-repo/.git/worktrees/pa/CLAUDE_BASE
ls ~/.claude/projects | grep probes-wt-repo
stat -f %SB ~/.claude/projects/<main key>/memory
```

**P-B**, `EnterWorktree` and `ExitWorktree` from the main checkout, with the P-A settings and stream-JSON output:

```sh
run.sh -p --model haiku --permission-mode bypassPermissions --output-format stream-json --verbose --settings '<json>' \
  "… call EnterWorktree with name pb … run pwd … call ExitWorktree with action remove and no discard_changes … report every tool result verbatim" < /dev/null
```

**P-C**, two subagents with `isolation: "worktree"`, one that commits and one that changes nothing, then a Bash `cd sub && pwd` as the `CwdChanged` control. The hooks were `SessionStart`, `CwdChanged`, `SubagentStart`, and `SubagentStop`:

```sh
run.sh -p --model haiku --permission-mode bypassPermissions --output-format stream-json --verbose --settings '<json>' \
  "… call the Agent tool with isolation \"worktree\" and run_in_background false … create sub1.txt, git add, git commit … then a second Agent call that changes nothing … then run: cd sub && pwd" < /dev/null
git -C wt-repo worktree list --porcelain
cat ~/.claude/projects/<main key>/<session>/subagents/agent-*.meta.json
```

**P-D**, git alone, in `pb`'s worktree:

```sh
git check-ignore -v node_modules
git -c core.excludesFile=<file holding node_modules> check-ignore -v node_modules
git worktree remove --force .claude/worktrees/<name>   # then: ls node_modules in the main checkout
```

**Cleanup.** Each probe worktree was unlocked and removed with `git worktree remove --force`, and its branch deleted. `claude agents --json --all` listed no session in the scratch repository. The probe transcripts stay in three `~/.claude/projects/` folders whose names end in `probes-wt-repo`, beside an empty `memory/`. `claude purge <path> --dry-run` lists them.

## Not checked

- The interactive exit prompt, and keep or remove at an interactive exit.
- A background session's isolation, `.worktreeinclude`, and `claude rm` on 2.1.316. This report relies on the 2.1.299 records.
- Squash-merge handling by `claude rm`, the sweep, or the reuse reset.
- `CwdChanged` on `EnterWorktree` in an interactive session.
- `--tmux`, `WorktreeCreate`, and `WorktreeRemove`.
- A `PostToolUse` hook on `EnterWorktree`.
- `worktree.sparsePaths`, and a session started in a subfolder.
