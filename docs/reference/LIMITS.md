# Known limits

Where a limit cannot be engineered away, this page says what it is and what to do about it. Pruned 2026-09-18 with ADR-0009 to the facts that survive the pivot; the earlier entries about the fan-out backend and the retired kernel live in git history.

## Enforcement is tamper-resistant, not tamper-proof

Claude Code hooks can tighten but not loosen permissions, and a PreToolUse deny holds even in bypass mode. An agent with write access to settings files can in principle edit the hook away. Treat hooks as the floor for a solo developer, and move binding gates to CI when stakes demand it. A mod is not bound the same way. It can approve a tool call that an `ask` rule or a `PreToolUse` hook would stop, so sidekick's mods never approve one (ADR-0012).

## Mods run on an early-access API, and fail quietly

Claude Code marks the mod API early access: it may change between releases without notice, and it has no version policy. A mod hook that throws or overruns its 10-second budget is skipped, and an installed plugin's mod errors reach only the debug log. A broken sidekick mod costs a view, not a wrong result, because the context warning runs as a classic hook, not a mod (ADR-0012). After a Claude Code upgrade, `bun run check:mods` in this repo checks that the mods load and fire. In a session, the context monitor tells you once when they are not running.

## `/goal` is not a verification gate

Claude Code's `/goal` completion check is a single fixed same-family model judging from the conversation surface only. Do not treat it as independent verification; independent verification is a separate invocation that sees the artifact and the spec, not the producer's reasoning.

## Read-only subagents that hold Bash are restrained by prompt, not enforcement

A subagent that needs `git diff` or `git log` holds `Bash`, and `Bash` can write. Its "never modify" is prose. Where a step must not modify state, the orchestrator runs the check from its own session, or the subagent's `tools:` drops `Bash` and takes the diff as input.

## Plugins cannot ship path-scoped rules, and their hooks cannot change each other's skills

A plugin ships skills, agents, hooks, executables, and settings, but not `.claude/rules/` files, so sidekick delivers its rules through an explicit command. Measured 2026-09-18 (#107) in headless sessions with a marker in each artefact: a path-scoped project rule injects its text when a matching file is read or edited; a project skill with the same `paths:` only appears in the skills listing once a matching file is touched, and its body is never injected; a plugin skill with `paths:` is listed unconditionally and its body is never injected either. So a skill's `paths:` gates discovery, not context, and a plugin cannot deliver guidance the way a rules file does. A plugin's hooks cannot change another plugin's skill text. They can add context when another plugin's skill loads (ADR-0010), or when a subagent reads one of that plugin's work files (ADR-0011). A mod's `skill.prompt` hook can replace the text the model reads, on an early-access API. ADR-0012 declines that until one of its revisit conditions is met. Beyond those hooks, sidekick's extensions run before or after superpowers' skills, or as rule lines those skills read.
