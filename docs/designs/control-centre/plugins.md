# Plugins: splitting sidekick along pm, dev, and ops

Status: revised after the review; one plugin in R9 · Gate 2, decision 4 of the [control-centre design](design.md) · 2026-10-12

## Problem

The operator ruled at gate 1 that sidekick splits into plugins exactly where a profile must separate things: pm, dev, and ops. Gate 2 settles the shape, because it changes install records wherever sidekick is enabled. It also fixes where each mod lives, since a plugin holds one hooks module. The split amends ADR-0009 Decision 2, which makes the repo a one-plugin marketplace.

Decided here: whether to split, and into which plugins. Routed to the split's issue: the CLI's packaging, versioning, and the migration.

## Constraints

Grades as in [mods.md](mods.md).

| # | Constraint | Grade |
|---|---|---|
| S1 | A plugin holds one hooks module, so a mod's boundary is its plugin's | read; K8 in [mods.md](mods.md) |
| S2 | Disabling superpowers or `code-review` turned sidekick off too. sidekick's manifest lists both as dependencies | measured; P3 in [profiles.md](profiles.md) |
| S3 | `sk-orient`, `sk-track`, `sk-milestone`, and `sk-holistic-reviewer` touch superpowers only through the `.superpowers/sdd/` path, which the release check writes itself. `sk-design`, `sk-execute`, and `sk-worker` build on superpowers' skills | read by a grep of `plugin/skills/` and `plugin/agents/` |
| S4 | `skillOverrides` does not apply to plugin skills. Hiding one plugin skill in a session needs the scope mod | read, in the surface report |
| S5 | sidekick's hooks run the CLI from their own plugin's folder (`plugin/hooks/session-start:8-11`, `plugin/hooks/post-read:22`) | read |
| S6 | A plugin's `bin/` joins the Bash tool's path (ADR-0009). Two plugins each shipping `bin/sidekick` would put two on it | read; the collision is inferred |
| S7 | A release bumps three version fields and tags `sidekick--v<version>` (`AGENTS.md` §Releasing) | read |
| S8 | sidekick is enabled in the user settings and in its own repo's project settings. furnace and aesir are the other home repos. The operator is its only user | settings read; the home repos per `sk-pm-conventions.md`; the sole user per session memory of 2026-09-27 |
| S9 | Split exactly where a profile must separate things: pm, dev, and ops | stated by the operator, gate 1 |

The ruling names three domains. The candidate mods in the design also place the gauge and the scope mod in a `core` module. And the operator expects profiles for work outside any repo. Such a session wants the gauge and the profile tools, but no board and no superpowers.

## Options

**A. No split.** One `sidekick` plugin. The scope mod hides skills a profile does not want, and the one mod switches its parts by the profile's name.

1. No pattern at the plugin level; a branch on the profile inside the mod.
2. It avoids churn in install records, releases, and skill names.
3. Today's shape.
4. Cost: every profile using any part of sidekick loads superpowers and `code-review` (S2), the prod and no-repo profiles included. Separation rides the scope mod on the early-access API (S4), where a plugin boundary would do it natively. One module branches on the profile, and each new profile adds a branch.
5. Next change: a new profile edits the mod's switch.

**B. Four plugins, split by what a profile needs.**

| Plugin | Holds | Depends on |
|---|---|---|
| `sidekick`, kept as the core's name | the reference skill, rules install and check, the profile tools, and one mod: gauge, scope, and desk | nothing |
| `sidekick-pm` | `sk-orient`, `sk-track`, `sk-milestone`, `sk-holistic-reviewer`, the pickup hook, and the board mod | `sidekick` |
| `sidekick-dev` | `sk-design`, `sk-execute`, `sk-worker`, and the hooks on superpowers' skills | `sidekick`, superpowers, `code-review` |
| `sidekick-ops` | the ops mod; moved to the loop milestone at the decision | `sidekick` |

1. Package by feature, with a dependency-free core.
2. The plugin boundary becomes the profile boundary and the mod boundary (S1). Native `enabledPlugins` does the separating, and superpowers' cascade stays inside dev (S2, S3).
3. New here. The marketplace already lists plugins by path, so it takes more entries.
4. Cost: install records change in the user settings and the home repos. Skill names change, as `sidekick:sk-orient` becomes `sidekick-pm:sk-orient`, and every reference moves. Four plugins release, and the CLI must reach each plugin's hooks without two on the path (S5, S6). Not worth it if every profile loads everything.
5. Next change: a new domain is a fifth plugin depending on `sidekick`, with its own mod, and no existing plugin changes.

The desk sits in core rather than in an orchestration plugin. G1 wants it in every session, and dispatching a session with a profile is generic. The worker's handoff stays in dev, in `sk-execute`.

**C. Split by stability.** `sidekick` keeps every skill and hook, and `sidekick-mods` holds every mod, so one switch drops all in-process code.

Rejected: a plugin holds one module (S1). The board, the gauge, and the ops hold could then be separated by profile only by branching inside it, which misses the ruling (S9).

## Recommendation

B: four plugins, with `sidekick` kept as the core's name, so existing install records still load something.

Assumptions, and what changes if each is wrong:

- Some profiles leave superpowers out: prod, and work outside a repo. If every profile loads superpowers anyway, the cascade argument goes, and the split's gain shrinks to the mod boundary.
- The operator stays the only user, so the migration is a few settings files and three installs. If others use sidekick, the release notes carry a migration.
- Dependencies between plugins in one marketplace resolve as they do across marketplaces, which ADR-0009 validated. The split's issue checks that first.

## Routed elsewhere

- How the CLI reaches each plugin's hooks, and which plugin puts it on the path (S5, S6): the split's issue.
- One version for all four plugins or one each, and the tags a release makes: the split's issue, with `AGENTS.md` §Releasing.
- The Read hook serves both pm's release check and dev's reviewers. Where it lives: the split's issue.
- The migration order, the release notes, and the sweep of skill names.
- ADR-0009 Decision 2's amendment: written with the split.
- The review found that the CLI reads skill and rule files from its own plugin folder (`bin/cli.ts:87`, `bin/helpers/hook.ts:40-41,181`). It also delivers `sk-pm-conventions.md` only where a `sidekick@` key is enabled (`bin/helpers/rules.ts:53-54,98`). A split that moves those files breaks both without an error, as ADR-0010 Decision 2 makes every hook failure silent.
- After a split, install records naming only `sidekick@rikmorn` load the core alone, so the PM layer drops until the records change.

## Decision

The operator's answer on 2026-10-12, in a session with Claude: split, as B, but without `sidekick-ops` for now. The ops mod moves to the loop milestone, which the operator expects to set concrete targets for what each plugin bundles. R9 ships three plugins: `sidekick` as the core, `sidekick-pm`, and `sidekick-dev`.

The operator asked whether this follows Anthropic's model of one plugin per domain, with Claude Code as the core. Claude checked on 2026-10-12:

- `anthropics/knowledge-work-plugins` holds 22 plugins of its own, one per domain, such as sales, finance, and engineering. None of their manifests declares a dependency, and each carries its own skills and connectors. Their only shared base is Claude Code.
- `anthropics/claude-code` lists 13 plugins split by capability, such as `code-review` and `commit-commands`. Their manifests were not read.

So the domain split follows that model; the core departs from it. sidekick's pm and dev share what Claude Code lacks: the CLI, and the control centre's profile tools and mod. A session can draw one gauge, so the mod cannot be copied into each domain plugin as connectors are. The operator then ruled that pm and dev depend on the core for the CLI. The core is the base for every other sidekick plugin. One `sidekick` command stays on the path, and the CLI's commands keep their names.

### Revised after the review

The design's review found that pm and dev reference each other in both directions (finding 4). It also found that the CLI reads skill and rule files from its own plugin folder (finding 3). R9 builds no profile that must separate pm from dev, since domain profiles are content made between the initiatives. Claude changed its recommendation to one plugin in R9, and the operator agreed on 2026-10-12: "likely better choice actually".

The split moves to the loop design, which the operator expects to set concrete targets for what each plugin bundles. The rulings in this note carry over. The core is the base for every other sidekick plugin, and ops is its own plugin. So do the findings under §Routed elsewhere.
