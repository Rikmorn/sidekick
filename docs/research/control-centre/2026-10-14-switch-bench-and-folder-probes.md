> Research for the `control-centre` design (R9, #213). It ran on 2026-10-14 on Claude Code 2.1.299, in two sessions. The worker session that built #213 ran the bench. The session that reviewed #213 re-read the bench's transcripts and ran the other probes. It records what the profile switch and the plugin dependency check rest on, beyond the earlier report of the same day. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: the switch bench, `plugin list` under a profile, and a session's folder (2026-10-14)

`2026-10-14-repo-profiles-and-switching-probes.md`, called "the earlier report" here, measured what #213 was designed on. Its "Switching by resume" section left MCP server instructions and hooks unmeasured. This report answers both, through the bench #213 ran on its built CLI. It also covers two more things the review measured. One is where a resume should start. The other is how `plugin list` behaves under the flags the dependency check passes. Sessions ran `claude -p --model haiku`, with stdin from `/dev/null`.

Provenance grades:

- **Measured:** run by the reviewing session on 2026-10-14, with the command and the observed output named.
- **Bench:** run by the bench on 2026-10-14, in a scratch git repo with the CLI built at `03ef627`. Where a row says so, the reviewing session re-read the transcript lines it cites. Session ids name transcripts under `~/.claude/projects/`, and line numbers count from 1.
- **Inferred:** a reading of measured output. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Does a resume under another profile withdraw a dropped plugin's MCP server instructions? | Yes, by a removal delta, and its tools leave the deferred list | Bench, transcript re-read |
| Do the new profile's hooks run at the resume? | Yes: `SessionStart` with `source: "resume"`, and `UserPromptSubmit` | Bench |
| Do `doctor` and `plugin list` run a profile's hooks? | No `SessionStart` or `UserPromptSubmit` hook fired during either | Bench |
| Does `--resume <id>` find a session from another folder? | Yes, from a subfolder and from outside the repo, under `-p` | Bench, transcript re-read |
| Does a session's shell stay where `cd` leaves it? | Yes, and the transcript's `cwd` follows it | Measured |
| Does a session started in a subfolder load the repo top's `.claude/settings.json`? | No | Measured |
| What does leaving out the user source drop from `plugin list`? | Only the synced-scope entry. Every user-scope install stays listed | Measured |
| Does a clean room keep a dependency error? | Only where a kept source enables the dependent plugin | Measured |

## Resume under another profile

The bench started session `a499595e-8101-492f-91f7-7594ec22a231` under a repo profile `bench-a`, then resumed it under `bench-b`. `bench-b` turned off `linear@claude-plugins-official`, whose MCP server gave instructions at the start. It also declared `SessionStart` and `UserPromptSubmit` hooks, each appending its input to a file outside the transcript.

| Part | After the resume | Transcript line |
|---|---|---|
| Rules | `bench-b`'s rule under `files`, `bench-a`'s under `removed`, `reason: "session_start"` | 41 |
| A plugin `bench-b` enables | a `skill_listing` delta naming only its skill | 38 |
| The dropped plugin's MCP instructions | an `mcp_instructions_delta` with `addedNames: []` and `removedNames: ["plugin:linear:linear"]` | 37 |
| The dropped plugin's tools | a `deferred_tools_delta` removing 82 names, each `mcp__plugin_linear_linear__*` | 36 |
| The original instructions block | still in the history at line 12, followed by the removal at line 37 | 12, 37 |
| `bench-b`'s hooks | ran: the file gained two lines, `SessionStart` with `source: "resume"`, then `UserPromptSubmit` | none |

The reviewing session re-read lines 12, 36, 37, 38, and 41. The hook file was removed at the bench's cleanup, so the hook rows rest on the bench's account. The transcript holds no record of either hook. Inferred from that: a hook that prints nothing leaves no trace in the transcript.

The file stayed empty after `sidekick profile switch bench-b` and `sidekick profile argv bench-b` ran. Both run `claude doctor` and `claude plugin list` under `bench-b`'s settings, so neither fired those two hooks. Other settings keys that run a command were not tried.

Not exercised: a dropped plugin's skills, since linear ships none, and `env`, permissions, and the model across a resume.

## A resume from another folder

Session `4b854c5f-85a5-4fe5-be25-fbdacfb9259e` started in the scratch repo's top, asked to remember a word. It was then resumed with `--resume <id>` from the repo's `sub/` folder, and again from a folder outside the repo. Both resumes answered with the word, under the same session id. Every turn went into the one transcript, each user and assistant record carrying the folder it ran in (re-read by the reviewing session). The resume from outside the repo created a project folder for that path, holding an empty `memory/`.

So under `-p`, `--resume <id>` finds a session from any folder. The folder decides what else the resumed session loads, as "A session's folder" shows. An interactive `--resume` was not run.

## A session's folder

**The shell stays where `cd` leaves it.** In the reviewing session, a Bash call ran `cd bin`, and the next call's `pwd` printed `…/sidekick/bin`. `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` was unset. The transcript records written after that call carried `cwd: …/sidekick/bin`, where earlier ones carried the repo's top.

**Project settings come from the start folder only.** Two sessions ran with the user source left out, one at the sidekick repo's top and one in `bin/helpers`:

```
claude --setting-sources project -p --model haiku --output-format stream-json --verbose "Reply with the word ok."
```

Each run's `init` event listed its plugins. At the top it listed `sidekick`, `superpowers`, and `code-review`, which the repo's `.claude/settings.json` enables. In `bin/helpers` it listed none of the three. Both listed the same three `cc-plugin-*` plugins, which no file in the repo enables.

Together: a session's shell can drift into a subfolder, so its current folder is not its start folder. A resume started from the drifted folder would load that folder's project settings, not the top's (inferred from the two runs).

## `plugin list` under a profile's flags

Each run used `claude [flags] plugin list --json`, in the sidekick repo and in a scratch git repo with no settings:

| Flags | Sidekick repo | Scratch repo |
|---|---|---|
| none | 48 entries, 17 user-scope | 48 entries, 17 user-scope |
| `--setting-sources project,local` | 47 entries, 17 user-scope | the same |
| `--setting-sources project` | 47 entries | 47 entries |
| `--settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}'` | 6 entries carry `dependency-unsatisfied`, all `sidekick@rikmorn` | the same |
| that `--settings` with `--setting-sources project,local` | still 6 | none |

- The one entry lost without the user source is `cowork-plugin-management@synced`.
- Naming that id `true` in `--settings`, under `--setting-sources project,local`, still listed no `@synced` entry.
- The six entries are sidekick's install records, one user-scope and five project-scope for other folders, each carrying the same detail.
- The sidekick repo's project settings enable sidekick, and the scratch repo's do not. So a clean room keeps a dependency error only where a kept source enables the dependent plugin. Two repos back it; no third was run.

A profile in a scratch store set `settingSources: ["project", "local"]` and named `cowork-plugin-management@synced` `false`. `sidekick profile show`, built from the #213 branch, printed `plugins: refused`, naming the id as unlisted.

## Sources

- The bench's transcripts, in the `~/.claude/projects/` folder for the scratch repo's path. Sessions `a499595e-8101-492f-91f7-7594ec22a231` and `4b854c5f-85a5-4fe5-be25-fbdacfb9259e`. The bench's own notes and hook file were scratch and were removed.
- The reviewing session's transcript, for the drifted `cwd`.
- `claude --version`: `2.1.299 (Claude Code)`.
