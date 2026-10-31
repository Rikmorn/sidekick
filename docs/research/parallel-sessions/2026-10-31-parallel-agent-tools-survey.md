> Research for the `parallel-sessions` design, not yet planned. A research subagent gathered it on 2026-10-31 for the operator and Claude. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Community tools and practice for parallel coding-agent sessions

This report surveys the tools and the documented practice for running several coding-agent sessions at once. It proposes no design. Claude Code's own features get a short section here, because [2026-10-31-claude-code-worktree-features.md](./2026-10-31-claude-code-worktree-features.md) covers them in depth.

Labels:

- **[V n]**: read at source n on 2026-10-31. Every source in §Sources was read that day.
- **[S n]**: taken from a search-result excerpt of source n, not read at the page itself.
- **[I]**: an inference from what was read, not stated by any source.

Stars, licences, last push, last release, and repository renames come from the GitHub REST API on 2026-10-31 [V 64]. A rename shows as the API answering an old `owner/repo` with a new `full_name`. Source files were read on `main` and are cited at the `main` commit fetched the same hour. No tool was installed or run.

## Sources

Claude Code and other agents' built-ins:

1. Claude Code docs, "Run parallel sessions with worktrees": https://code.claude.com/docs/en/worktrees
2. Claude Code docs, "Run agents in parallel": https://code.claude.com/docs/en/agents
3. Claude Code docs, "Message your other Claude Code sessions": https://code.claude.com/docs/en/cross-session-messaging
4. Claude Code docs, "Common workflows", §Run parallel sessions with worktrees: https://code.claude.com/docs/en/common-workflows
5. Claude Code docs, memory page on `--add-dir` (search excerpt only): https://code.claude.com/docs/en/memory
6. Codex, "Git worktrees" (redirected from `developers.openai.com/codex/app/worktrees`): https://learn.chatgpt.com/docs/environments/git-worktrees
7. Codex, "Cloud environment": https://learn.chatgpt.com/docs/environments/cloud-environment
8. Cursor docs, "Worktrees": https://cursor.com/docs/configuration/worktrees
9. Cursor docs, "Cloud agents": https://cursor.com/docs/cloud-agent

Worktree CLIs:

10. worktrunk README: https://github.com/max-sixty/worktrunk
11. worktrunk, Claude Code integration: https://worktrunk.dev/claude-code/
12. worktrunk, `wt remove`: https://worktrunk.dev/remove/
13. worktrunk, tips and patterns: https://worktrunk.dev/tips-patterns/
14. git-worktree-runner (gtr) README: https://github.com/coderabbitai/git-worktree-runner
15. gwq README: https://github.com/d-kuro/gwq
16. workmux README: https://github.com/raine/workmux
17. ccmanager README: https://github.com/kbwo/ccmanager
18. Claude Squad README: https://github.com/smtg-ai/claude-squad
19. Claude Squad source, `session/tmux/tmux.go`: https://github.com/smtg-ai/claude-squad/blob/ce1ffb4392b0/session/tmux/tmux.go
20. uzi README: https://github.com/devflowinc/uzi

Desktop orchestrators:

21. Conductor, workspaces and branches: https://www.conductor.build/docs/concepts/workspaces-and-branches
22. Conductor, scripts reference: https://www.conductor.build/docs/reference/scripts
23. Conductor, parallel agents: https://www.conductor.build/docs/concepts/parallel-agents
24. Conductor, settings reference: https://www.conductor.build/docs/reference/settings/reference
25. Conductor, "Run multiple Claude Code sessions": https://www.conductor.build/docs/guides/parallel-agents/run-multiple-claude-code-sessions
26. Conductor's published agent skill file: https://www.conductor.build/.well-known/agent-skills/conductor/SKILL.md
27. Paradev README: https://github.com/ParadevAI/Paradev
28. Paradev source, `apps/desktop/docs/EXTERNAL_FILES.md`: https://github.com/ParadevAI/Paradev/blob/0dcd64a0a405/apps/desktop/docs/EXTERNAL_FILES.md
29. Emdash README: https://github.com/generalaction/emdash
30. Emdash source, Claude hooks: https://github.com/generalaction/emdash/blob/ab766e8fbb43/packages/plugins/src/agents/impl/claude/hooks.ts
31. Crystal README: https://github.com/stravu/crystal
32. Nimbalyst docs, worktrees: https://nimbalyst.com/docs/developer-features/worktrees/
33. Nimbalyst source, `ClaudeSettingsManager.ts`: https://github.com/nimbalyst/nimbalyst/blob/46472d85f885/packages/electron/src/main/services/ClaudeSettingsManager.ts
34. Jean README: https://github.com/coollabsio/jean
35. Jean source, `jean-core/src/claude_cli/commands.rs`: https://github.com/coollabsio/jean/blob/89a40c911568/jean-core/src/claude_cli/commands.rs
36. Sculptor README: https://github.com/imbue-ai/sculptor
37. Sculptor source, Claude Code harness: https://github.com/imbue-ai/sculptor/blob/ea2a9dffea13/sculptor/sculptor/agents/default/claude_code_sdk/harness.py
38. Xum README: https://github.com/coder/xum
39. vibe-kanban README: https://github.com/BloopAI/vibe-kanban
40. vibe-kanban source, Claude executor: https://github.com/BloopAI/vibe-kanban/blob/7c3807084daa/crates/executors/src/executors/claude.rs
41. bloop's shutdown post, 2026-04-10: https://vibekanban.com/blog/shutdown
42. vibe-kanban docs, repositories: https://www.vibekanban.com/docs/workspaces/repositories
43. Agent Orchestrator README: https://github.com/OrchestratorInc/agent-orchestrator
44. Agent Orchestrator source, Claude Code hooks: https://github.com/OrchestratorInc/agent-orchestrator/blob/1ead72090666/backend/internal/adapters/agent/claudecode/hooks.go
45. ComposioHQ-era Agent Orchestrator multi-project guide (search excerpt; the page returned HTTP 410): https://www.mintlify.com/ComposioHQ/agent-orchestrator/guides/multi-project

Fleets, collisions, and containers:

46. Gas Town README: https://github.com/gastownhall/gastown
47. Gas Town, `docs/HOOKS.md`: https://github.com/gastownhall/gastown/blob/466aa41c83ee/docs/HOOKS.md
48. The New Stack on Gas Town (search excerpt): https://thenewstack.io/steve-yegges-ai-agent-orchestration-project-gas-town-comes-to-the-cloud-and-brings-the-wasteland-with-it/
49. Clash README: https://github.com/clash-sh/clash
50. Scott Chacon, "Managing Multiple Claude Code Sessions Without Worktrees": https://blog.gitbutler.com/parallel-claude-code
51. GitButler docs, Claude Code hooks (search excerpt; the page returned HTTP 404): https://docs.gitbutler.com/features/ai-integration/claude-code-hooks
52. Eric Allam, "We ditched worktrees for Claude Code", Trigger.dev, 2026-04-16: https://trigger.dev/blog/parallel-agents-gitbutler
53. container-use README: https://github.com/dagger/container-use
54. container-use docs, environment configuration: https://container-use.com/environment-configuration

Multi-repo tools:

55. Android docs, repo command reference: https://source.android.com/docs/setup/reference/repo
56. meta README: https://github.com/mateodelnorte/meta
57. VS Code docs, multi-root workspaces: https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces

Practice:

58. incident.io, "How we're shipping faster with Claude Code and Git Worktrees", 2025-06-27: https://incident.io/blog/shipping-faster-with-claude-code-and-git-worktrees
59. Simon Willison, "Embracing the parallel coding agent lifestyle", 2025-10-05: https://simonwillison.net/2025/Oct/5/parallel-coding-agents/
60. Xu, Subramanian, and Karthik, "AI Agent Pull Requests on GitHub: Frequency, Structure, and Merge Conflict Rates", arXiv:2607.04697, July 2026: https://arxiv.org/abs/2607.04697
61. "Ask HN: Is it actually possible to run multiple coding sessions in parallel?": https://news.ycombinator.com/item?id=47573483
62. anthropics/claude-code#24798, "Inter-session communication for multi-Claude workflows": https://github.com/anthropics/claude-code/issues/24798
63. Sahil Kathpal, Grass blog, 2026-05-14: https://codeongrass.com/blog/parallel-worktrees-conflict-prediction/

Metadata and repositories known only from it:

64. GitHub REST API, `https://api.github.com/repos/{owner}/{repo}` and its `/releases` endpoint
65. grove (behaviour from a search excerpt): https://github.com/jossmoff/grove
66. ericclemmons/workspace (behaviour from a search excerpt): https://github.com/ericclemmons/workspace
67. mani: https://github.com/alajmo/mani
68. gita: https://github.com/nosarthur/gita

## Summary

- **Claude Code ships the single-repo substrate itself.** It offers `--worktree`, `.worktreeinclude`, `WorktreeCreate` and `WorktreeRemove` hooks, isolation checks, agent view, and cross-session messaging [V 1, 2, 3]. It has no port, database, or conflict-prediction support [V 1].
- **`.worktreeinclude` is a shared convention.** Claude Code, the Codex app, Conductor, ccmanager, and worktrunk all read it [V 1, 6, 24, 17, 13]. Each copies the gitignored files it names into a new worktree.
- **worktrunk is the most complete thin CLI for one repo.** It has lifecycle hooks, a stable per-branch port, a per-branch database recipe, and squash-aware merge detection [V 12, 13]. Its Claude Code plugin takes over Claude Code's worktree creation [V 11]. It has no multi-repo mode [V 10].
- **Few tools predict collisions.** Clash checks every worktree pair with `git merge-tree` and can gate edits through a `PreToolUse` hook [V 49]. Gas Town is the only tool with a merge queue [V 46]. The rest leave conflicts to merge time.
- **No mature local tool runs one task across sibling repos.** vibe-kanban has multi-repo workspaces, but its company shut down in April 2026 [V 41, 42]. Cursor's cloud agents work across repos in the cloud [V 9]. Classic tools such as `repo` and `meta` coordinate repos with no agent awareness [V 55, 56].
- **Several desktop tools write user-level agent config.** Paradev and Emdash merge hook entries into Claude Code's user settings [V 28, 30]. Jean refreshes Claude Code's OAuth token and writes the new credentials back [V 35]. Gas Town and Agent Orchestrator keep their hooks out of `~/.claude` [V 47, 44].
- **Five failure modes have the strongest evidence.** They are the review bottleneck, colliding ports and databases, and per-worktree installs and disk. Late merge conflicts and the human acting as message bus complete them (§Documented failure modes).

## Patterns this survey reads against

The operator stated three patterns on 2026-10-31:

- **P1.** Several features in one repo at once, each in its own worktree where possible. The features may or may not touch the same files.
- **P2.** Support work on the main branch, such as production issues and reporting, while features run elsewhere.
- **P3.** One full-stack feature across several sibling repos, with one objective.

## Claude Code itself

[2026-10-31-claude-code-worktree-features.md](./2026-10-31-claude-code-worktree-features.md) covers these features with probes. This section keeps only what the comparison needs.

- **Creation.** `claude --worktree <name>` creates `.claude/worktrees/<name>/` on branch `worktree-<name>` [V 1]. The base is origin's default branch unless `worktree.baseRef` is `"head"` [V 1].
- **Environment.** The docs leave setup to you: "ask Claude to install dependencies, or run your project's setup yourself" [V 1]. `.worktreeinclude` copies gitignored files such as `.env` [V 1].
- **Replacement hooks.** A `WorktreeCreate` hook replaces the git logic entirely, and Claude Code then skips `.worktreeinclude` [V 1].
- **Cleanup.** An interactive session that exits clean and unnamed loses its worktree. A session whose worktree holds work asks whether to keep it. A `-p` run cleans nothing [V 1]. A sweep removes subagent and background worktrees past `cleanupPeriodDays` unless they hold work [V 1].
- **Merged-branch detection.** A reopened worktree resets only when its remote branch is gone and every commit is already on the default branch [V 1]. A squash-merged branch fails the second test, so it reopens at its old tip [I].
- **Isolation checks.** A worktree session cannot edit files in the main checkout or run git there [V 1]. The checks do not track `cp` or shell redirects into the main checkout [V 1].
- **What worktrees share.** They share the `.git` directory and project-scope plugins [V 1]. A "don't ask again" approval in a worktree saves to the main checkout's `.claude/settings.local.json` [V 1].
- **Awareness.** `claude agents` opens agent view over background sessions [V 2]. `ListAgents` and `SendMessage` reach every local session, other directories included, and Remote Control or cloud sessions [V 3]. A session can ask for one notice when another goes idle [V 3].
- **Teams.** Agent teams do not isolate teammates in worktrees, so the docs say to partition files between them [V 2].
- **Several repos.** `--add-dir` grants access to more directories. Their `CLAUDE.md` files load only with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` [S 5].

## Other agents' built-ins

### Codex app and cloud

- **Worktree mode.** Codex creates managed worktrees in `$CODEX_HOME/worktrees` on a detached HEAD, and carries uncommitted changes across [V 6].
- **Handoff.** Handoff moves a chat between Local and Worktree, and Codex runs the git steps [V 6]. Local mode is a documented way to keep work in the main checkout [V 6].
- **Setup and cleanup.** A local environment's setup script runs per new worktree [V 6]. `.worktreeinclude` decides which ignored files move in a handoff [V 6]. Codex keeps the 15 most recent managed worktrees by default and snapshots one before deleting it [V 6].
- **Cloud.** Each task gets a container with the repo, a setup script with internet access, and agent internet access off by default [V 7]. The result is a diff that becomes a PR [V 7]. The page describes one repo per task [V 7].

### Cursor

- **Worktree setup.** `.cursor/worktrees.json` takes per-OS setup keys, each a command list or script [V 8]. The docs show copying `.env` from `$ROOT_WORKTREE_PATH` and advise against symlinking dependencies [V 8].
- **Cleanup.** Cursor 3.5 caps worktrees at 25 per machine by default [V 8]. Its cleanup can delete worktrees created outside the manager, including those from `git worktree add` [V 8]. That reaches worktrees another tool made [I].
- **Comparison runs.** `/best-of-n` runs one task in several worktrees, and you pick a winner [V 8].
- **Cloud agents.** They run in cloud VMs set up from `.cursor/environment.json` or snapshots [V 9]. They can run in multi-repo environments, make coordinated changes, and open a PR in each repo they change [V 9].

## Worktree CLIs

### worktrunk

Status: about 9.6k stars, last release v0.81.0 on 2026-10-20, MIT OR Apache-2.0 by its README badge [V 10, 64].

- **(a) Setup.** Hooks run on create, post-start, pre-merge, post-merge, and pre-remove [V 10, 13]. `wt step copy-ignored` copies gitignored files and caches, and `.worktreeinclude` narrows the copy [V 13].
- **(a) Ports and databases.** The `hash_port` filter gives each branch a stable port in 10000 to 19999 [V 13]. A documented recipe starts a Postgres container per branch at post-start and stops it at pre-remove [V 13]. `wt step tether` stops a dev server when its worktree goes [V 13].
- **(b) Integration.** `wt merge` squashes, rebases, merges, and cleans up in one command [V 10]. `wt remove` runs six checks for whether a branch is already integrated [V 12].
- **(b) Squash detection.** Two of those checks catch squash merges: a simulated merge that adds nothing, and a patch-id match [V 12]. The walk is capped, so an old squash merge needs `-D` [V 12].
- **(c) Collisions.** None documented [V 10].
- **(d) Awareness.** `wt list` shows ahead and behind counts, CI, and AI summaries [V 10]. The agent plugin sets "working" and "waiting" markers through hooks, and a killed agent can leave a stale one [V 11].
- **(e) Several repos.** No multi-repo mode [V 10, 13].
- **(f) Sessions and `~/.claude`.** `wt switch -x claude` launches an agent, or worktrunk runs alongside one [V 10]. The plugin installs through Claude Code's marketplace [V 11]. It registers `WorktreeCreate` and `WorktreeRemove` hooks that route Claude Code's worktrees through `wt` [V 11]. A `PermissionRequest` hook auto-approves entering certain worktrees [V 11].

### git-worktree-runner (gtr)

Status: about 1.8k stars, v3.0.0 on 2026-10-28, Apache-2.0 [V 64]. CodeRabbit publishes it.

- **(a)** `git gtr new <branch>` creates the worktree, copies files matching `gtr.copy.include` or `.gtrconfig`, and runs `postCreate` hooks [V 14]. No port or database support [V 14].
- **(b)** `git gtr clean --merged` removes worktrees whose PRs merged, asking `gh` or `glab` [V 14]. Asking the host catches squash merges too [I].
- **(c, d)** No conflict detection; `git gtr list` shows branches and status [V 14].
- **(e)** Each repository is scoped on its own; a separate multi-repo guide exists but was not read [V 14].
- **(f)** `git gtr ai <branch>` starts the configured tool, such as `claude` [V 14]. All configuration lives in `git config` and `.gtrconfig`; the README never mentions `~/.claude` [V 14].

### gwq

Status: about 480 stars, v0.1.2 on 2026-10-02, Apache-2.0 [V 64].

- **(a)** Worktrees sit in a ghq-like tree, such as `~/worktrees/github.com/user/myapp/feature-auth/` [V 15]. `copy_files` and `setup_commands` set a worktree up, and a local `.gwq.toml` must be trusted first [V 15].
- **(b, c)** `gwq remove` has `--dry-run`; `gwq prune` clears stale metadata; nothing detects conflicts [V 15].
- **(d)** `gwq status` reports git state as a table or JSON, with `--watch`. It detects no agent processes [V 15].
- **(e)** `-g` lists worktrees across every repo under the base directory [V 15].
- **(f)** `gwq tmux` runs long processes in tmux sessions; the README names only gwq's own config files [V 15].

### workmux

Status: about 3k stars, v0.1.278 on 2026-10-31, MIT [V 64].

- **(a)** `workmux add <branch>` creates a worktree and a tmux window, runs `post_create` hooks, and copies or symlinks files such as `.env` [V 16]. No port support [V 16].
- **(b)** `workmux merge` merges, rebases, or squashes, then removes worktree, window, and branch [V 16]. `workmux remove --gone` removes worktrees whose upstream branch was deleted [V 16].
- **(c)** None; rebase conflicts are resolved by hand [V 16].
- **(d)** Status icons for working, waiting, and done appear in tmux window names, and a dashboard lists agents across sessions [V 16].
- **(e)** `list --all` covers every repo with tracked agents, and the dashboard has a Project column [V 16].
- **(f)** workmux launches agents in tmux panes and can fan one prompt out with `--count` or `--foreach` [V 16]. `workmux setup` installs status-tracking hooks [V 16]. For Claude Code that means a plugin, or hooks you add by hand to `~/.claude/settings.json`, and it respects `CLAUDE_CONFIG_DIR` [V 16].

### ccmanager

Status: about 1.3k stars, v4.4.11 on 2026-10-27, MIT [V 64].

- **(a)** It copies `.worktreeinclude` matches, then runs post-creation hooks asynchronously [V 17]. Devcontainer sessions are supported [V 17].
- **(b, c)** You create, merge, and delete worktrees in the app; nothing detects conflicts [V 17].
- **(d)** Each agent shows busy, waiting, or idle, and status-change hooks can send notifications [V 17]. An experimental auto-approval asks Claude Haiku whether a prompt needs you [V 17].
- **(e)** Multi-project mode discovers every git repository under a root [V 17].
- **(f)** ccmanager runs agents in its own PTYs and kills them when it closes [V 17]. It copies session data from `~/.claude/projects/<source>` to the new worktree's project path [V 17].

### Claude Squad

Status: about 8.7k stars, v1.0.20 on 2026-08-20, AGPL-3.0 [V 64].

- **(a, b)** Each session gets a worktree; `s` commits and pushes, and `c` commits and pauses [V 18]. Nothing covers dependencies or ports [V 18].
- **(c, d, e)** No conflict detection; a TUI shows preview and diff tabs; no multi-repo support [V 18].
- **(f)** It launches each agent in tmux and keeps config in `~/.claude-squad/config.json` [V 18]. Its source presses Enter when the pane shows "Do you trust the files in this folder?" or "new MCP server" [V 19]. It accepts workspace trust and new MCP servers on your behalf [I].

### uzi

Status: about 580 stars, v0.0.2 on 2025-06-03, no push since 2025-06-04, MIT [V 64]. Dormant.

- `uzi.yaml` sets a `devCommand` that receives `$PORT` from a `portRange` [V 20].
- `uzi checkpoint` commits an agent's work and rebases it onto your branch [V 20].
- `uzi ls` shows each agent's status, diff size, and dev-server address, and `uzi broadcast` sends one message to every agent [V 20].

## Desktop orchestrators

### Conductor

Status: a Mac-only app from conductor.build; cloud workspaces run on Linux [V 26]. No public repository turned up, and its skill file is marked "Proprietary" [V 26]. Its source licence was not found, and pricing was not read.

- **(a)** Each workspace is a git worktree on a new branch, based on a freshly fetched `origin` branch [V 21]. A setup script runs after checkout [V 22].
- **(a) Environment.** Each workspace gets `CONDUCTOR_PORT` and nine ports after it, plus `CONDUCTOR_ROOT_PATH` and `CONDUCTOR_WORKSPACE_NAME` [V 22]. `file_include_globs` applies only when `.worktreeinclude` is absent [V 24]. `scripts.run_mode` set to `nonconcurrent` serialises actions that share something such as a local database [V 22].
- **(b)** The flow is review, PR, merge, and archive, and an archive script runs first [V 22, 25]. What archiving removes is not stated [V 25].
- **(c)** Advice only: "Avoid assigning two workspaces the same file-heavy refactor unless you expect merge conflicts" [V 25].
- **(d)** A Checks tab tracks git status, CI, deployments, comments, and todos per workspace [V 25]. Each workspace has an uncommitted `.context` folder for notes and handoffs [V 21].
- **(e)** Settings are per repository, and a cloud workspace holds one repository [V 24, 26].
- **(f)** "Conductor runs Claude Code through the Claude Code setup available on your machine" [V 25]. A setting overrides the executable path [V 24]. Its own settings live in `~/.conductor/` [V 26]. Whether it writes `~/.claude` is undocumented [V 24, 26].

### Paradev, formerly Superset

Status: about 15.8k stars, a rolling `desktop-canary` release on 2026-10-31, Elastic License 2.0 [V 27, 64]. The API redirects `superset-sh/superset` to `ParadevAI/Paradev` [V 64].

- **(a)** Each task gets a worktree, branch, and terminals; `.superset/config.json` holds setup, teardown, and run scripts; ports are detected per workspace [V 27].
- **(b)** A Changes pane commits, pushes, and opens PRs, and a PR pane shows checks and merges [V 27].
- **(c)** The README says worktrees "do not sandbox processes or prevent merge conflicts" [V 27].
- **(d, e)** A sidebar shows working, done, or waiting, with chimes and dock badges; tasks run "in one repository" [V 27].
- **(f)** Paradev runs CLI agents in its terminals on your own subscriptions [V 27]. A `claude` wrapper on `PATH` injects notification hooks [V 28]. Paradev also merges hook entries into `~/.claude/settings.json`, keeping user entries [V 28].

### Emdash

Status: about 6.1k stars, v1.2.10 on 2026-10-30, Apache-2.0 [V 64]. It runs on macOS, Windows, and Linux, and on remote machines over SSH [V 29].

- **(a, b)** Each task gets a worktree and branch; you review diffs, open PRs, inspect CI, and merge in one place [V 29]. Setup scripts and ports are not in the README [V 29].
- **(c, e)** Neither conflict detection nor multi-repo support is mentioned [V 29].
- **(d)** Agent lifecycle hooks feed status, notifications, and resumable sessions [V 29].
- **(f)** Emdash "installs marker-tagged entries in the agent's user-level config" [V 29]. For Claude Code those are `SessionStart`, `UserPromptSubmit`, `Notification`, and `Stop` hooks in `settings.json` under `CLAUDE_CONFIG_DIR` or `.claude` [V 30].

### Nimbalyst, formerly Crystal

Status: Crystal was deprecated in February 2026 in favour of Nimbalyst [V 31]. Nimbalyst has about 2k stars, v0.82.4 on 2026-10-27, MIT [V 64].

- **(a, b)** **New Worktree** starts a session on a new branch, and a side panel reviews, commits, and merges [V 32]. A rebase stashes uncommitted changes automatically [V 32].
- **(c, e)** Conflicts and multiple repos are not covered on the worktrees page [V 32].
- **(f)** Its settings manager reads Claude Code's user, project, and local settings files [V 33]. The write calls this survey read target the project's `.claude/settings.local.json`, for allowed tools and additional directories [V 33].

### Jean

Status: about 1.4k stars, v1.0.13 on 2026-10-28, Apache-2.0 [V 64].

- **(a, b)** Each task gets a worktree with archive and restore. A PR can open as a worktree, and a merge archives it [V 34].
- **(c)** The README lists conflict detection on fetch and merge, and a command to resolve conflicts [V 34].
- **(e)** It supports several projects and "linked projects for cross-project context" [V 34].
- **(f)** Jean "uses your own CLI installations and subscriptions" [V 34]. Its source can also install a Claude Code binary from Anthropic's release bucket [V 35]. It reads Claude Code's OAuth credentials from `~/.claude/.credentials.json` or the keychain [V 35]. It refreshes the token itself and writes the result back, skipping the write if the credentials changed meanwhile [V 35].

### Sculptor

Status: about 240 stars, `sculptor-v0.49.0` on 2026-10-21, MIT; Imbue calls it a research preview [V 36, 64].

- Workspaces are worktrees, with an experimental Docker or remote container backend [V 36].
- It shells out to the Claude Code CLI, honours `CLAUDE_CONFIG_DIR`, and falls back to `~/.claude` [V 37].

### Xum, formerly Mux

Status: about 2.1k stars, a nightly on 2026-10-31, AGPL-3.0 [V 64]. Coder renamed it after a trademark concern [V 38].

- It runs agents locally, in worktrees, or over SSH, and a "Git divergence UI" flags potential conflicts [V 38].
- It runs "a custom agent loop", not Claude Code [V 38].

### vibe-kanban

Status: about 28.5k stars, Apache-2.0; last release 2026-04-24, though commits continue to 2026-10-28 [V 64]. bloop shut down on 2026-04-10, and the project continues as open source maintained by the community [V 41].

- **(a)** Each workspace gives an agent a branch, a terminal, and a dev server [V 39]. Worktrees sit in `.vibe-kanban-workspaces` [V 42].
- **(b)** Orphaned and expired worktrees are cleaned up; a Rebase action rebases onto the target branch [V 39, 42].
- **(e)** A workspace can hold several repositories, each with its own working branch, target branch, and PR [V 42]. The repositories page gives no merge-order advice [V 42].
- **(f)** It launches its own Claude Code with `npx -y @anthropic-ai/claude-code@2.1.119`, a pinned version [V 40]. It passes hooks as SDK callbacks rather than files [V 40]. Its default MCP config path is `~/.claude.json` [V 40], so its MCP editor targets your user file [I].

### Agent Orchestrator

Status: about 13.9k stars, a nightly on 2026-10-30, Apache-2.0 [V 64]. The API redirects `ComposioHQ/agent-orchestrator` to `OrchestratorInc/agent-orchestrator` [V 64].

- **(a, b)** Each task gets its own agent, branch, and worktree [V 43]. Failed checks, review comments, and merge conflicts go back to the worker that owns the branch [V 43].
- **(d)** A board sorts tasks into lanes such as Working, Needs you, In review, and Ready to merge [V 43].
- **(e)** The current README names one repository [V 43]. The ComposioHQ-era docs described several projects in `agent-orchestrator.yaml` on a tmux runtime [S 45].
- **(f)** It installs its Claude Code hooks into the workspace's `.claude/settings.local.json` and keeps user-defined hooks [V 44].

## Fleet orchestration: Gas Town

Status: about 18.6k stars, v1.2.1 on 2026-06-06, MIT [V 64]. Secondary coverage names Steve Yegge as its author [S 48].

- **Shape.** A Town holds rigs, and each rig wraps one git repository [V 46]. A Mayor session coordinates, and polecats are workers [V 46].
- **(c) Merge queue.** Each rig's Refinery "batches merge requests, runs verification gates, and merges to main using a Bors-style bisecting queue" [V 46]. Polecats never push to main [V 46].
- **(d)** Agents have mailboxes; `gt feed` shows live activity and stuck agents; `gt escalate` routes blockers [V 46].
- **(e)** A Town spans several rigs, so several repos [V 46].
- **(f)** It launches its roles in tmux [V 46]. Hook settings live in Gas Town's own directories and reach Claude Code through `--settings <path>`, keeping customer repos clean [V 47].
- It claims to "Scale comfortably to 20-30 agents" [V 46].

## Collisions and single-checkout alternatives

### Clash

Status: 65 stars, v0.2.0 on 2026-02-08, last push 2026-07-17, MIT [V 64].

- It runs a three-way `git merge-tree` between every pair of worktrees, in memory and read-only [V 49].
- `clash status` prints a conflict matrix, `--json` serves scripts, and `clash watch` is a live view [V 49].
- A Claude Code plugin, or a `PreToolUse` hook on `Write|Edit|MultiEdit`, returns "ask" when an edit would conflict [V 49]. Claude Code does not show the reason in that prompt [V 49].
- It detects and does not resolve [V 49]. It sees textual conflicts only, not semantic ones [I].

### GitButler

Status: about 21.9k stars, `release/0.23.1` on 2026-10-28, FSL-1.1-MIT [V 64].

- **One directory, many branches.** Claude Code hooks tell GitButler which session is editing, and it assigns each session's edits to that session's branch [V 50]. Each chat round becomes one commit [V 50].
- The hook commands are `but claude pre-tool` and `but claude stop` [S 51].
- **Why Trigger.dev chose it.** One checkout keeps one database, one Redis, and one dev server [V 52].
- **Its limit.** The hooks tie one session to one branch, so Trigger.dev drives the `but` CLI from a skill instead [V 52].
- **Residual risks.** Same-file overlap, tasks that need different build flags, and tests that mutate shared state still need real isolation [V 52].

### container-use

Status: about 4.1k stars, v0.4.2 on 2025-08-19, last push 2026-09-21, Apache-2.0; "early development" [V 53, 64].

- Each agent gets "a fresh container in its own git branch" [V 53]. `.container-use/environment.json` sets base image, setup and install commands, and secrets [V 54].
- You review an agent's work by checking out its branch [V 53].
- You add it to Claude Code as an MCP server with `claude mcp add container-use -- container-use stdio` [V 53].

## Multi-repo approaches

- **Google's `repo`.** A manifest lists the projects. `repo start` puts a topic branch on the projects you choose, `repo forall` runs a command in each, and `repo upload --topic` groups related changes for review [V 55]. The page mentions no worktree option [V 55].
- **meta.** A `.meta` file lists child repos, and `meta exec --parallel` runs a command in each [V 56]. It documents no cross-repo branch feature [V 56]. Its last release dates from 2021 [V 64].
- **mani and gita.** Both are maintained multi-repo CLIs by the API; their READMEs were not read [V 64].
- **VS Code multi-root workspaces.** A `.code-workspace` file lists folders, and source control shows each folder's repository separately [V 57].
- **Agent-aware, local.** vibe-kanban's multi-repo workspaces come closest [V 42]. ccmanager discovers many repos, Jean links projects, and Gas Town groups rigs [V 17, 34, 46]. workmux and gwq list across repos [V 16, 15].
- **Agent-aware, cloud.** Cursor's cloud agents make coordinated changes across repos and open a PR in each [V 9]. The Codex cloud and Conductor pages describe one repository per task [V 7, 24].
- **Per-task sibling worktrees.** grove and ericclemmons/workspace build one directory per task, with a worktree for each repo it touches [S 65, 66]. Each had 1 star on 2026-10-31 [V 64].
- **Claude Code.** Cross-session messaging lets sessions in sibling repos on one machine pass findings [V 3]. `--add-dir` lets one session reach the other repos [S 5].

## Comparison

Stars are rounded and were read on 2026-10-31 [V 64].

| Tool | Kind | Stars | Last release | Licence |
|---|---|---|---|---|
| Claude Code | First-party CLI | n/a | n/a | Not checked |
| Codex app and cloud | First-party, OpenAI | n/a | n/a | Not checked |
| Cursor | First-party IDE | n/a | n/a | Not checked |
| worktrunk | CLI | 9.6k | 2026-10-20 | MIT OR Apache-2.0 |
| gtr | CLI | 1.8k | 2026-10-28 | Apache-2.0 |
| gwq | CLI | 480 | 2026-10-02 | Apache-2.0 |
| workmux | CLI and tmux | 3k | 2026-10-31 | MIT |
| ccmanager | TUI | 1.3k | 2026-10-27 | MIT |
| Claude Squad | TUI and tmux | 8.7k | 2026-08-20 | AGPL-3.0 |
| uzi | CLI and tmux | 580 | 2025-06-03 | MIT |
| Conductor | Mac app | n/a | n/a | Not published |
| Paradev | Desktop app | 15.8k | Rolling canary | Elastic 2.0 |
| Emdash | Desktop app | 6.1k | 2026-10-30 | Apache-2.0 |
| Nimbalyst | Desktop app | 2k | 2026-10-27 | MIT |
| Jean | Desktop app | 1.4k | 2026-10-28 | Apache-2.0 |
| Sculptor | Desktop app | 240 | 2026-10-21 | MIT |
| vibe-kanban | Local web app | 28.5k | 2026-04-24 | Apache-2.0 |
| Agent Orchestrator | Desktop app | 13.9k | Nightly | Apache-2.0 |
| Gas Town | Fleet CLI | 18.6k | 2026-06-06 | MIT |
| Clash | Conflict checker | 65 | 2026-02-08 | MIT |
| GitButler | Git client | 21.9k | 2026-10-28 | FSL-1.1-MIT |
| container-use | MCP server | 4.1k | 2025-08-19 | Apache-2.0 |

Columns (a) to (f) follow the brief. "None" means the sources read document nothing for that column.

| Tool | (a) Create and set up | (b) Clean up and integrate | (c) Collisions | (d) Other sessions | (e) Several repos | (f) Session and `~/.claude` |
|---|---|---|---|---|---|---|
| Claude Code | `--worktree`, `.worktreeinclude`, `WorktreeCreate` hook | Exit prompt, sweep; no squash detection [I] | None; teams partition files | Agent view, `SendMessage` | `--add-dir`, messaging | Native |
| Codex app | Setup script; `.worktreeinclude` on handoff | Keeps 15, snapshots | None | Threads list [I] | One repo | Not Claude Code |
| Cursor | `worktrees.json` | Cap of 25, may delete others' | `/best-of-n` compares | Agents Window [I] | Cloud only | Not Claude Code |
| worktrunk | Hooks, hashed ports, DB recipe | Six checks incl. squash | None | Markers via plugin | None | Launches or coexists; plugin takes `WorktreeCreate` |
| gtr | Copy patterns, hooks | Asks `gh` or `glab` | None | List only | Per repo | Launches tool; git config only |
| gwq | `copy_files`, trusted setup | `--dry-run` remove | None | Git status | Global list | Coexists |
| workmux | Hooks, copy or symlink | Merge, `--gone` | None | Window icons, dashboard | List across repos | Launches in tmux; plugin, or hooks by hand in `~/.claude` |
| ccmanager | `.worktreeinclude`, hooks | In-app merge | None | Busy, waiting, idle | Multi-project | Own PTYs; copies `~/.claude/projects` |
| Claude Squad | Worktree only | Commit and push | None | TUI | None | Launches in tmux; auto-accepts trust prompt |
| Conductor | Setup script, port block, env vars | Archive script | Advice only | Checks tab | One repo | Uses your install; own `~/.conductor` |
| Paradev | Config scripts, port detection | PR pane | None | Sidebar states | One repo | Wrapper; merges into `~/.claude/settings.json` |
| Emdash | Worktree only | PR, CI, merge | None | Hook-fed status | None | Hooks in user-level `settings.json` |
| Nimbalyst | Worktree only | Merge panel, rebase | None | Side panel | Not read | Writes project-local settings |
| Jean | Worktree, archive | Auto-archive on merge | On fetch and merge | Worktree view | Linked projects | Refreshes OAuth credentials |
| vibe-kanban | Dev server per workspace | Rebase, PR per repo | None | Kanban | Multi-repo workspace | Pinned `npx` Claude Code |
| Agent Orchestrator | Worktree per task | Conflicts back to worker | Routed, not predicted | Lanes | Not stated now | Hooks in worktree `settings.local.json` |
| Gas Town | Worktree per agent [I] | Bisecting merge queue | Queue gates | Mail, feed | Rigs | tmux; `--settings` path |
| Clash | n/a | n/a | Pairwise `merge-tree` | Conflict matrix | n/a | Plugin or `PreToolUse` hook |
| GitButler | One checkout | Branch per session | Overlap still risky | n/a | n/a | Claude Code hooks |
| container-use | Container plus branch | `git checkout` | None | None | None | MCP server |

## Fit against the three patterns

- **P1, several features in one repo.** worktrunk and Conductor cover setup and ports, and gtr and workmux cover setup [V 13, 22, 14, 16]. Only worktrunk documents squash-aware cleanup [V 12]. Only Clash predicts overlap before merge [V 49]. GitButler avoids worktrees altogether at the cost of same-file risk [V 52].
- **P2, support work on main.** Claude Code blocks worktree sessions from editing the main checkout [V 1]. Codex's Local mode and Handoff make the main checkout an explicit mode [V 6]. No other source read documents a separate mode for the main checkout.
- **P3, one feature across sibling repos.** vibe-kanban's multi-repo workspace and Cursor's cloud agents model it directly [V 42, 9]. Locally, the rest is per-repo tooling plus a channel between sessions, such as Claude Code's messaging or Gas Town's mail [V 3, 46].

## Documented failure modes

| Failure mode | Evidence | Strength |
|---|---|---|
| Review is the bottleneck | Willison: "the natural bottleneck on all of this is how fast I can review the results" [V 59]. An HN commenter keeps three threads at most [V 61]. bloop's shutdown post says engineers spend more time planning and reviewing [V 41] | Strong and consistent, though anecdotal |
| Ports, databases, and shared services collide | incident.io: "juggling databases, ports, and local services" [V 58]. Trigger.dev: two worktrees on port 3030, migration and seed conflicts [V 52]. An HN commenter stays on main to avoid "dependencies and ports" [V 61]. Conductor and worktrunk both ship port allocation [V 22, 13] | Strong |
| Each worktree needs installs and disk | Trigger.dev cites "9.82 GB across two worktrees" for a 2 GB codebase, quoting a Cursor forum user [V 52]. GitButler: each worktree needs bootstrapping [V 50]. Cursor advises against symlinking dependencies [V 8] | Medium; the disk number is second-hand |
| Conflicts surface late | Replayed merges of co-active agent PRs: 41.7% textual conflicts for cross-agent pairs, 19.8% within one agent [V 60]. Trigger.dev reports two agents refactoring one utility apart [V 52]. Semantic conflicts merge cleanly and still break [V 63] | Strong for textual conflicts; the semantic claim comes from a vendor blog |
| The human becomes the message bus | claude-code#24798 lists "User as message bus" and handoff files as workarounds [V 62]. Cross-session messaging in v2.1.224 closed it [V 62]. An HN poster reports two sessions as their limit [V 61] | Medium |
| Stale worktrees pile up | An HN commenter calls "hanging worktrees" "a nightmare managing" [V 61]. Codex and Cursor both cap worktree counts [V 6, 8] | Medium |
| Tools change user-level agent config | Paradev, Emdash, and Jean write user-level Claude Code files [V 28, 30, 35]. Claude Squad accepts trust prompts [V 19]. The brief for this survey reports an earlier trial where a tool rewrote `~/.claude/settings.json` | Verified in each tool's repository |
| Isolation leaks at its edges | Claude Code's checks miss `cp` and redirects into the main checkout [V 1]. Worktree approvals save to the main checkout's settings [V 1]. Cursor's cleanup can delete other tools' worktrees [V 8] | Verified in docs |

## Not read

- Conductor's pricing, its source availability, and whether it writes `~/.claude`.
- GitButler's Claude Code hooks page, which returned 404, and gtr's multi-repo guide.
- Nimbalyst's multi-folder projects page, and vibe-kanban's setup-script and git-operations pages.
- Agent Orchestrator's current docs beyond its README and one source file.
- Gas Town's original announcement, and the READMEs of mani, gita, grove, and ericclemmons/workspace.
