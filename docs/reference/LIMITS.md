# Known limits

Where a limit cannot be engineered away, this page says what it is and what to do about it. Pruned 2026-09-18 with ADR-0009 to the facts that survive the pivot; the earlier entries about the fan-out backend and the retired kernel live in git history.

## Enforcement is tamper-resistant, not tamper-proof

Claude Code hooks can tighten but not loosen permissions, and a PreToolUse deny holds even in bypass mode. An agent with write access to settings files can in principle edit the hook away. Treat hooks as the floor for a solo developer, and move binding gates to CI when stakes demand it.

## `/goal` is not a verification gate

Claude Code's `/goal` completion check is a single fixed same-family model judging from the conversation surface only. Do not treat it as independent verification; independent verification is a separate invocation that sees the artifact and the spec, not the producer's reasoning.

## Read-only subagents that hold Bash are restrained by prompt, not enforcement

A subagent that needs `git diff` or `git log` holds `Bash`, and `Bash` can write. Its "never modify" is prose. Where a step must not modify state, the orchestrator runs the check from its own session, or the subagent's `tools:` drops `Bash` and takes the diff as input.

## Plugins cannot ship path-scoped rules, or compose with each other at runtime

A plugin ships skills, agents, hooks, executables, and settings, but not `.claude/rules/` files, so sidekick delivers its rules through an explicit command. Measured 2026-09-18 (#107) in headless sessions with a marker in each artefact: a path-scoped project rule injects its text when a matching file is read or edited; a project skill with the same `paths:` only appears in the skills listing once a matching file is touched, and its body is never injected; a plugin skill with `paths:` is listed unconditionally and its body is never injected either. So a skill's `paths:` gates discovery, not context, and a plugin cannot deliver guidance the way a rules file does. A skill in one plugin cannot override or hook into a skill in another, so sidekick's extensions run before or after superpowers' skills, or as rule lines those skills read, never inside them.
