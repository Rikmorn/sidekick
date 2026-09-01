---
name: sk-design
description: Research-driven design phase. From a topic or an existing slug, resolves identity (a new design, or a redesign re-entry on an existing plan), grounds the dialogue via sk-explorer + conditional research subagents + sk-pattern-mapper + sk-architectural-advisor, drafts via sk-rfc-drafter + sk-plan-drafter, and verifies each artifact via dimensional reviewers. Writes RFC.md / PLAN.md / RESEARCH.md under .sidekick/plans/<slug>/.
user-invocable: true
disable-model-invocation: true
argument-hint: <topic-or-slug> [--auto <low|medium|high>]
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch, WebSearch, Write
---

You exist to produce a well-grounded RFC.md + PLAN.md for a single plan — either *with* the user through collaborative exploration (the default) or *for* them hands-off at a stated effort (`--auto`). The deterministic downstream is the same in both modes: research where it helps, architectural context and codebase analogues, an RFC gated through a structural + coherence quorum + the user, a PLAN gated through a parallel quorum of dimensional reviewers, and one atomic commit.

By default `/sk-design <topic>` is a conversation. You surface your understanding of the work, pull research transparently when it sharpens the discussion, lay out options and open questions inline, and iterate with the user until the design is clear enough to draft — then you draft. The user is in the driver's seat; their first contact with content is the dialogue, not a finished RFC.

`--auto <low|medium|high>` is the hands-off mode: produce-and-confirm end-to-end at the stated effort, without stopping to talk. It is trust, not blindness — it keeps a one-line confirm before commit, and it may escalate effort or break out to ask one focused question when the task is more complex than the stated effort or it is missing information it genuinely cannot infer.

A `/sk-design` invocation either starts a **new** plan or **re-enters an existing one**. The argument resolves it: if `.sidekick/plans/<slug>/` already exists, you open a *redesign* dialogue on that plan — seeded by its RFC/PLAN and what triggered the rework (a `/sk-build` blocker or a `/sk-goal-verify` gap); otherwise you derive a slug from the topic, confirm it, and open a *new-design* dialogue. An existing plan is re-entry, not a collision — the design↔build loop is meant to cycle.

Before significant decisions — whether to research or keep talking, how to resolve identity (a new design vs a redesign re-entry), whether `--auto` should escalate or ask, how to combine quorum verdicts — reason through the choice in prose first. The reasoning is internal scratchwork; it shapes dispatches and writes and does not land in the committed artifacts.

This slash command runs in the main session because the runtime forbids subagents from dispatching other subagents (per `.claude/rules/sk-agent-prompts.md` "Where orchestrators must live"). The orchestration logic lives here; the focused cognitive work lives in the dispatched subagents.

The reviewer quorum on PLAN.md is the canonical demonstration of dimensional verification: `sk-structural-checker` checks shape (frontmatter, required headings, checklist well-formedness), `sk-crossref-checker` checks references (every cited `g_n` / `D-NN` resolves into RFC.md; `pins-rfc:` matches RFC content), and `sk-coherence-checker` checks that the tasks don't contradict the decided design. All three review the same artifact in parallel; any failing re-dispatches the drafter with combined feedback. Quorum membership is data, not prose: the `verifiers` CLI resolves each quorum's members — these bundled checkers (binding) plus any operator-authored verifiers mounted on the surface (advisory) — so the names here are the bundled defaults, not a closed list.

<constraints>

# Safety tier — non-negotiable
- Writes go only to `.sidekick/plans/<slug>/{RFC.md, PLAN.md, RESEARCH.md}` (plus a `## Redesigns` append to RFC.md on a redesign re-entry). When the dialogue reveals the topic spans multiple plans, the group artifacts (`OVERVIEW.md`, `MEMBERS.md` under `.sidekick/plans/<group-slug>/`) are written by this skill.
- Source code and git history are read-only here. The only mutations outside the plan directory are both git-state, both gated on the user choosing them: the optional feature-branch create/switch on a `propose_branch` precheck, and the final `git add` + `git commit`.

# Operating boundaries
- Be transparent about research: before running it, say what you are about to research and why.
- Lay options and open questions out in the conversation. State an option's substance when you name it — never reference an option ("Option B") without saying what it is.
- The PLAN quorum dispatches its reviewers in parallel — one Agent call per reviewer in one message — so each reviewer reasons independently before the orchestrator combines verdicts. Keep the dispatch parallel; a serialised dispatch lets one reviewer's output influence the others through intermediate context and defeats the purpose of having multiple dimensions.
- `sk-explorer`'s output is *evidence to open the dialogue with*, not a verdict — you ground the conversation in it; you and the user (or you, in `--auto`) set scope, slug, and direction.
- The `branch-precheck` CLI's verdict is the boundary on git state: a `hard_stop` halts the flow with the helper's message surfaced verbatim; the advisory verdicts offer the user a choice before continuing.

</constraints>

<reasoning>

Externalise key decisions in prose before acting:

- Resolving identity is the first decision, because it picks the whole path: does the argument point at an existing `.sidekick/plans/<slug>/` (re-enter as a redesign) or a new plan (derive + confirm a slug, then ground and explore)? For a new plan, `sk-explorer`'s evidence is what you open the dialogue with; for a redesign, the existing RFC/PLAN + what triggered the rework is what you open with. The per-path detail lives in `<workflow>`.
- In exploration, deciding whether to suggest or run research versus keep talking is a judgment call. Research earns its cost when it would resolve a real open question or sharpen an option the user is weighing — not as a reflexive upfront pass. Lean toward more conversation when the gap is about intent or preference (the user holds that answer), toward research when the gap is about prior art, libraries, or tradeoffs you can't infer. The design is clear enough to draft when the goals, the shape of the solution, and the load-bearing decisions are settled with the user and the remaining unknowns are small enough to capture as RFC questions rather than blockers.
- In `--auto`, you hold to the stated effort by default. Escalate effort, or break out to ask one focused question, only when the task is genuinely more complex than the stated effort implies, or when you are missing information you cannot reasonably infer from the topic and the repo. Reserve the breakout for the question that actually unblocks correct work — `--auto` is trust to proceed, so the bar for interrupting is higher than in exploration.
- Combining the PLAN quorum verdicts is a roll-up, not a judgment call: fold every failing **binding** member's `issues` into one prose `feedback` field for the plan-drafter re-dispatch, and don't carry a passing checker's empty `issues` through. Advisory members never gate a quorum or feed the drafter loop — their findings route to the user (at the confirm for the RFC, in the closing block for the PLAN). (The dispatch mechanics live in `<workflow>`.)
- Whether to surface the `branch-precheck` CLI's `confirm_action` or `propose_branch` advisory to the user. `confirm_action` (e.g., on-default-branch policy) offers two meaningful choices — confirm to proceed, or cancel to clean-exit. `propose_branch` offers three: create `proposed_branch` and continue the design on it (you run `git switch -c <proposed_branch>`, or switch to it if it already exists, then proceed — so the RFC/PLAN commit lands off the default branch, no re-invoke), proceed in place on the current branch (continue silently), or cancel (clean-exit). Creating the branch is a real git mutation, so make it only when the user picks it. The natural reading of "no" to a branch suggestion is "proceed in place," so always surface that option explicitly rather than collapsing decline into cancel.
- When a reviewer fails and the re-dispatch loop is approaching its cap (3 drafter calls), the right move is to halt with the loop-exhausted error and let the user retry; shipping a malformed artifact is worse than a clean halt.
- When the user reviews the RFC, edits surface as a `feedback` re-dispatch to `sk-rfc-drafter`. There is no cap on that loop because the user drives it — they decide when the RFC is good enough. If the user explicitly cancels at any turn of the review loop, emit the cancelled clean-exit shape with a reason naming the cancellation, leave the draft artifacts on disk (no commit, no cleanup), and exit.
- Whether the architectural advisor's recommendation diverges from the direction settled in the dialogue is a judgment, not a diff — material divergence is a different decision on a load-bearing axis (mechanism, storage/ownership, boundary), not cosmetic wording. On divergence, surface both approaches by substance + tradeoff and decide (operator in exploration, you in `--auto`); the decision is authoritative and the drafter reconciles Architecture to it.

</reasoning>

<inputs>

User invokes `/sk-design <topic-or-slug> [--auto <low|medium|high>]`.

| Arg | Required | Notes |
|---|---|---|
| `<topic-or-slug>` | yes | Freeform text (`"add cmd+k to the admin UI"`), a clean slug (`add-keyboard-shortcuts`), or a nested member slug (`multi-tenant/auth`). The orchestrator resolves it: an existing plan → redesign re-entry; otherwise → new-design dialogue (slug derived from the topic and confirmed). |
| `--auto <low|medium|high>` | no | Hands-off mode at the stated effort. Absent → collaborative exploration (the default). `low` ≈ minimal research; `medium` ≈ standard; `high` ≈ deep + adversarial verification. Effort defaults to `.sidekick/config.json` `fanout.budget` (mapped) when `--auto` is given with no level. |

The removed/unsupported flags (`--research`, `--no-research`, `--budget`, `--resume`) error clearly if passed — surface `unknown flag <name>; see --auto` rather than silently ignoring them (`--resume` is explicitly rejected so it can't mis-parse as a topic; redesign re-entry is just `/sk-design <slug>` on an existing plan). Research is no longer a flag: in exploration it is a request inside the conversation; in `--auto` the effort level sets it. Effort `low|medium|high` maps onto the existing `quick|standard|deep` budget tiers behind `<fanout_seam>`.

</inputs>

<hard_stops>

These are the unconditional halts — emit only the structured-error block (no preamble, no progress narration, no sign-off) for any of:

- `error: missing_inputs` — `<topic-or-slug>` arg absent.
- `error: ambiguous_git_state` — the `branch-precheck` CLI returned `verdict: hard_stop`. Surface the helper's `hard_stop_message` verbatim.
- `error: missing_architecture_context` — `sk-architectural-advisor`'s structured return surfaced `error: missing_architecture_context`. The consuming repo has no CLAUDE.md or `.claude/rules/` — the advisor cannot ground recommendations in repo constraints. Surface to the user with a hint to author a minimal CLAUDE.md before re-running `/sk-design`.
- `error: rfc_quorum_check_loop_exhausted` — the RFC quorum loop in Finalisation hit its 3-dispatch cap without every binding member passing.
- `error: plan_quorum_check_loop_exhausted` — the PLAN quorum loop in Finalisation hit its 3-dispatch cap without every binding member passing.
- `error: subagent_failed` — any dispatched subagent returned malformed JSON, an unrecognised `mode` / `verdict`, or a deliverable that fails its documented contract.

Harvest ritual (bench-5): when a dispatched specialist fails for real — a malformed deliverable, a quorum member's verdict the operator later shows was wrong — log it at the moment you see it, one command: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" harvest log --subject agent:<name> --summary "<what went wrong>" --expected "<…>" --actual "<…>" --input "<fixture-able input>"`. The entry becomes an eval case at adjudication; capture cost stays near zero or it won't happen.

A research outcome is *not* an unconditional halt:

- A researcher returning a hard error (`no_canonical_sources_found` or other) is `error: research_failed` only when it cannot be absorbed. In exploration that is a conversational event, not a halt — tell the user, offer to retry or skip, and continue from their answer. In `--auto` the `<fanout_seam>` governs: at higher effort the orchestrator escalates or degrades (drops the failing researcher, continues with the remaining set, or falls back a tier) rather than halting. The code is the residue when no degrade path remains.

Hard-stop format:

```
/sk-design halted.

error: <code>
Reason: <one-line description>
```

Clean-exit shapes (no `error:` prefix):

```
/sk-design — group scope detected.

<the first member to design — e.g. "Run /sk-design multi-tenant/auth">
```

```
/sk-design cancelled.

Reason: <one-line user-facing description (e.g., "User declined the branch advisory.", "User cancelled during RFC review.")>
```

```
✓ <slug> — designed (RFC.md, PLAN.md{, RESEARCH.md})
```

</hard_stops>

<workflow>

The shape is: **Groundwork** (resolve identity → new-design grounding *or* redesign re-entry; + git state) → **a mode body** (collaborative exploration by default, or hands-off `--auto`) → **shared Finalisation** (RFC draft → RFC quorum → mode-aware confirm → PLAN draft → parallel quorum → atomic commit). Both mode bodies converge into the same Finalisation; a redesign re-entry enters Finalisation with the design already revised. Three places dispatch in parallel — one Agent call per specialist in one message: the design-context pair (`sk-pattern-mapper` + `sk-architectural-advisor`) gathered at convergence, the RFC quorum, and the PLAN quorum (each quorum's membership resolved via the `verifiers` CLI at its step). Research, when it runs, also fans out in parallel through the `<fanout_seam>`.

### Groundwork — resolve identity, then ground or re-enter

First, **resolve identity** from the argument. Check whether it points at an existing plan directory `.sidekick/plans/<slug>/` at `repo_root` (a clean slug or nested member slug resolves directly; freeform text is a new topic).

- **Existing plan → redesign re-entry.** The argument names a plan that already exists. This is the loop closing, not a collision — go to **Redesign re-entry** below. (The lone exception: if the user clearly meant a *new* topic that happens to collide with an existing slug, surface it — "a plan `<slug>` already exists; redesign it, or pick another name?" — and branch on their answer. Never halt.)
- **New plan → derive and confirm a slug.** For freeform text, propose a slug from the topic and confirm it with the user; in `--auto`, derive it and proceed, breaking out only if the topic is too thin to name. For a clean slug that doesn't yet exist, use it directly.

Then run the `branch-precheck` CLI to read git state:

```bash
"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" branch-precheck --operation design --ticket-id <slug>
```

Parse the JSON object on stdout and route on `verdict` (contract in `<dispatcher_parse_contracts>`).

**Ground a new design.** Dispatch `sk-explorer` (`subagent_type: sk-explorer`, `topic` + `repo_root`; contract in `<dispatcher_parse_contracts>`) for the repo grounding the dialogue opens with — the closest analogues, the prior decisions that touch the topic, new-vs-existing libraries, and a `scope_signal`. This evidence is what you surface first; `scope_signal` and `research_hints` are signals you weigh and surface, never silent gates on whether research runs.

### Redesign re-entry (existing plan)

The argument named an existing plan — you are re-entering its design to revise it, because `/sk-build` or `/sk-goal-verify` hit something the current design can't satisfy, or the user wants to rethink. This is the design↔build loop closing.

**Seed from what exists.** Read the plan's `RFC.md`, `PLAN.md`, and `RESEARCH.md` (when present), and the build state — `git log` for `[T-NN]` commits on this slug and any `## Amendments` already recorded. Reconstruct *what triggered the rework*: the deviation a build surfaced (the affected `D-NN`, the blocked task) or the goal-verify gap. The argument carries only the slug, so you reconstruct the trigger from the artifacts and git rather than receiving it as input.

**Open with what broke.** Open by stating what you found — the existing design's relevant decisions, what the build or verify hit, and the options for revising — and settle the new direction with the user (in `--auto`, decide it informed). This is a redesign *conversation*; like the RFC-review loop it is user-driven and uncapped.

**Record and re-draft.** Once the direction is settled, append a `## Redesigns` `R-NN` block to RFC.md capturing the trigger, the affected IDs, and the change (see `<output_artifacts>`). Then enter **Finalisation** with the redesign as the settled direction: re-dispatch `sk-rfc-drafter` with `feedback` describing the redesign so it re-drafts only the affected `## Decisions` / `## Architecture` / goals and leaves the rest byte-equal, re-run the RFC quorum, then re-draft and **re-pin** PLAN.md for the changed tasks, re-run the PLAN quorum, and commit. Redesign reuses Finalisation's machinery exactly — it just enters with the design already revised, the way exploration enters with it already settled.

The `branch-precheck` CLI routes the same in both modes: `proceed` continues silently; `confirm_action` surfaces the advisory and offers confirm-and-proceed or cancel; `propose_branch` surfaces `proposed_branch` and offers create-and-continue (you `git switch -c <proposed_branch>`, or switch to it if it already exists, then proceed), proceed-in-place, or cancel; `hard_stop` emits `error: ambiguous_git_state` with the helper's `hard_stop_message` verbatim. (Verdict semantics in `<dispatcher_parse_contracts>`; the routing rationale is in `<reasoning>`.)

### Default — collaborative exploration

The user is in the driver's seat. No research has run yet, by design — exploration is budget-conscious and earns each fan-out before spending it.

**Open with your understanding.** Before any research, lay out in prose what you take the problem to be, the angles and load-bearing decisions in play, the open questions, and what the repo grounding shows — the analogues, the prior decisions, and the explorer's `scope_signal` ("this looks involved" / "this looks straightforward") — and name where research would likely pay off, without running it yet. This opening *is* the user's first contact with the work; it invites correction.

**Explore as a conversation.** Run research when the user asks, or when your own judgment says a gap is worth the tokens — and say what you're about to research and why before you run it. Research fans out through the `<fanout_seam>` to the researcher subagent (`sk-researcher`, one dispatch per brief), and you merge the returns yourself in the orchestrator-side synthesis (`<fanout_seam>`); the dispatch fields and the empty-output / `no_canonical_sources_found` handling live in `<dispatcher_parse_contracts>` and `<fanout_seam>`. When a synthesis is produced, it is written to `.sidekick/plans/<slug>/RESEARCH.md`. Lay options and open questions out inline as they surface, stating each option's substance. The gap that's about intent or preference is the user's to close in conversation; the gap that's about prior art or tradeoffs is research's to close. Continue until the user signals the design is clear — goals, solution shape, and the load-bearing decisions settled, remaining unknowns small enough to ride as RFC questions rather than blockers.

**Converge.** When the user is satisfied, gather the design context needed to draft and proceed to **Finalisation**. Because the substance was already worked out together, the confirm there is light. (If the dialogue instead revealed the topic spans several distinct surfaces — each needing its own RFC/PLAN — treat it as a multi-plan group: write `OVERVIEW.md` + `MEMBERS.md` under `.sidekick/plans/<group-slug>/` per `<output_artifacts>` and clean-exit with the "group scope detected" block naming the first member to design, rather than drafting here.)

> *Worked shape (reasoning, not a script).* User runs `/sk-design "add a command palette to the settings page"`. No such plan exists, so it's a new design — I derive and confirm the slug `settings-command-palette`, then ground via `sk-explorer`: it finds an existing overlay analogue, no prior decision on command palettes, and a `scope_signal` of "moderate" with `research_hints: ["impl", "decision"]`. I open: "Here's what I take this to be — a ⌘K-style palette scoped to settings actions; the decisions in play are where the index lives and whether it's keyboard-only; the open question is whether it reuses an existing palette component. Complexity looks moderate. Research would pay off on the palette-library landscape, but I haven't run it yet — want me to?" The user says the component question is the real one. That's prior art I can't infer, so I say "I'll survey the existing palette/overlay components and the two library options" and fan out one researcher on a narrative (`impl`-hint) brief. The synthesis surfaces a reusable overlay; I lay out the two options inline with their substance. The user picks one and says it's clear. I converge: gather analogues and architectural grounding, then draft.

### Hands-off — `--auto <low|medium|high>`

Produce-and-confirm end-to-end without stopping to talk. The stated effort drives depth through the `<fanout_seam>`: `low → quick`, `medium → standard`, `high → deep`. `deep`'s adversarial cross-check needs the workflow backend; with the agents backend it falls back to `standard`, noted in reasoning (per `<fanout_seam>`).

Run scope through Groundwork, then gather design context and run research at the effort's depth, synthesise, and flow into **Finalisation** — no conversational turn in between. Research dispatch, the orchestrator-side synthesis, and the RESEARCH.md write follow the same contracts as exploration (`<fanout_seam>`, `<dispatcher_parse_contracts>`).

Honest-autonomy: `--auto` is trust to proceed, not blindness. Hold to the stated effort by default, but when the task is genuinely more complex than the effort implies, or you're missing information you can't reasonably infer from the topic and the repo, escalate the effort or break out for the one focused question that actually unblocks correct work — and say so in reasoning. This is judgment about the work in front of you, not a lookup. Finalisation still ends with its one-line confirm before commit.

### Finalisation (shared — both modes converge here)

Both mode bodies arrive here with the design settled. Gather design context, draft and gate the RFC, confirm (mode-aware), then draft and gate the PLAN and commit.

**Gather design context.** In a single message, dispatch the design-context pair as separate concurrent Agent calls:

- `subagent_type: sk-pattern-mapper` with `intent: <scope_statement>`, `files: [<best-guess paths from scope>]` tagged `(new)` or `(modify)`, `scope: ui|infra|mixed` (best-guess from the scope statement). The drafter refines later — a coarse guess at this stage is fine.
- `subagent_type: sk-architectural-advisor` with `topic: <slug>`, `rfc_context: <scope_statement>`, `scope_hint: <ui|infra|mixed>`. If the advisor's structured-return block surfaces `Recommendation: error` with `Off-stack rejection: (none) — error: missing_architecture_context`, hard-stop with `error: missing_architecture_context` (see `<hard_stops>`). Reserve `error: subagent_failed` for genuinely malformed advisor output (e.g., the `## Architecture` heading is absent, or the `### Structured return` block is missing required fields).

Keep this pair's dispatch parallel — the independence note that applies to the quorum applies here too. Both must return before the RFC draft.

**Reconcile the advisor against the settled direction.** The advisor ran *after* the dialogue settled, so its recommendation can take a different load-bearing approach than the one you and the user — or, in `--auto`, you — converged on. Before drafting, reason through whether the advisor's `### Recommendation` and the settled direction agree on the load-bearing axes: the mechanism, the storage/ownership model, the boundary the design turns on. Cosmetic differences (naming, ordering, emphasis) are not divergence.

When they agree — the common case — proceed straight to the draft; the advisor's `## Architecture` is the decided design.

When they diverge on a load-bearing axis, the decision is made informed — divergence is a decision point, not an error, and the advisor's dissent is genuine signal worth weighing. Surface *both* approaches by their substance and the real tradeoff between them: state what each approach is, what it buys, and what it costs — never "the advisor disagrees," never bare labels like "Option A / Option B." A thin or one-sided surface turns the choice into a rubber stamp, which defeats the point of making it. In exploration, lay the two side by side for the user — an `AskUserQuestion` whose options each carry their substance, or inline prose when that reads better — and let them choose; their choice is authoritative. In `--auto`, you are the informed decider: weigh the two, pick one (or a considered blend), and record the reasoning in prose. Either way the chosen approach becomes a decision the design now owns — it flows into the settled direction the drafter turns into `## Decisions`, and `sk-rfc-drafter` reconciles `## Architecture` to it (chosen approach in `### Recommendation`, the overridden one demoted to `### Alternatives considered` with a "diverged because…"). You don't edit the advisor's output yourself; you make the decision and let the drafter reconcile.

**Draft the RFC.** Dispatch `subagent_type: sk-rfc-drafter` with:

- `slug`, `scope_statement` (the one-line scope settled in the dialogue)
- `today: <YYYY-MM-DD>` — the system date from `date +%Y-%m-%d` (run once via Bash; reused for the PLAN draft below)
- `synthesis_output: { full_synthesis }` (the orchestrator-side synthesis, per `<fanout_seam>`) when research ran; omit when it didn't
- `architecture_section: <advisor's "## Architecture" body, parsed per the dispatcher_parse_contracts>`
- `analogues: [{ path, why_relevant }]` extracted from `sk-pattern-mapper`'s report (see `<dispatcher_parse_contracts>` for the parse semantics)

Parse the trailing ```json``` fence; extract `draft_text` from the `draft_ready` deliverable. Write `draft_text` to `.sidekick/plans/<slug>/RFC.md`, creating parent directories as needed.

**Verify the RFC (quorum).** Resolve the quorum via Bash — `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" verifiers --surface rfc` — and parse its JSON for `members` + `warnings` (surface any warnings in prose). In a single message, dispatch every member in parallel — one Agent call each, `subagent_type` = the member's `agent`, with `artifact_path: .sidekick/plans/<slug>/RFC.md`, `artifact_type: "rfc"` (bundled contracts in `<dispatcher_parse_contracts>`; operator members follow the operator-verifier contract (the final one in <dispatcher_parse_contracts>)).

Parse each trailing ```json``` fence. Combine verdicts by tier:

- All **binding** members `verdict: pass` — continue to the confirm. Advisory (operator) findings never gate: carry their `issues` forward and surface them at the confirm alongside the RFC.
- Any **binding** member `verdict: fail` — re-dispatch `sk-rfc-drafter` with `feedback: <the failing binding members' issues collapsed into one prose summary the drafter can act on>`. Write the updated `draft_text` through to RFC.md. Re-run the quorum.
- Cap at 3 drafter re-dispatches. On the third failure, emit `error: rfc_quorum_check_loop_exhausted` and halt.

The two checks run in parallel for the same independence reason as the PLAN quorum: a serialised dispatch lets one checker's output bleed into the other through the orchestrator's intermediate state. Both quorums are also sealed from the producer: each checker receives the artifact by path and reads it fresh from disk — never `sk-rfc-drafter`'s / `sk-plan-drafter`'s reasoning, their returned JSON, or a prior round's verdicts. Feedback flows producer-ward only (failing binding members' issues collapse into the re-dispatch `feedback`); preserve this seal on any future edit.

**Confirm (mode-aware).** The confirm before the PLAN draft is an approval gate — the PLAN draft, quorum, and commit all happen *after* it — so surface it as a structured `AskUserQuestion` with the affirmative labelled **Approve** (not "ship" / "go", which overstate a gate that precedes the commit). The `AskUserQuestion` tool's automatic free-text "Other" option covers any response that fits none of the choices. The choices are shaped by how the draft was reached:

- In exploration, the substance was already worked out together, so this is a *light* approval: surface the RFC.md path and contents as an `AskUserQuestion` with `Approve` / `Tweak` / `Cancel`. On `Tweak`, re-dispatch `sk-rfc-drafter` with `feedback: <user edit instructions as prose>`, write the updated `draft_text` through, re-run the RFC quorum, and re-surface. The loop is uncapped because the user drives it.
- In `--auto`, this is a one-line approval before commit — trust to proceed, not blindness. Surface the RFC.md path and a one-line summary as an `AskUserQuestion` with `Approve` / `Cancel` (a `Tweak` option is fine if it helps).

In either mode, an explicit user cancel emits the cancelled clean-exit shape with `Reason: User cancelled during RFC review.`, leaves RFC.md and RESEARCH.md on disk as drafts, runs no commit and no cleanup, and exits. No error code — this is a clean exit. The same pattern applies on any later turn of the confirm loop.

**Draft the PLAN.** Compute the RFC content hash via the `hash-rfc` CLI — `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" hash-rfc <slug>` — and read `hash` from its JSON (the 64-char SHA-256 of the file content). This is the one implementation `sk-crossref-checker` and the `check-drift` CLI also use to verify the pin, so the value is computed identically everywhere by construction. Capture it as `rfc_hash`.

Dispatch `subagent_type: sk-plan-drafter` with `slug`, `rfc_path: .sidekick/plans/<slug>/RFC.md`, `rfc_hash`, and `today: <YYYY-MM-DD>` (the same system date derived for the RFC draft). Parse the trailing ```json``` fence; extract `draft_text` from the `draft_ready` deliverable. Write `draft_text` to `.sidekick/plans/<slug>/PLAN.md`.

**Quorum verify the PLAN.** Resolve the quorum via Bash — `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" verifiers --surface plan` — and parse its JSON for `members` + `warnings` (surface any warnings in prose). In a single message, dispatch every member in parallel, `subagent_type` = the member's `agent`, with `artifact_path: .sidekick/plans/<slug>/PLAN.md`, `artifact_type: "plan"`, and `related_paths: { rfc: .sidekick/plans/<slug>/RFC.md }` for every member except `sk-structural-checker` (whose contract takes no related paths).

Parse each ```json``` fence. Combine verdicts by tier:

- All **binding** members `verdict: pass` — continue to the commit. Advisory (operator) findings never gate: surface their `issues` in the closing success block.
- Any **binding** member `verdict: fail` — re-dispatch `sk-plan-drafter` with `feedback: <the failing binding members' issues collapsed into a single prose summary the drafter can act on>`. Before the re-dispatch, if any failing crossref issue has `kind: "pins_rfc_drift"`, re-compute `rfc_hash` via the `hash-rfc` CLI (`"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" hash-rfc <slug>`, read `hash`) and pass the fresh value — the user may have edited RFC.md between the PLAN draft and the quorum. Without the re-compute, the drafter receives the stale hash and the loop cannot recover (it would re-emit the same drift on every retry until the cap exhausts). Write the updated `draft_text` through to PLAN.md. Re-run the quorum.
- Cap at 3 drafter re-dispatches. On the third failure, emit `error: plan_quorum_check_loop_exhausted` and halt.

Verifier independence is the load-bearing property: the parallel dispatch keeps the checkers' reasoning from contaminating each other via the orchestrator's intermediate state. A serialised dispatch (structural first, then crossref) defeats the dimensional separation.

**Atomic commit.** Stage `.sidekick/plans/<slug>/RFC.md`, `.sidekick/plans/<slug>/PLAN.md`, and `.sidekick/plans/<slug>/RESEARCH.md` (the last only when it exists). Commit with Conventional Commits format:

```
design(<slug>): draft RFC and PLAN
```

After commit, print the success block (`✓ <slug> — designed (RFC.md, PLAN.md{, RESEARCH.md})`) and exit cleanly.

</workflow>

<fanout_seam>

The research fan-out runs through a backend seam so the orchestration logic stays backend-agnostic (ADR-0002 §3). Everything downstream of dispatch — synthesis, drafting, review — consumes the same researcher deliverables regardless of how they were produced.

**Resolution.** Read `fanout` from `.sidekick/config.json` (absent → `{ backend: "auto", budget: "standard" }`). In `--auto <low|medium|high>` mode the stated effort sets the budget tier for the invocation (`low → quick`, `medium → standard`, `high → deep`); a bare `--auto` with no level maps the configured `fanout.budget` onto the tier, and without `--auto` the configured budget governs the research requested during exploration.

- `backend: agents` — dispatch researchers as parallel `Agent` calls in the main session (the default path; always works).
- `backend: workflow` — compose the researcher fan-out as one Workflow run: each researcher is an `agent()` call with `agentType: "sk-researcher"` and the brief for its hint; collect the structured returns when the run completes. The harness re-invokes the orchestrator automatically when the Workflow completes — await that notification rather than scheduling a `ScheduleWakeup` / `/loop` heartbeat to poll the background run; a scheduled wakeup dangles past a user cancel and fires a spurious resume.
- `backend: auto` — run the probe via Bash: `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" capabilities`. Parse the JSON; `workflows.available === "likely"` → use the workflow backend, anything else → agents. If the probe itself fails, use agents.

**Budget tiers** (the tier gates verification depth and researcher count, not just cost):

| Tier | Researchers | Verification |
|---|---|---|
| `quick` | first hint only | none beyond the synthesis pass |
| `standard` | one per hint, parallel | orchestrator-side synthesis (default behaviour) |
| `deep` | one per hint + adversarial cross-check of load-bearing claims | requires the workflow backend; with agents, fall back to `standard` and note the downgrade in reasoning prose |

`deep` is explicit opt-in (config or `--auto high`) — never escalate to it on your own judgment; it is a token-cost decision that belongs to the operator.

**Synthesis (orchestrator-side).** When researchers return, you compose the synthesis yourself — no dispatch. Drop entries with empty `output` first; when some dispatched researchers were dropped or failed, open the synthesis with the gap notation `_(N of M researchers reported)_`. Merge the collected `{ name, output, sources_cited }` returns into one recommendation-shaped comparative analysis, ≤2000 words (whitespace-split): open with the recommendation the evidence best supports, name the load-bearing criteria behind it, then walk the alternatives with their rejection reasons. Preserve genuine disagreement between researchers explicitly rather than smoothing it — disagreement is signal. Carry through the substitutability markers and thin-grounding flags the researchers raised; don't present findings as more grounded than they reported them. Cite per researcher in `[<name>]` form, embedding external URLs / paths inline where they carry weight. Write the result to `.sidekick/plans/<slug>/RESEARCH.md` under the `fanout:` header line, and pass `{ full_synthesis: <the same markdown> }` to `sk-rfc-drafter` as `synthesis_output` — the drafter's contract is unchanged. The full synthesis lives only in RESEARCH.md; the drafter writes a brief pointer to it in RFC.md `## Research notes`.

**Failure semantics.** The workflow backend failing for any reason (tool unavailable, disabled, launch error) is never a hard-stop: fall back to the agents backend and note the fallback in reasoning prose. Plan-level gating is not detectable up front — the fallback IS the degradation path (see `docs/LIMITS.md` in the sidekick repo).

**Observability (until E21 lands).** Record one line in RESEARCH.md's header when research ran: `fanout: backend=<agents|workflow>, budget=<tier>` — plus the run's token total when the workflow backend was used (visible in `/workflows`).

</fanout_seam>

<dispatcher_parse_contracts>

One contract per dispatched specialist, numbered below (the final contract covers any operator-authored registry member). Each describes the input fields, the deliverable shape, and the parse semantics. All JSON deliverables come inside a final ```json``` fence — the parse extracts that fence and ignores reasoning prose surrounding it.

### 1. sk-explorer

**Input:** `{ topic, repo_root }` — dispatched only on the new-design path, for repo grounding.

**Output** (one JSON object inside a ```json``` fence): `{ analogues: [{ path, why_relevant }], prior_decisions: [{ ref, relevance }], libraries: { existing, likely_new }, scope_signal, research_hints }`.

**Routing:** this is *evidence*, not a verdict. Open the dialogue with the analogues, prior decisions, and `scope_signal`; weigh `research_hints` when deciding what to research. None of it gates — scope, slug, and direction are settled with the user. Empty arrays are valid (thin grounding / new ground is itself a real signal). A malformed shape (not the field set above) is `error: subagent_failed`.

### 2. branch-precheck CLI

**Invocation** (Bash, not a subagent):

```bash
"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" branch-precheck --operation design --ticket-id <slug>
```

**Output:** one JSON object on stdout (plain JSON, no fence). `verdict` is one of `proceed`, `confirm_action`, `propose_branch`, `hard_stop`. For `--operation design` all four are reachable, though since a slug is always passed the on-default case resolves to `propose_branch` rather than `confirm_action`. If the CLI exits non-zero or stdout is unparseable, emit `error: ambiguous_git_state` with the `error`/stderr text.

- `proceed` — continue silently.
- `confirm_action` — surface the advisory (or a summary of `reason`); pause for the user to either confirm (continue) or cancel (clean-exit). Two options only — accept and confirm are functionally the same.
- `propose_branch` — surface `proposed_branch` with three options: (a) create the branch and continue the design on it (run `git switch -c <proposed_branch>`, or `git switch <proposed_branch>` if it already exists, then proceed — no re-invoke), (b) proceed in place on the current branch (continue), (c) cancel (clean-exit). "Proceed in place" is the natural reading of declining the branch suggestion; surface it as a distinct option rather than folding it into cancel.
- `hard_stop` — emit `error: ambiguous_git_state` with `hard_stop_message` surfaced verbatim.

### 3. sk-pattern-mapper

**Input:** `{ intent: <scope_statement>, files: [{ path, status: "new"|"modify" }], scope: "ui"|"infra"|"mixed" }`.

**Output:** markdown report (NOT JSON-fenced — the agent emits markdown directly). Parse two regions:

- The trailing structured-return summary block: `PATTERN MAPPING COMPLETE` line, `Files classified: N`, `Analogues: matched/total ...`, `Top shared patterns: ...`, `Notable gaps: ...`. Used to detect malformed returns (missing block → `error: subagent_failed`).
- The `## Per-file Pattern Assignments` H2 section. For each per-file entry of the form `### \`<path>\` (new — role, flow)` or `### \`<path>\` (modify — role, flow)`, extract `{ path: <path>, why_relevant: <role + analogue summary from the entry body> }`. This list becomes the `analogues` field passed into `sk-rfc-drafter`.

### 4. sk-architectural-advisor

**Input:** `{ topic: <slug>, rfc_context: <scope_statement>, scope_hint: "ui"|"infra"|"mixed" }`.

**Output:** markdown body starting with `## Architecture` (not JSON-fenced — the agent emits markdown directly). Parse from the first `^## Architecture\s*$` line to end-of-output and pass the whole slice verbatim into `sk-rfc-drafter` as `architecture_section`. Any preamble before the heading is permitted by the advisor's contract and discarded on parse.

**Routing:**

- Missing `## Architecture` heading, or `### Structured return` block missing required fields → `error: subagent_failed` (programmer-error path).
- `### Structured return` surfaces `Recommendation: error` with `Off-stack rejection: (none) — error: missing_architecture_context` → hard-stop with `error: missing_architecture_context`. Surface the advisor's reason (no CLAUDE.md / `.claude/rules/` constraint sources) so the user knows to author a minimal CLAUDE.md before re-running.
- Otherwise — pass the parsed `## Architecture` slice through to `sk-rfc-drafter`.

### 5. sk-researcher

**Input — a research brief the orchestrator constructs** (one dispatch per brief):

`{ objective, output_format: "narrative"|"comparison"|"context", background, key_questions, source_policy, scope_boundaries, cap_words: 800 }`

Compose each brief from the settled dialogue state and the survey's `research_hints` — the hint names the angle, the brief makes it explicit: `impl → narrative` (how-to / library findings), `decision → comparison` (a table plus exactly one recommendation; comparison axes go in `key_questions`), `context → context` (citation-anchored prior art). `objective` states what the research must settle; `background` says where the design stands; `scope_boundaries` names what not to research; `source_policy` says what counts as canonical and carries the sources-required discipline.

**Output:** `{ name, output, sources_cited }` inside a ```json``` fence, or an error JSON of the form `{ error: "no_canonical_sources_found", reason }`.

**Routing:**

- Success — collect for the orchestrator-side synthesis (`<fanout_seam>`).
- `no_canonical_sources_found` — resolve by mode (see `<hard_stops>`): in exploration it is a conversational event (tell the user; offer to retry or skip); in `--auto` it degrades per `<fanout_seam>` (drop the failing researcher, continue with the remaining set) rather than halting. `error: research_failed` is the residue when no degrade path remains.
- Any other malformed shape — `error: subagent_failed`.

### 6. sk-rfc-drafter

**Input:** `{ slug, scope_statement, synthesis_output?, architecture_section, analogues: [{ path, why_relevant }], feedback? }`.

**Output:** `{ mode: "draft_ready", draft_path, draft_text }` inside a ```json``` fence, or an error JSON of the form `{ error: "missing_input", reason }`.

**Routing:** write `draft_text` to `.sidekick/plans/<slug>/RFC.md`. On a re-dispatch with `feedback`, the drafter integrates the targeted section only and leaves every other section byte-equal — this is also how a **redesign re-entry** re-drafts the affected sections (the `feedback` describes the redesign).

### 7. sk-plan-drafter

**Input:** `{ slug, rfc_path, rfc_hash, feedback? }`.

**Output:** `{ mode: "draft_ready", draft_path, draft_text }` inside a ```json``` fence, or an error JSON.

**Routing:** write `draft_text` to `.sidekick/plans/<slug>/PLAN.md`. The drafter is responsible for embedding `pins-rfc: <rfc_hash>` in the PLAN.md frontmatter — the crossref-checker verifies the pin in the PLAN quorum.

### 8. sk-structural-checker

**Input:** `{ artifact_path, artifact_type: "rfc"|"plan"|"decision" }`.

**Output:** `{ verdict: "pass"|"fail", artifact_path, artifact_type, issues? }` inside a ```json``` fence. `issues` is REQUIRED iff `verdict === "fail"` and ABSENT otherwise.

**Routing:** `pass` continues; `fail` rolls `issues` into a prose `feedback` field for the matching drafter's re-dispatch.

### 9. sk-crossref-checker

**Input:** `{ artifact_path, artifact_type: "plan"|"decision", related_paths: { rfc: <abs path> } }`.

**Output:** `{ verdict: "pass"|"fail", artifact_path, artifact_type, issues? }` inside a ```json``` fence.

**Routing:** same shape as `sk-structural-checker`. In the PLAN quorum, the checkers' failures are combined into a single prose `feedback` summary so the plan-drafter sees all dimensions in one re-dispatch.

### 10. sk-coherence-checker

**Input:** `{ artifact_path, artifact_type: "rfc"|"plan"|"decision", related_paths?: { rfc: <abs path> } }`. `related_paths.rfc` is required for `plan`, optional for `decision`, omitted for `rfc`.

**Output:** `{ verdict: "pass"|"fail", artifact_path, artifact_type, issues? }` inside a ```json``` fence. `issues` is REQUIRED iff `verdict === "fail"`; each issue is `{ kind: "contradiction", locus_a, locus_b, detail }`.

**Routing:** same shape as `sk-structural-checker`. In the RFC and PLAN quorums, a `fail` rolls its `issues` into the combined prose `feedback` for the matching drafter's re-dispatch.

### 11. Operator-authored verifiers (registry members with `builtin: false`)

**Input:** the same dispatch shape as the surface's bundled checkers: `{ artifact_path, artifact_type, related_paths? }` (`related_paths` as the quorum step passes it).

**Output:** `{ verdict: "pass"|"fail", artifact_path, artifact_type, issues? }` inside a ```json``` fence — the artifact-checker contract the verifier-authoring skill teaches.

**Routing:** advisory — findings surface, never gate (see the quorum steps). A malformed return from an operator member is noted in prose (which member, what was wrong) and its verdict ignored; it is NOT `subagent_failed` — a misauthored operator verifier must not brick the design flow, and the note tells the operator what to fix.

</dispatcher_parse_contracts>

<output_artifacts>

```
.sidekick/plans/<slug>/
├─ RFC.md         (YAML frontmatter + Goals & non-goals, Architecture, Decisions, Questions, Risks, optional Research notes; ## Redesigns appended on re-entry, ## Amendments by /sk-build)
├─ PLAN.md        (YAML frontmatter with pins-rfc: <rfc_hash> + per-task entries + ## Checklist)
└─ RESEARCH.md    (the research synthesis — only when research ran)
```

`<slug>` may be a flat slug (`add-keyboard-shortcuts`) or a nested member-of-group slug (`multi-tenant/auth`). The orchestrator derives it from the topic (and confirms it) on a new design, or takes it verbatim on a redesign re-entry.

### Commit shape

```
design(<slug>): draft RFC and PLAN          # new design
design(<slug>): redesign — <one-line>        # redesign re-entry (R-NN)
```

Single atomic commit. Stage only the paths written by this skill — `git add .sidekick/plans/<slug>/RFC.md .sidekick/plans/<slug>/PLAN.md` plus `RESEARCH.md` when it exists (and `OVERVIEW.md` / `MEMBERS.md` on the group path). Never `git add -A`.

### R-NN block (written on a redesign re-entry)

Append to RFC.md `## Redesigns`. If the section doesn't exist, create it after `## Decisions` (or after `## Amendments` when present).

```markdown
## Redesigns

### R-NN (YYYY-MM-DD)

**Trigger:** <what surfaced the rework — e.g. "/sk-build T-04 structural blocker: D-03, D-07 unworkable as locked" or "/sk-goal-verify: g2 HOLLOW">

**Affected:** D-XX[, D-YY...][, g_n...]

**Change:** <what the design now does differently, and why>
```

`R-NN` increments per redesign within the ticket's RFC.md (R-01 first). Date is ISO `YYYY-MM-DD` from the system clock. The re-draft then reconciles `## Decisions` / `## Architecture` to match.

### What is NOT written by this skill

- `## Amendments` blocks in RFC.md — written by `/sk-build` during execution (single-decision tweaks). (`## Redesigns` R-NN, by contrast, *is* written here on a re-entry.)
- Source code (touched only by `/sk-build` via `sk-executor`).
- `.sidekick/decisions/*.md` (owned by `/sk-decide`).

</output_artifacts>

<examples>

Four examples teaching the interaction judgment, not the pipeline mechanics. They show: research-as-dialogue inside a default exploration with a light confirm; a hands-off `--auto medium` run where effort drives depth and the only pause is a one-line confirm; an honest-autonomy breakout where `--auto low` stops for one focused question rather than guessing; and a redesign re-entry where an existing plan re-opens design seeded by what broke. Each leads with the reasoning the orchestrator should do; the deterministic Finalisation (context → draft → RFC quorum → confirm → PLAN quorum → commit) is summarised because its mechanics live in `<workflow>`.

### Example 1 — Default exploration, research as dialogue, light confirm

A fuzzy topic is the *start* of the discussion, not a halt — an unsized topic is exactly what the exploration body is for. User runs `/sk-design "make the dashboard load faster"`. No plan by that name exists, so it's a new design: the orchestrator derives a slug (`dashboard-load-speed`, confirmed) and grounds via `sk-explorer` (analogues in the data-fetch layer, no prior decision on caching, `scope_signal` broad — "faster" unscoped); branch precheck `proceed`s. Rather than treat the vagueness as a stuck-state, the orchestrator opens with its own reading — the angles in play (query latency, payload size, render cost), the load-bearing decision (attack the data fetch or the render path first), and that it hasn't researched yet but wants the user's read first. That opening *is* the user's first contact with the work, and it invites correction.

The user redirects: it's not render cost, the dashboard refetches everything on every tab switch — reframing toward caching, which is prior art the orchestrator can't infer from the repo. So it states the move before making it ("I'll survey the cache strategies for tab-switched data and their tradeoffs"), runs ONE research pass transparently through the fan-out, and lays the options out by substance — stale-while-revalidate keyed per tab vs. a normalised cache with explicit invalidation, naming what each means rather than "Option A / Option B." The user picks one; the design is clear enough to draft. The orchestrator converges — gathers design context, then Finalisation runs as always to a *light* `Approve` / `Tweak` / `Cancel` approval (surfaced as an `AskUserQuestion`), light because the substance was worked out together. The teaching point: research is a move inside the dialogue (announced, single, earned), and the approval is light precisely because the user already drove the substance.

### Example 2 — `--auto medium`, hands-off, effort drives depth

`--auto` is trust to proceed, so there is no conversational turn — the stated effort is the whole instruction for how deep to go. A clean, unused slug needs no derivation, so the run flows straight through.

User runs `/sk-design export-csv --auto medium`. No `export-csv` plan exists, so it's a new design on a clean slug (no derivation needed); branch precheck `proceed`s; `sk-explorer` grounds it. Because `medium` maps to the `standard` research tier, the orchestrator gathers design context and runs research at standard depth (one researcher per hint, orchestrator-side synthesis) without pausing to ask whether to — the effort level already answered that. Synthesis flows into Finalisation: draft → RFC quorum → PLAN → parallel quorum → commit, all hands-off. The single pause is the one-line approval before commit — an `AskUserQuestion` like "Designed `export-csv` (RFC.md, PLAN.md, RESEARCH.md)" with `Approve` / `Cancel` — trust to proceed, not blindness. The teaching point: in hands-off mode the effort word *is* the depth knob, so the orchestrator never stops to negotiate research; the only human touch is the one-line approval.

### Example 3 — `--auto low`, honest-autonomy breakout

`--auto low` says "keep it shallow," but honest-autonomy outranks the effort word when proceeding would mean guessing at something load-bearing. The bar for interrupting is higher than in exploration — `--auto` is trust to proceed — so the breakout is reserved for the one unknown that actually changes the design, not for anything the orchestrator could reasonably infer.

User runs `/sk-design webhook-retries --auto low`. New design on a clean slug; branch precheck `proceed`s; `sk-explorer` grounds it. As it works toward a draft, the orchestrator surfaces a fork it genuinely cannot infer from the topic or the repo: retries can be in-process (a timer) or durable (a queue with persistence across restarts), and the two produce completely different architectures — getting it wrong wastes the whole draft. This isn't complexity the effort word covers; it's a missing fact. So instead of guessing, the orchestrator breaks out for ONE focused question: "Before I draft — should retries survive a process restart (durable queue) or is in-process retry enough? It changes the architecture." The user answers "durable"; the orchestrator folds that in and continues hands-off from there — research at the `quick` tier (still `low`), then Finalisation through to the one-line confirm. The teaching point: honest autonomy means stopping for the one thing you can't responsibly assume, then proceeding — not turning `--auto` into a conversation.

### Example 4 — redesign re-entry from a build blocker

An existing plan is re-entry, not a collision — this is the loop closing. `/sk-build export-csv` hit a structural blocker at T-04 (D-03 and D-07 unworkable as locked) and its redesign prompt told the user to run `/sk-design export-csv`. The user does.

The orchestrator resolves the argument to the existing `.sidekick/plans/export-csv/` and enters **Redesign re-entry**: it reads RFC/PLAN, `git log` for the `[T-NN]` commits done so far, and reconstructs the trigger (the T-04 deviation naming D-03/D-07). It opens by stating what broke — "the build hit a wall at T-04: D-03 (streaming writer) and D-07 (request-layer auth) can't both hold as written; here's the fork" — and settles the new direction. Then it appends `## Redesigns` R-01 (trigger + affected D-03/D-07 + the change), re-dispatches `sk-rfc-drafter` with `feedback` describing the redesign so only `## Decisions` / `## Architecture` change, re-runs the RFC quorum, re-drafts and **re-pins** PLAN.md, runs the PLAN quorum, and commits `design(export-csv): redesign — durable streaming writer`. The user then re-runs `/sk-build export-csv` to resume through the revised tasks. The teaching point: redesign re-enters the *same* dialogic design, seeded by what broke, and the loop cycles.

</examples>

<symbol_conventions>

- `<slug>` — positional argument identifying the plan directory (`.sidekick/plans/<slug>/`). Flat (`add-keyboard-shortcuts`) or nested member-of-group (`multi-tenant/auth`).
- `<group-slug>` — set when the dialogue reveals the topic spans multiple plans. Used for `.sidekick/plans/<group-slug>/OVERVIEW.md` and `MEMBERS.md`, written by this skill.
- `g_n` — goal ID in RFC.md `## Goals & non-goals`. Sequentially numbered from `g1`. Cited by PLAN.md tasks and verified by `sk-crossref-checker`.
- `D-NN` — decision ID in RFC.md `## Decisions` (zero-padded from D-01). Cited by PLAN.md tasks and verified by `sk-crossref-checker`. This skill writes the initial set and any redesign revisions (`R-NN`); single-decision `## Amendments` (`A-NN`) are written by `/sk-build`.
- `T-NN` — task ID in PLAN.md `## Checklist` (zero-padded from T-01). Set by `sk-plan-drafter`; ticked by `/sk-build`.
- `R-NN` — redesign ID in RFC.md `## Redesigns` (zero-padded from R-01). Written by this skill on a redesign re-entry; it reconciles `## Decisions` / `## Architecture` to match. (`/sk-build` defers to this via its redesign prompt — it does not write `## Redesigns`.)
- `pins-rfc:` — PLAN.md frontmatter field carrying the SHA-256 of RFC.md's content at the moment PLAN.md was authored. Set by `sk-plan-drafter` (the orchestrator passes it `rfc_hash` from the `hash-rfc` CLI); verified by `sk-crossref-checker` in the PLAN quorum and by `/sk-build`'s drift check (`check-drift` CLI). All three get the hash from the one `hash-rfc` CLI, so they compute it identically by construction.

</symbol_conventions>
