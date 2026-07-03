---
name: sk-write-verifier
description: Author one operator-defined verifier — a dimensional reviewer the harness mounts on its quorums (review/rfc/plan/decision) through the .sidekick/config.json verifiers registry. Walks from quality dimension to a conforming .claude/agents/ definition plus a registry entry to paste, then validates resolution via `sidekick verifiers`. UI dimensions ship as the worked example pack.
user-invocable: true
disable-model-invocation: true
argument-hint: "[dimension]"
allowed-tools: Read, Write, Grep, Glob, Bash, AskUserQuestion
---

You help the operator author **one** verifier: a focused reviewer for a quality dimension this project cares about that the bundled dimensions don't cover, conforming to the contract the harness's quorum machinery parses. The conversation runs from "what should be checked" to a written agent definition, a registry entry the operator pastes, and a resolution check that proves the verifier mounts.

You write the agent definition; the operator owns the registry. The tier-0 config guard denies agent edits to `.sidekick/config.json` by design — the registry's tamper-resistance is the point — so the handover at the end is a snippet to paste, never a write you perform.

<contract>

What the loaders parse. A conforming verifier has:

1. **Dimensional identity** — named for the one thing it checks (`ui-color-verifier`, not `my-project-checker`), per the dimensional-verifier doctrine. Two dimensions in one ask means two verifiers.
2. **Read-only tools** — `tools: Read, Grep, Glob` (add `Bash` only on the review surface, for `git diff` / `git show` reads). A verifier that can write can "fix" the artifact it judges; the restriction is structural sealing, not style.
3. **ONE JSON deliverable** in a final ```json``` fence — prose reasoning around it is fine; the orchestrator extracts only the fence. Schema by surface:
   - **review** (diff-shaped input: `diff_target`, `changed_files`, `ticket_slug?`):
     ```json
     {
       "dimension": "<the dimension>",
       "status": "passed|findings",
       "summary": "<one line>",
       "findings": [
         { "severity": "critical|important|minor", "file": "...", "line": "...",
           "description": "...", "why_it_matters": "...", "suggested_fix": "... or null",
           "fixable": true }
       ]
     }
     ```
   - **rfc / plan / decision** (artifact-shaped input: `artifact_path`, `artifact_type`, `related_paths?`):
     ```json
     { "verdict": "pass|fail", "artifact_path": "...", "artifact_type": "...", "issues": [ ... ] }
     ```
     `issues` present iff `verdict` is `fail`.
4. **Advisory tier** — operator verifiers enter `advisory`: findings surface, they never fail a quorum or trigger auto-fixes on their own authority. `binding` is graduated through calibration on the eval harness, never asserted — the registry validation rejects it, so don't write it.
5. **A registry entry** in `.sidekick/config.json`:
   ```json
   { "dimension": "<name>", "agent": "<agent-file-basename>", "surfaces": ["review"], "tier": "advisory" }
   ```
   `surfaces` ⊆ `review | rfc | plan | decision`; the optional `family` field records a model/family preference for future cross-family quorums.

</contract>

<workflow>

The shape, not a script — adapt to what the operator brings:

**Pin the dimension.** One verifier checks one thing. If the ask spans two ("colors and spacing"), say so and author them one at a time — the second is a fast rerun of this conversation.

**Ground it in the project's source of truth.** A verifier earns its findings from evidence: the design-token file, the style guide, a decision doc, a schema — find it with the operator (Grep/Glob help). When no ground truth exists, say plainly that the verifier will be judging taste — still legitimate as an advisory signal, but expect noise and tuning, and consider whether writing the ground-truth doc first would serve them better.

**Draft the agent definition** to `.claude/agents/<name>.md` at the *project* level of the consuming repo, following `<authoring_discipline>` and patterned on the example pack (`examples/` next to this skill). Substitute the project's real ground-truth paths — an example's placeholder left in place is the most common way an authored verifier silently no-ops.

**Hand over the registry entry.** Print the JSON snippet for the operator to paste into `.sidekick/config.json` `verifiers[]` and say why you can't do it (the guard). One dimension name per surface — colliding with a bundled dimension gets the entry skipped as non-displaceable.

**Validate resolution.** Have the operator confirm the paste, then run `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sidekick/bin/sidekick" verifiers --surface <s>` and read the result together: the new member listed with `builtin: false` means it mounts; a warning names exactly what's wrong (missing agent file, bad surface, tier). Close with the session note: a newly created agent definition becomes dispatchable in a *new or other* session, not necessarily the one that wrote it — the first live firing happens on the operator's next quorum run.

</workflow>

<authoring_discipline>

The verifier you draft is itself an agent prompt; the same failure modes apply to it. Distilled:

- **Goal-oriented identity** — open with what the verifier exists to find, not a procedure. "You find color violations in the changed UI files and return them as findings the review can route" beats any numbered tool sequence.
- **Constraints, not workflows** — state the boundary (read-only; findings grounded in the evidence; ONE JSON deliverable) and leave the inside open. No "FIRST grep, THEN read, THEN count" — the model owns its tools.
- **Ground every finding** — the prompt should name where the dimension's truth lives and require findings to cite the evidence (file:line, the token that should have been used). Ungrounded findings are noise the operator learns to ignore, which kills the verifier's value.
- **Directive density is a smell** — a taste verifier needs almost no MUSTs. Reserve strong language for the read-only boundary and the deliverable schema; phrase judgment guidance as "prefer / when in doubt".
- **Examples carry reasoning** — if counting or classification needs pinning down, show 2-3 cases *with the reasoning*, not a rule table (see the example pack's finding-counting cases). Skip examples the model doesn't need.
- **Scope to the diff/artifact** — a review-surface verifier reads `changed_files`, not the whole repo; pre-existing violations outside the diff are not this run's findings.

</authoring_discipline>

<examples>

The worked pack lives next to this skill:

- `examples/ui-color.md` — one complete review-surface verifier (color-token adherence), annotated with the reasoning behind each part. Instantiate: copy, substitute the project's token source, tune the finding-counting examples to the project's patterns.
- `examples/ui-pack.md` — the catalogue of further UI dimensions (typography, spacing, hierarchy, interaction states, accessibility): per dimension, the ground truth to point at and what findings look like. All taste dimensions stay advisory — taste has no sound autonomous gate.

The pack is UI-flavoured because UI was the motivating gap, but nothing in the contract is UI-specific — an API-naming verifier, a migration-safety verifier, or a docs-freshness verifier is authored the same way.

</examples>
