Amended 2026-10-14: [2026-10-14-switch-bench-and-folder-probes.md](./2026-10-14-switch-bench-and-folder-probes.md) measures the MCP server instructions and hooks that "Switching by resume" leaves unmeasured.

> Research for the `control-centre` design (R9, #213). Claude ran it on 2026-10-14 in a session with the operator, on Claude Code 2.1.299. Subagents did the docs and types reading. It records what repo profiles, switching, and the dependency check rest on, for #213 and #206. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: repo profiles, switching by resume, and plugin dependencies (2026-10-14)

#205 launched a profile from one user-level store. #213 adds a store inside a repo, a switch of a running session's profile, and a check for a profile that breaks a plugin dependency. Each fact here is one of those rests on. The earlier probes, in `2026-10-13-profile-launch-probes.md`, are not repeated. Probe sessions ran on Haiku to keep them cheap.

Provenance grades:

- **Measured:** run on 2026-10-14, with the command and the observed output named. What loaded was read from the session's transcript under `~/.claude/projects/`, not from the model's answer. The model's reply is corroboration only.
- **Docs:** read in the official Claude Code docs on 2026-10-14 by a subagent, with the page named. Not re-read by Claude.
- **Types:** read in the `claude-code.d.ts` file that the bundled `plugin-authoring` skill writes for 2.1.299, by a subagent, with the line named.
- **Operator:** run by the operator in a session of their own, and reported.
- **Inferred:** a reading of measured output or docs. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does a session in a repo load a profile folder stored inside it? | Not at start. Reading any file in the folder loads its `.claude/rules/` on demand | Measured |
| Does resuming under another profile swap its rules? | Yes. The old rule is listed as removed | Measured |
| Does it swap plugins? | It adds the new profile's. A dropped plugin's skills stay listed and fail when called | Measured |
| Does the recorded system prompt hold rules or skills? | Neither was found in it | Measured |
| Can a mod relaunch a session or change its flags? | No call does either | Types |
| Does `plugin list` report a broken dependency under a profile's flags? | Yes, in `errorDetails`, which follows `--settings` and `--setting-sources` | Measured |
| Does `plugin list`'s `enabled` follow the same flags? | `--settings` only, not `--setting-sources` | Measured |
| Does `CLAUDE_CODE_SESSION_ID` follow a `/clear`? | Yes | Operator |

## The setup

The probes ran in a scratch git repository, `probe-repo`, with one commit. A runner script fed the output of the branch's `node plugin/bin/sidekick profile argv <name>` to `claude`, with `SIDEKICK_PROFILES_DIR` pointing at a scratch store. Its stdin was `/dev/null`.

The scratch store held two profiles. Each had one rule asking every reply to end with a token:

| Profile | Rule token | `settings` |
|---|---|---|
| `alpha` | `ALPHATAG` | none |
| `bravo` | `BRAVOTAG` | `enabledPlugins: { "claude-code-setup@claude-plugins-official": false }` |

`claude-code-setup` is enabled in the operator's user layer and ships the skill `claude-code-setup:claude-automation-recommender`, so its listing shows whether the plugin loaded.

## A profile folder inside a repo

`probe-repo` held `.claude/profiles/alpha/profile.json` and `.claude/profiles/alpha/.claude/rules/canary.md`. The rule asked replies to end with `NESTEDCANARY`.

- `claude -p --model haiku "Reply with one short sentence saying hello."` replied `Hello!`. Its transcript carries no `NESTEDCANARY`.
- `claude -p --model haiku "Read .claude/profiles/alpha/profile.json with the Read tool and tell me its description in one sentence. Do not read any other file." --allowedTools Read` read the file. Its transcript then carries a `nested_memory` attachment whose `path` is the canary rule. The model named the token and declined to follow it, as text arriving with a tool result.

So a profile folder stored in a repo stays out of a session until the session reads a file inside it. Then that profile's rules join the session. The docs say the same in general: the memory page lists "rules in nested `.claude/rules/` directories" among the rules that load on demand (Docs). Any path inside the repo behaves so (Inferred: only `.claude/profiles/` was run).

## Switching by resume

Two sessions were each started under one profile, then resumed under the other with `--resume <id>`.

**Rules swap.** Session `124c03b9` started under `alpha` and answered with `ALPHATAG`. Resumed under `bravo`, its transcript gained an `instructions` attachment. It lists the bravo rule under `files`, the alpha rule under `removed`, and carries `changed: true` and `reason: "session_start"`. The reply ended `BRAVOTAG`.

**Added plugins load.** Session `b9900b7e` started under `bravo`, and the model answered that the recommender skill was absent. Resumed under `alpha`, its transcript gained a new `skill_listing` attachment naming the skill. Asked to invoke it, the Skill tool returned the skill's content.

**Dropped plugins linger in the listing.** Session `124c03b9`, resumed under `bravo`, gained no new `skill_listing`, so its first listing, from the alpha start, still named the recommender. The model answered that the skill was available. Asked to invoke it, the Skill tool returned `Unknown skill: claude-code-setup:claude-automation-recommender`. A fresh session under `bravo` answered that the skill was absent.

**The recorded system prompt.** Both `prompt_snapshot` attachments of session `124c03b9` were searched for the rule token and for a skill name, `superpowers:brainstorming`. Neither appeared. `claude --help` describes the snapshot. The system prompt is recorded on the first request, then resent on every resume "even when a later launch passes different text". Compaction ends it (Docs, the CLI's own help).

Not measured: MCP server instructions, hooks, `env`, permissions, and the model across a switch, and any switch in an interactive session. The sessions page says to pass `--settings`, `--add-dir`, and similar flags again on resume, and that "the standard settings files … are re-read at launch" (Docs).

## A session cannot relaunch itself

The mod API has no call that ends, restarts, or relaunches a session, or changes its launch flags (Types). `$.settings.read` is read-only (`claude-code.d.ts:3615-3637`), and the `Settings` type says "a write to it changes nothing the engine reads" (`:12101`). `$.command.run` "runs a slash command as if the person typed `/command args`" (`:3135`). Whether it can run the built-in `/exit` was not tested. `session.end` is an event a mod can watch, not a call (`:4490-4500`).

So a switch from inside a running interactive session needs the operator to end it, then relaunch with the new profile.

## Plugin dependencies through `plugin list`

`claude plugin list --json` carries no dependency field. Each installed plugin's manifest carries them, at `<installPath>/.claude-plugin/plugin.json`; sidekick's lists superpowers and code-review as objects with `name` and `marketplace`. The docs accept an entry as a string, `name` or `name@marketplace`, or as an object with `name`, `version`, and `marketplace` (Docs, plugins/dependencies).

The command honours the global settings flags placed before the subcommand. `claude plugin list --json --settings <json>` fails with `error: unknown option '--settings'`.

| Command, run in `probe-repo` | superpowers | sidekick |
|---|---|---|
| `claude plugin list --json` | `enabled: true` | `enabled: true`, no `errorDetails` |
| `claude --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}' plugin list --json` | `enabled: false` | `enabled: true`, `errorDetails: [{type: "dependency-unsatisfied", plugin: "sidekick", dependency: "superpowers@claude-plugins-official"}]` |
| `claude --setting-sources project --settings '{"enabledPlugins":{"sidekick@rikmorn":true}}' plugin list --json` | `enabled: true` | `enabled: true`, the same `dependency-unsatisfied` detail |
| `claude --setting-sources project plugin list --json` | `enabled: true` | `enabled: true`, no `errorDetails` |

So `errorDetails` follows both flags: under the project source alone, superpowers is not enabled, and sidekick's error says so. `enabled` follows `--settings` but not `--setting-sources`, since superpowers still reads `true` there. A plugin with an unmet dependency also reads `enabled: true` beside its error. The docs say Claude Code "keeps the affected plugin disabled" and shows the error in `plugin list` and `/plugin`'s Errors tab (Docs, plugins/troubleshooting).

A design reviewer measured two more facts in the sidekick repo the same day. `enabled` and `errorDetails` are computed for the current folder on every entry, including other repositories' project-scope entries. One `--settings` flipped superpowers' `enabled` on those entries, and added the error to sidekick's entry for another repo. And `--setting-sources local` also left user-only plugins reading `enabled: true`. Three timed runs of `plugin list` with `--settings` took 0.64, 0.66, and 0.67 seconds.

## The session id after `/clear`

A session's Bash sees `CLAUDE_CODE_SESSION_ID` (Measured, `env` in the session that wrote this report). The operator ran `! echo $CLAUDE_CODE_SESSION_ID`, then `/clear`, then the echo again, in a session of their own. The two ids differed (Operator). The types say that after a `/clear` or a resume "the process goes on under another" session id (`claude-code.d.ts:11312-11313`, Types).

## Sources

- Claude Code 2.1.299: `claude --help`, `claude respawn --help`, and the probe sessions' transcripts.
- Docs pages, read by a subagent on 2026-10-14: [plugins/dependencies](https://code.claude.com/docs/en/plugins/dependencies.md), [plugins/troubleshooting](https://code.claude.com/docs/en/plugins/troubleshooting.md), [memory](https://code.claude.com/docs/en/memory.md), [sessions](https://code.claude.com/docs/en/sessions.md), [cli-reference](https://code.claude.com/docs/en/cli-reference.md).
- The bundled `plugin-authoring` skill's `types/claude-code.d.ts` and `reference.md` for 2.1.299, read by a subagent.
