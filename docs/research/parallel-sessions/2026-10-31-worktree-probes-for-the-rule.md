# Worktree probes for the parallel-sessions rule

Research for #286, the parallel-sessions rule and its per-repo worktree settings. It answers the probes #286 asks for, before the rule is written:

- which command spellings pass Claude Code's isolation guard;
- whether a hook can start a worktree's setup;
- which spelling gives each base;
- what each repo's gates need inside a worktree.

Run on 2026-10-31 on Claude Code 2.1.316, in sidekick at `43fc153` and in the work repo at its `origin/main`. The work repo is a TypeScript monorepo on Yarn 4, named in generic terms because this repo is public.

## Sources

- A pass over every session transcript under `~/.claude/projects/` on 2026-10-31. It joined each refusal by the guard to its command and classified the command by shape. The transcripts span 2026-10-07 to 2026-10-31, on Claude Code 2.1.292 to 2.1.316.
- Five probes, P1 to P5, each under its own heading.
- A read-only survey of the work repo's configuration. It covered `package.json`, the Biome, TypeScript, and Vitest configs, and the Compose file. It also covered the CI workflow, the husky hooks, and the `.claude/` settings and hooks.
- superpowers 6.4.1's `finishing-a-development-branch/SKILL.md`, read.

## The guard's refusals in the transcripts

All measured, unless marked inferred.

The guard refused 452 commands in 29 top-level sessions, and 370 of them (82%) came from subagents. The parallel-sessions design counted about 120 in 16 sessions; that sweep read top-level transcripts only (inferred).

Every Bash refusal opens with "This session is isolated in the worktree `<path>`, but this command …". The commonest reasons:

| Reason | Count |
|---|---|
| "is too complex to verify that it stays inside the worktree" | 162 |
| "names git in a form too complex to verify …" | 124 |
| "runs `<cmd>` with a value computed at runtime … so what it runs cannot be shown not to be git" | about 70 |
| "changes directory to the shared checkout … before running git" | 7 |
| "points git at a directory computed at runtime (-C .)" or "redirects git to the shared checkout via -C" | 6 |

The refusal rate by shape, over the 7,690 Bash calls run inside a worktree in the transcripts that hold a refusal:

| Shape | Refused |
|---|---|
| git with literal arguments, with pipes, `&&`, `;`, or redirects | 1–3% |
| Several git calls in one command | 2% of 626 |
| git beside an unquoted `$…` | 87 of 89 |
| git beside a double-quoted `$…` | 18 of 135 |
| git inside a `( … )` subshell | 13 of 14 |
| `git -C` | 13 of 15 |
| A heredoc as the whole command, no backtick in its body | 0 of 59 |
| A heredoc chained with other commands | 145 of 449 |
| No git, an unquoted `$VAR` | 96 of 377 |

- 243 of the 452 refusals (54%) name no git at all. The check that a command "cannot be shown not to be git" catches sed, python, node, docker, find, and awk beside a variable.
- 259 refusals involve an ordinary workflow command: an install, the tests, a type check, a lint, or a plain git command. Most were refused for something else on the same line: 108 had a `$…` beside git, and 80 a heredoc. The same command without that part passed.
- GNU-style `sed -i 's/…/' f` is refused on macOS, where `-i` takes the next word as a backup suffix; `sed -i '' 's/…/' f` passes.
- No version in the range changed the behaviour: every kind of message appears across all of it.

## P1. An interactive session moves into a worktree

In sidekick. An interactive session ran in a tmux pane on Sonnet 5.5 in `bypassPermissions`. It was told to move into a worktree for the probe, and given 31 fixed steps. The screen was captured every 4 seconds. All measured.

- `EnterWorktree` made `.claude/worktrees/probe-286-p1` on `worktree-probe-286-p1`. Under the default `"fresh"`, it started at `origin/master` (`b708f0c`), while the main checkout held the milestone branch at `43fc153`.
- `.worktreeinclude` copied both ignored type folders. In the worktree, `bun install` took 1.3 seconds. `bun run typecheck`, `test` (1,210 passing), `check`, and `check:docs` all passed.
- A commit in the worktree passed. A Read of a plan in the main checkout's ignored `docs/superpowers/` passed.
- Four commands were refused, as the guard's docs say: a Write into the main checkout, `cd <main> && git status --short`, `git -C . status --short`, and `B=$(git branch --show-current); echo "$B"`.
- `git reset --hard milestone/r10-memory-and-parallel-sessions` passed, and moved the worktree's branch to the milestone tip.
- `ExitWorktree` with `remove` then refused: "Worktree has 29 commits on “worktree-probe-286-p1”. Removing will discard this work permanently." It counts commits from the base the worktree started at, so the milestone's commits read as work. A second call with `discard_changes: true` removed the worktree and its branch.
- sidekick's mods held through the move and back. The identity row stayed `sidekick-a4 · your main · no profile`. The status line followed the worktree's folder and branch. The board line refreshed after the worktree's commit, and no mod reported an error.

## P2. Hooks when a worktree is made

In sidekick, two headless runs on Haiku. Probe hooks passed through `--settings` logged each event's payload and working folder. On `SessionStart` and on `PostToolUse` for `EnterWorktree`, each started a detached `sleep 15` that then wrote its folder. Each returned a marker as additional context. Run A called `EnterWorktree` mid-session; run B started with `-w`. All measured.

- `PostToolUse` fires for `EnterWorktree`. The payload's `cwd` and the hook's own working folder are the new worktree. `tool_response` carries `worktreePath`, `worktreeBranch`, and a message.
- `SessionStart` under `-w` carries the worktree as its `cwd`, with `source` set to `startup`.
- The detached processes from both hooks ran in the worktree and outlived their hook.
- Claude Code discarded the `EnterWorktree` hook's context, and logged a non-blocking error:

  ```text
  hook output parsed as a document that grants, rewrites or injects, but its stdio went quiet before end-of-stream and a dropped later document could have changed it; refusing to honor the suspect capture
  ```

  The background list held the hook's stdout open, because only the inner command's streams were redirected.
- The `SessionStart` hook's context, from the same script, reached the model. Why the two events differ was not probed.
- A third run set `{"env": {"PROBE_ENV_X": "…"}}` through `--settings`, and its `SessionStart` hook read that value. A settings file's `env` therefore reaches hook processes.

Run D settled the difference between the two events. Its `EnterWorktree` hook started no background process and returned a marker synchronously, and that context reached the model. The same run measured three more facts:

- `PreToolUse` fires for `EnterWorktree`, with the main checkout as its `cwd`.
- `EnterWorktree` honoured `worktree.baseRef: "head"` from settings passed through `--settings`. It started at the milestone tip, `43fc153`.
- A general-purpose subagent of the worktree session fired `SubagentStart` with the worktree as its `cwd`. That hook's context reached the subagent's transcript.

## P3. Hooks when the guard refuses

From run A, which ran `git -C . status --short` in its worktree. All measured.

- `PostToolUseFailure` fires on the refusal. Its payload carries the refusal text in `error`, and the command in `tool_input`. Its additional context reached the model, by a grep of the transcript.
- `PreToolUse` fires before the refusal, with the command.
- `PermissionDenied` does not fire.
- The refusal of `git -C .` ends "Run the equivalent from" the main checkout's path, a folder the guard would also refuse. The session ran `git status --short` instead.

Run C, a third headless Haiku run with the same hooks, started with `-w`. It had a general-purpose subagent run `git -C . status --short`. All measured.

- The guard refused the subagent's command too.
- `PreToolUse` and `PostToolUseFailure` fired for it, with the subagent's `agent_id` and `agent_type` in the payload.
- The `PostToolUseFailure` hook's context reached the subagent's own transcript.

A subagent's context also holds the user-level rules. A general-purpose subagent's transcript from 2026-10-31 held every rule under `~/.claude/rules/` that has no `paths:` list, and the repo's `AGENTS.md` (measured).

## P4. Which spelling gives which base

| Spelling | Started at | Probe |
|---|---|---|
| `EnterWorktree`, under `"fresh"` | The remote's default branch: `origin/master` in sidekick | P1, P2 run A |
| `claude -w <name>` under `"fresh"` | `origin/main` in the work repo | P5 |
| `claude -w <name> --settings '{"worktree":{"baseRef":"head"}}'`, launched from the checkout holding the integration branch | That checkout's `HEAD`, the milestone tip | P2 run B |
| `EnterWorktree` with `worktree.baseRef: "head"` in settings | The session's checkout's `HEAD`, the milestone tip | P2 run D |
| `EnterWorktree`, then `git reset --hard <integration branch>` | That branch's tip. `ExitWorktree` then counts its commits as work | P1 |

## P5. The work repo's usual commands in a worktree

A headless run on Sonnet 5.5, `claude -p -w probe-286` in `bypassPermissions`, after `git fetch origin`, with 23 fixed steps. All measured.

- It started at `origin/main` on `worktree-probe-286`. The guard refused no command.
- Absent from the worktree: `.env`, the other env files, and the ignored secrets folder, since the repo has no `.worktreeinclude`. Also absent: the repo's per-branch context file, so its `SessionStart` hook printed nothing.
- Before any install, `node -e "require.resolve('typescript')"` resolved to the main checkout's `node_modules`. The worktree sits inside the main checkout, so Node's lookup walks up into it. `yarn ts:ci` refused instead: "Couldn't find the node_modules state file - running an install might help".
- `yarn install` took 19 seconds. After it, `yarn ts:ci` and `yarn lint:ci` passed. The unit tests passed (4,880 tests in 451 files) against the running DynamoDB Local container, started under `COMPOSE_PROJECT_NAME` set to the repo's name.
- A commit ran the main checkout's husky hooks, since `core.hooksPath` is an absolute path into the main checkout, and passed the guard.
- `git reset --hard HEAD~1` was denied by `Bash(git reset --hard*)`. Only the repo's `.claude/settings.local.json` holds that rule, so that file applies inside a `.claude/worktrees/` worktree. This confirms the design's K12.
- `git worktree remove` took 12 seconds with the install inside.

## Per-repo checks

| Check | sidekick | The work repo |
|---|---|---|
| A local service the gates need | None: no test opens a port or a database | DynamoDB Local in Docker, on port 8000 with a fixed container name. A worktree's Compose project takes the worktree's folder name, so it starts a second container that clashes. Setting `COMPOSE_PROJECT_NAME` to the repo's name shares one container, and per-file table names keep the data apart. Stopping it, as `test:terminate` does, stops it under every session |
| Linters run from the main checkout beside a nested worktree | Pass. Biome reads `.gitignore`, which ignores `.claude/worktrees/`. `tsc` includes `bin/**`, `bun test` runs `bin/`, and `check:docs` walks `git ls-files` | Biome fails: "Found a nested root configuration, but there's already a root configuration", for `.claude/worktrees/<name>/biome.jsonc`. Its config sets `vcs.useIgnoreFile` to `false`. `tsc` and Vitest include root-relative globs only |
| Setup | `bun install` | `yarn install`, which needs `NODE_AUTH_TOKEN` for a private registry. Generated code is tracked, so no generate step |
| Ignored files a worktree needs | `.cache/claude-code-types/` and `plugin/.claude-plugin/types/`, already in `.worktreeinclude` | None for the gates. Synth, deploys, and the repo's toolkit need the env files, a secrets folder, and a tunnel config |

## superpowers' finishing step against `.claude/worktrees/`

From `finishing-a-development-branch/SKILL.md` in superpowers 6.4.1.

- Step 6 removes a worktree "under `.worktrees/` or `worktrees/`" (`:169-175`). `.claude/worktrees/<name>` contains `worktrees/`, so a literal reading takes it as superpowers' own.
- Option 1, merge locally, and the discard path both open with `cd "$MAIN_ROOT"` and then run git (`:88-96`, `:148-151`). P1 measured that shape refused.
- Inferred: in a Claude Code worktree session, both stop at the guard before Step 6's `git worktree remove` runs. `ExitWorktree` removes the worktree instead, which the skill's last line allows: "If your platform provides a workspace-exit tool, use it."

## What follows for #286

Inferred from the results.

- The rule's spellings come from the transcript table. Run one git command per call with literal arguments. Keep `$…` away from git, and use no `git -C`, subshell, or chained heredoc. Write files with the Write tool, and use `sed -i ''` on macOS.
- Most refusals happen in subagents, which already hold the user-level rules, and `sk-worker`'s paragraph on the guard. A `PostToolUseFailure` hook answers a refusal when it happens, in a subagent too, and `PreToolUse` could catch one before it does.
- A hook can start a worktree's setup, from `PostToolUse` on `EnterWorktree` or from `SessionStart` with a worktree as its `cwd`. Its background process must close every stream it inherits from the hook. A value in a settings file's `env` can name the command, and `settings.local.json` serves a repo whose tracked files need a team's agreement.
- Without its install, a nested worktree can run against the main checkout's dependencies, so setup carries weight.
- A feature worktree off a branch other than the default starts with `-w` and an inline `baseRef: "head"`, or with a reset after `EnterWorktree`. After a reset, removing it takes `discard_changes`.
- The work repo needs `COMPOSE_PROJECT_NAME` for test runs side by side, and a Biome exclusion before a nested worktree stops breaking `lint:ci` in its main checkout.

## Cleanup

Every probe worktree and branch was removed. `ExitWorktree` removed P1's. `git worktree unlock`, `git worktree remove`, and `git branch -D` removed P2's four and P5's. A worktree made for the Biome check went by `git worktree remove`. `git worktree list` then showed only each main checkout. The probes' transcript folders remain under `~/.claude/projects/`.
