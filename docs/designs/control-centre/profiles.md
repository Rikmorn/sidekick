# Profiles: where they live and how one is declared

Status: format and store decided; what a declaration means is left to use · Gate 2, decision 2 of the [control-centre design](design.md) · 2026-10-12

## Problem

G2 asks for a sound management system for declared profiles: create, list, switch, and launch sessions with one, background sessions included. A session loads only the plugins, rules, and stance its profile declares. Three pieces read the profile's data. The launcher starts interactive and background sessions, and the gauge mod names the session's profile. The scope mod filters what native settings cannot. A wrong data model here is paid for in all three.

Decided here, because they cross pieces:

1. What a profile's declaration means: only what it names, or changes over the user layer.
2. Its format.
3. Where profiles live.
4. How a running session carries its profile's name.

Routed to the profile-management issue: the CLI's verbs, the launcher's path, the start-cost report, and the test profile's content.

## Constraints

Grades as in [mods.md](mods.md). Probes on 2026-10-12 ran `claude -p --model haiku` in a scratch folder on Claude Code 2.1.296.

| # | Constraint | Grade |
|---|---|---|
| P1 | Claude Code has no profile feature. A profile is a settings file passed with `--settings`, with a stance through `--append-system-prompt-file` | read, in the surface report; the stance file measured, in the probes report |
| P2 | `--settings` merges into the user layer key by key. A plugin the profile does not name keeps its user-level state | measured: with only `code-review` named, superpowers' and sidekick's skills were still listed |
| P3 | Disabling superpowers, or `code-review`, also removed sidekick's skills | measured, once each. sidekick's manifest lists both as dependencies (read), so the cascade is inferred to come from them |
| P4 | `claudeMdExcludes` removes instruction and rule files. It is a deny list | measured, in the surface report |
| P5 | No setting switches loose agents or user-settings hooks off for one session. A mod can, as harness-scope does through `agent.offer` | read and surveyed, in the surface report |
| P6 | `claude --bg` takes `--settings` and `--append-system-prompt`, and `claude agents --settings` sets the settings for sessions agent view dispatches | measured and read, in the design's constraints |
| P7 | `plugin/bin/sidekick` joins the Bash tool's path inside a session only. The installed plugin's folder carries its version, as in `~/.claude/plugins/cache/rikmorn/sidekick/0.5.1/` | read in ADR-0009; the folder seen on 2026-10-12 |
| P8 | A profile's settings beat the repo's own. In the sidekick repo, whose `.claude/settings.json` enables `code-review`, a profile setting it to `false` removed it | measured |
| P9 | Profiles are content, made ad hoc; the management system is the goal. One test profile is the bench. Profiles are built and documented properly. Sessions launch through aliases, and every worker runs from a session | stated by the operator, gate 1 |

From P2 and P4: a native settings file can only subtract from the user layer. "Only what it declares" means every other installed plugin written as `false`, and every other rule file excluded. Each new install then leaks into every profile until someone edits it.

## Options

### What a profile is

**A. Native files only.** A profile is a folder holding `settings.json`, passed to `--settings` as written, and `stance.md`. Aliases launch it.

1. No pattern: the platform's own format.
2. Nothing to translate or keep in step with Claude Code.
3. The trial profiles of 2026-10-11 took this shape.
4. Cost: it cannot mean "only what it names" (P2). A plugin or rule installed later reaches every profile silently, and the scope mod's filters and a profile's description have no home.
5. Next change: installing a plugin means editing every profile.

**B. A full sidekick manifest.** A `profile.json` models every switch a profile may set. `sidekick profile launch` compiles it into a settings file and starts the session.

1. Schema at the boundary, with parse, don't validate: one schema owns the format.
2. A profile is checked before launch, and allowlists compile to the `false` entries and excludes the platform needs.
3. New here.
4. Cost: a translation layer that must follow every settings key Claude Code adds or changes.
5. Next change: a new native switch needs a schema field and a release.

**C. A thin manifest, compiled at launch.** A `profile.json` holds only what native settings cannot say: a description, the plugin and rule allowlists, and the scope mod's filters. A `settings` block inside it passes native keys through untouched. Launch compiles the allowlists against what is installed, merges the block, and starts the session.

1. Declarative configuration compiled to the platform's format, with a passthrough for the rest.
2. It models only the gap between "what the operator means" and "what `--settings` does" (P2, P4, P5).
3. New here. `bin/helpers/rules.ts` is the nearest: it writes only what it owns.
4. Cost: a compile step and a schema, and a launcher that must find the installed CLI from outside a session (P7). Not worth it if profiles stay a handful that rarely change.
5. Next change: a new native switch needs nothing. A new gap the scope mod fills needs one field.

### Where profiles live

A profile is plain files, written in any session. Adding one needs no sidekick release; only the mechanism ships.

| Option | For | Against |
|---|---|---|
| User level, `~/.claude/profiles/<name>/` | One store, usable in any repo and outside one | Not versioned unless the operator makes the folder a repository |
| User and repo level, the repo's first on a shared name | A profile can travel with a repo. Colleagues without sidekick ignore the files | Two stores and a precedence rule. A repo profile is settings from a repo, and its `settings` block can set hooks and permissions. Whether a `--settings` file is held to the folder's trust has not been checked |
| Shipped in the plugin | Versioned and released | Contradicts the ruling that profiles are content made ad hoc (P9). The test profile ships only as a test fixture |

### How a session knows its profile

The compiled settings set an environment variable naming the profile, such as `SIDEKICK_PROFILE`, through the `env` key. The gauge reads it, and a session without it is unprofiled. Assumed: that a mod reads the variable has not been checked, so the gauge's issue checks it first.

## Recommendation

C, stored at user and repo level, with the profile's name in the compiled settings' environment. What a declaration means is left to use, as the operator ruled.

Assumptions, and what changes if each is wrong:

- C holds both meanings, so trying both costs nothing. A profile with an allowlist loads only what it names; one with only a `settings` block changes the user layer, as A would. If use settles on changes alone, the compile step goes.
- Compiling at launch finds the installed CLI from outside a session (P7). If no stable path exists, the compile runs when a profile is saved and at plugin update. The gauge then flags a profile built before the latest install.
- A mod reads the session's environment. If not, the compiled settings carry the name some other way the gauge can read.
- A repo profile is launched only by name, by the operator or a session they run. If a cloned repo's profile could be launched unread, the launcher needs a trust check first.

## Routed elsewhere

- The CLI's verbs, the launcher's path, the start-cost report, and how agent view gets the stance: the profile-management issue.
- A profile that disables a plugin another one it enables depends on (P3): that issue's check reports it.
- Whether a repo profile is held to the folder's trust, and what the launcher shows before it applies one: that issue, before repo profiles ship.
- What a declaration means by default: decided after the test bench holds one profile of each kind.
- A memory folder per profile: the loop design, through the `settings` block.
- Which plugins a profile can choose between: decision 4.

## Decision

The operator's answers on 2026-10-12, in a session with Claude:

- **What a declaration means:** not decided. The operator wants to use both before choosing. C allows that, as the recommendation says.
- **Format: C,** the thin manifest with a passthrough block. Agreed.
- **Store: user level, and repo level too.** The operator will make profiles while working in other repos, or outside any repo, and a release per profile would not scale. User level is acceptable; since profiles are files, a repo can hold them as well, and colleagues without sidekick ignore them.

On how user-level profiles meet a repo's own plugins, Claude reported P8 and P3. A profile's settings beat the repo's, so a profile that turns a plugin off turns it off there too. A profile with an allowlist therefore turns off a plugin the repo enables but the profile does not name. Turning off one of sidekick's dependencies turns sidekick off with it.
