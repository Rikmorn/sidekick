# ADR-0009 — Pivot to a plugin bundle: superpowers does the work, sidekick adds what it lacks

**Status:** Accepted (2026-09-18). Supersedes the harness shape of ADR-0001 and the substrate scoping of ADR-0002; parks the eval, knowledge-layer, and measurement programmes of ADR-0006, ADR-0007, and ADR-0008. Issue #93, milestone R5.

## Context

Sidekick was built from June to September 2026 as a design → build → review harness with sixteen specialist agents, a deterministic CLI kernel, an eval bench, and a knowledge graph. It never ran: the two consumer repos hold only a config file, sidekick itself was built with superpowers (29 superpowers plans in this repo), and the last batch of work closed eighteen issues with no sidekick command invoked. The operator kept returning to superpowers, and the parts of sidekick that transferred to other repos are the portable rules and the PM conventions.

Four audits on 2026-09-18, kept under `docs/reviews/2026-09-18-*.md`, established: 14 of 22 skills and agents duplicate superpowers, GSD, or an official plugin; superpowers has nothing for GitHub project management, research workflow, or retrospectives; the loop's genuine mechanisms (a fresh gate from the controller per task, goal-backward verification, sealed review of the design and the plan, a structural stop-versus-continue threshold) can be re-expressed as thin extensions around superpowers; and the agent-prompt authoring rule is worth keeping but rests on a runtime fact that has changed.

The plugin system now supports what the pivot needs: a manifest may declare `dependencies` on other plugins with semver ranges, a plugin may ship `bin/` executables that join the Bash tool's PATH, and `claude plugin eval` exists as a rented replacement for the bench. Plugins cannot ship path-scoped rules, so a rules installer stays a genuine sidekick job.

## Decision

1. **Superpowers and the official plugins are the trunk.** sidekick depends on `superpowers` (`^6.3.0`) and `code-review` from `claude-plugins-official`. sidekick builds something itself only for a gap felt in daily use.
2. **sidekick is a plugin bundle.** The repo is a one-plugin marketplace (`rikmorn`); the plugin (`sidekick`) ships the portable rules, a `bin/sidekick` CLI whose only command family is `rules install|check`, and a reference skill. Enablement is user-scoped in the work repos and project-scoped in the home repos.
3. **Rules delivery is non-destructive.** The installer writes and prunes only `sk-*.md` files and reports overlap with other rule files instead of resolving it. Repetition is accepted where a repo keeps its own copy for colleagues who do not use sidekick.
4. **Everything built to replace superpowers is retired**, tagged `pre-pivot-2026-09` and deleted: the six skills, the sixteen agents, the eval kernel and its corpus, the knowledge graph and its generated surfaces, the dashboards, the smokes, and the `.sidekick/` artifact contract. The extension ideas worth bringing back return in later milestones shaped around superpowers, not restored from the tag: design-pass, sealed spec review, goal-backward verification, the SDD rule lines, decision capture, and a child-session execution mode.
5. **The north star is recalibrated** to the everyday loop; the objective tree it replaces is the record of the research programme and stays in git history.
6. **Milestones are releases.** A milestone is sized to one or two sessions and closes with a plugin version tag and a GitHub Release. R6 opens the PM layer on `gh` alone; R7 onward is planned through that layer.

## Consequences

**Positive:** the tool the operator actually uses is the tool the repo ships; the surface shrinks to what is used every day; superpowers' release cadence becomes "read the notes, bump the range"; the repo consumes its own plugin like any other repo, so the project-versus-usage boundary disappears.

**Negative, accepted:** the research programme is parked, including calibrated gates and the adaptive-harness objective. The calibration certificates are lost with the eval kernel; `claude plugin eval` is the replacement when a skill needs measuring. Customisation of superpowers' own skills is limited to prose around them, since plugins cannot hook into each other's skills at runtime; if daily use shows that limit binding, the case for owning a piece of the loop is a felt one rather than a speculative one.

## Assumptions

- Cross-marketplace dependency resolution behaves as documented; both manifests validated under `--strict` on 2026-09-18. If installation fails on dependencies, the fallback is documenting the two dependencies and enabling them by hand.
- Superpowers keeps its cadence and does not rename the skills the later extensions call by name.
- Colleagues in the home repos accept a project-scoped plugin.

## Revisit when

- Daily use of the bundle hits a problem one of the parked components solved; the tag is the recovery point, the audits say which mechanism it was.
- Plugins gain a way to ship path-scoped rules or to override another plugin's skill; either changes the delivery design.
- A second tracker is actually used for work; the PM layer's `gh` mechanics then need the generic layer the conventions already are.

## Links

`docs/reviews/2026-09-18-overlap-matrix.md` · `docs/reviews/2026-09-18-pm-layer-survey.md` · `docs/reviews/2026-09-18-loop-audit.md` · `docs/reviews/2026-09-18-authoring-audit.md` · ADR-0001 · ADR-0002 · tag `pre-pivot-2026-09`.
