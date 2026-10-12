> Research for the `control-centre` design, not yet planned by PM. Done on 2026-10-12 by Claude in a session with the operator, on Claude Code 2.1.296, partly through two read-only research subagents. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Extension fit and loop pauses (2026-10-12)

Two questions the design owed. Does the mod event `skill.prompt` change how sidekick attaches to superpowers, under ADR-0009, ADR-0010, and ADR-0011? And what in Claude Code fits the pauses #140 names? The design note had suggested the Workflow tool for the second; this report treats that as one candidate.

Provenance grades follow the companion reports. **Measured** means probed on 2026-10-12. **Read** means read in the repo, the docs, or the build's bundled `plugin-authoring` reference on 2026-10-12, with the source named. **Inferred** marks the rest.

## `skill.prompt` against the ADRs

### What the ADRs say

- ADR-0009 revisits when "Plugins gain a way to ship path-scoped rules or to override another plugin's skill" (`docs/adr/0009-pivot-to-plugin-bundle.md:43`). Read.
- ADR-0010 attaches through one `PostToolUse` hook on the Skill tool, keyed by skill name. "A hook adds context only. It never denies a call or rewrites a skill" (`0010:25-26`). Read.
- ADR-0010 revisits on three conditions (`0010:46-51`). Read. The first is when "Claude Code documents a way to order or wrap another plugin's skill". The others are a nudge proving ineffective (#136) and a change to the Skill tool's hook input.
- ADR-0011 attaches reviewer lines through a `PostToolUse` hook on `Read` of a review package (`0011:20-22`). Reviewers read a file, not a skill, so `skill.prompt` does not bear on it. Inferred.

### What `skill.prompt` does

- Read, bundled types: it "Fires when the engine expands a skill's prompt for the model (`/name`, the Skill tool, a preload)". "Return `{ text }` with the text the model reads instead. A hook that fails passes it through."
- **Measured on superpowers' skills.** A probe mod appended a line naming `e.skill` to each expanded skill:
  - `/superpowers:brainstorming` typed as a command printed `SKILLPROMPT-SAW=[superpowers:brainstorming]`.
  - Loading `superpowers:writing-plans` through the Skill tool printed `SKILLPROMPT-SAW=[superpowers:writing-plans]`.
  - Both ran under `claude -p`. A separate `--bg` probe loaded a mod from `--plugin-dir`, so background sessions run mods too.
- Not probed: a subagent's preload, and order against a third mod hooking the same skill.
- Read: mods run before the mods they list as `dependencies`, so sidekick's hook would wrap superpowers' if superpowers ever ships one. Order between unrelated mods is not documented.
- Read: the bundled reference labels the API "EARLY ACCESS: this surface may change between releases without notice". The web pages no longer carry that label; the bundled files are the build's own.
- Read: "Mods aren't sandboxed." A mod runs in-process with the operator's permissions.

### Today's hooks against a `skill.prompt` mod

| | Today's `PostToolUse` hooks | A `skill.prompt` mod |
|---|---|---|
| Effect | Adds context after the skill loads (`bin/helpers/hook.ts`). Read | Replaces the text the model reads. Read and measured |
| Removes superpowers' conflicting lines | No; the writing-plans nudge has to say it "overrides parts of this skill". Read | Yes, by rewriting. Inferred |
| A command typed as `/brainstorming` | Not covered (ADR-0010). Read | Covered. Measured |
| When superpowers rewords a skill | Only a rename breaks it. Read | Appending: the same. Splicing into the text: anchors fail silently. Inferred |
| When Claude Code moves the API | Settings hooks; stable so far. Inferred | Early access. A failure passes the text through, so a nudge vanishes silently. Read and inferred |
| Runtime | One `node` start per Skill call. Read | In-process. Read |

### Verdict

ADR-0010's first revisit condition is met: the docs describe the event, and the probe shows it wrapping another plugin's skill. ADR-0009's "override another plugin's skill" is met in mechanism, with an early-access caveat. The options, for gate 2 and not decided here:

- **Keep the hooks** and record that the condition fired and was declined. Stable; typed commands stay uncovered.
- **Append through `skill.prompt`.** Closes the typed-command gap and drops the `node` start. It reverses ADR-0010's "never rewrites a skill" and adds a Claude Code version floor.
- **Splice through `skill.prompt`.** Removes superpowers' conflicting passages outright. Breaks silently on their releases unless a test pins the superpowers version. It bears on #136 if nudges prove ignored.
- **Mod first, hook as fallback** for older Claude Code. Two code paths, and a risk of injecting twice.

## Loop pauses (#140)

### The pauses

A subagent read each skill in `plugin/skills/` and classed each place the loop stops for the operator. The operator's ruling from 2026-09-26 frames the classes: approval gates cover outward actions only.

| Class | Pauses |
|---|---|
| Quality: goals, scope, review, decisions | `sk-milestone`'s outcome, seeds, scope ruling, cut work, and AT_RISK; `sk-design`'s goals and decision; the three explore gates; `sk-execute`'s plan review and second verifier failure |
| Outward write | `sk-milestone`'s release ask; `sk-execute`'s outward-write batch |
| Handoff | only the operator starts `sk-worker` (`sk-execute` §Hand off to a worker, `sk-worker`'s description); each plan needs a session the operator opens (inferred from plan sizing) |
| Routing | which design to continue; the execution mode; the integration route; several milestones open with none active |
| Unclear | a design outgrowing its spec; a plan matching no milestone plan |

The rows are the subagent's reading of the skills as they stood on 2026-10-12.

### The mechanisms

| Mechanism | Unit | Fresh context per unit | Steer mid-run | Fits |
|---|---|---|---|---|
| Workflow tool | subagents run by a script | yes | no input mid-run; pause or stop only | sealed fan-outs before a pause; not the pause itself |
| `/loop`, `ScheduleWakeup` | a prompt into the same session | no | yes | polling; cannot run `sk-worker`, which disables model invocation |
| `/goal` | the same session, judged by a small model | no | yes | weaker than sidekick's sealed reviewers for quality |
| `ralph-loop` Stop hook | the same session, the same prompt fed back | no | cancel | its README rules out "human judgment or design decisions" |
| A shell loop over `claude -p` | a fresh process per pass | yes | messages only | unattended stretches; loses attach and blocked-state signals |
| `claude --bg` with `SendMessage` and `notify_when_idle` | a full session under a supervisor | yes | attach or reply | handoffs |
| Routines (`/schedule`) | a cloud session on a fresh clone | yes | in a browser | not here: they push `claude/` branches, and this repo takes no pull requests |
| A mod's `$.clock.every`, `$.prompt.submit` | a timer in the session | n/a | in the session | making a wait cheaper to notice |

Sources, read by the subagent: the Workflow docs say it has "No mid-run user input" and advise "For sign-off between stages, run each stage as its own workflow". The rest come from the `ralph-loop` README and these pages on `code.claude.com`: agent view, cross-session messaging, scheduled tasks, goal, routines, headless, and mods.

### Mapping

- **Handoff pauses:** background sessions plus messaging fit best. Read and inferred. They give a fresh context per plan, a session the operator can attach to, readable blocked states, and survival past a closed terminal.
- **Routing pauses:** a stated default in the skill fits, as `sk-design` already does with no operator to ask. No runtime mechanism is needed. Inferred.
- **Outward writes:** nothing may hold them. The docs rule out a message or a fired prompt as consent. A mechanism can only make the wait cheaper, through a notification or a reply from the peek panel.
- **Quality pauses:** nothing fits as the holder. The Workflow tool can host the sealed reviews that run before them.

### Background sessions and git

Read in the agent view docs on 2026-10-12. "When a background session has made code changes in a worktree Claude entered", it is told to preserve the work:

- "Claude commits without asking, and pushes the branch when the repository has a remote."
- It opens a draft pull request "when the task calls for it".
- It never pushes to `main` or `master`, force-pushes, or merges.
- "Your git instructions take precedence: if the task, `CLAUDE.md`, or memory says you handle committing or pushing yourself, Claude leaves git to you."
- A session editing a checkout it did not isolate itself still asks before committing. `worktree.bgIsolation: "none"` turns isolation off.

`sk-worker` says never to push. Under a background session that line is an instruction the model follows, not a guard. A worker launched through `claude --bg` would need a guard on push, or isolation off. Inferred.

### A contradiction found on the way

`docs/reference/LOOP.md:40` says `sk-orient` "Pauses for nothing; it reports". `plugin/skills/sk-orient/SKILL.md` §Reading it tells the agent to ask when several milestones are open and none is active. Read.
