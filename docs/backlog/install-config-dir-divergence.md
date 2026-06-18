# Backlog: `install` ignores `CLAUDE_CONFIG_DIR`

**Status:** Parked 2026-06-11. Surfaced by the E19 final integration review (fan-out seam build).

**What:** `install()` derives the Claude home from `os.homedir()` + `.claude` (`bin/cli.ts`, the `claudeHome` binding) and does **not** honour the `CLAUDE_CONFIG_DIR` environment variable. Every skill/agent invocation of the installed launcher — including E19's `<fanout_seam>` capability probe and the existing helpers (branch-precheck, check-drift, wave-plan, reconcile-plan, init) — reads `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`. The two disagree when `CLAUDE_CONFIG_DIR` points somewhere other than `~/.claude`.

**Why it matters:** if an operator sets `CLAUDE_CONFIG_DIR` to a non-default location, `install` writes the launcher + payload under `~/.claude/sidekick/...` while every invocation looks under `$CLAUDE_CONFIG_DIR/sidekick/...` and misses it. For the E19 probe specifically this is absorbed gracefully — the seam's documented degradation ("if the probe itself fails, use agents") falls back to the in-session backend — but the broader effect is that an installed sidekick is simply not found, so it's a latent install/runtime mismatch, not E19-specific.

**Scope:** pre-existing; affects all six helpers equally. E19 did not introduce it and the seam already degrades safely, so it was out of scope for E19 and not a merge blocker.

**Recommendation when picked up:** make `install()` resolve the Claude home the same way the launcher convention does — `process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')` — and add a test asserting the install target tracks `CLAUDE_CONFIG_DIR`. Audit for any other `os.homedir()`-derived path that should defer to the env var.

**Refs:** `bin/cli.ts` (`install`, `claudeHome`); the launcher path convention in `skills/sk-design/SKILL.md` `<fanout_seam>`, the orchestrators' `branch-precheck` calls, and sibling agents (`agents/sk-crossref-checker.md`).
