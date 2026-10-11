> Research for the `control-centre` design, not yet planned by PM. The operator and Claude conducted it on 2026-10-11 and 2026-10-12, with Claude Code 2.1.296 installed. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Claude Code's extension and session surface (2026-10-12)

What Claude Code offers for mods, background sessions, profiles, and context budgets, and what the operator's machine showed when each was tried.

Provenance has three grades, marked inline:

- **Measured:** run on the operator's machine on the date given, with the command or probe named.
- **Docs:** read in the official docs or the `plugin-authoring` skill bundled with build 2.1.296, on the date given.
- **Survey:** reported by a research subagent that fetched the page; not re-read unless marked. Survey claims about third-party projects are the projects' own descriptions.

## Mods

A mod is a plugin whose `hooks/hooks.json` names one hooks module, a JavaScript or TypeScript file exporting `register(on, options)`. It runs inside Claude Code's process. Docs, 2026-10-11: [mods overview](https://code.claude.com/docs/en/plugins/mods/overview), [mods reference](https://code.claude.com/docs/en/plugins/mods/reference), and the bundled `plugin-authoring` reference.

- **What only a mod can do,** per the docs' table: draw a pane or a band above the prompt, and redraw Claude Code's own interface. A mod can also run a command with no Claude turn while Claude works, and rewrite events such as tool calls and prompts.
- **API pieces the design leans on:** `$.session.usage()` returns context `tokens`, `window`, and `percent`, plus rate limits. The `session.measure` event pushes the same after each turn. `$.tool.register` gives the model a tool the mod serves. `$.model.fork` asks one question over the session's transcript from the prompt cache. `$.agent.spawn`, `$.process.run`, `$.clock.every`, and `$.store` cover background work. `agent.offer`, `prompt.attachment`, and `tool.describe` filter what the model is offered. `skill.prompt` rewrites a skill's text as it expands.
- **One module per plugin.** `hooks.json`'s `modules` holds one path, and the same file can also hold settings hooks under `hooks`. A plugin's mod boundary is therefore its plugin boundary.
- **Stability.** The bundled reference says the API "is early access and moves between releases". Mods need v2.1.287 or later.
- **Trust.** The overview says a mod is not sandboxed. It can read secrets, see and rewrite prompts and tool calls, and approve a tool call that an `ask` rule or a `PreToolUse` hook would stop. `claude plugin validate <dir>` lists a mod's `hooks:` and `calls:` before install.
- **Where drawing appears.** Hooks run in every session kind; panes and bands draw only in the terminal and the Desktop app. `claude -p` and the VS Code chat panel run hooks and draw nothing.
- **Built-in mods,** docs: `cc-plugin-you-should-know` runs a side agent on long tasks and notes what the operator might miss; it is off by default, enabled with `/plugin enable cc-plugin-you-should-know@builtin`. Source for `diff`, `agents-md`, `sec-default`, and `telemetry` is in [anthropics/claude-code `mods/`](https://github.com/anthropics/claude-code/tree/main/mods).
- **Samples,** docs: [`token-weather`, `blast-radius`, `replay-theater`](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods), shared without support.
- **Ecosystem,** survey 2026-10-11: [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) is hand-curated; [karanb192/awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods) scans public mods and labels what each can read, write, run, or reach. The survey found no community mod older than about six weeks.
- **Incident risk,** survey: Tenet Security showed Claude Code hijacked through a forged Sentry event ([VentureBeat, 2026-06-29](https://venturebeat.com/security/the-attack-that-hijacked-claude-code-came-through-sentry-datadog-pagerduty-and-jira-have-the-same-exposure)).

## Background sessions and agent view

Measured 2026-10-11 with `claude --bg -n bg-probe --model haiku "…"` run from a session's Bash tool, then `ps`, `claude agents --json`, `claude logs`, and the probe's transcript. Docs: [agent view](https://code.claude.com/docs/en/agent-view), [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging).

- **Process model, measured.** The probe ran as its own process under a pty host under a supervisor daemon, not as a child of the session that started it. Agent view is a viewer of the supervisor.
- **Dispatch, measured.** `claude --bg` works from inside a session's Bash tool and returns at once, printing an id for `attach`, `logs`, `stop`, and `rm`.
- **Scope, docs.** A background session runs in the directory it is dispatched from, in any repo. Before its first edit it moves into a git worktree under `.claude/worktrees/`. Deleting a session in agent view deletes the worktree Claude made for it.
- **Hooks, measured.** The probe ran the same SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, and Stop hooks as an interactive session.
- **Trust, measured.** `claude --bg` refuses a folder whose workspace is not trusted.
- **Lifecycle, docs.** Sessions survive closing the terminal and machine sleep; a shutdown stops them. An idle, unattached session's process stops after about an hour and resumes on reply.
- **Taking over, docs.** `claude attach <name>` takes the session; `←` on an empty prompt hands it back, still running. One process drives a transcript at a time.
- **Supervision, docs.** `claude agents --json` is "the supported way to read session state from outside Claude Code", including from "another Claude session that supervises background work".
- **Messaging, docs.** `SendMessage` and `ListAgents` reach local sessions, background ones included. A message arrives between tool calls or starts a turn when the receiver is idle. It cannot approve a permission prompt, and a slash command in it arrives as text. `notify_when_idle` returns one notice when a watched session goes idle, at no token cost to it. By default a session that bypasses permissions holds incoming messages unless the sender bypasses too.
- **Status.** Agent view is a research preview, per the docs.

## Context budget

Measured 2026-10-11 from the `bg-probe` transcript: its first request carried **74,229 tokens** for a one-sentence prompt, in the sidekick repo on Haiku 5.5. The table splits that by counting characters of each startup attachment in the transcript and dividing by four, so it is an estimate. Claude Code's own prompt and tool definitions are not in the transcript, so they are the remainder.

| Part | Tokens, estimated |
|---|---|
| Claude Code system prompt and tool definitions (remainder) | ≈41.8k |
| Instructions: `~/.claude/CLAUDE.md`, four unscoped user rules, `AGENTS.md`, `MEMORY.md` | ≈11.2k |
| Skill listing | ≈7.9k |
| Deferred tool names, mostly claude.ai connectors and plugins | ≈4.4k |
| Session-start hook output | ≈4.3k |
| Agent listing | ≈3.0k |
| MCP server instructions | ≈1.1k |
| Other | ≈0.4k |

- The three path-scoped user rules (`sk-agent-prompts`, `sk-clean-code`, `sk-typescript`) did not load; the transcript's instructions list names the seven files that did.
- GSD's 67 skills and 33 agents contribute about 3.4k tokens of names and descriptions, counted from their frontmatter.
- Later requests read 74,227 tokens from the prompt cache, so the repeated start is cheap in money and still occupies the window.
- `/context` in a fresh session gives exact figures.

## Profiles

Claude Code has no profile feature; a [feature request](https://claudeissues.com/issue/14843-feature-request-bulk-enable-disable-plugins) asks for bulk enable and disable. A profile here is a settings file passed with `--settings`. Docs: [settings](https://code.claude.com/docs/en/settings) and the settings reference.

| Switch | Reach | Grade |
|---|---|---|
| `enabledPlugins` through `--settings` | whole plugins, one session | measured: plugin skills absent in headless and background sessions |
| `claudeMdExcludes` | instruction and rule files | measured: `sk-pm-conventions.md` left out |
| `disableClaudeAiConnectors` | claude.ai connectors | measured: Gmail and Notion tools absent |
| `skillOverrides` | skills outside plugins | docs; "Overrides don't apply to plugin skills" |
| `permissions.disableBypassPermissionsMode` | bypass mode | measured: a session started with `--permission-mode bypassPermissions` recorded `default` |
| `--append-system-prompt` | a stance per profile | measured: present in a background session started with it |
| `agent` / `--agent` | runs the main thread as a named agent | docs |
| `autoMemoryDirectory` | the auto-memory folder | docs; honoured from `--settings` |
| `claude agents --settings` | sessions dispatched from agent view | docs |

- **Measured cost, 2026-10-11.** The same headless prompt in the same folder started at 44,707 tokens with no profile and 29,342 under the `core` profile.
- **Gaps.** No setting found switches agents loose in `~/.claude/agents` or hooks in user settings off for one session. `disableAllHooks` stops plugin hooks too.
- **Prior art, survey 2026-10-12.** [shimo4228/harness-scope](https://github.com/shimo4228/harness-scope) is a mod that filters skills one by one and withholds agents through `agent.offer`. It defers tools through `tool.describe` and removes instruction files through `prompt.context`. It picks a profile per repo through `.claude/harness-scope.json`, not per session.
- **Domain plugins.** [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) holds sales, finance, legal, marketing, HR, data, operations, product management, and other plugins. They are built mainly for Cowork, and how they run in Claude Code is unverified.

## Status lines

Survey, 2026-10-11, against the operator's criteria of low maintenance, no network, context and rate limits.

- A status line prints text for the operator, and nothing it prints reaches the model. That is why GSD's monitor reads a bridge file its status line writes (`~/.claude/hooks/gsd-statusline.js`, read 2026-10-11).
- The stdin JSON already carries `context_window.used_percentage` and the five-hour and seven-day `rate_limits` ([statusline docs](https://code.claude.com/docs/en/statusline)).
- Ranked: [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud), no dependencies and installed as a plugin; [Owloops/claude-powerline](https://github.com/Owloops/claude-powerline), a daily pricing fetch; [sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline), richest, network-free only with care. A short script from `/statusline` beats all of them on those criteria.

## GSD's footprint

Read 2026-10-11 from `~/.claude/settings.json` and each hook's header comment in `~/.claude/hooks/`, GSD 1.42.3.

- Active outside GSD projects: the status line, the context monitor, the update check, `gsd-read-injection-scanner.js` (advisory, on `Read` results only), and `gsd-read-guard.js` (written for non-Claude models).
- No-ops outside GSD projects: `gsd-prompt-guard.js`, `gsd-workflow-guard.js`, `gsd-validate-commit.sh`, `gsd-phase-boundary.sh`, and `gsd-session-state.sh`.
- Every session lists 67 GSD skills and 33 GSD agents.

## Ralph, workflows, and the official loop plugin

- **Ralph,** [Huntley](https://ghuntley.com/ralph/): a shell loop feeding the same prompt to a fresh agent process, with state in files and git. The memory layout is in the companion report.
- **`ralph-loop`,** read 2026-10-11 from its [README](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop): a Stop hook feeds the same prompt back *inside the same session*, so context keeps growing.
- **Workflow tool,** from its own tool description in this build: a deterministic script orchestrates subagents with `agent()`, `parallel()`, and `pipeline()`. It runs in the background and reports its result back. Its agents are subagents, so none can be attached to.

## Other tools looked at

- **Moltamp** ([moltamp.com](https://moltamp.com), read 2026-10-11): a skinnable macOS wrapper around the operator's own `claude`, with tabs that glow by state. It sends anonymous usage statistics with a machine fingerprint, which can be turned off, and the site names no maker. The operator ruled it out on 2026-10-11.
- **Flightdeck** ([scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck), read 2026-10-11): a mod showing one session's subagents, permission checks, and cost. Its README says it "only watches".
- **Ostrakon** ([gaius-codius/ostrakon](https://github.com/gaius-codius/ostrakon), read 2026-10-11): `/jot` captures a note while Claude works, and the model gets a `jot` tool. An opt-in harvest proposes side issues after each turn. Notes stay local Markdown.
- **wshobson's `context-management`,** read 2026-10-11 from the installed copy: a persona agent and two commands in prose, with no storage mechanism.
