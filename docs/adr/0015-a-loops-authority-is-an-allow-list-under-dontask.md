# ADR-0015 — a loop's authority is an allow list under `dontAsk`

> **Amended 2026-11-12 (#360):** §Consequences' "a profile that leaves the user layer out loads only the role's plugins" does not hold. Claude Code's built-in plugins load too. On Claude Code 2.1.322, two of them handle `tool.check`, `cc-plugin-plugin-authoring` and `cc-plugin-privacy` ([the R11 loop probes, §U9](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u9-what-dontask-denies-a-background-loop-and-the-rule-that-allows-each)). So the listing of what a loop inherits names the built-ins (#363). Whether settings can turn a built-in off is not measured.

> **Amended 2026-11-12 (#360):** leaving the user layer out has a cost §Consequences does not name. A session that loads no layer enabling sidekick runs plugin auto-update without sidekick's superpowers pin, inferred from the logs. One probe moved user-scope superpowers from 6.4.1 to 7.0.0 ([the R11 loop probes, §Found on the way](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#found-on-the-way-a-probes-plugin-auto-update)). Every session launched on the Mac then had 7.0.0 until it was set back. So the loop's and its workers' overlays set `DISABLE_AUTOUPDATER=1` (#364, #367). The variable also stops Claude Code's own background updates in those sessions.

> **Amended 2026-11-12 (#360):** §Assumptions' "sidekick's gates pass inside the sandbox" failed for one gate on Claude Code 2.1.322 ([the R11 loop probes, §U10](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u10-sidekicks-gates-inside-the-sandbox)). Five gates matched their unsandboxed results. `bun run test` failed six bash cases in `bin/helpers/profile-shell.test.ts`, whose spawned shell lacks `TMPDIR`, so their temp file falls back to `/tmp`, which the sandbox refuses. #367 fixes the test in place of the stated fallback, unconfined tests with a warning. By reading the code, not by a run, the fix clears all six. The suite also needs a `timeout` on its call, since it ran 433.6 s.

> **Amended 2026-11-12 (#360):** §Decision's "a denial seen only in the loop's record" and §Consequences' "the denial shows only in the loop's record" understate it. A denied call also leaves a `permissionDecision` of `reject` in the transcript, which the desk counts (#365). Three refusals leave none: the edit guard's, the block on a standalone `sleep`, and a mod's `allow` past a deny rule ([the R11 loop probes, §U13](https://github.com/Rikmorn/sidekick/blob/44b87bb6af67f180440c58978791b237a0629b84/docs/research/loop/2026-11-12-loop-probes.md#u13-how-a-call-dontask-denies-shows-in-a-transcript)).

**Status:** Accepted (2026-11-12), as the operator decided it at the loop design's third gate. Milestone R11, not yet opened; its Opening files the design's pieces as issues.

## Context

A loop must act only within its mandate, and the operator ruled that Claude Code's own checks enforce its `never` ([loop design §Gate 1 answers](https://github.com/Rikmorn/sidekick/blob/dff1a64076b83ccc24a65828e393302a3905a761/docs/designs/loop/design.md#gate-1-answers)). What the permissions, permission-modes, and sandboxing docs say, fetched 2026-11-11:

- A deny rule covers the spelling Claude usually writes, and "isn't a security boundary around the program" (`permissions.md:250`).
- Under `bypassPermissions`, which the operator runs almost everywhere, everything not denied runs.
- `dontAsk` denies every call nothing allows, explicit `ask` rules included, and "the session never waits for input".
- A sandboxed command reaches no host until one is allowed, and `dontAsk` denies the unsandboxed retry.
- Without managed settings, a `managed-mcp.json`, or a Team or Enterprise login, a plugin's mod can approve a call a deny rule refuses (`permissions.md:645-651`). The operator's sessions run on a personal subscription.

ADR-0012 Decision 2 holds: a sidekick mod never approves a call.

## Options considered

- **A deny list under `bypassPermissions`.** The operator's habit, but anything unforeseen runs, another spelling of a denied action included.
- **An allow list under `dontAsk`, with each ask written down as a request.** Chosen.
- **An allow list in Manual mode.** A yes per instance with no machinery, but each ask stops the loop until the operator attaches.

## Decision

In the context of loops that run unattended, facing deny rules that bound a spelling and a permission mode the operator bypasses, we decided for default deny. A loop and its workers run under `dontAsk`, with the mandate compiled to an allow list. This achieves a loop that never waits and runs only what its mandate allows. We accept no yes per instance in R11, and a denial seen only in the loop's record.

1. **A loop and its workers run under `dontAsk`.** The mandate compiles to settings. Its `reads` and each class's rules become allow rules, and `never` becomes deny rules, which beat an allow from any layer.
2. **Trust grows one class at a time,** on a `record`, `ask`, `act` ladder. In R11 an `ask` is a written request, never a prompt that waits. A promotion is an edit of one class's state, then `sidekick loop start`.
3. **The loop's allow list names fixed `sidekick loop` verbs.** The check refuses an allow rule that grants a shell, an interpreter, `sidekick worker`, or `claude`. Launch denies the loop's own `loop.json` and its profile's folder, so a loop never edits its definition.
4. **Workers that edit and run code run sandboxed,** with the sandbox's auto-allow and its unsandboxed retry off. The loop runs no code its workers wrote.
5. **A landing pushes exactly the commit the worker tested,** by fast-forward, and runs no repo code. It stays a request the operator runs until the loop's role runs a review before landing.

## Consequences

**Positive:** an unforeseen action, and another spelling of an allowed one, is denied because nothing allows it. A new action class is data in `loop.json`, and a promotion changes one word.

**Negative, accepted:**

- A mandate that leaves out a rule the work needs fails closed, and the denial shows only in the loop's record.
- `start` lists the allow rules, hooks, and plugins a loop inherits, since each can widen it.
- A pin in an allow rule bounds a spelling, not a value: `gh` takes the last `--author` it is given. A read that must be pinned goes through code that filters.
- On a personal subscription a plugin's mod can approve past a deny rule. sidekick's mods approve nothing, and a profile that leaves the user layer out loads only the role's plugins.

## Assumptions

- `dontAsk` can allow what a loop and its workers need: their skills, the cron tools, and sidekick's verbs. The design's probe U9 measures it.
- sidekick's gates pass inside the sandbox (probe U10). If not, a worker's tests run unconfined, and `start` warns.

## Revisit when

- A loop needs a yes per instance, or requests pile up unanswered.
- A managed settings file of the operator's own keeps a deny rule binding over a mod (probe U24).
- Claude Code changes what `dontAsk` denies, or how the sandbox retries.

## Links

ADR-0012 · ADR-0014 · [loop design](https://github.com/Rikmorn/sidekick/blob/dff1a64076b83ccc24a65828e393302a3905a761/docs/designs/loop/design.md) · [loop research](../research/loop/README.md)
