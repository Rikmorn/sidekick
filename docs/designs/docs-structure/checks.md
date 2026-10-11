# Sub-problem: the checks that keep docs true

Part of `design.md`, gate 2. Status: decided 2026-10-11, revised after review to Option 1 · 2026-10-11

## Problem

Goal 9: drift a machine can see is caught by a check, not a reviewer. Today nothing checks the docs. The results are 31 broken relative links (F6) and an ADR index listing 5 of 11 (F5). Research topics also lack the index the layout asks for (F5).

Two kinds of drift differ in who should own the check:

- **Links** are a generic problem with maintained tools (`docs/research/docs-structure/2026-10-10-docs-lifecycle-prior-art.md` §Offline Markdown link checkers).
- **The layout's invariants** are sidekick's own. An ADR index lists every ADR, and a research topic's index lists its reports. A design note has a status line, and no committed file cites `docs/superpowers/`. No tool knows them, and the plugin states them for every repo.

## Constraints

- **Verified on 2026-10-11 in a scratch repo**, with remark-cli 12.0.1 and remark-validate-links 13.1.0:
  - With an `origin` remote on GitHub, the plugin treats a permalink such as `https://github.com/<owner>/<repo>/blob/<sha>/docs/work/EPIC.md` as a local link, ignores the SHA, and reports the file missing. Compaction's D1 permalinks would all fail.
  - With `repository: false`, permalinks are skipped. A missing relative file and a missing heading in another file are both still reported.
  - The plugin reports warnings, and `--frail` turns them into a non-zero exit.
- **Verified**: CI runs `bun run check`, `bun run typecheck`, and `bun run test` (`.github/workflows/ci.yml`). A new gate is one more step there.
- **Verified**: `plugin/bin/sidekick` is built and committed. Every dependency the CLI imports is bundled into it, and each change to `bin/` rebuilds it (`AGENTS.md` §Layout).
- **Decided**: the `superpowers.md` sub-problem puts a cleanup command in the CLI, scoped to `docs/superpowers/`.
- **Verified**: the 11 legacy research topics have no `README.md` index. A research-index check fails on them until they conform or are exempted. The critical pass decides their shape.
- **Assumed**: consumer repos run whatever the plugin ships only when a skill step runs it or the operator does.

## Options

### Option 1: sidekick-only checks

- remark-validate-links as a dev dependency, with `repository: false`, run on tracked Markdown by a package script that CI runs.
- A bun test under `bin/` asserts that sidekick's ADR index lists every ADR, and that each research topic's index lists its reports.

Pattern card:

1. Rent the generic check; test the repo's own content.
2. It closes F5 and F6 for sidekick with the least new surface.
3. Already in the repo: `bun run prose`, a dev-dependency check run as a package script.
4. Cost: the layout's invariants are encoded in sidekick's test suite, which then reads docs content, a different job from its unit tests. Consumer repos get nothing, though the plugin states the invariants for them too. Don't use it if the layout's rules should be checkable wherever the layout applies.
5. Next change: a new invariant is a new assertion in sidekick's tests, and consumer repos still drift.

### Option 2: rent links, ship the layout's invariants in the CLI

- The link check as in Option 1, for sidekick alone.
- `sidekick docs check` joins the CLI beside the cleanup command, as a `docs` noun next to `rules` and `pm`. It checks the layout's invariants in whichever repo it runs:
  - every ADR file appears in the ADR index;
  - every research topic has an index that links each of its reports;
  - every `design.md` has a status line with a valid value;
  - no tracked file links into `docs/superpowers/`.
- It reports each breach with a path, exits non-zero on any, and skips a check whose folder is absent. Fixtures test it, and sidekick's CI runs it on sidekick's own docs.
- A skill step can run it. `sk-milestone`'s close is the natural seat, and #186's release check another.

Pattern card:

1. Validation where the contract is defined: the plugin that states the layout checks it. Generated-docs checks follow the same pattern, such as Kubernetes' `hack/verify-generated-docs.sh` and terraform-docs' `--output-check`.
2. It closes F5 and F6 for sidekick, and gives every consumer repo a way to find the same drift. aesir's 13 ADRs carry the same risk sidekick's did.
3. Already in the repo: `sidekick pm lint` checks the PM layer's invariants the same way, deterministic and fixture-tested.
4. Cost: a new CLI subcommand, its tests, and a rebuild, plus deciding what the research check does with legacy topics. Don't use it if no skill or person will run it outside sidekick.
5. Next change: a new invariant is a function and a fixture in one place, and every repo gets it with the release.

### Option 3: ship everything, links included

- Option 2, plus link checking inside `sidekick docs check`, with remark bundled into the CLI.

Pattern card:

1. One command for every docs check.
2. Consumer repos get link checking without installing anything.
3. New here.
4. Cost: the remark and unified packages are bundled into a committed executable that every repo's hooks load. That is a heavy coupling for a generic job each repo can rent itself. Don't use it while no consumer repo has asked for link checks.
5. Next change: a remark upgrade becomes a plugin release.

## Revised after review, 2026-10-11

The operator accepted review answers 4–6 (`design.md` §Review): **Option 1, sidekick-local, modelled on furnace's checker.** Furnace runs `scripts/check-docs.ts` and `scripts/docs-index.ts` in its `bun run check`. Furnace has not moved to sidekick's layout yet, so its layout is no evidence either way. Its checker's design is the prior art.

- A repo script beside `bin/prose.ts`, the precedent for a check outside the shipped CLI, run by a package script in CI.
- It regenerates the ADR index from each ADR's status line and diffs it against the committed one.
- It confirms each permalink's `<sha>:<path>` exists, with `git cat-file -e`, since remark skips permalinks under `repository: false`.
- It checks code-span paths in living docs, with records exempt, as furnace does.
- It runs remark-validate-links with `repository: false` for relative links and headings.
- Each research topic's `README.md` links every other Markdown file in the topic, and each `design.md` carries a valid status line.
- `sk-milestone`'s close gains no docs check. Hygiene for other repos is #191, in `backlog` until a second repo adopts the layout. The operator expects it will be needed.

## Stance

**Decided 2026-10-11, before the review: Option 2.**

The recommendation, as written before the decision: Option 2. Option 1 checks the layout in one repo though the plugin states it for all, and Option 3 bundles a generic tool into the plugin.

It rests on three assumptions:

- A skill step will run `sidekick docs check` outside sidekick, likely `sk-milestone`'s close. If nothing does, Option 2's reach beyond sidekick is unused, and it costs little more than Option 1.
- The legacy research topics conform after the critical pass, or the check exempts them by a rule the layout states. Until then the research check cannot gate CI.
- remark-validate-links stays usable with `repository: false`. Verified for the current versions.

Either way, links are checked by remark with `repository: false`, so compaction's permalinks pass and relative links stay checked.
