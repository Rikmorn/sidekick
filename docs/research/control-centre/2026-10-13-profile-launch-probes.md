> Research for the `control-centre` design (R9, #205). Claude ran it on 2026-10-13 in a session with the operator, on Claude Code 2.1.296. Research subagents did the docs reading and the probes. It records what a profile launch depends on, for the issues that cite it: #206, #208, #209, and #213. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: the settings, instruction, and background surface a profile launches through (2026-10-13)

A profile is a folder plus a settings object that a launcher hands to `claude`. Each fact in this report is something that launch rests on. The earlier probes of 2026-10-12, in `2026-10-12-probes.md`, are not repeated. Probe sessions ran on Haiku to keep them cheap.

Provenance grades:

- **Measured:** run on 2026-10-13, with the command and the observed output named. What loaded was read from the session's own records (the `system/init` message, the transcript's instruction and skill listings), not from the model's answer. The model's reply is corroboration only.
- **Docs:** read in the official Claude Code docs, fetched as Markdown on 2026-10-13 and matching 2.1.296, with the page and section named.
- **Types:** read in the `claude-code.d.ts` file that the bundled `plugin-authoring` skill writes, on 2026-10-13.
- **Read:** an internal file read on this machine, with the file named. These files are undocumented.
- **Inferred:** a reading of measured output or docs. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does `--settings` take inline JSON, in `-p` and `--bg`? | Yes. Its `env` reaches Bash and hooks | Measured |
| Does an unknown top-level key start? | Yes, silently, and the known keys beside it apply | Measured |
| What does one wrongly typed known key do? | It drops the whole object, with no warning | Measured |
| Does `--setting-sources project` give a clean room? | Of settings, hooks, and plugins. Under `$HOME` the user's `CLAUDE.md` and rules still load | Measured |
| Can a folder ride as `--add-dir` with its own rules? | Yes, with one variable set through the same `--settings` | Measured |
| What hides a repo's `AGENTS.md`? | Any `CLAUDE.md` in a parent folder or in an `--add-dir` folder | Measured |
| Does `doctor` catch a bad object before launch? | For wrongly typed values only | Measured |
| Does a respawned background job keep its settings? | Yes, as given | Measured |
| Does a folder rule steer like an appended prompt? | No gap seen at n = 5 | Measured, first reading |

## The settings flag and a dropped object

**`--settings` takes inline JSON in `-p` and `--bg`, measured on 2026-10-13.**

- `claude -p --model haiku --settings '{"env":{"SK_PROBE":"canary-a"}}' --allowedTools Bash …` returned the canary from a Bash `echo`. Stderr was empty.
- Under `--bg` in the sidekick repo, a `SessionStart` hook from the same kind of object echoed `$SK_PROBE`, and the transcript recorded `hookenv=[canary-a-bg]`. A `claudeMdExcludes` entry in the object dropped one user rule.
- Inferred: the Bash tool sees the same `env` under `--bg`. The probe used no tools, so it did not run.
- `claude --bg` refuses a folder that was never trusted: `Workspace not trusted. Run claude in <folder> once and accept the trust prompt, then retry.` `-p` skips the trust check, so headless probes ran in an empty folder outside `$HOME`.

**An unknown top-level key starts silently, and the known keys beside it apply, measured on 2026-10-13.**

- `--settings '{"sidekick":{"profile":"bench"},"env":{"SK_PROBE":"canary-b"}}'` exited 0 with empty stderr. The `env` canary arrived, and a 385-line debug log named no key.
- A file with the same object behaved the same, in `-p` and in `--bg`.
- The published settings schema on schemastore allows extra keys (the published schema, not the Claude Code docs; fetched 2026-10-13). The Claude Code docs say nothing about unknown keys.

**One wrongly typed known key drops the whole object, silently, in `-p` and `--bg`, measured on 2026-10-13.**

- The same object plus `"permissions":{"allow":"not-a-list"}` returned `SK_PROBE=[]`. Stderr was empty, the debug log held no validation line, and under `--bg` the echo hook never ran.
- The session then runs unprofiled. A launcher that wants to know must check the object before it starts the session.
- Inferred from `doctor` runs on 2026-10-13: other faults, such as a malformed permission rule or an unknown hook event, skip only their own entry. What `doctor` listed was measured, but what the session then loaded was not.

**A mod reads the launched object, and a dropped object looks like no object, measured on 2026-10-13.**

- A probe plugin's `session.start` hook recorded, under `-p --plugin-dir`, `$.settings.read({ source: "flag" })`. With `--settings '{"sidekick":{"profile":"bench"},"env":{"SK_PROBE":"canary-e"}}'` it returned the whole object, unknown key included. The merged read carried `sidekick` too, and `$.env.get("SK_PROBE")` returned `canary-e`.
- Without `--settings` the flag read returned `{}` and `$.env.get` returned `null`.
- With the dropped object, the flag read returned `{}` and `$.env.get` returned `null`, the same as an unprofiled session. A mod cannot tell the two apart.
- `process` is `undefined` in a hooks module. `claude plugin validate` lists the literal names that `$.env.get` reads.
- Types: `$.settings.read` takes the sources `user`, `project`, `local`, `flag`, and `policy`, and "nothing is filtered" at the read (`claude-code.d.ts` lines 3562 to 3585).

## The user layer and the clean room under `$HOME`

**`--setting-sources project` and `""` drop the user's settings layer, measured on 2026-10-13 in `-p` from an empty folder outside `$HOME`.**

| Item | `user,project,local` | `project` | `""` |
|---|---|---|---|
| User `CLAUDE.md` and rules | loaded | not loaded | not loaded |
| User plugins | six | none | none |
| User hook (`cc-status`) | fired on three events | no hooks | no hooks |
| claude.ai connectors | present | present | present |

- Dropping the user source also dropped the synced plugin `cowork-plugin-management@synced`, the `anthropic-skills:*` skills, and the Linear plugin's MCP tools.
- `--setting-sources project` plus `--settings '{"enabledPlugins":{…}}'` naming three plugins loaded exactly those three, with their hooks, and no user hooks.
- Under `--bg` in the sidekick repo, the same flags dropped the user hook and user plugins as `-p` did.
- Dropped with the rest: the user's `model`, `effortLevel`, `attribution`, and `skipDangerousModePermissionPrompt` keys. This was read from `~/.claude/settings.json`, not run. Inferred: a bypass-mode worker could then wait on a dialog nobody sees.

**Under `$HOME`, the clean room keeps the user's instructions, measured on 2026-10-13.**

- From the sidekick repo and from `~/Documents/Projects`, which is not a git repo, `--setting-sources project` still loaded `~/.claude/CLAUDE.md` and every user rule. The transcript's instruction listing typed them `Project`, not `User`.
- That held in `-p` and in `--bg`. The empty folder outside `$HOME` was the exception.
- Inferred: Claude Code reads each parent folder's `.claude/`, and at `$HOME` that is `~/.claude/`.
- `claudeMdExcludes` in inline `--settings`, naming `/Users/<name>/.claude/CLAUDE.md` and `/Users/<name>/.claude/rules/**`, removed those copies under `--setting-sources project`. Three runs on 2026-10-13 carried the excludes: runs 1, 4, and 7 in the AGENTS.md section. None of them loaded the user copies.
- Docs: a `claudeMdExcludes` pattern also excludes a symlink whose target it matches (memory page, §Exclude specific CLAUDE.md files).

**A repo keeps its own plugins in the clean room, but only some in odin. Measured on 2026-10-13 in the bench.**

- In the sidekick repo, the repo's `enabledPlugins` named the same three plugins that the probe enabled, so the clean room and the control matched.
- In odin, `.claude/settings.json` enables seven plugins. A `-p` session loaded hookify, javascript-typescript, and backend-development. The four trailofbits plugins never loaded, with the user layer kept (`bench`) or left out (`bench-clean`). No run omitted the profile.
- `claude plugin list --json` in odin lists those four as `project` scope and enabled. `claude plugin marketplace list` does not list a `trailofbits` marketplace, though odin's settings declare it under `extraKnownMarketplaces`.
- Inferred, not tested: a `-p` session does not install a marketplace that a repo declares.
- So "a clean room keeps the repo's own plugins" holds in the sidekick repo. In odin it held for three of seven. Inferred, not checked: those three come from marketplaces that Claude Code knows.

**Auto memory loads in the clean room, measured on 2026-10-13.**

- The transcript's instruction listing held `MEMORY.md` from the repo's folder under `~/.claude/projects/`, typed `AutoMem`, in the sidekick-repo runs with `--setting-sources project`. Those were a `--bg` session, its two `-p` controls, and runs 1, 4, 5, and 7. It also loaded in the run from `~/Documents/Projects` and in both bench-clean runs, which used `project,local`. The empty-folder probes outside `$HOME` had no memory index, so loading was not checked there.
- No setting that turns it off was looked for. A clean room is therefore free of the user's settings, rules, and plugins, but not of the repo's auto memory.

## The profile folder as `--add-dir`

**A folder loads as a layer of rules, agents, and skills, measured on 2026-10-13.**

The probe folder held a `CLAUDE.md`, a rule under `.claude/rules/`, an agent under `.claude/agents/`, and a skill under `.claude/skills/`, each with a canary string.

| Case | Command shape | Result |
|---|---|---|
| a | `-p --add-dir <folder> --settings '{"env":{"CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD":"1"}}'` | folder `CLAUDE.md` and rule loaded, typed `Project` |
| b | the same variable in the process environment | same as a |
| c | `--add-dir <folder>` with the variable unset | neither loaded |
| d | a plus `--setting-sources project` | folder files loaded, user files not |
| e | a under `--bg` | same as a |

- The variable therefore works from a settings `env` block, which is how a launcher sets it. Docs: memory page, §Load from additional directories.
- The folder's `.claude/agents/` and `.claude/skills/` loaded in every case, whatever the variable said. With tools off the model could not see them. With the Agent and Skill tools on, it listed `probe-agent` and `probe-skill`.
- Case d held outside `$HOME` only. Under `$HOME`, the user files return, as the clean-room section on `$HOME` says.
- The store path itself works: `--add-dir ~/.claude/profiles/<name>` loaded only that folder's files. Claude Code reads no `profiles/` folder on its own (docs, the `.claude` directory page, 2026-10-13).

**A folder's agents and skills load only under the `project` setting source, measured on 2026-10-13.**

- The runs used `-p --model haiku --tools ""` from an empty folder outside `$HOME`, on Claude Code 2.1.296. Each had `--add-dir <folder>` and the variable through `--settings`.
- The folder held a rule, an agent, and a skill. With `--setting-sources local`, the rule loaded and the agent and skill did not. With `project`, all three loaded.
- The docs agree, and add commands: skills, commands, and subagents from an `--add-dir` folder load through the `project` source. Docs: permissions page, §Additional directories grant file access, not configuration. No probe ran a command.
- Consequence for a profile: one whose `settingSources` leaves out `project` loses the folder's agents and skills without a word. So a profile folder holds only rules.

**`--add-dir` is variadic, so it swallows a prompt placed after it, measured on 2026-10-13.**

- `claude --bg … --model haiku --add-dir <folder> "<prompt>"` backgrounded a session that reported `idle — send a prompt to start`. Its stored flags held the prompt as a second `--add-dir` value.
- Placing `--add-dir <folder>` before another flag ended the list. A bare `--` before the prompt also ended it, in all the later runs.
- `--add-dir` refuses a path that does not exist (docs, cli-reference).

**What a folder's own `.claude/settings.json` does, docs-grade, 2026-10-13.**

- It contributes `enabledPlugins` and `extraKnownMarketplaces`. Its skills reload live. Its agents and commands do not.
- Its agents' frontmatter hooks and inline MCP servers are skipped unless the folder is itself trusted, and a `-p` session never counts as trusted.
- Output styles are not read from it.
- Docs: permissions §Additional directories, skills §Live change detection, sub-agents §Hooks in subagent frontmatter.

## `AGENTS.md` and what hides it

**A `CLAUDE.md` in a parent folder or in an `--add-dir` folder stops the repo's `AGENTS.md` loading, measured on 2026-10-13.**

The sidekick repo has an `AGENTS.md` and no `CLAUDE.md`. Seven headless runs started there, each with `--tools ""`. The instruction listing in each transcript gave:

| Run | Flags | `AGENTS.md` | Other instruction files |
|---|---|---|---|
| 1 | `--setting-sources project` plus the user excludes | loaded | repo `MEMORY.md` only |
| 2 | `--setting-sources project` plus the `cc-plugin-agents-md@builtin` option | loaded | user `CLAUDE.md` and rules, typed `Project` |
| 3 | the variable, `--add-dir` of a folder with a `CLAUDE.md` and a rule, user layer on | **absent** | user files, folder `CLAUDE.md` and rule |
| 4 | `--setting-sources project`, the variable, the excludes, the option, the folder from run 3 | loaded | folder `CLAUDE.md` and rule |
| 5 | `--setting-sources project`, the variable, `--add-dir` of the folder from run 3 | **absent** | user copies, folder `CLAUDE.md` and rule |
| 6 | the variable, `--add-dir` of a folder with only a rule, user layer on | loaded | user files, folder rule |
| 7 | `--setting-sources project`, the variable, the excludes, the folder from run 6 | loaded | folder rule only |

- Under `--setting-sources project` in the sidekick repo, `AGENTS.md` dropped in four runs that kept the user copies and used no `AGENTS.md` option. They were the `--bg` clean-room session with `enabledPlugins`, its `-p` control, a `-p` control with no `--settings`, and run 5. Run 2 kept the copies too, and its option restored `AGENTS.md`. Docs, memory page, §When Claude Code reads `AGENTS.md`: by default, any `CLAUDE.md` in a parent folder stops it. The `~/.claude/CLAUDE.md` copy that `$HOME` brings in counts as one.
- A folder's `CLAUDE.md` does the same with the user layer on (run 3). Run 5 left the layer out but loaded the six user copies, which hide `AGENTS.md` on their own, so it cannot isolate the folder file. The case with the user layer off, the excludes set, and no option was not run. A rule in that folder does not (runs 6 and 7).
- The excludes restore `AGENTS.md` when the user copies are the cause (runs 1 and 7).
- The option `pluginConfigs["cc-plugin-agents-md@builtin"].options.instructionFiles: "claude-md-and-agents-md"` in inline `--settings` loads `AGENTS.md` beside the `CLAUDE.md` files (runs 2 and 4). Docs, memory page, §Choose which instruction files load.
- Consequence for a profile: put its stance in `.claude/rules/`, not in a `CLAUDE.md` at the folder's root.

## `doctor`

**`claude --settings <json-or-file> doctor` lists wrongly typed keys under `Invalid settings`, measured on 2026-10-13.**

- It makes no model call and works with no TTY when stdin is `/dev/null`. It took 0.71 s and 0.93 s in two timed runs.
- It exits 0 whether or not it found anything, so only its text tells. The text includes `No installation issues found.` in both cases.
- Given a file, it names that file's path. Given an inline object, it names a temp file called `claude-settings-<hex>.json` under `/tmp/claude-501/`. Inferred: that folder is Claude Code's own. The name changes per run. A later search found no such file, and the named one no longer existed.
- It lists every wrongly typed key, one line each, as `- <path> › <key>: <message>`. A file with `permissions.allow` and `cleanupPeriodDays` both wrong produced two lines. The `permissions` line is followed by a `Suggested fix:` line.
- Measured on 2026-10-13 on Claude Code 2.1.296: `claude --settings <file> doctor < /dev/null` on a file holding `{"sidekick":{"profile":"x"},"feedbackSurveyRate":"sidekick-canary"}` exited 0 in about 1 s. It printed `- <path> › feedbackSurveyRate: Expected number, but received string` under `Invalid settings`, and nothing for the `sidekick` key.
- It says nothing about a misspelled top-level key (`claudeMdExclude`) or a misspelled plugin id (`sidekik@rikmorn`). Both runs looked identical to a clean one.
- This format is undocumented. Inferred: it can change between releases, so a check built on it should fail closed when the text it expects stops appearing.
- What is not covered: an error that drops the whole object without a `doctor` line. Only wrongly typed values were tried.

## Background sessions, respawn, and the daemon

**A `--bg` job keeps its inline `--settings` as given, and `claude respawn` applies it again, measured on 2026-10-13.**

- `claude --bg -n <name> --model haiku --settings '<json with an env block and a SessionStart hook>' …` stored the JSON as one element of `respawnFlags` in `~/.claude/jobs/<id>/state.json` (Read: an undocumented file). No temp path replaced it.
- `claude respawn <id>` printed `respawned <id>`, and the `SessionStart` hook fired again with its `env` value intact. `respawnFlags` were byte-identical before and after.
- Inferred: the respawned job ran in a pre-warmed spare process. Its pid started 25 seconds before the new `startedAt`.
- Not settled: whether the respawn fires `SessionStart` as `startup` or `resume`. The probe cut the hook's stdin before the `source` field.
- Read, in an earlier job's `state.json` on 2026-10-13: a job stored a `--settings` file as its path. Inferred: a respawn then reads whatever the file holds. A launcher that passes inline JSON avoids that.
- Docs: `--settings`, `--setting-sources`, `--add-dir`, and `--plugin-dir` carry over when an interactive session is backgrounded. Neither append flag does (agent-view page, §What carries over).

**A `--bg` job does not inherit the dispatching client's environment, measured on 2026-10-13.**

- `SK_CLIENT=client-canary-p5 claude --bg … --settings '<hook echoing $SK_CLIENT>'` logged `client=[]`. The job's `state.json` held `"providerEnv": {}`.
- `ps` showed the job's process as `claude bg-spare …`, started before the dispatch. Its environment held `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, from the user's `env`, and no `SK_CLIENT`.
- A profile's environment therefore has to travel in `--settings` `env`, which reaches the job.
- Read, with `ps`: the agent-view daemon was started on 2026-10-10 by an odin session, and it keeps the environment of the process that started it. Inferred: a profiled session that starts the daemon could hand its `env` to later jobs. The probe did not start a daemon.

**Append flags reach `--bg`, measured on 2026-10-13.** `claude --bg --append-system-prompt-file <file> '<prompt>'` put the file's canary line into the recorded system prompt, and the session quoted it.

- Docs: a resumed conversation reuses the recorded system prompt until compaction. New flag text then applies only after compaction, unless `--system-prompt-snapshot off` is set (cli-reference, §System prompt flags in resumed conversations).
- Inferred: a `--bg` launch stores its flags as given, so an append flag is likely kept on respawn. Not measured.
- `claude agents --json` gives `cwd`, `id`, `kind`, `name`, `pid`, `sessionId`, `startedAt`, `state`, and `status`. It names no settings and no profile (measured on 2026-10-13).
- `--agent` with a non-empty prompt replaces Claude Code's system prompt, as `--system-prompt` does, and `--bg` accepts it (docs, sub-agents and agent-view pages).

## Plugin options and the installed CLI

- `pluginConfigs["<plugin id>"].options` in `--settings` reach a mod's `options` and a hook's `CLAUDE_PLUGIN_OPTION_*`, only for fields the plugin's `userConfig` declares. The id is `sidekick@inline` under `--plugin-dir`. Docs: settings reference and plugins reference, 2026-10-13. The context monitor reads one such option (`bin/helpers/context-monitor.ts`).
- `pluginConfigs` is read from user settings, managed settings, and `--settings`, never from project or local files. A `userConfig` option that is neither `sensitive` nor `multiple` shows as a row in `/config`. Docs, settings reference §`pluginConfigs`, and plugins reference §User configuration.
- How a flag-level `pluginConfigs` merges with a user's own entry was not measured. The operator's user settings held no `pluginConfigs` on 2026-10-13 (Read: `~/.claude/settings.json`).
- Outside a session, `sidekick` is not on `PATH`. `claude plugin list --json` gives each install's `installPath` and `version`, and it also lists project-scope installs, so filter on `scope == "user"`. It took 0.7 s here (measured on 2026-10-13). Docs: plugins CLI reference, §plugin list. `bin/release-install.sh` already reads it this way.

## The bench and the steering test

The bench ran the feature's own `profile argv` output for two fixture profiles, `bench` (user layer kept, with changes) and `bench-clean` (user source left out), in two repos, with `claude -p --model haiku --tools "" --output-format stream-json --verbose … 'Reply with the single word ok.'`. All four runs exited 0 with empty stderr, and the `doctor` check inside `argv` passed in each. Run on 2026-10-13, Claude Code 2.1.296.

**Plugins come from the stream's init line.** The first stream line is a `hook_started` event, not the init object. The loaded plugins are in the later `{"type":"system","subtype":"init"}` line, field `plugins`. Each run also loaded the three built-ins `cc-plugin-agents-md`, `cc-plugin-telemetry`, and `cc-plugin-plugin-authoring`.

| Run | Non-built-in plugins that loaded | Instruction files that loaded |
|---|---|---|
| `bench`, sidekick repo | code-review, linear, superpowers, sidekick, cowork-plugin-management; `claude-code-setup` absent as the profile disabled it | user `CLAUDE.md` and four user rules without `about-me.md`; the profile's rule; `AGENTS.md`; `MEMORY.md` |
| `bench-clean`, sidekick repo | sidekick, superpowers, code-review | the profile's rule, `AGENTS.md`, `MEMORY.md`; no user entry |
| `bench`, odin | code-review, linear, superpowers, sidekick, hookify, javascript-typescript, backend-development, cowork-plugin-management | the same user files; odin's `CLAUDE.md` and four rules; the profile's rule; odin's `MEMORY.md` |
| `bench-clean`, odin | hookify, javascript-typescript, backend-development, sidekick, superpowers, code-review | odin's files, the profile's rule, odin's `MEMORY.md`; no user entry |

- The user's `cc-status` hooks ran in both `bench` runs and in neither `bench-clean` run. The Linear plugin's tools were absent from both `bench-clean` runs, and the claude.ai connectors were present in all four.
- The odin runs also loaded odin's repo MCP servers (`awsdocs`, `graphos-tools`, and `github` connected, and `linear` disabled), in `bench` and in `bench-clean` alike. The clean room does not drop the three connected servers. Whether they come from a repo `.mcp.json` or from odin's settings was not checked.
- Every instruction path that came from the profile came from the temp store, not from the repo's committed fixture copies.
- Two results contradicted what the design expected. They are odin's four missing plugins and auto memory in the clean room, both in the clean-room section on `$HOME`.
- Not run: a refusal path in the bench, a control run without a profile in each repo, and an agent with frontmatter hooks. Unit tests cover the refusal with an injected runner.

**A folder rule steered as well as an appended prompt in five of five paired replies, measured on 2026-10-13 in the sidekick repo.**

- The "profile" runs used a profile whose only rule said: `End every reply with the exact line: -- steered --`. The "append" runs used no profile and `--append-system-prompt` with the same sentence. Both kept the user layer and `AGENTS.md`.
- Five one-line prompts ran once per path (arithmetic, a primary colour, a capital, a rhyme, days in a week). The profile path ended on the exact line 5 of 5 times, and the append path 5 of 5 times.
- This is a first reading of whether a folder rule steers as well as an appended prompt: no gap seen at n = 5. It is not proof of equal strength. Both paths followed a trivial instruction, and a harder or longer one was not tried.
- One side effect, from a single sample: the append reply to the capital question added a remark from the user's `CLAUDE.md` labelling its sources. The profile reply did not.
- Inferred from the docs read on 2026-10-13: a rule from `--add-dir` loads as memory, not into the system prompt. It therefore sits in a different place in the context than an appended prompt.

**`sidekick profile launch --bg` started a profiled background session, measured on 2026-10-13.**

- It ran in the sidekick repo from the built bundle, with a copy of `bench-clean` that added `"model": "haiku"` to its settings.
- With the agent-view daemon running, it exited 0 in 1.68 s. With no daemon running, it printed `Starting background service…`, started one, and exited 0 in 2.07 s.
- Both jobs replied `ok`. Each loaded the profile's rule, `AGENTS.md`, and `MEMORY.md`, and no user file.
- The job's `respawnFlags` held `--add-dir <store>/bench-clean`, the settings JSON, and `--setting-sources project,local`.
- Read with `lsof`: both daemons had stdin and stdout on `/dev/null` and stderr on a log file. So a daemon does not hold the launching process's pipes.

## Not tested

- Whether deleting a profile folder stops its running jobs respawning. The docs suggest it would. Nothing was deleted.
- Whether a resume under a different `--add-dir` reloads the folder's rules.
- Whether a setting turns off auto memory in a clean room.
- Whether the Bash tool under `--bg` sees a settings `env` value. A hook did.
- The `sandbox` settings, or file-system permissions, as a boundary around a profile folder.
- Whether a `-p` session installs a repo-declared marketplace. The cause of odin's missing plugins is a reading only.
