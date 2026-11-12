> Research for the `loop` design (`docs/designs/loop/`), which PM has not planned yet. Run 2026-11-11 by Claude for the operator. Claude Code was 2.1.322. A docs agent fetched each page's raw Markdown and quoted it. The main session read the `CronCreate` schema and ran `strings` on the executable. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Native loop facts, re-read on Claude Code 2.1.322 (2026-11-11)

The loop probes of 2026-11-08 ran on 2.1.319, and some of their facts came from docs a research agent read without quoting. This re-read checks each fact the loop design rests on against the current docs and build.

## Sources

- `https://code.claude.com/docs/en/scheduled-tasks.md`, `agent-view.md`, `sub-agents.md`, `cli-reference.md`, `hooks.md`, `routines.md`, `desktop-scheduled-tasks.md`, and `changelog.md`, fetched 2026-11-11.
- The `CronCreate` tool schema, as a 2.1.322 session receives it.
- `strings` on `~/.local/share/claude/versions/2.1.322`.

## The schema and the binary

- **The schema** says jobs "live only in this Claude session — nothing is written to disk, and the job is gone when Claude exits". `durable` "Has no effect". Recurring jobs "auto-expire after 7 days — they fire one final time, then are deleted". Jobs fire only while the session is idle, up to 50% of the period late, at most 30 minutes.
- **The binary** still holds `tengu_kairos_cron_durable`, `tengu_kairos_loop_keepalive`, `tengu_kairos_loop_persistent`, `tengu_kairos_loop_persistent_activated`, `CLAUDE_CODE_LOOP_KEEPALIVE`, `CLAUDE_CODE_LOOP_PERSISTENT`, and `scheduled_tasks.json`.

## The docs

| Fact | Reading | Quote | Page, section |
|---|---|---|---|
| A resume restores cron jobs, but not a self-paced loop, nor a one-shot job whose time has passed | holds, with the one-shot clause | "When you resume a session with `claude --resume` or `claude --continue`, Claude Code restores the tasks scheduled with `CronCreate`, except recurring tasks that have expired and one-shot tasks whose scheduled time has passed. A self-paced `/loop` isn't restored" | scheduled-tasks, Limitations |
| The 7-day expiry, and a way past it | holds; the route is to recreate | "If you need a recurring task to last longer, cancel and recreate it before it expires." | scheduled-tasks, Seven-day expiry |
| A durable mode | documented only behind a flag | "With feature-flag fetching off, Claude Code stores a task you asked to keep across sessions in the project's `.claude/scheduled_tasks.json` file." | scheduled-tasks, Limitations |
| Bare `/loop` reads `.claude/loop.md`, then `~/.claude/loop.md` | holds | It "defines a single default prompt for bare `/loop`, not a list of separate scheduled tasks." The file is truncated beyond 25,000 bytes | scheduled-tasks, Customize the default prompt with loop.md |
| A reboot stops background sessions | holds; no automatic restart is documented | "Shutting down or restarting your machine stops running background sessions." "Attach or reply to it and it restarts from its saved conversation." Past 48 hours the session shows "ended while the background service was off" | agent-view, Sessions show as failed or stopped after shutdown |
| The idle stop, and what counts as work | holds | "Unattached for about an hour: the supervisor stops the process." "A pending session-scoped scheduled task, such as a `/loop` wakeup" counts as working. "Press `Ctrl+T` to pin a session." | agent-view, The supervisor process; Organize the list |
| `--agent` persists on resume | holds | "the choice persists when you resume the session." Its persistence through a supervisor respawn is not stated; the 2026-11-08 probes measured it | sub-agents, Choose the subagent scope |
| What a plugin agent can carry | narrower than assumed | `initialPrompt`: "Ignored for plugin subagents." "For security reasons, plugin subagents don't support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields." | sub-agents, Frontmatter reference |
| The flags a background session carries | holds; `--agent` is not in the list | Carried: "`--mcp-config` and `--strict-mcp-config`, `--settings`, `--setting-sources`, `--add-dir`, `--plugin-dir`, `--fallback-model`, `--allow-dangerously-skip-permissions`." "The permission mode, model, and effort you chose … along with the configuration flags it carries, all persist when the supervisor later stops and restarts its process." | agent-view, What carries over when you background; What persists across restarts |
| A `SessionStart` hook adds context only | holds, with one exception | `SessionStart` is "Context only … No blocking or decision control." It "also accepts `initialUserMessage`", a "first user message of the session, in non-interactive mode with the `-p` flag." | hooks, Decision control; SessionStart decision control |
| Routines | hold; plugins and `.claude/` settings not stated | Skills "include the ones committed to the cloned repository." "Expressions that run more often than once per hour are rejected." Cloud tasks are limited to 100 scheduled runs per hour per account | routines, Create a scheduled task; Add a schedule trigger; Usage and limits |
| Desktop scheduled tasks | hold; per-task plugins and settings not stated | "Tasks only run while the desktop app is running and your computer is awake." "Desktop starts exactly one catch-up run for the most recently missed time." Each task has a working folder and "its own permission mode". Stored under `~/.claude/scheduled-tasks/<task-name>/` | desktop-scheduled-tasks, How scheduled tasks run; Missed runs; Permissions for scheduled tasks |

## The changelog

2.1.320 has no entry in the changelog, and 2.1.322's only entry concerns Vertex fast mode. 2.1.321 has these entries that touch loops, background sessions, or plugins:

- "Changed nested skill loading: `.claude/skills` folders inside `~/.claude/plugins` no longer load when Claude works on files there"
- "Improved the agent view's row for a `claude --bg --worktree` session that couldn't set up its worktree"
- "Fixed `claude agents` ignoring `--permission-mode`, … `--model`, `--effort` or `--agent` typed before `agents`"
- "Changed headless sessions to reload mods in `.claude/skills` when their files change"

## What this changes from the 2026-11-08 reading

- **`initialPrompt`.** The probes found it did not fire in a background session, and read that as a `--bg` limit. The docs say the field is ignored for every plugin subagent. A loop's agent from a plugin never arms its own cron, attached or not.
- **The expiry.** The docs name the renewal route: cancel and recreate before day 7. A hook cannot do that, since `SessionStart` adds context only, outside `-p`.
- **A reboot.** Nothing documented restarts a background session after a reboot without an attach or a reply.
