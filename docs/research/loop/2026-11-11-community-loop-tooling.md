> Research for the `loop` design ([`docs/designs/loop/`](../../designs/loop/design.md)), not yet planned. A research subagent gathered it on 2026-11-11 for the operator and Claude. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Community tooling for Claude Code loops

This report surveys community and official tooling for recurring or long-lived coding-agent loops, mostly around Claude Code. It judges each find against the five constraints in §Constraints this survey reads against, and closes with documented practice. It proposes no design.

It skips what the design already knows. That covers Claude Code's `/loop`, `CronCreate`, background sessions, `--agent`, routines, desktop scheduled tasks, and Projects. It also covers the Ralph lessons, DeepSeek's `dsh-superagent-prototype`, Feng, McDonald, and Zhang's levels of autonomy, and harness-scope.

Labels:

- **[V n]**: read at source n on 2026-11-11.
- **[S n]**: taken from a search-result excerpt of source n, not read at the page itself.
- **[P]**: carried from sidekick's 2026-10-31 survey [V 2], not re-read today.
- **[I]**: an inference from what was read, not stated by any source.

Stars, licences, last push, and last release come from the GitHub REST API on 2026-11-11 [V 1]. A rename shows as the API answering an old `owner/repo` with a new `full_name`. No tool was installed or run. Most pages were read through a summarising fetch, so a quotation here is as that fetch returned it.

## Sources

Metadata and earlier sidekick research:

1. GitHub REST API, `https://api.github.com/repos/{owner}/{repo}` and `/releases/latest`
2. sidekick, [parallel agent tools survey, 2026-10-31](../parallel-sessions/2026-10-31-parallel-agent-tools-survey.md)

Local schedulers:

3. claude-code-scheduler README: https://github.com/jshchnz/claude-code-scheduler
4. clauck, search excerpt only: https://awesome.ecosyste.ms/projects/github.com%2Fcoreyrdean%2Fclauck
5. anthropics/claude-code#30646, built-in scheduler request, search excerpt only: https://github.com/anthropics/claude-code/issues/30646

Standing loops and supervisors:

6. agent-deck README: https://github.com/asheshgoplani/agent-deck
7. agent-deck, `docs/orders.md`: https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/docs/orders.md
8. agent-deck, `documentation/WATCHDOG.md`: https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/documentation/WATCHDOG.md
9. Gas Town README: https://github.com/gastownhall/gastown
10. Gas Town, `docs/glossary.md`: https://raw.githubusercontent.com/gastownhall/gastown/main/docs/glossary.md
11. Gas Town, `docs/HOOKS.md`: https://raw.githubusercontent.com/gastownhall/gastown/main/docs/HOOKS.md
12. Tmux-Orchestrator README: https://github.com/Jedward23/Tmux-Orchestrator
13. Tmux-Orchestrator, `schedule_with_note.sh`: https://raw.githubusercontent.com/Jedward23/Tmux-Orchestrator/main/schedule_with_note.sh
14. Claude Code Agent Farm README: https://github.com/Dicklesworthstone/claude_code_agent_farm
15. Claude Code Agent Farm, `LICENSE`: https://raw.githubusercontent.com/Dicklesworthstone/claude_code_agent_farm/main/LICENSE
16. sleepless-agent README: https://github.com/context-machine-lab/sleepless-agent
17. claude-auto-resume README: https://github.com/terryso/claude-auto-resume
18. multiclaude README: https://github.com/dlorenc/multiclaude

Iteration loops:

19. continuous-claude README: https://github.com/AnandChowdhary/continuous-claude
20. ralph-orchestrator README: https://github.com/mikeyobrien/ralph-orchestrator
21. ruflo README, formerly claude-flow: https://github.com/ruvnet/ruflo

Session managers from the brief:

22. Claude Squad README: https://github.com/smtg-ai/claude-squad
23. Claude Squad, `daemon/daemon.go`: https://raw.githubusercontent.com/smtg-ai/claude-squad/main/daemon/daemon.go
24. ccmanager README: https://github.com/kbwo/ccmanager
25. vibe-kanban README: https://github.com/BloopAI/vibe-kanban
26. Crystal README: https://github.com/stravu/crystal
27. Conductor changelog index: https://www.conductor.build/changelog.md
28. Conductor 0.85.0 changelog entry: https://www.conductor.build/changelog/0.85.0-sections-routines-and-a-new-model-picker

CI-hosted and cloud loops:

29. Claude Code docs, "Claude Code GitHub Actions": https://code.claude.com/docs/en/github-actions
30. claude-code-action README: https://github.com/anthropics/claude-code-action
31. gh-aw README: https://github.com/github/gh-aw
32. gh-aw, safe outputs reference: https://github.github.com/gh-aw/reference/safe-outputs/
33. gh-aw, staged mode reference: https://github.github.com/gh-aw/reference/staged-mode/
34. gh-aw, triggers reference: https://github.github.com/gh-aw/reference/triggers/
35. gh-aw, threat detection reference: https://github.github.com/gh-aw/reference/threat-detection/
36. GitHub blog, "Under the hood: Security architecture of GitHub Agentic Workflows", 2026-03-09: https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/
37. Claude Code docs, "Hosting the Agent SDK": https://code.claude.com/docs/en/agent-sdk/hosting
38. GitHub docs, "About automations" for Copilot cloud agent: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations
39. GitHub docs, Copilot CLI "Schedule prompts": https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/schedule-prompts
40. Codex scheduled tasks, redirected from `developers.openai.com/codex/app/automations`: https://learn.chatgpt.com/docs/automations?surface=app
41. Cursor docs, automations: https://cursor.com/docs/cloud-agent/automations
42. Devin docs, automations: https://docs.devin.ai/product-guides/automations
43. Jules docs, scheduled tasks: https://jules.google/docs/scheduled-tasks/
44. OpenClaw docs, heartbeat migration: https://docs.openclaw.ai/gateway/heartbeat
45. OpenClaw docs, automation index: https://docs.openclaw.ai/automation/cron-jobs

Policy outside the prompt:

46. Claude Code docs, permission modes: https://code.claude.com/docs/en/permission-modes
47. Claude Code docs, sandboxing: https://code.claude.com/docs/en/sandboxing
48. sandbox-runtime README: https://github.com/anthropics/sandbox-runtime
49. Cupcake README: https://github.com/eqtylab/cupcake
50. Cupcake site: https://cupcake.eqtylab.io
51. Leash README: https://github.com/strongdm/leash
52. cc-safety-net README: https://github.com/kenryu42/cc-safety-net
53. destructive_command_guard (dcg) README: https://github.com/Dicklesworthstone/destructive_command_guard
54. dcg, `LICENSE`: https://raw.githubusercontent.com/Dicklesworthstone/destructive_command_guard/main/LICENSE

Practice:

55. Anthropic, "Measuring AI agent autonomy in practice", 2026-02-18: https://www.anthropic.com/research/measuring-agent-autonomy
56. AWS Architecture Blog, "Closing the AI agent trust gap with graduated autonomy", 2026-08-26: https://aws.amazon.com/blogs/architecture/closing-the-ai-agent-trust-gap-with-graduated-autonomy/
57. Meta AI, "Agents Rule of Two: A Practical Approach to AI Agent Security", 2025-10-31: https://ai.meta.com/blog/practical-ai-agent-security/
58. Simon Willison, "The lethal trifecta for AI agents", 2025-06-16: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
59. Beurer-Kellner et al., "Design Patterns for Securing LLM Agents against Prompt Injections", arXiv:2506.08837: https://arxiv.org/abs/2506.08837, read in full at https://arxiv.org/html/2506.08837v3
60. `launchd.plist(5)`, a mirror of Apple's man page: https://keith.github.io/xcode-man-pages/launchd.plist.5.html
61. Practitioner autonomy ladders, search excerpts only: https://alpeshnakrani.com/books/human-in-the-loop-is-not-a-plan/autonomy-boundaries-and-evaluation-strength/ and https://cdn.jsdelivr.net/npm/attacca-forge@0.6.0/docs/methodology/progressive-autonomy.md

Three sources are blogs or vendor pages rather than primary documentation. Source 36 is GitHub's own blog, 56 is a vendor blog, and 28 is a product changelog. Source 61 is practitioner writing seen only in excerpts.

## Summary

- **No find runs a long-lived Claude Code loop on native features alone.** Each local tool that keeps agents going brings its own runtime [I]. That is tmux plus a daemon, a Go or Python supervisor, or a gateway [V 6, 9, 14, 16, 44].
- **The durable local clock is launchd.** Of the local tools read, the three that document surviving a reboot use launchd or systemd [V 3, 8, 16]. launchd coalesces missed calendar runs into one run on wake [V 60]. A `nohup sleep` timer in tmux dies with the machine [V 13].
- **agent-deck's standing orders are the closest shipped prior art for a loop's mandate.** A shell check runs each minute without a model, and the agent wakes only on a change. Each order carries a daily wake cap, active hours, an expiry, and actions to ask about first [V 7].
- **gh-aw is the clearest case of a mandate held outside the prompt.** The agent job has no write access and no secrets. It emits typed requests that a separate job applies, with a count cap per type [V 32, 36]. Staged mode previews each output type separately, which promotes one action class at a time [V 33].
- **Claude Code's own levers cover most of a mandate.** Deny rules block in every mode, `dontAsk` turns every prompt into a denial, and the sandbox confines shell commands [V 46, 47]. Nothing native covers "must ask" in an unattended session [I].
- **Prompt-only enforcement recurs, and skipping permissions is the common unattended setting.** Four tools launch Claude Code with `--dangerously-skip-permissions` or press Enter on its prompts [V 3, 14, 17, 23]. Three rest on prompt text or a guard not yet built [V 11, 12, 14].
- **Expiry is a feature elsewhere.** gh-aw, agent-deck, GitHub's scheduler, and Copilot all end or cap recurring work on purpose [V 34, 7, 29, 38]. That reframes the design's goal of surviving the 7-day expiry (§Expiry as a feature).

## Constraints this survey reads against

The brief set five constraints on 2026-11-11:

- **C1.** A local CLI on macOS.
- **C2.** Built on Claude Code's native features, not a second runtime.
- **C3.** Personal by default: nothing committed to a work repo unless a team adopts it.
- **C4.** No secrets in any file.
- **C5.** The operator runs many sessions in parallel and wants less to watch, not more.

## Verdicts at a glance

Activity is the last push, or the last release where one exists, from the API on 2026-11-11 [V 1].

| Find | Kind | Licence | Activity | Verdict |
|---|---|---|---|---|
| Claude Code permission modes and sandbox | First-party | n/a | n/a | Use |
| sandbox-runtime | Anthropic library | Apache-2.0 | pushed 2026-11-11 | Use through Claude Code's sandbox; borrow for hooks and MCP servers |
| gh-aw | `gh` extension on Actions | MIT | v1.2.2, 2026-11-10 | Borrow typed outputs, per-type staging, `stop-after`, `skip-if-match` |
| agent-deck | TUI on tmux | MIT | v1.16.38, 2026-11-07 | Borrow check-then-wake, wake caps, expiry, order turns, restart caps |
| claude-code-scheduler | Plugin on launchd | MIT | pushed 2026-01-19, no release | Borrow the launchd clock and a worktree per run |
| Claude Code GitHub Actions | First-party action | MIT | pushed 2026-11-11 | Use later for team loops; reject as the personal host |
| Gas Town | Fleet CLI | MIT | v1.2.1, 2026-06-06 | Borrow `--settings <path>` and a watchdog of the watchdog |
| continuous-claude | Bash CLI | MIT | v0.24.9, 2026-09-27 | Borrow a mandatory cap and stall thresholds |
| ccmanager | TUI | MIT | v4.4.11, 2026-10-27 | Borrow a continuously written restore record |
| Codex scheduled tasks | OpenAI product | n/a | n/a | Borrow the inbox |
| Devin automations | Commercial | n/a | n/a | Borrow the preflight and the invocation limit |
| Copilot automations and CLI | GitHub product | n/a | n/a | Borrow personal automations kept out of git, and budgets |
| Cursor automations | Commercial | n/a | n/a | Borrow the memory warning |
| Agent SDK hosting | First-party SDK | n/a | n/a | Borrow recycling and the stall watchdog; reject as host for now |
| Cupcake | Policy engine on hooks | Apache-2.0 | pushed 2026-03-02, no release | Borrow signals and a warn rung; reject as a dependency |
| Leash | Container plus Cedar | Apache-2.0 | v1.1.7, 2026-03-11 | Reject for now; revisit for a production loop |
| cc-safety-net | Pre-execution guard | MIT | pushed 2026-11-11 | Borrow effect-based parsing |
| dcg | Hook guard | MIT with a restrictive rider | pushed 2026-11-09 | Reject on the licence |
| Claude Code Agent Farm | tmux orchestrator | MIT with a restrictive rider | pushed 2026-09-21 | Borrow ideas only: backoff, disable after N errors |
| sleepless-agent | Daemon with Slack | MIT | v0.1.2, 2025-10-27 | Borrow the usage-window gate |
| OpenClaw | Gateway runtime | MIT | pushed 2026-11-11 | Borrow `NO_REPLY` and `activeHours` |
| Tmux-Orchestrator | tmux scripts | README says MIT; no `LICENSE` file | pushed 2025-07-14 | Reject |
| claude-auto-resume | Shell script | MIT | pushed 2026-05-09 | Reject |
| Claude Squad | TUI on tmux | AGPL-3.0 | v1.0.20, 2026-08-20 | Reject |
| multiclaude | tmux supervisor | README says MIT; no `LICENSE` file | pushed 2026-01-28 | Reject |
| ralph-orchestrator | Rust loop runner | MIT | v2.10.1, 2026-06-23 | Reject as a runtime |
| ruflo | Meta-harness | MIT | pushed 2026-11-11 | Reject |
| vibe-kanban | Local web app | Apache-2.0 | sunsetting | Reject |
| Crystal, now Nimbalyst | Desktop app | MIT | deprecated February 2026 | Reject |
| Conductor | Mac app, cloud routines | Not published [P] | 0.94.0, 2026-11-09 | Reject |
| Jules scheduled tasks | Google product | n/a | n/a | Reject |

## Local schedulers for `claude -p`

### claude-code-scheduler

Status: MIT, about 510 stars, last push 2026-01-19, no tagged release [V 1].

- **What.** A Claude Code plugin that registers tasks with the operating system's scheduler: launchd on macOS, crontab on Linux, Task Scheduler on Windows [V 3].
- **Keeps alive.** It keeps no session alive. Each run executes `claude -p "<command>"` afresh [V 3]. It claims native schedulers are "reliable, survives restarts" [V 3]. It does not say how it treats a missed run or a sleeping machine [V 3].
- **Authority.** For autonomous tasks it adds `--dangerously-skip-permissions`, through `"skipPermissions": true` [V 3]. Its real boundary is git: each run works in a fresh worktree and branch, then commits and pushes for review [V 3]. A failed push leaves the worktree under `~/.worktrees/` [V 3].
- **Storage.** Tasks live in `.claude/schedules.json` in the project, or in `~/.claude/schedules.json` [V 3]. Logs go to `~/.claude/logs/<task-id>.log` [V 3].
- **Fit.** C1 and C2 hold: a launchd job running the native CLI [I]. C3 holds with the user-level file, and fails with the project file unless it is ignored [I]. C5 fails partly: results land in log files the operator must open [I].
- **Verdict.** Borrow two ideas. launchd is the durable clock, with no 7-day expiry, and a worktree per run keeps the main checkout clean. Reject its skip-permissions default.

Related: clauck is a macOS-only tool that runs `claude -p` with `--dangerously-skip-permissions` from a LaunchAgent [S 4]. It had 1 star on 2026-11-11 [V 1]. A Claude Code feature request asks for a built-in scheduler that could generate launchd or systemd units [S 5].

## Standing loops and supervisors

### agent-deck

Status: MIT, about 1.2k stars, v1.16.38 on 2026-11-07 [V 1].

- **What.** A session manager on tmux whose conductors are "persistent agent sessions that monitor and orchestrate all your other sessions" [V 6].
- **Standing orders.** An order lives in `ORDERS.md` with a `check:` shell command, `every:`, `do:`, `ask_first:`, `active:`, `max_wakes_per_day:` (default 6), `expires:`, and `status:` [V 7].
- **How a check wakes the agent.** A per-host timer runs `agent-deck orders tick --all` each minute [V 7]. The check runs with no AI and a 60-second timeout [V 7]. The first run only records a baseline, and an unchanged value spends no tokens [V 7].
- **What the agent receives.** A changed value sends one message with `Was:`, `Now:`, and the `do:` text [V 7]. The message tells the conductor to ask before any `ask_first` action, and to reply `NO_REPLY` when nothing is needed [V 7].
- **Failure handling.** A failing check appends `[exit N]`, so failure reads as a change [V 7]. A failed send keeps the old value and retries next minute [V 7]. A `flock` stops overlapping ticks [V 7].
- **Authority.** An order-started turn cannot add or change orders: those commands exit with code 2 [V 7]. A permission prompt in that turn is denied at once and queued to the owner as a `NEED:` [V 7]. Budgets with `enforce = true` refuse sends once spent; the default only displays them [V 6]. An `allow_dangerous_mode` option exists to stop prompts pausing automation [V 6].
- **Watchdog.** An optional Python daemon restarts dead critical sessions and nudges children stuck in `waiting` for 10 minutes [V 8]. It runs under launchd with `KeepAlive`, or a systemd unit with `Restart=always` [V 8].
- **Restart caps.** At most three restarts per session per 300 seconds, one global restart per 60 seconds, and a 60-second cool-down [V 8]. A rate-limit reply makes it back off and escalate [V 8]. It never merges, pushes, deploys, or restarts itself [V 8].
- **Notifications.** `NEED:` and `[urgent]` lines go to Telegram or Slack at once, `[info]` lines go to a digest, and the rest stay local [V 6].
- **Fit.** C2 fails: conductors are agent-deck's own tmux sessions [I]. C5 is its design goal: the agent and the operator see only changes [I]. Whether sessions survive a reboot is not stated [V 6].
- **Verdict.** Borrow, and heavily. Take check-then-wake, the baseline-first rule, the wake cap, `active:` hours, and `expires:`. Take order turns that cannot edit their own orders, and prompts denied and queued. Take the watchdog's restart caps. Reject it as a dependency, because it is a second runtime.

### Gas Town

Status: MIT, about 18.8k stars, v1.2.1 on 2026-06-06, last push 2026-11-10 [V 1].

- **What.** A fleet orchestrator: a Town of rigs, each wrapping one repository, with Mayor, Witness, Refinery, Deacon, and polecat roles in tmux [V 9] [P].
- **Watchdog chain.** A Go daemon sends a "heartbeat every 3 min" to Boot, then the Deacon, then Witnesses and Refineries [V 9]. Boot is "a special Dog that checks the Deacon every 5 minutes" [V 10]. The Witness "monitors polecats, detects stuck agents, triggers recovery" by nudge or handoff [V 9].
- **Survives restarts.** Work lives outside the session: "Work persists in git-backed hooks", which "survive crashes and restarts" [V 9]. GUPP states the drive: "If there is work on your Hook, YOU MUST RUN IT" [V 10]. A session refresh hands work state to a new session through `/handoff` [V 10].
- **Hooks.** `SessionStart` and `PreCompact` run `gt prime --hook` to re-inject context [V 11]. Settings reach Claude Code "via `--settings <path>`," so customer repos stay clean [V 11].
- **Authority.** Polecats never push to main; a bisecting merge queue gates merges [V 9]. Its `dangerous-command-guard` is listed, but `gt tap guard dangerous-command` "does not exist yet" [V 11]. Only the PR-workflow guard is implemented [V 11].
- **Fit.** C3 holds through `--settings` [V 11]. C2 and C5 fail: many standing roles to run and watch [I].
- **Verdict.** Borrow `--settings <path>` for personal-by-default settings, and a watchdog that is itself watched. Borrow re-priming on `SessionStart` and `PreCompact`. Reject the runtime.

### Tmux-Orchestrator

Status: about 1.8k stars, last push 2025-07-14 [V 1]. The README says "MIT License", but the repository root has no `LICENSE` file [V 12, 1]. Dormant.

- **What.** Orchestrator, project-manager, and engineer agents in tmux windows [V 12].
- **Keeps alive.** Agents schedule their own check-ins with `./schedule_with_note.sh 30 "<note>"` [V 12]. The script writes a note file, then starts a `nohup` background `sleep` [V 13]. When it wakes, it uses `tmux send-keys` to type the note into the target pane [V 13]. Nothing survives a reboot, and no watchdog exists [V 12, 13].
- **Authority.** Git rules such as "commit every 30 minutes" are written as agent instructions [V 12]. No technical enforcement is described [V 12].
- **Verdict.** Reject. It shows why a sleep timer is not a durable clock, and why prompt-only rules are not a mandate.

### Claude Code Agent Farm

Status: about 920 stars, last push 2026-09-21 [V 1]. Its licence is "MIT License (with OpenAI/Anthropic Rider)" [V 15]. The rider grants no rights to Anthropic, OpenAI, or anyone acting "for the benefit of" them [V 15].

- **What.** A Python orchestrator that runs 20 or more Claude Code sessions in tmux to sweep a codebase [V 14].
- **Keeps alive.** Agents write heartbeat files to `.heartbeats/`. With auto-restart on, it restarts agents that error, idle, or have heartbeats older than 2 minutes [V 14]. Restarts back off from 10 seconds, doubling to a 5-minute cap [V 14]. An agent is disabled after `max_errors` failures [V 14].
- **Authority.** It requires `alias cc="ENABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions"` [V 14]. Its work locks are a convention "implemented entire[ly] by means of the prompt file" [V 14].
- **Verdict.** Borrow ideas only: heartbeat staleness, exponential restart backoff, and disabling after repeated failure. Copy no code, because the rider's reach over a Claude Code plugin is unclear [I].

### sleepless-agent

Status: MIT, about 840 stars, v0.1.2 on 2025-10-27, last push 2026-03-29 [V 1].

- **What.** A 24/7 daemon with a SQLite task queue, fed by Slack or its `sle` CLI, that runs tasks through the Claude Code CLI [V 16].
- **Keeps alive.** It ships launchd and systemd install targets [V 16]. Each task checks usage through `claude /usage` [V 16]. Thresholds are set per time window: 96% from 1 to 9 AM, 95% otherwise [V 16]. At the threshold it "automatically pauses task generation" and resumes when usage resets [V 16].
- **Authority.** Each task runs in its own workspace directory [V 16]. Serious tasks open a PR that "requires review" [V 16]. Permission flags are not described [V 16].
- **Verdict.** Borrow the usage gate: stop starting new work near the plan's limit, and resume on reset. Reject the runtime.

### claude-auto-resume

Status: MIT, about 820 stars, last push 2026-05-09 [V 1].

- **What.** A shell script that detects "Claude AI usage limit reached|<timestamp>", waits out the countdown, and reruns a prompt [V 17].
- **Authority.** It runs `claude --dangerously-skip-permissions -p` or `claude -c --dangerously-skip-permissions -p` [V 17]. It warns that it "depends on Claude CLI output format" [V 17].
- **Verdict.** Reject: it scrapes output and drops all permissions. It names a real need, since a loop must outlast the usage-limit wall [I].

### multiclaude

Status: about 570 stars, last push 2026-01-28 [V 1]. The README says MIT; no `LICENSE` file sits at the root [V 18, 1].

- **What.** A supervisor agent that "nudges stuck agents", workers in tmux, and a merge queue [V 18].
- **Authority.** "CI is the ratchet": the merge queue "auto-merges PRs when CI passes" in single-player mode [V 18]. In multiplayer mode it "respects your team's review process" [V 18].
- **Verdict.** Reject. Auto-merging on green CI is an outward write the operator keeps [I].

## Iteration loops

### continuous-claude

Status: MIT, about 1.4k stars, v0.24.9 on 2026-09-27, last push 2026-10-29 [V 1].

- **What.** A CLI that loops Claude Code or Codex through branch, PR, CI wait, and merge or discard [V 19].
- **Context.** `SHARED_TASK_NOTES.md` passes context between iterations, and a `--knowledge-file` holds durable facts [V 19].
- **Stop conditions.** At least one of `--max-runs`, `--max-cost`, or `--max-duration` is required [V 19]. A completion signal stops the loop after three agents agree [V 19]. `--error-threshold` exits after three consecutive errors [V 19]. `--stall-threshold` pauses and writes diagnostics to the notes file [V 19].
- **Authority.** It waits for required checks and approved reviews, so branch protection applies [V 19]. It forwards unknown flags, such as `--allowedTools`, to the agent CLI [V 19].
- **Verdict.** Borrow: refuse to start a loop with no cap, and pause on consecutive errors or stalls with diagnostics left for the operator. Reject auto-merge.

### ralph-orchestrator

Status: MIT, about 3.2k stars, v2.10.1 on 2026-06-23, last push 2026-11-06 [V 1].

- **What.** A Rust runner that iterates an agent until it prints `LOOP_COMPLETE` or hits an iteration limit [V 20]. "Hats" are personas coordinating through events, and "backpressure" gates reject incomplete work [V 20].
- **Human input.** Agents emit `human.interact` events, and "the loop blocks until a response arrives or times out" [V 20].
- **Verdict.** Reject as a runtime; the Ralph lessons are already known. The blocking ask with a timeout is one shape for "must ask" [I].

### ruflo, formerly claude-flow

Status: MIT, about 81k stars, last push 2026-11-11 [V 1]. The API redirects `ruvnet/claude-flow` to `ruvnet/ruflo` [V 1].

- **What.** "An agent meta-harness for Claude Code and Codex," with a daemon, auto-triggered workers, and loop plugins such as `ruflo-loop-workers` [V 21].
- **Footprint.** `npx ruflo init` writes `.claude/`, `.claude-flow/`, `CLAUDE.md`, and settings into the workspace [V 21]. A plugin-only install writes none [V 21].
- **Authority.** Its default console control is "read + ask," and destructive actions need confirmation even in `auto` [V 21]. Its mods "are not sandboxed" [V 21].
- **Verdict.** Reject. It writes into the repo by default, and its claims are mostly self-reported [V 21].

## Session managers from the brief

### Claude Squad

Status: AGPL-3.0, about 8.8k stars, v1.0.20 on 2026-08-20 [V 1].

- **Keeps alive.** Sessions live in tmux and pause or resume by key [V 22]. No scheduling [V 22].
- **Authority.** `--autoyes` starts a detached daemon that forces auto-accept on for every saved instance [V 23]. Each poll, it sends Enter to any session showing a prompt [V 23].
- **Verdict.** Reject. It is the opposite of a mandate: every prompt is approved without reading it.

### ccmanager

Status: MIT, about 1.3k stars, v4.4.11 on 2026-10-27 [V 1].

- **Keeps alive.** Closing ccmanager kills its sessions [V 24]. It writes a restore record "as sessions come and go, not on exit," so it survives a crash [V 24]. On the next launch it offers to restart each session's command, without its conversation [V 24].
- **Authority.** Experimental auto-approval asks Claude Haiku whether a prompt needs a human [V 24]. It "always defaults to manual approval on errors or timeouts" [V 24].
- **Verdict.** Borrow the continuously written record of what should be running, and a classifier that fails closed. Reject as a dependency.

### vibe-kanban, Crystal, and Conductor

- **vibe-kanban.** Its README banner reads "Vibe Kanban is sunsetting" [V 25]. It describes no scheduled or recurring runs [V 25]. Reject.
- **Crystal.** "Deprecated: February 2026," replaced by Nimbalyst [V 26]. Neither README describes scheduling [V 26]. Reject.
- **Conductor.** Release 0.85.0 on 2026-09-09 added routines that "run your agents on a schedule or via GitHub action" [V 27, 28]. "Routines run in the cloud," for pro and team plans only [V 28]. Its licence is unpublished [P]. Reject: cloud-hosted and proprietary, against C1 and C2.

## CI-hosted and cloud loops

### Claude Code GitHub Actions on a schedule

Status: the action is MIT, last push 2026-11-11 [V 1].

- **Schedule.** With a `prompt` input, the action runs in automation mode on any GitHub event, cron included [V 29]. GitHub runs scheduled workflows only from the default branch [V 29]. In public repositories, GitHub disables the schedule after 60 days without repository activity [V 29].
- **Authority.** For a plain prompt, Claude "has no shell or GitHub API access" until `--allowedTools` or a `permissions.allow` rule grants it [V 29]. A skill prompt gets its `allowed-tools` frontmatter instead [V 29]. Scheduled runs skip the write-access check but keep the human-actor check [V 29].
- **Secrets.** Credentials live in GitHub Secrets, and workload identity federation avoids a long-lived secret [V 29].
- **Fit.** C4 holds [V 29]. C1 and C3 fail: it runs on GitHub's runners from a committed workflow [I]. Each run starts fresh, so no long-lived context exists [I].
- **Verdict.** Use later, for a loop a team adopts that needs no local state. Reject as the personal loop's host. Borrow the default of no tools until the prompt or skill grants them.

### GitHub Agentic Workflows (gh-aw)

Status: MIT, about 5.6k stars, v1.2.2 on 2026-11-10 [V 1]. The docs say "Use it with caution, and at your own risk" [V 31].

- **What.** Markdown workflows with YAML frontmatter that `gh aw compile` turns into a `.lock.yml` Actions workflow [V 31]. Engines include Copilot, Claude Code, Codex, Gemini, and Pi [V 31].
- **Schedule.** `on: schedule:` takes cron or phrases like `daily around 14:00` [V 34]. The compiler scatters each workflow to a deterministic time [V 34]. The minimum interval is 5 minutes [V 34].
- **Expiry and preflight.** `stop-after: "+25h"` disables triggering after a deadline "to control costs," and recompiling resets it [V 34]. `skip-if-match:` skips a run when a GitHub search matches, before the agent starts [V 34].
- **Authority, structurally.** The agent job has no write permissions; it requests actions that "separate permission-controlled jobs execute" [V 32]. Each output type has a cap, such as `max: 1` for `create-issue` [V 32]. The agent has "zero access to secrets" and runs behind a firewall [V 36].
- **Threat detection.** A detection job runs after the agent and before writes [V 35]. It flags prompt injection, secret leaks, and malicious patches [V 35]. In the default warn mode, reviewable outputs carry a warning, and non-reviewable ones such as a merge are not applied [V 35].
- **Staged mode.** `staged: true` under `safe-outputs:` previews every built-in output without writing it [V 33]. The same key under one output type stages only that type [V 33]. Custom jobs are "not automatically skipped" and must check `GH_AW_SAFE_OUTPUTS_STAGED` themselves [V 33].
- **Fit.** C1 and C3 fail: GitHub-hosted and committed [I]. C4 holds by design [V 36].
- **Verdict.** Borrow four ideas. The agent proposes typed actions and a deterministic step applies them under caps. Staging works per action class. Expiry is explicit and renewable. A cheap query decides whether to wake the agent. Use later if a team adopts a loop on GitHub.

### Claude Agent SDK, hosted

- **What.** The SDK spawns "a `claude` CLI subprocess" per session, which owns the shell, working directory, and transcripts [V 37].
- **Patterns.** Ephemeral, long-running, hybrid, and multi-agent containers [V 37]. The hybrid pattern resumes a session by ID from a `SessionStore` [V 37].
- **Limits.** "No top-level session timeout," so `maxTurns` bounds a session [V 37]. Memory grows over long sessions, so "recycle subprocesses periodically" [V 37]. `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` is "a stall watchdog," not a runtime deadline [V 37].
- **Isolation and secrets.** `settingSources: []`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and a per-tenant `CLAUDE_CONFIG_DIR` keep context from leaking [V 37]. Credentials are injected at a proxy outside the agent [V 37].
- **Fit.** C2 is partial: it is Claude Code underneath, but sidekick would own a host process [I]. C5 fails until that host has its own view [I].
- **Verdict.** Reject as the loop's host for now. Borrow: recycle long sessions, use the stall watchdog, and inject credentials from outside.

### Copilot cloud agent automations and Copilot CLI

- **Automations.** Schedule triggers run hourly, daily, or weekly, and event triggers take filters [V 38]. Each run starts a cloud agent session [V 38].
- **Personal by default.** Automations "are not committed to Git" [V 38]. Personal automations act as, and bill to, their creator [V 38].
- **Authority.** "Grant only the tools that the task needs" [V 38]. Workflows on an automation's PR wait for a write-access user's approval by default [V 38]. Per-run limits stop a run; daily, weekly, and monthly limits block new runs [V 38].
- **CLI.** `/every` and `/after` are session-scoped, saved with the session, and restored on `--resume` [V 39]. With no session open, the docs advise `copilot -p` from cron [V 39].
- **Verdict.** Borrow: personal loops kept out of git and attributed to their owner, and budgets per run and per period. Reject the product, since it is another agent [I].

### Codex scheduled tasks

- **Kinds.** A task in a chat returns to that chat with its context [V 40]. A standalone task "start[s] a new chat for each scheduled run" [V 40].
- **Where.** A local project or, for Git repos, a separate worktree [V 40]. "Keep the computer on and the app running" when a task needs local files [V 40].
- **Authority.** Tasks "run unattended with your default sandbox settings," with `approval_policy = "never"` where policy allows [V 40]. In read-only mode, calls needing writes or network fail [V 40].
- **Review.** "The Scheduled view acts as your inbox," with an unread indicator for runs needing attention [V 40].
- **Verdict.** Borrow the single inbox of findings for C5. Its chat-or-standalone split matches long-lived versus fresh-per-run [I]. Reject the product.

### Cursor automations

- **What.** Cloud agents on a cron schedule or on GitHub, Slack, Linear, Sentry, PagerDuty, or webhook events [V 41].
- **Authority.** PR creation is on by default; approving reviews needs a setting [V 41]. An MCP server exposes "every tool" it has [V 41].
- **Memory.** Memories persist across runs outside the working filesystem [V 41]. The docs warn they "should be used with caution if your automation handles untrusted input" [V 41].
- **Verdict.** Borrow the warning: memory across runs plus untrusted input is a standing injection path [I]. Reject the product.

### Devin automations

- **What.** A trigger, optional filters, an optional preflight check, and an action [V 42]. Schedules are hourly, daily, weekly, an RRULE, or one-time [V 42].
- **Preflight.** An LLM filter or a script runs before the agent, and can skip the event [V 42]. "Run now" bypasses it [V 42].
- **Limits.** An ACU limit stops a session; an invocation limit defaults to 50 runs per hour [V 42]. A network policy "only ever narrows access" [V 42].
- **Verdict.** Borrow the preflight script and a rate limit on wakes. Reject the product.

### Jules scheduled tasks

A task becomes recurring from the input field, and a Scheduled tab shows last and next runs [V 43]. The page says nothing about where tasks run or what approves them [V 43]. Reject: too little to borrow.

### OpenClaw automation jobs

Status: MIT, about 394k stars, last push 2026-11-11 [V 1].

- **Change.** "Heartbeat monitoring now uses ordinary automation jobs" [V 44]. The runtime no longer reads `HEARTBEAT.md`; a doctor command imports it into a job and archives it [V 44].
- **Quiet runs.** A check with nothing to report returns `NO_REPLY`, and a `no_change` result suppresses delivery [V 44]. `activeHours` "restricts execution to a timezone-aware window" [V 44].
- **Unread.** Persistence, restart behaviour, and the "unattended run contract" sit on child pages that returned 404 or were not reached [V 45].
- **Verdict.** Borrow `NO_REPLY` and active hours. Reject the runtime, a separate gateway (C2).

## Policy outside the prompt

### Claude Code permission modes and sandbox

These are first-party. They are in scope here because the brief's other agent re-checks only the scheduling features.

- **Modes.** "Deny rules block in every mode, including `bypassPermissions`" [V 46]. In `dontAsk`, Claude Code "auto-denies every tool call that would otherwise prompt you," and "the session never waits for input" [V 46].
- **Defaults.** `claude -p` and the Agent SDK start in Manual from v2.1.302, denying calls that need approval [V 46]. Interactive sessions start in auto mode from v2.1.283 [V 46].
- **Auto mode's blocks.** Its classifier blocks force pushes, production deploys, and merging a PR no human approved, among others [V 46]. It enforces boundaries stated in conversation, such as "don't push" [V 46].
- **Sandbox scope.** "The sandbox covers shell commands only. Claude's file tools, MCP servers, and hooks run outside it" [V 47]. Default reads include `~/.ssh` and `~/.aws/credentials` unless denied [V 47].
- **Sandbox hardening.** `allowUnsandboxedCommands: false` removes the escape hatch, and `failIfUnavailable: true` refuses to run unsandboxed [V 47].
- **Verdict.** Use. "Must never" maps to deny rules plus the sandbox, and "may do" to allow rules under `dontAsk` [I]. "Must ask" has no native unattended form, since `dontAsk` denies asks [V 46] [I].

### sandbox-runtime (srt)

Status: Apache-2.0, about 7.1k stars, last push 2026-11-11; "Beta Research Preview" [V 1, 48]. The API redirects `anthropic-experimental/sandbox-runtime` to `anthropics/sandbox-runtime` [V 1].

- **What.** OS-level filesystem and network limits for any process tree, using Seatbelt on macOS and bubblewrap on Linux [V 48].
- **Rules.** Writes and network are allow-only; reads are allowed until denied [V 48]. Settings default to `~/.srt-settings.json` [V 48].
- **Monitoring.** On macOS it can read the system's sandbox violation log [V 48]. It can wrap an MCP server in `.mcp.json` [V 48].
- **Verdict.** Use through Claude Code's sandbox, which it powers [V 48]. Borrow it to wrap the hooks and MCP servers that Claude Code's sandbox leaves out [V 47] [I].

### Cupcake

Status: Apache-2.0, about 300 stars, last push 2026-03-02, no releases [V 1, 49].

- **What.** A policy layer that runs Rego policies, compiled to WebAssembly, in the agent's hook path [V 49].
- **Signals.** It gathers facts first, "such as the current Git branch, CI status, or database metadata" [V 49].
- **Decisions.** Allow, Modify, Block, Warn, and Require Review [V 50]. Block returns feedback for the agent to correct itself [V 49].
- **Unread.** Which Claude Code hook events it uses, and where policies live, are not stated on either page [V 49, 50].
- **Verdict.** Borrow signals evaluated before a decision, and Warn as a record-only rung. Reject as a dependency: a second policy language, and quiet since March [I].

### Leash

Status: Apache-2.0, about 600 stars, v1.1.7 on 2026-03-11 [V 1].

- **What.** It "wraps AI coding agents in containers and monitors their activity," with Cedar policies and an MCP observer [V 51]. `leash --open claude` runs Claude Code [V 51].
- **Fit.** It needs Docker, Podman, or OrbStack, and its macOS native mode is experimental [V 51].
- **Verdict.** Reject for now (C2). Revisit for a production-assistant loop, where a container boundary may earn its cost [I].

### cc-safety-net and dcg

- **cc-safety-net.** MIT, about 2k stars, last push 2026-11-11 [V 1]. It blocks destructive git and filesystem commands, piped install scripts, and secret reads [V 52]. It "parses what the command does," so wrapping does not hide it [V 52]. "It is not a sandbox" [V 52].
- **dcg.** A Rust hook with "50+ security packs" [V 53]. Its licence carries the same rider as Agent Farm's [V 54].
- **Verdict.** Borrow cc-safety-net's effect-based parsing as a defence-in-depth idea. Reject dcg on its licence. Committing `.cc-safety-net/` to share rules would breach C3 [V 52] [I].

## Documented practice

### Graduated autonomy

- **Users grant autonomy gradually.** Full auto-approve rises from about 20% of sessions for new users to over 40% by 750 sessions [V 55]. Interruptions rise too, from about 5% to 9% of turns [V 55].
- **Mandating approval of every action backfires.** It "will create friction without necessarily producing safety benefits" [V 55]. The authors recommend designing for monitoring and intervention instead [V 55].
- **Vendor ladders tier whole agents.** AWS's T1 to T4 tiers promote an agent on a rolling 50-action score, with immediate demotion [V 56]. A Cedar forbid policy enforces the tier, and "Enforcement never depends on the agent's choosing to behave" [V 56].
- **Per-action-class promotion is rare.** gh-aw's per-type `staged` flag is the only shipped mechanism found that promotes one action class at a time [V 33] [I]. Practitioner ladders attach trust to skills, starting in shadow mode [S 61].
- **Evidence gates promotion.** One practitioner sets a floor of 30 days or 100 cases, and restarts shadow mode on a model change [S 61]. No authoritative ladder exists [S 61].

### Record-only and dry-run modes

- **gh-aw staged mode** runs the agent fully and writes a preview of each output to the run summary [V 33].
- **agent-deck** records a baseline on an order's first run and sends nothing [V 7].
- **OpenClaw and agent-deck** let a run end with `NO_REPLY`, so a quiet check costs no attention [V 44, 7].
- **Devin's preflight** and **gh-aw's `skip-if-match`** decide before the agent starts whether a run is worth its cost [V 42, 34].
- **Cupcake's Warn** lets an action proceed and logs it, a policy-side record-only rung [V 50].

### Watchdogs and heartbeats

- **Restart with caps and backoff.** agent-deck caps restarts per session and globally, and escalates on a rate limit [V 8]. Agent Farm backs off exponentially and disables a failing agent [V 14]. continuous-claude pauses on stalls [V 19].
- **Watch the watchdog.** Gas Town's Boot checks the Deacon every 5 minutes [V 10]. agent-deck's watchdog does not restart itself, and relies on launchd or systemd [V 8].
- **Detect stuck, not only dead.** agent-deck hashes a waiting pane and nudges after 10 unchanged minutes [V 8]. Gas Town lists "hooked work with no progress" as a problem state [V 9].
- **launchd's semantics matter on a laptop.** A missed `StartCalendarInterval` runs once on wake, coalesced [V 60]. A `StartInterval` due during sleep "will be missed" [V 60]. `KeepAlive` jobs respawn at most once every 10 seconds by default [V 60].
- **Long sessions degrade.** The Agent SDK docs advise recycling subprocesses, since memory grows over long sessions [V 37].

### Keeping the mandate outside the prompt

- **The threat model.** The lethal trifecta is private data, untrusted content, and external communication together [V 58]. Meta's Rule of Two allows at most two of untrusted input, sensitive access, and state change per session [V 57]. Needing all three "requires supervision" or a fresh context [V 57].
- **The patterns.** Beurer-Kellner et al. propose six patterns, among them Plan-Then-Execute and Dual LLM [V 59]. Their principle: once an agent reads untrusted input, that input cannot trigger consequential tool use [S 59].
- **Shipped structure.** gh-aw separates a read-only agent from capped write jobs [V 32]. AWS routes every tool call through Cedar at a gateway [V 56]. Claude Code offers deny rules, `dontAsk`, and the sandbox [V 46, 47].
- **The failure pattern.** Prompt-only rules recur among the tools read: Tmux-Orchestrator's git rules, Agent Farm's locks, and Gas Town's unbuilt guard [V 12, 14, 11]. Skipping permissions is the common unattended setting [V 3, 14, 17, 23].

### Expiry as a feature

- gh-aw's `stop-after` ends triggering at a deadline that recompiling renews [V 34].
- agent-deck's orders carry `expires:` and a daily wake cap [V 7].
- GitHub disables a public repository's schedule after 60 days without activity [V 29].
- Copilot's period limits block new runs once spent [V 38].
- The design aims to survive Claude Code's 7-day expiry. This prior art suggests surviving the platform's expiry while keeping an expiry the operator sets and renews [I].

## What this survey could not verify

- Cupcake's Claude Code hook events, its policy location, and whether it has a dry-run mode [V 49, 50].
- Leash's macOS native mode, whose `MACOS.md` was not read [V 51].
- Conductor's routine schedule options and permissions; only a changelog entry was read [V 28].
- Where Jules runs scheduled tasks, and what approves them [V 43].
- OpenClaw's persistence and unattended-run rules; the child page returned 404 [V 45].
- Whether agent-deck sessions survive a reboot, and its watchdog's poll interval [V 6, 8].
- Claude Squad's default poll interval, which `daemon.go` reads from config [V 23].
- clauck's behaviour and the scheduler feature request, seen only in search excerpts [S 4, 5].
- What happens when auto mode's classifier blocks an action in an unattended background session; no source read covers it.
- Whether the dcg and Agent Farm rider reaches a user of a Claude Code plugin; that is a legal question this survey did not settle.
