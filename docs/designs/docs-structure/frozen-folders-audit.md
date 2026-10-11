# Audit of the frozen folders before deletion

For `design.md` (#100), 2026-10-10. A subagent read all 31 files in `docs/backlog/`, `docs/work/`, and `docs/references/`. It checked each cited issue with `gh issue view`, and each inbound citation with `git grep`. The one genuine loss was reproduced again in the orchestrating session.

The question was whether deleting the three folders loses anything still true, still unresolved, or recorded nowhere else. Git keeps the files, so "lost" means no longer findable from the living repo, the issues, or the ADRs.

## Verdict

One loss: the reason `plugin/bin/package.json` exists. Everything else is recorded elsewhere or describes the retired harness. The deletion also makes living text false in six places, listed in §What else must change.

## Per file

| Path | What it is | Where it lives now | Loss | Cited by |
|---|---|---|---|---|
| `backlog/agent-measurement-program.md` | Framing of the measurement programme | ADR-0008, amended by #1 and #31 (both completed); parked by ADR-0009 | None | ADR-0006, ADR-0008 |
| `backlog/cross-family-quorum.md` | Verify with a non-Anthropic model family | #5, not planned; `research/README.md:79`, `research/ACTION-PLAN.md:31` | None | Research README, ACTION-PLAN |
| `backlog/dashboard-verdict-rule-duplication.md` | Dashboard sync hazard | #44, not planned; dashboards retired | None | Nothing |
| `backlog/failure-capture-pipeline.md` | Harvest capture design | ADR-0008 D4; retired by ADR-0009 §4 | None | ADR-0008 |
| `backlog/fixer-scope-widening.md` | Widening the fixer's scope gate | #16, not planned; principle at `plugin/rules/sk-agent-prompts.md:133-135` | None | Nothing |
| `backlog/gate-command-defaults.md` | No `pnpm` default for gates | Resolved in item 3.1; no plugin skill names a default runner | None | Nothing |
| `backlog/install-config-dir-divergence.md` | Install ignored `CLAUDE_CONFIG_DIR` | #17, completed (`b40c07f`); `bin/cli.ts:97-99`, `bin/cli.test.ts:165` | None | Nothing |
| `backlog/install-esm-module-resolution.md` | Why the ESM bundle exits silently under an up-tree `"type": "commonjs"` | **Nowhere.** The fix survives as `plugin/bin/package.json`, with no explanation and no test | **Yes**, see §The loss | Nothing |
| `backlog/operator-dial-tooling.md` | Operator-set knobs | #4, not planned; `research/README.md:53` | None | Research README, ACTION-PLAN, reasoning-capability |
| `backlog/own-dashboard-renderer.md` | Replace Quarto | #35, not planned; dashboards retired | None | Nothing |
| `backlog/platform-primitives-scoping.md` | E2's discussion trail and pilot findings F1–F10 | ADR-0002's context (line 7), ADR-0003 (F9); both superseded or parked by ADR-0009 | None (F5 is borderline) | ADR-0002:7,74; ADR-0003:13 as evidence |
| `backlog/usage-instrumentation.md` | E21 usage-data design | #6, not planned; open successors #138 and #146 | None | Nothing |
| `backlog/work-item-doc-format.md` | No work-item format | #34, not planned; the content-shape half is #128 | None | Nothing |
| `references/README.md` | A dead backlog-to-references convention | `docs/README.md:25` | None | `docs/README.md:25` |
| `references/sk-agent-prompts-revisions.md` | Provenance for the E1 prompt-rule edits | `research/prompting/REPORT.md:48,62-66`; the rule was trimmed since (#96, #162) | None | Research ACTION-PLAN:15, README:51, prompting REPORT:77 |
| `work/EPIC.md` | Harness roadmap, the E# crosswalk, the execution log | Issues #1–#35, ADR-0009, `DESIGN-PRINCIPLES.md`, `research/README.md:47-66` | None; the crosswalk is a side effect, see §What else must change | ADRs 0001–0007, `adr/README.md`, `docs/README.md`, research README, platform-landscape, the 2026-06-18 review |
| `work/EPIC-STATE.md` | State snapshot to 2026-07-07 | The same issues; ADR-0009's context | None | ADR-0006:63, ADR-0007, knowledge-layer REPORT, `docs/README.md` |
| `work/bench/epic.md` | The bench epic | ADR-0008 (amended), #31 completed; parked by ADR-0009 | None | ADR-0008:3,66 |
| `work/bench/1-…`, `2-…`, `3-…`, `5-…` | Bench specs and write-ups | ADR-0008; retired by ADR-0009 §4 | None (bench-5 is borderline) | Nothing |
| `work/bench/4-…`, `6-…` | Specs never built | #14 and #15, not planned | None | Nothing |
| `work/ops/epic.md`, `1-…` to `6-…` | Knowledge graph, dashboards, orient | ADR-0007; retired by ADR-0009; orient became `sk-orient`; the bun-import trap is caught at `ci.yml:68` | None | Nothing |

## The loss

`backlog/install-esm-module-resolution.md` is the only record of why `plugin/bin/package.json` exists. Reproduced on 2026-10-10 on Node v22:

- `plugin/bin/package.json` is `{"type": "module"}`, and `~/.claude/package.json` is `{"type":"commonjs"}`.
- A copy of `plugin/bin/sidekick` under an up-tree `{"type":"commonjs"}` exits 0 and prints 0 bytes. With the co-located `package.json` beside it, it prints its usage.
- The entry guard at `bin/cli.ts:105-111` is what goes silent.
- CI cannot catch the file's removal, because the repo's root `package.json` declares `"type": "module"`. No test covers it, and the commit that added it, `fd8354c`, does not explain it.
- Inferred: a silent no-op would also stop every hook that calls the CLI.

The note's warning still applies: keep the co-located `type` in step with the build format.

## What else must change with the deletion

These are not losses, but each would become false:

- `plugin/rules/sk-pm-conventions.md:15` names sidekick's `docs/work/`. It is a shipped rule, so the edit needs a release.
- `docs/README.md`: the frozen-folder clause in §Lifecycle classes, the three folder rows, and the folder-earning test, which names `work/` and `backlog/`.
- `README.md:88`: "the frozen work history".
- `docs/research/README.md:82`: "Parked build items → `docs/backlog/{item}`".
- `docs/adr/README.md:7` sends readers to the E# crosswalk in `EPIC.md`, which ADRs 0001–0005 depend on. After deletion the crosswalk exists only in git, which #137's index rewrite has to point at.
- #105's link repairs into and inside the EPIC files become permalinks to a commit that holds them.

## Borderline, not counted

- Bench-5: the headless eval session's permission sandbox denied the installed CLI, and the subject failed closed, which would have recorded a false miss. It is relevant to #117 and #136 if `claude plugin eval` tests skills that call `sidekick pm` or `gh`. #117 already treats tool grants as open. A comment there is optional.
- Pilot F5: options and open questions referenced but never laid out in chat. One data point about a retired skill; the memory `askuserquestion-swallows-preamble` holds a related fact.

## Not determined

- The "R1 catalog" `EPIC.md` cites matches no file. #44 treats it as the set of issues filed in R1 (inferred).
- Three EPIC ideas have no issue: a pre-write syntax guardrail, a contradiction linter, and persisting the research plan. All concern retired agents.
- The ESM failure was tested on Node v22 only.
- Consumer repos were not searched for links to these files.
