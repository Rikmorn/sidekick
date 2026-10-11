# Docs lifecycle and drift: prior art

For #100, #105, and #137, through the design at `docs/designs/docs-structure/`. Written 2026-10-10.

A subagent surveyed the sources and ran two link checkers read-only against sidekick's tracked Markdown in a scratch directory. **[V]** marks a claim it verified by reading the primary source or running the tool, and **[I]** an inference. The orchestrating session re-read the remark-validate-links README and spec-kit's persistence page and confirmed the claims quoted from them.

## Summary

- **Records never become reference.** PEP 1 calls a resolved PEP "a historical document rather than a living specification" [V]. It adds that "Formal documentation of the expected behavior should be maintained elsewhere" [V]. Nygard ADRs and log4brains agree: a record is immutable, and only its status changes [V].
- **Diátaxis describes the living side only.** Its reference type "describes the machinery" and stays accurate to the product [V]. It says nothing about records or repo layout.
- **The agentic frameworks leave ephemeral versus durable open.** spec-kit declines to choose a default. Kiro says to version-control specs and says nothing about retiring them. GSD archives at a milestone's close rather than deleting.
- **Two link checkers catch the drift offline.** lychee and remark-validate-links both check cross-file anchors with no network; markdown-link-check and mlc do not. Run on `git ls-files '*.md'`, remark reproduced the 31 missing-file links [V]. It also found 3 missing headings, all inside the absent `../EPIC.md` [V].
- **Every ADR tool derives the index from the directory.** Only one young tool documents a drift gate. "Regenerate and compare" is established for generated docs in general, not as an ADR convention.

## Organising docs by purpose or lifecycle

- **Diátaxis.** Four types sit on a compass of action or cognition against acquisition or application: tutorial, how-to, reference, and explanation [V]. Reference is "austere", gives "neutral description", and mirrors "the structure of the product" [V]. Explanation covers "design decisions, historical reasons, technical constraints" [V]. The site's front pages say nothing on repo placement, records, or ADRs [V, not a whole-site search]. What transfers: a reference doc is a present-tense description that tracks the code. What does not: Diátaxis sorts by reader need, not lifecycle [I].
- **Docs as code.** Write the Docs defines it as writing docs "with the same tools as code", tests included, and says nothing on living versus record docs [V]. Google's documentation guide says "Change your documentation in the same CL as the code change", "Dead docs are bad", and "Default to delete" [V]. What transfers: living docs change in the commit that changes what they describe, and records freeze.
- **ADR practice.** Nygard (2011-11-15): ADRs are "numbered sequentially and monotonically. Numbers will not be reused", and a reversed decision is kept and marked superseded [V]. MADR 4.0.0 (2024-09-17) uses `superseded by ADR-0123` and `docs/decisions/NNNN-title-with-dashes.md` [V]. MADR's own ADR-0004 built `adr-log` because "ADRs have to be indexed somehow" [V]. `adr new -s N` in adr-tools rewrites the old ADR's status and links both ways [V]. log4brains 1.1.0 (2024-12-17): "an ADR is immutable. Only its status can change", with the index published as a generated site [V]. What transfers: the index is a derived view, and supersession is a pair of links a tool can check.
- **spec-kit v1.1.3 (2026-10-09).** `docs/concepts/spec-persistence.md` names three models: Flow-Back Spec, Flow-Forward Spec, and Living Spec. It says "None is the default, and none is required by Spec Kit", and teams record their choice in the constitution [V]. It has no deletion step [V]. What transfers: state the mutation rule for each kind of artefact. What does not: leaving it unchosen.
- **Kiro.** Each feature gets `.kiro/specs/<feature>/` with `requirements.md` or `bugfix.md`, `design.md`, and `tasks.md` [V]. The best-practices page says "Specs are designed to be version-controlled", updated 2026-09-25, and says nothing about retiring them [V]. Böckeler classes Kiro and spec-kit as spec-first in practice (martinfowler.com, 2025-10-15) [V].
- **GSD.** `gsd-build/get-shit-done` is archived and points at `open-gsd/gsd-core`, v1.16.0 of 2026-10-05 [V]. In the installed GSD 1.42.3, `.planning/` is committed by default, and gitignoring it turns its commits off [V]. At a milestone's close the workflow moves the roadmap and requirements into `.planning/milestones/` and removes `REQUIREMENTS.md`. Its `cleanup` command moves phase folders after a dry run and the user's confirmation [V]. `pr-branch` filters "transient .planning/ commits" out of a PR [V]. Who deletes: the workflow, by archiving at the close.
- **BMAD v6.12.1 (2026-10-04).** Working artefacts go under `_bmad-output/` [V, from an example path]. No retirement policy turned up in its English docs [V, limited search]. Its theory of project context says "A stored copy goes stale" and "stored maps rot fastest of all" [V]. That is the mechanism behind taxonomy READMEs that restate a layout and drift from it.

## Offline Markdown link checkers

| Tool | Latest | Maintenance | Cross-file anchors | Offline | Footprint | Bun |
|---|---|---|---|---|---|---|
| lychee | 0.24.2 (2026-05-01) | Active | Yes. Its own kebab-case slugs, which it calls GitHub's method [V]. A GitHub-exact generator is on `master`, unreleased [V] | `--offline` [V] | 16.6 MB binary, or `lycheeverse/lychee-action` v2.9.0 [V] | Not applicable |
| remark-validate-links with remark-cli | 13.1.0 (2025-02-21), CLI 12.0.1 | Stable, low churn [I] | Yes, from the CLI only; the API skips other files' headings [V]. Slugs by `github-slugger`, read in its source [V] | Yes; it never checks external URLs [V] | About 19 MB of `node_modules` as a devDependency [V] | Yes, on Bun 1.3.14 [V] |
| markdown-link-check | 3.15.0 (2026-07-28) | Active [V] | **No**: `b.md#nope` passes [V] | Only by ignoring `^https?://` [V] | About 25 MB [V] | Yes [V] |
| linkspector | 0.5.6 (2026-07-29) | Active | Yes, by `github-slugger` in its source, not run [V] | No flag [V] | Needs Chrome [V] | Not tested |
| mlc | 1.2.2 (2026-09-28) | Active | **No**: "The chapter part … is not checked" [V] | `--offline` [V] | Rust binary | Not applicable |

markdownlint's MD051 checks fragments within one document only [V]. GitHub documents its slug rules: lowercase, spaces to hyphens, punctuation removed, and `-1`, `-2` for duplicates [V].

Commands for "relative links only, fail on a broken file or anchor", each checked against a fixture [V]:

```
git ls-files -z '*.md' | xargs -0 lychee --offline --include-fragments --no-progress
remark --use remark-validate-links --frail --quiet --no-stdout $(git ls-files '*.md')
```

- lychee exits 2 on an error. In `lychee.toml` the setting is `include_fragments = "anchor-only"`, because `= true` is a parse error in 0.24.2. It also reads bare URLs in prose, so it found 32 errors on sidekick: the extra is the text `file://-open` at `docs/work/ops/6-dashboards.md:41`.
- remark exits 1 only with `--frail`. It needs a Git `origin` remote, or `repository: false` in the plugin's options.
- markdown-link-check runs one file per call and misses broken cross-file anchors.

## Generating or verifying an ADR index

| Tool | How it builds the index | Drift check |
|---|---|---|
| adr-tools 3.0.0 (2018-07-25) | `adr generate toc` to stdout [V] | None [V] |
| adr-log 2.2.0 (2020-10-21) | `-i` injects the list between `<!-- adrlog -->` markers [V] | None documented [V] |
| log4brains 1.1.0 | A static site from the directory and the git log [V] | Not needed: no committed index |
| adrs 0.12.1 (2026-09-03) | `adrs generate toc > doc/adr/README.md` [V] | `adrs doctor` checks naming, gaps, and links, with no index-drift rule [V] |
| adr-kit 0.59.1 (2026-10-05) | `bin/adr-index docs/adr` writes JSON [V] | `adr-index --check` [V]; created 2026-04, 10 stars |

Derive and assert is documented practice for generated docs. Kubernetes' `hack/verify-generated-docs.sh` reruns the generator and fails with "Generated docs need to be updated" [V]. terraform-docs has `--output-check` [V]. No source read describes asserting an ADR index in a unit test as an ADR convention [V for the sources read].

Two designs follow. Commit no index, as log4brains does, so the directory is the index. Or commit one and gate it with a test that derives it from the directory and asserts equality, which matches `sk-working-standards.md` §Numbers that go stale.

## Sources

Retrieved 2026-10-10 unless dated.

- https://diataxis.fr/ and its compass, reference, explanation, and reference-explanation pages
- https://www.writethedocs.org/guide/docs-as-code/
- https://google.github.io/styleguide/docguide/best_practices.html
- https://peps.python.org/pep-0001/
- https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions (2011-11-15)
- https://adr.github.io/madr/ and https://github.com/adr/madr/blob/develop/docs/decisions/0004-write-own-toc-tool.md
- https://github.com/npryce/adr-tools
- https://github.com/adr/adr-log
- https://github.com/thomvaill/log4brains
- https://github.com/joshrotenberg/adrs
- https://github.com/rvdbreemen/adr-kit
- https://github.com/github/spec-kit/blob/main/docs/concepts/spec-persistence.md (v1.1.3, 2026-10-09)
- https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html (2025-10-15)
- https://kiro.dev/docs/specs/ and https://kiro.dev/docs/specs/best-practices/
- https://github.com/gsd-build/get-shit-done and https://github.com/open-gsd/gsd-core; the local GSD 1.42.3 workflows `cleanup.md`, `complete-milestone.md`, and `pr-branch.md`
- https://github.com/bmad-code-org/BMAD-METHOD (`docs/existing-codebases/theory-of-project-context.md`)
- https://lychee.cli.rs/guides/cli/ and lychee-lib `extract/markdown.rs` at `lychee-v0.24.2`
- https://github.com/remarkjs/remark-validate-links
- https://github.com/tcort/markdown-link-check
- https://github.com/UmbrellaDocs/linkspector
- https://github.com/becheran/mlc
- https://github.com/DavidAnson/markdownlint/blob/main/doc/md051.md
- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax
- https://github.com/kubernetes/kubernetes/blob/master/hack/verify-generated-docs.sh
- terraform-docs `docs/reference/terraform-docs.md` (v0.24.0)
