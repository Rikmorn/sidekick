> Research for the `control-centre` design (R9, #207, #208, #225). Claude ran it on 2026-10-15 in a session with the operator, on Claude Code 2.1.300. It records what sidekick's first hooks module and the gauge rest on. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Probes: the mod foundation and the gauge (2026-10-15)

R9's plan 6 adds sidekick's first mod, the gauge, and the checks around it. Its design left a set of mechanism facts unknown. This report measures them with scratch plugins under `--plugin-dir`, run headless with `claude -p` and in the background with `claude --bg`. The earlier status-line probe in `2026-10-12-probes.md` is re-run, not repeated.

Provenance grades:

- **Measured:** run on 2026-10-15, with the command and the observed output named. Hook output was read from files the probe hooks wrote in `$TMPDIR`. Screens were read by replaying `claude logs <id>` through `pyte` at 200 columns. Transcripts were read under `~/.claude/projects/`.
- **Read:** read on 2026-10-15 in the declaration file the bundled `plugin-authoring` skill writes for 2.1.300, or in the docs, with the place named.
- **Inferred:** a reading of measured output or what was read. Nothing tested it.

## Summary

| Question | Answer | Grade |
|---|---|---|
| Do `claude plugin validate` and `claude plugin test` catch a type error? | No. A string assigned to a `number` export passed both, exit 0 | Measured |
| Does `validate` catch an import the loader refuses? | Yes, exit 1: "cannot import "valibot" … a hooks module imports its own files by relative path and "claude-code", nothing else" | Measured |
| Does `claude plugin test` pass when the module cannot load? | Yes, when no test imports the module | Measured |
| Do `validate` and `test` need a sign-in? | No. Both ran with an empty `CLAUDE_CONFIG_DIR` on macOS | Measured |
| Does a headless run load a `--plugin-dir` module and fire its events? | Yes: `session.start`, `session.measure`, and `classic.PostToolBatch` all fired under `claude -p` | Measured |
| How does a headless run report a module that did not load? | On stderr, as "brokenprobe: hooks module did not load: …", and the run still exits 0. A `--output-format json` run prints nothing about it | Measured |
| Where do a `SessionMode` label and a `$.ui.status` line draw? | The label at the right of the status line's row. The status line directly above a custom status line, as `⚠ <plugin>: <text>` | Measured |
| Does `$.session.usage({ breakdown: 'summary' })` answer in `session.start`? | Yes, before any response. It took 50 ms at start, and 13 to 16 ms in later calls | Measured |
| Does a variable the module sets reach the plugin's settings hooks? | Yes. Set in `session.start`, it reached `UserPromptSubmit` and `Stop` hooks. Set in `classic.PostToolBatch`, it reached that same event's settings hook | Measured |
| What does `$.session.model()` return? | The model id the transcript records: `claude-opus-5-5` for the operator's default, `"model": "opus"`, on a 1M window; `claude-haiku-5-5` and `claude-sonnet-5-5` for `--model haiku` and `--model sonnet` | Measured |
| Where does Claude Code compact? | At the compaction window less 33,000 tokens, on Haiku 5.5, Sonnet 5.5, and Opus 5.5 | Measured |
| Which settings set the compaction window? | `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, raised to a 100,000 floor; the `autoCompactWindow` setting, 100,000 to 1,000,000; and the `--autocompact` flag | Measured and read |
| Does a `PostToolBatch` hook's `systemMessage` reach the operator? | Yes. It shows under the tool's row as `⎿ PostToolBatch says: <text>`, and the transcript records it | Measured |
| Where can a session get the API's declarations? | Only where the `plugin-authoring` skill loads, a headless `claude -p "/plugin-authoring …"` included, or beside a mod a session hot-reloads | Measured |
| Does the engine write files into a `--plugin-dir` folder? | Yes: `.claude-plugin/types/`, with a `.gitignore` of `*`, and a root `tsconfig.json` when none exists. It left an existing root `tsconfig.json` untouched | Measured |

## Type checks and the loader

A scratch mod, `gaugeprobe`, held a module, a logic file, and a test file importing `claude-code/testing`.

- `claude plugin validate .` listed the module's hooks, calls, and environment reads, and passed. `claude plugin test .` ran two tests and passed.
- An export `wrong: number = "not a number"` appended to the logic file left both at exit 0. Only `tsc` against the declarations catches it.
- A copy whose module imported `valibot` failed `validate` with exit 1. `claude plugin test` still passed, since its one test imported the logic file, not the module.
- With `CLAUDE_CONFIG_DIR` pointed at an empty folder, `validate` and `test` both exited 0.
- `tsc` with the engine's laid config rejected the probe's `.ts`-suffixed relative imports (`TS5097`). Anthropic's own mods import without a suffix.

## Headless runs

`claude -p "Reply with the single word ok." --model haiku --plugin-dir <probe> --settings '{"sidekick":{"profile":"probe"}}'` ran from a scratch folder.

- `session.start` read the flag source as `{"sidekick":{"profile":"probe"}}`, and `$.session.version()` as `2.1.300`.
- `session.measure` fired after the turn with window 1,000,000, tokens 42,441, threshold 967,000, and auto-compaction on.
- The broken copy printed `brokenprobe: hooks module did not load: cannot import "valibot" (from hooks/register.ts): …` on stderr. The run exited 0. With `--output-format json`, the same run printed nothing about the module.
- The turn in the scratch folder counted 42,441 input tokens. A run in this repository counts more, since its rules and memory load (inferred).

## Drawing beside a custom status line

Two `claude --bg` sessions on Haiku ran in this repository with the probe under `--plugin-dir`, beside GSD's status line. One carried `--settings '{"sidekick":{"profile":"probe"}}'`, and one did not. The module appended `profile: probe` to `SessionMode`'s `modes`, and called `$.ui.status` when the flag held no profile.

```text
  Haiku 5.5 │ sidekick ░░░░░░░░░░ 8%                                   profile: probe
  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
```

```text
  ⚠ gaugeprobe: GAUGEPROBE no profile
  Haiku 5.5 │ sidekick ░░░░░░░░░░ 8%
  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
```

The replay is only legible at 200 columns, the width the background session drew at. Narrower widths were not tried.

## The process environment

A module calls `$.env.set`, which the declaration file describes as setting a variable "for this process and everything it starts after". Its name must be a string literal, which `validate` lists under `env writes:` (read, `claude-code.d.ts:3683-3692`).

- Set in `session.start` to `67000`, `SIDEKICK_PROBE_WINDOW` printed `67000` from both a `UserPromptSubmit` and a `Stop` hook in the same plugin.
- Set in `classic.PostToolBatch` to the batch's count, `SIDEKICK_PROBE_BATCH` printed `1:16` and `2:13` from the plugin's `PostToolBatch` settings hook, in two read batches. Each settings hook saw the value set in its own event. The declaration file gives the chain as "[managed settings hooks, ...hooks modules, the other settings hooks as core]" (read, `:1277`).
- `validate` warns that hooks on `classic.*` events "do not run in a plugin a person installs where an organization manages Claude Code". It lists the hook as a gating hook without `.catch`, since that event can block.
- That every later child process inherits the variable, Bash commands and `claude` sessions included, is read, not measured.

## Usage, the model, and the compaction point

The probe read `$.session.usage({ breakdown: 'summary' })`, `$.session.id()`, and `$.session.model()` in `session.start`, and timed the usage call with `$.clock.now()`.

| Run | `model()` | `window` | `rawMaxTokens` | `autoCompactThreshold` |
|---|---|---|---|---|
| `--model haiku`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=60000` | `claude-haiku-5-5` | 1,000,000 | 100,000 | 67,000 |
| the default `opus`, `autoCompactWindow: 100000` | `claude-opus-5-5` | 1,000,000 | 100,000 | 67,000 |
| `--model sonnet`, `autoCompactWindow: 200000` | `claude-sonnet-5-5` | 1,000,000 | 200,000 | 167,000 |
| `--model sonnet`, nothing set | `claude-sonnet-5-5` | 1,000,000 | 1,000,000 | 967,000 |

- `$.session.id()` matched the run's `session_id` in `-p` output.
- The default run's transcript recorded `claude-opus-5-5` on each main-thread assistant entry, the same id `model()` returned.
- The docs' settings reference gives the order: `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, then `--autocompact`, then `autoCompactWindow` (read).
- The margin is the same 33,000 tokens on all three models (inferred from the four rows). Whether it holds on other builds is not known.

## `systemMessage` from `PostToolBatch`

The probe's `PostToolBatch` settings hook printed `{"systemMessage":"PLANPROBE-SYS-MSG"}`.

- Headless, with `--output-format stream-json --verbose`, each batch produced `{"type":"system","subtype":"informational","content":"PostToolBatch says: PLANPROBE-SYS-MSG","level":"notice",…}`.
- The transcript recorded the text.
- In a background session, the screen showed `⎿  PostToolBatch says: PLANPROBE-SYS-MSG` under `Read 1 file`.

## Files the engine writes

A background session loaded each probe folder with `--plugin-dir`.

- The engine wrote `.claude-plugin/types/` with `claude-code/index.d.ts` (650,711 bytes), `claude-code-tools/index.d.ts`, `claude-code-mcp/index.d.ts`, a `tsconfig.json`, and a `.gitignore` of `*`. The MCP file lists the tools of the servers connected in that session.
- In a folder with no root `tsconfig.json`, it wrote one holding `{ "extends": "./.claude-plugin/types/tsconfig.json" }`.
- In a folder whose root `tsconfig.json` held other content, it left the file byte for byte as it was.
- The laid `tsconfig.json` includes `../../hooks`, `../../types`, and `../../tests`.
- A headless `claude -p "/plugin-authoring Reply with the single word ok and nothing else." --model haiku` wrote a fresh skill folder under `/tmp/claude-<uid>/bundled-skills/2.1.300/<hash>/`, with `types/claude-code.d.ts`. That file appends the built-in tools to the API. The diff of two writes for 2.1.300 ran to 15 lines, all in the tools section.
