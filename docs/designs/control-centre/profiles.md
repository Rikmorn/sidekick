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
| P1 | Claude Code has no profile feature. A profile is a settings file passed with `--settings`. #205 settled the stance as a rule file in the profile folder, loaded through `--add-dir`, not `--append-system-prompt-file` ([the 2026-10-13 probes report](../../research/control-centre/2026-10-13-profile-launch-probes.md)) | read, in the surface report; the `--append-system-prompt-file` canary measured in the 2026-10-12 probes report |
| P2 | `--settings` merges into the user layer key by key. A plugin the profile does not name keeps its user-level state | measured: with only `code-review` named, superpowers' and sidekick's skills were still listed |
| P3 | Disabling superpowers, or `code-review`, also removed sidekick's skills | measured, once each. sidekick's manifest lists both as dependencies (read), so the cascade is inferred to come from them |
| P4 | `claudeMdExcludes` removes instruction and rule files. It is a deny list | measured, in the surface report |
| P5 | No setting switches loose agents or user-settings hooks off for one session. A mod can, as harness-scope does through `agent.offer` | read and surveyed, in the surface report |
| P6 | `claude --bg` takes `--settings` and `--append-system-prompt`, and `claude agents --settings` sets the settings for sessions agent view dispatches | measured and read, in the design's constraints |
| P7 | `plugin/bin/sidekick` joins the Bash tool's path inside a session only. The installed plugin's folder carries its version, as in `~/.claude/plugins/cache/rikmorn/sidekick/0.5.1/` | read in ADR-0009; the folder seen on 2026-10-12 |
| P8 | A profile's settings beat the repo's own. In the sidekick repo, whose `.claude/settings.json` enables `code-review`, a profile setting it to `false` removed it | measured |
| P9 | Profiles are content, made ad hoc; the management system is the goal. One test profile is the bench. Profiles are built and documented properly. Interactive sessions launch through aliases, and every worker runs from a session, none started by hand | stated by the operator, gate 1 |
| P10 | `--setting-sources project` with `--settings` naming one plugin loaded that plugin alone. Dropping the user source also drops the user layer's permissions, hooks, environment, and status line | measured by the reviewer and again by Claude on 2026-10-12; the dropped keys are the reviewer's reading |
| P11 | `--agent`, or the `agent` key, runs the main thread as a named agent with its own prompt, tools, model, MCP servers, and hooks. `claude --bg` accepts it. A non-empty agent prompt replaces Claude Code's system prompt | `--bg` with `--agent`: read in the agent-view docs on 2026-10-12. The rest is the second reviewer's reading of the sub-agents docs, not re-read |
| P12 | A separate `CLAUDE_CONFIG_DIR` switches the whole user layer, but needs its own login, and its supervisor "runs as a separate instance with its own sessions" | login: session memory of 2026-10-11; supervisor: read in the agent-view docs on 2026-10-12 |

From P2 and P4: a native settings file can only subtract from the user layer, unless the session drops that layer with `--setting-sources` (P10). "Only what it declares" means every other installed plugin written as `false`, and every other rule file excluded. Each new install then leaks into every profile until someone edits it.

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
| User and repo level, the repo's first on a shared name | A profile can travel with a repo. Colleagues without sidekick ignore the files at session start | Two stores and a precedence rule. A repo profile is settings from a repo, and its `settings` block can set hooks and permissions. #213 settled it with no trust gate, by the operator's choice: they write every profile they launch. Whether a `--settings` file is held to the folder's trust is still unchecked, and #223 tracks a gate. A session that reads a file in a repo profile's folder receives its rules ([the 2026-10-14 probes report](../../research/control-centre/2026-10-14-repo-profiles-and-switching-probes.md)) |
| Shipped in the plugin | Versioned and released | Contradicts the ruling that profiles are content made ad hoc (P9). The test profile ships only as a test fixture |

### How a session knows its profile

The launched settings carry the name as `sidekick.profile`, not through `env` (#205; [the probes report](../../research/control-centre/2026-10-13-profile-launch-probes.md)). A mod reads the launched object, and a session without the key is unprofiled. A dropped settings object looks the same to a mod, so the launch checks the object first.

## Recommendation

C, stored at user and repo level, with the profile's name in the launched settings as `sidekick.profile`, not in the environment (#205; [the 2026-10-13 probes report](../../research/control-centre/2026-10-13-profile-launch-probes.md)). What a declaration means is left to use, as the operator ruled.

Assumptions, and what changes if each is wrong:

- C holds both meanings, so trying both costs nothing. A profile with an allowlist loads only what it names; one with only a `settings` block changes the user layer, as A would. If use settles on changes alone, the compile step goes.
- Compiling at launch finds the installed CLI from outside a session (P7). If no stable path exists, the compile runs when a profile is saved and at plugin update. The gauge then flags a profile built before the latest install.
- A mod can read the profile. `$.settings.read({ source: "flag" })` returns what `--settings` carries, and `{}` for an unprofiled session (`claude-code.d.ts:3566-3586`, `:11824`). #205 settled it: the name travels as `sidekick.profile`, so no environment variable is needed ([the 2026-10-13 probes report](../../research/control-centre/2026-10-13-profile-launch-probes.md)).
- A repo profile is launched only by name, by the operator or a session they run. #213 settled it with no trust check, since the operator writes every profile they launch. The launch names a repo profile's store, and `show` prints what it sets. #223 tracks a gate, for a cloned repo's profile launched unread.

## Routed elsewhere

- The CLI's verbs, the launcher's path, the start-cost report, and how agent view gets the stance: the profile-management issue.
- Whether an allowlist compiles to `false` entries or to `--setting-sources` with the user layer restored (P10): that issue. The manifest stays, since rules (P4), scope filters (P5), and a description still need it.
- Where the compiled settings file lives. Agent view keeps a session's `--settings` across supervisor restarts, so recompiling it changes a resumed worker. That is the reviewer's reading, not re-read.
- A profile that disables a plugin another one it enables depends on (P3): that issue's check reports it.
- Whether a repo profile is held to the folder's trust, and what the launcher shows before it applies one: settled by #213 with no gate. The launch names the profile's store and any user profile it shadows, and #223 tracks a gate.
- What a declaration means by default: decided after the test bench holds one profile of each kind.
- A memory folder per profile: the loop design, through the `settings` block.
- Which plugins a profile can choose between: decision 4.

## Decision

The operator's answers on 2026-10-12, in a session with Claude:

- **What a declaration means:** not decided. The operator wants to use both before choosing. C allows that, as the recommendation says.
- **Format: C,** the thin manifest with a passthrough block. Agreed.
- **Store: user level, and repo level too.** The operator will make profiles while working in other repos, or outside any repo, and a release per profile would not scale. User level is acceptable; since profiles are files, a repo can hold them as well, and colleagues without sidekick ignore them.

On how user-level profiles meet a repo's own plugins, Claude reported P8 and P3. A profile's settings beat the repo's, so a profile that turns a plugin off turns it off there too. A profile with an allowlist therefore turns off a plugin the repo enables but the profile does not name. Turning off one of sidekick's dependencies turns sidekick off with it.

The second review round, recorded in the design's §Review, adds:

- **No compile step in R9.** Trying both meanings is not free. The allowlist half needs the compile step, a launcher that finds what is installed, the dependency check, and the rule excludes. Claude recommends building the manifest without a compile step, and trying "only what it names" through `--setting-sources` (P10). The operator agreed on 2026-10-12.
- **`--agent` (P11)** may carry a profile's stance, tools, and model. #205 settled the stance channel, so neither `--agent` nor `--append-system-prompt-file` carries it: the stance is a rule in the profile folder ([the probes report](../../research/control-centre/2026-10-13-profile-launch-probes.md)).
- **One config folder per profile (P12)** is rejected for R9: one login each, and agent view split by profile, against G1. It is the fallback if scope filtering proves too weak.
- **Switching a session's profile** is settled by resume (#213; [the 2026-10-14 probes report](../../research/control-centre/2026-10-14-repo-profiles-and-switching-probes.md)). A session cannot relaunch itself, so `sidekick profile switch` prints the resume line to run after `/exit`. A resume swaps the rules and adds the new profile's plugins, but a dropped plugin's skills stay listed. #224 tracks a relaunch without the paste.
