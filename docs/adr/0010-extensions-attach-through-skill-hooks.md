# ADR-0010 — Extensions attach to superpowers through hooks on the Skill tool

**Status:** Accepted (2026-09-25). Amends ADR-0009's Consequences on how far sidekick reaches into superpowers' skills. Issue #119, milestone R7.

## Context

ADR-0009 made superpowers the trunk and sidekick a bundle of extensions around it. Its Consequences held that customising superpowers' skills "is limited to prose around them, since plugins cannot hook into each other's skills at runtime". The loop audit reasoned the same way (`docs/reviews/2026-09-18-loop-audit.md` §5): an extension is a separate skill run before or after, or a rule line the trunk reads.

The design pass in #119 needed to reach the model when `superpowers:brainstorming` loads. A probe on 2026-09-25, on Claude Code 2.1.282, established three facts:

- A plugin's `PreToolUse` or `PostToolUse` hook with the matcher `Skill` fires when the model invokes another plugin's skill. Its input names the skill, as in `{"tool_input": {"skill": "superpowers:brainstorming"}}`.
- `additionalContext` from either event reaches the model.
- A skill the operator types as a slash command loads without the Skill tool, so no hook fires.

Claude Code's hooks guide also documents that a `PreToolUse` hook can deny a call, with a reason the model sees. What still holds from ADR-0009 is that a plugin cannot change another plugin's skill text.

## Decision

1. A sidekick extension that acts when a superpowers skill loads attaches through a hook on the Skill tool. `plugin/hooks/hooks.json` wires one `PostToolUse` entry with the matcher `Skill`. `sidekick hook post-skill` looks the loaded skill up in a table keyed by its name.
2. A hook adds context only. It never denies a call or rewrites a skill. On input it does not recognise, or on any failure, it prints nothing and exits 0.
3. The skill's name is the contract. ADR-0009 already assumes superpowers keeps the names that later extensions call.
4. The first entry is `superpowers:brainstorming`, which points the model at `sk-design`. Later extensions in the loop audit's order attach the same way: a sealed spec review after brainstorming writes its spec, and goal verification after execution.

## Consequences

**Positive:** an extension reaches the trunk at the moment it matters, without forking or restating a superpowers skill. The next attachment point is one table entry. The hook's logic is TypeScript under `bun test`, like `sidekick pm`.

**Negative, accepted:**

- A slash command the operator types bypasses the hook, so a nudge covers model-invoked skills only.
- Every Skill call starts a `node` process; the cost is unmeasured.
- A superpowers rename disables a nudge silently. Daily use, or a headless check, is what notices.
- A nudge is advice the model may not follow. #136 measures that if it misfires.

## Assumptions

- `PostToolUse` context keeps reaching the model on the Skill tool. Measured once, on 2.1.282.
- The hook input keeps naming the skill in `tool_input.skill`.

## Revisit when

- Superpowers ships its own extension points, or Claude Code documents a way to order or wrap another plugin's skill.
- A nudge proves not to change behaviour (#136), which argues for a different mechanism.
- Claude Code changes the Skill tool's hook input.

## Links

ADR-0009 · `docs/reviews/2026-09-18-loop-audit.md` · #119 · #136
