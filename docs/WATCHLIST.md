# Watchlist

Where to look for Claude Code skills, agents, rules, hooks, plugins, and mods worth knowing about. The ecosystem moves faster than any one session can follow. This page names the sources that surface new things, and says how to treat what they surface.

## Treat a find as code to review

A mod runs inside Claude Code with your permissions and no sandbox. The [mods overview](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod) says one can read your secrets, rewrite prompts and tool calls, and approve a tool call your own rules would ask about. Skills, agents, and settings hooks reach less, but they still steer the model or run scripts.

- Read it before you install it. For a mod, clone it and run `claude plugin validate <dir>`. Its `hooks:` and `calls:` lines say what it handles and what it reaches.
- An update replaces the code you reviewed, so review again when one lands.
- Prefer borrowing the idea when the thing is small. A mod is a few files, and one you own changes only when you change it.
- What sidekick itself takes from a source follows [ADR-0009](adr/0009-pivot-to-plugin-bundle.md). Superpowers and the official plugins are the trunk, and sidekick builds only for a gap felt in daily use.

A find you want to try becomes an issue on the board, and its verdict goes in the close comment. This page keeps sources and leads, never verdicts.

## Sources

### Anthropic

| Source | What it surfaces |
|---|---|
| [Docs index](https://code.claude.com/docs/llms.txt) | Every Claude Code docs page; new features show up here first |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | The official marketplace, including partner plugins for Sentry, Datadog, PagerDuty, and other incident tools |
| [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community) | The community marketplace Anthropic hosts, with entries pinned to commits |
| [Plugin directory](https://claude.com/marketplace/plugins) | A web catalogue of the marketplaces |
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic's own skills |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) | Domain plugins beyond code, such as sales, finance, legal, marketing, and data; built mainly for Cowork |
| [Engineering blog](https://www.anthropic.com/engineering) | Practice write-ups, such as context engineering and harnesses for long-running agents |
| [anthropics/claude-code `mods/`](https://github.com/anthropics/claude-code/tree/main/mods) | The source of the built-in mods: working examples of the mod API |
| [anthropics/claude-code-playground mods](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods) | Sample mods, shared without support |

Built-in mods that ship switched off appear in `/plugin` under **Installed**, then **Show disabled**.

### Community

| Source | What it surfaces |
|---|---|
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | A hand-picked list of skills, agents, hooks, status lines, and plugins. The best signal found as of 2026-10-11 |
| [karanb192/awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods), browsable at [mods.aidojo.si](https://mods.aidojo.si/) | An automated scan of public mods, labelling what each can read, write, run, or reach. Use it to check a mod's reach, not to find good ones |
| [obra/superpowers](https://github.com/obra/superpowers) | The trunk sidekick builds around; its release notes decide sidekick's dependency range |
| [wshobson/agents](https://github.com/wshobson/agents) | A large marketplace of agent and workflow plugins |
| [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | A large collection of subagent definitions |
| [trailofbits/skills](https://github.com/trailofbits/skills) | Security review skills |

Skipped as low signal, checked 2026-10-11: whyashthakker/awesome-claude-code-mods, one author's bundle.

### Skills

| Source | What it surfaces |
|---|---|
| [agentskills.io](https://agentskills.io) | The open Agent Skills format that Anthropic first developed; changes to `SKILL.md` land here. A specification, not a catalogue |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | A curated collection of skills from official teams and the community, across agents |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | A curated list of Claude skills, resources, and tools |
| [karanb192/awesome-claude-skills](https://github.com/karanb192/awesome-claude-skills) | A smaller set of verified Claude skills, from the maintainer of the mods scan |
| [gmh5225/awesome-skills](https://github.com/gmh5225/awesome-skills) | A curated list of skills for several coding agents, split by category |
| [skills.sh](https://www.skills.sh) | Vercel's skills registry, ranked by installs, with an install CLI. Popularity, not review |

Seen in search and not reviewed, 2026-10-12: travisvn/awesome-claude-skills, GetBindu/awesome-claude-code-and-skills, and index sites such as claudemarketplaces.com and openskillindex.com.

### Research

| Source | What it surfaces |
|---|---|
| [VoltAgent/awesome-ai-agent-papers](https://github.com/VoltAgent/awesome-ai-agent-papers) | Agent research papers from 2026, on agent engineering, memory, evaluation, workflows, and autonomy |
| [`docs/research/`](research/) | What sidekick has already surveyed, so a find can be checked against past verdicts |

## Leads

Things seen and not yet reviewed. A lead that becomes an issue leaves this list.

| Lead | Why it caught the eye |
|---|---|
| [backnotprop/plannotator](https://github.com/backnotprop/plannotator) | A local browser UI to annotate a plan and send the feedback back. Its hook fires when plan mode ends, and superpowers 6.4.1 writes plans without plan mode, so the fit is unchecked |
| [gaius-codius/ostrakon](https://github.com/gaius-codius/ostrakon) | Captures notes mid-turn with `/jot` and gives the model a `jot` tool. The shape a capture-an-issue mod would take |
| [`token-weather`](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather) | Anthropic's sample: a context forecast above the prompt. Prior art for #146 |
| [`blast-radius`](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/blast-radius) | Anthropic's sample: holds `rm -rf` or a force push until you confirm. A pattern for production guards |
| [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) | A status line with no dependencies that shows context and rate limits from what Claude Code passes it. The pick to replace GSD's, per the split in #146 |
| [Yanir-R/catchup](https://github.com/Yanir-R/catchup) | A mod whose `/catchup` summarises what a session said since you last looked. Lowers the cost of switching back to a session |
| `cc-plugin-you-should-know` | A built-in mod, off by default, that runs a side agent on long tasks and notes what you might miss |

Already assessed: ccpm, in the [PM layer research round](research/pm-layer/2026-09-19-pm-layer-research-round.md), skipped because it mirrors tracker state in local files.
