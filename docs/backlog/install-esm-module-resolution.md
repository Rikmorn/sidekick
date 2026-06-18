# Resolved: installed launcher silently no-ops under an up-tree `type:commonjs` package.json

**Status:** Resolved 2026-06-15 (commit `ef4f1fa`). Found while verifying the E19 install during pilot prep. **Severity: high** (silent total failure — exit 0, no output, looks like success). Kept as a record because the trigger (`~/.claude/package.json`, not sidekick-owned) is invisible and will recur on any host that has one.

## Symptom

The installed launcher `~/.claude/sidekick/bin/sidekick <any-subcommand>` produces **no output and exits 0** — `main()` never runs. Observed for `capabilities` and bare invocation, across every working directory. The source (`bun bin/cli.ts capabilities`) and a fresh build run from `/tmp` (`node /tmp/sk-test.js capabilities`) both work correctly. The installed bundle is **byte-identical** to the working fresh build (verified with `diff`), so it is not a stale-build problem.

## Root cause

`install()` copies the **ESM** bundle (`dist/cli.js`, which uses `import.meta`) to `~/.claude/sidekick/bin/sidekick` — a file with **no extension** and **no co-located `package.json`**. Node resolves a module's type by walking up from the file looking for the nearest `package.json` `type` field. On this machine `~/.claude/package.json` exists (`{"type":"commonjs"}`, created 2026-02-15 — not created by sidekick), so Node loads the ESM bundle in CommonJS mode. The entry-point guard (`_isEntry = import.meta.main ?? isMainEntrypoint(...)`, `bin/cli.ts:239-243`) then evaluates **false**, so the CLI body is skipped and the process exits 0 silently.

`/tmp` copies work only because nothing above `/tmp` declares a `type`, so Node falls back to treating the bundle as a module.

## Why it matters

- **Worst failure mode.** Exit 0 + empty stdout reads as success. Nothing alerts the operator that the entire installed CLI is dead.
- **Pre-existing and common.** `~/.claude/package.json` is not created by sidekick (it predates the install by months — likely Claude Code or a plugin). Any consumer with *any* non-`module` `package.json` above the install dir is affected.
- **Defeats the E19 fan-out seam silently.** `/sk-design` with `fanout.backend: auto` runs the probe via this launcher; an empty/unparseable result is treated as "probe failed → use agents" (the seam's documented degradation). So the workflow backend is **never exercised** even where it is genuinely available — the seam reports a graceful fallback while the real cause is a broken launcher. RESEARCH.md would record `backend=agents` despite `capabilities` reporting `available: likely` on a healthy build.

## Fix shipped

`install()` now writes `<claudeHome>/sidekick/package.json` = `{"type":"module"}` next to the bundle (`bin/cli.ts`, right after the launcher copy). Node finds it before reaching `~/.claude/package.json`, pinning the bundle's module type independent of anything up-tree. It lives inside `stateDir`, so uninstall's recursive `stateDir` removal cleans it up — no manifest entry needed.

Tests (`bin/cli.test.ts`, the `install` describe):
- **Behavioral** — install with a real `import.meta`-using ESM fake-bundle *and* an up-tree `<claudeHome>/package.json` `{"type":"commonjs"}`, then spawn `node` on the installed launcher and assert it emits output (`main()` actually runs). Reproduces the symptom and guards the fix end-to-end.
- **Structural** — assert install writes the `{"type":"module"}` file beside the launcher.

**Alternative considered — emit the bundle as `.mjs`** (forces ESM by extension regardless of up-tree config): rejected as more invasive — the launcher is invoked by its extension-less path (`.../sidekick/bin/sidekick`) in every skill/agent file (`agents/sk-crossref-checker.md`, `skills/sk-design/SKILL.md` `<fanout_seam>`, the orchestrators' `branch-precheck` calls), so renaming touches all those call sites. Co-locating `package.json` changes nothing about the invocation contract.

**Maintenance note:** keep the co-located `type` in sync with the build format. The bundle is ESM today (`bun build` default). If the build ever switches to CJS, this must follow.

## Interaction with the other install-robustness item

See [`install-config-dir-divergence.md`](./install-config-dir-divergence.md) (still open). Both concern the install target. The co-located `package.json` is written to `stateDir`, which is derived from `claudeHome` (`os.homedir()`-based) — so it inherits the same `CLAUDE_CONFIG_DIR` blind spot. When that item is fixed (resolve `claudeHome` from `CLAUDE_CONFIG_DIR`), this file follows automatically because it already uses the same `stateDir`.

**Refs:** `bin/cli.ts` (`install`, the launcher copy + co-located `package.json`; the `_isEntry`/`isMainEntrypoint` guard at lines ~226-243); `dist/cli.js` (the ESM bundle); `~/.claude/package.json` (the up-tree `type:commonjs` trigger, not sidekick-owned).
