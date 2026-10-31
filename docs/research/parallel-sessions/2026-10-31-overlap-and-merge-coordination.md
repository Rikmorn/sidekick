> Research for the `parallel-sessions` design, not yet planned. A research subagent gathered it on 2026-10-31 for the operator and Claude. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Overlap and merge coordination for parallel changes

This report asks how teams and tools surface, coordinate, and resolve overlap between parallel changes to one repo. It proposes no design.

The operator framed the interest on 2026-10-31 in three parts:

- **Early awareness of overlap.** Planning can know which other sessions are active and which files they touch, "though it will never be perfect".
- **Cheap merges.** The operator expects most conflicts to be obvious and can "help with priority".
- **A check after integration.** Every in-flight feature still meets its objective once the others land.

Preventing overlap altogether is not the goal.

[2026-10-31-parallel-agent-tools-survey.md](./2026-10-31-parallel-agent-tools-survey.md) already covers Clash, GitButler, worktrunk, and the desktop orchestrators. This report cites it as source 1 and does not repeat it.

Labels:

- **[V n]**: read at source n on 2026-10-31. Every source in §Sources was read that day.
- **[S n]**: taken from a search-result excerpt of source n, not read at the page itself.
- **[I]**: an inference from what was read, not stated by any source.

Stars, licences, last push, and last release come from the GitHub REST API, the Codeberg API, crates.io, and npm on 2026-10-31 [V 76]. Source files were read at the commit named in each source's URL. No tool was installed or run.

## Sources

Earlier report:

1. [2026-10-31-parallel-agent-tools-survey.md](./2026-10-31-parallel-agent-tools-survey.md), cited by section

Awareness and reservations among agents:

2. Claude Code docs, "Orchestrate teams of Claude Code sessions": https://code.claude.com/docs/en/agent-teams
3. MCP Agent Mail README, Python: https://github.com/Dicklesworthstone/mcp_agent_mail
4. MCP Agent Mail README, Rust: https://github.com/Dicklesworthstone/mcp_agent_mail_rust
5. MCP Agent Mail source, `crates/mcp-agent-mail-core/src/setup.rs`: https://github.com/Dicklesworthstone/mcp_agent_mail_rust/blob/a12f77334853/crates/mcp-agent-mail-core/src/setup.rs
6. MCP Agent Mail `LICENSE`: https://github.com/Dicklesworthstone/mcp_agent_mail_rust/blob/a12f77334853/LICENSE
7. Foremerge README: https://raw.githubusercontent.com/naw103/foremerge/HEAD/README.md
8. Foremerge source, `src/integrations.rs`: https://github.com/naw103/foremerge/blob/553d252d113b/src/integrations.rs
9. Foremerge, `docs/mcp-setup.md`: https://github.com/naw103/foremerge/blob/553d252d113b/docs/mcp-setup.md
10. Gas Town, Refinery role prompt: https://github.com/gastownhall/gastown/blob/466aa41c83ee/internal/templates/roles/refinery.md.tmpl
11. Gas Town source, `internal/refinery/batch.go`: https://github.com/gastownhall/gastown/blob/466aa41c83ee/internal/refinery/batch.go
12. Gas Town, `docs/concepts/integration-branches.md`: https://github.com/gastownhall/gastown/blob/466aa41c83ee/docs/concepts/integration-branches.md
13. Wilson Lin, "Scaling long-running autonomous coding", Cursor, 2026-01-14: https://cursor.com/blog/scaling-agents
14. Nicholas Carlini, "Building a C compiler with a team of parallel Claudes", Anthropic, 2026-02-05: https://www.anthropic.com/engineering/building-c-compiler
15. agent-worktrees README: https://github.com/kaimbuilds/agent-worktrees
16. claude-presence README: https://github.com/garniergeorges/claude-presence
17. conflict-check README: https://github.com/Cipher-08/conflict-check
18. weave README: https://github.com/Ataraxy-Labs/weave
19. CrossWatch (search excerpt only): https://github.com/jsgoldman/crosswatch

Conflict prediction and its evidence:

20. Brun, Holmes, Ernst, and Notkin, "Proactive Detection of Collaboration Conflicts", ESEC/FSE 2011: https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-fse2011.pdf
21. Crystal's code, exported from Google Code: https://github.com/brunyuriy/crystalvc
22. Brun, Holmes, Ernst, and Notkin, "Early Detection of Collaboration Conflicts and Risks", TSE 2013 (record only): https://doi.org/10.1109/TSE.2013.28
23. Sarma, Redmiles, and van der Hoek, "Palantír: Early Detection of Development Conflicts Arising from Parallel Code Changes", TSE 2012 (abstract from search excerpts): https://doi.org/10.1109/TSE.2011.64
24. Kasi and Sarma, "Cassandra: Proactive Conflict Minimization through Optimized Task Scheduling", ICSE 2013, as reviewed: https://neverworkintheory.org/2014/04/25/cassandra-proactive-conflict-minimization-through-optimized-task-scheduling.html
25. Maddila, Nagappan, Bird, Gousios, and van Deursen, "ConE: A Concurrent Edit Detection Tool for Large Scale Software Development", TOSEM 2022: https://arxiv.org/abs/2101.06542
26. Ananthanarayanan et al., "Keeping Master Green at Scale", EuroSys 2019 (abstract via Semantic Scholar): https://doi.org/10.1145/3302424.3303970
27. Adrian Colyer's summary of source 26, 2019-04-18: https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/
28. Xu, Subramanian, and Karthik, "AI Agent Pull Requests on GitHub: Frequency, Structure, and Merge Conflict Rates", arXiv:2607.04697, July 2026: https://arxiv.org/html/2607.04697
29. Ogenrwot and Businge, "AgenticFlict", arXiv:2604.03551, April 2026: https://arxiv.org/abs/2604.03551
30. Campos Junior and Murta, "How AI Coding Agents Resolve Merge Conflicts: An Empirical Study", SBES 2026: https://cbsoft.sbc.org.br/2026/data/papers/sbes/How%20AI%20Coding%20Agents%20Resolve%20Merge%20Conflicts%20An%20Empirical%20Study.pdf
31. Subramanian, Xu, and Karthik, "Asymmetric Repository Lineage Modeling and Verifier-Guided Coordination in Concurrent AI Coding Agents", arXiv:2610.04779, October 2026: https://arxiv.org/abs/2610.04779
32. Xia, Wu, and Park, "Passes Alone, Fails Together", arXiv:2609.25396, September 2026: https://arxiv.org/html/2609.25396
33. Nikolaev, "Claim Plane", arXiv:2608.00947, August 2026: https://arxiv.org/abs/2608.00947
34. Khatua et al., "CooperBench: Why Coding Agents Cannot be Your Teammates Yet", arXiv:2601.13295, January 2026: https://arxiv.org/abs/2601.13295
35. Da Silva, Borba, et al., "Detecting semantic conflicts with unit tests", JSS 2024 (search excerpt only): https://research.chalmers.se/publication/541567

Merge queues and stacking:

36. GitHub docs, "Managing a merge queue": https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
37. Mergify docs, merge queue: https://docs.mergify.com/merge-queue/
38. Mergify docs, scopes: https://docs.mergify.com/merge-queue/scopes
39. Trunk docs, merge queue: https://docs.trunk.io/merge-queue
40. Trunk docs, parallel queues: https://docs.trunk.io/merge-queue/optimizations/parallel-queues/
41. Aviator docs, MergeQueue: https://docs.aviator.co/mergequeue
42. Aviator docs, affected targets: https://docs.aviator.co/mergequeue/concepts/affected-targets
43. Aviator docs, queue modes and parallel mode (search excerpts only): https://docs.aviator.co/mergequeue/concepts/queue-modes
44. Graphite docs, merge queue: https://graphite.com/docs/graphite-merge-queue
45. npm registry, `@withgraphite/graphite-cli`: https://registry.npmjs.org/@withgraphite/graphite-cli
46. bors-ng README: https://github.com/bors-ng/bors-ng
47. Zuul docs, project gating: https://zuul-ci.org/docs/zuul/latest/gating.html
48. av README: https://github.com/aviator-co/av
49. git-branchless wiki, `git sync`: https://github.com/arxanas/git-branchless/wiki/Command:-git-sync
50. git-branchless wiki, `git test`: https://github.com/arxanas/git-branchless/wiki/Command:-git-test
51. git docs, `git-rebase`: https://git-scm.com/docs/git-rebase

Making the merge cheap:

52. Mergiraf home page: https://mergiraf.org/
53. Mergiraf, supported languages: https://mergiraf.org/languages.html
54. Mergiraf, usage: https://mergiraf.org/usage.html
55. Spork README: https://github.com/ASSERT-KTH/spork
56. IntelliMerge README: https://github.com/Symbolk/IntelliMerge
57. git docs, `git-rerere`: https://git-scm.com/docs/git-rerere
58. git docs, `git-merge-tree`: https://git-scm.com/docs/git-merge-tree
59. Jujutsu docs, conflicts: https://docs.jj-vcs.dev/latest/conflicts/
60. VS Code docs, merge conflicts: https://code.visualstudio.com/docs/sourcecontrol/merge-conflicts
61. GitHub changelog, "Ask @copilot to resolve merge conflicts on pull requests", 2026-03-26 (search excerpt only): https://github.blog/changelog/2026-03-26-ask-copilot-to-resolve-merge-conflicts-on-pull-requests/
62. GitHub changelog, "Agent Merge watches and fixes pull requests in the cloud", 2026-10-28: https://github.blog/changelog/2026-10-28-agent-merge-watches-and-fixes-pull-requests-in-the-cloud
63. Phil Haack, "Resolve Merge Conflicts the Easy Way", 2026-03-25: https://haacked.com/archive/2026/03/25/resolve-merge-conflicts/
64. LWN, Sasha Levin's LLMinus RFC, 2026-01-11: https://lwn.net/Articles/1053714/
65. Zhang et al., "Using Pre-trained Language Models to Resolve Textual and Semantic Merge Conflicts", ISSTA 2022: https://www.microsoft.com/en-us/research/uploads/prod/2022/07/issta22-merge-conflicts-llm.pdf
66. Svyatkovskiy et al., "Program Merge Conflict Resolution via Neural Transformers" (MergeBERT), ESEC/FSE 2022 (search excerpt only): https://arxiv.org/abs/2109.00084

Checking after integration:

67. Martin Fowler, "SemanticConflict", 2011-08-04: https://martinfowler.com/bliki/SemanticConflict.html
68. git docs, `gitworkflows`: https://git-scm.com/docs/gitworkflows
69. Stephen Rothwell's linux-next announcement, 2008-02-12, via LWN: https://lwn.net/Articles/268881/
70. Isaac Corbrey, "Jujutsu megamerges for fun and profit", 2026-04-20: https://isaaccorbrey.com/notes/jujutsu-megamerges-for-fun-and-profit
71. Justin Young, "Effective harnesses for long-running agents", Anthropic, 2025-11-26: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
72. agentic-coding-swarm-protocol README: https://github.com/antoniarco/agentic-coding-swarm-protocol

Availability statements and metadata:

73. GitHub docs, merge queue availability (search excerpt of source 36 and the branch protection page): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule
74. Claim Plane repository (metadata only): https://github.com/SkeinRank/claim-plane
75. Semantic Scholar API, for paper records: https://api.semanticscholar.org/graph/v1/paper/
76. GitHub REST API `repos/{owner}/{repo}` and `/releases`; Codeberg API `repos/mergiraf/mergiraf`; crates.io `crates/{name}`; npm registry

Added after a claim about Gas Town failed its check:

77. Gas Town source, `internal/git/git.go`: https://github.com/gastownhall/gastown/blob/466aa41c83ee/internal/git/git.go

## Comparison by stage

Each cell says what the find does at that stage. A dash means the sources read document nothing there. The last column notes fit for the operator's setup, as an inference [I]. That setup is one machine, with Claude Code sessions and background workers in worktrees, on TypeScript and Node repos.

| Find | Planning | During work | Merge | After merge | Fit for one operator [I] |
|---|---|---|---|---|---|
| Claude Code agent teams | Lead writes tasks with dependencies; teammates self-claim under a file lock [V 2] | One owner per file set, by advice; no worktrees [V 2] | – | `TaskCompleted` hook can refuse a completion [V 2] | Inside one lead session only, not across peer mains |
| MCP Agent Mail | Reserve path globs with a TTL; conflicts come back with the grant [V 4] | Hooks list active and expiring leases at start and before `Edit` [V 5] | Pre-commit and pre-push guards block commits on others' exclusive leases [V 4] | – | Advisory and file-level; writes `~/.claude.json`; licence rider [V 5, 6] |
| Foremerge | Agents declare scoped intents; rules compare them [V 7] | Claims stay advisory [V 7] | Acceptance refuses open conflicts; it never merges [V 7] | Records which check passed on which fingerprint [V 7] | Pre-1.0; repo-local files only [V 8] |
| Clash | – | Pairwise `git merge-tree` across worktrees [V 1, §Clash] | – | – | Textual only; v0.2.0 [V 1] |
| agent-worktrees, claude-presence, conflict-check | Path claims with `wt check`; named-resource locks [V 15, 16] | LLM and AST checks per branch pair [V 17] | – | – | Single-author projects with 0 to 12 stars [V 76] |
| Cassandra (research) | Schedules tasks to avoid predicted conflicts [V 24] | – | – | – | 2013 prototype on Eclipse Mylyn [S 24] |
| Claim Plane (research) | A stronger model declares each task's scope once [V 33] | Writes outside the declared scope are refused [V 33] | – | – | Reliable mostly by serialising [V 33] |
| Crystal (research) | – | Merges, builds, and tests others' commits in the background [V 20] | – | Build and test failures count as conflicts [V 20] | 2011 prototype, unmaintained [V 21] |
| Palantír (research) | – | Shows same-file and dependency overlap in others' workspaces [S 23] | – | – | Research prototype [S 23] |
| ConE (Microsoft) | – | Flags pull requests whose files overlap others' [V 25] | – | – | Internal service, not released [I] |
| GitHub merge queue | – | – | Tests each PR on the base plus PRs ahead of it [V 36] | Merges only what passed [V 36] | Needs a PR, CI, and an organisation-owned repo [S 73] |
| Mergify, Trunk, Aviator | – | – | Path or build-target scopes split unrelated PRs into lanes [V 38, 40, 42] | Same as GitHub's queue [V 37, 39] | Hosted; team-scale [I] |
| Graphite | Stacks of dependent PRs [V 44] | – | Stack-aware queue, optional fast-forward [V 44] | – | Hosted; closed-source CLI [V 45] |
| bors-ng | – | – | Batches into a staging branch, then bisects failures [V 46] | Fast-forwards main to the tested commit [V 46] | Archived; points to GitHub's queue [V 46] |
| Gas Town Refinery | – | – | An agent rebases each branch and resolves trivial conflicts [V 10] | Runs setup, typecheck, lint, build, and test before merging [V 10] | Launches its own Claude Code [V 1, §Fleet orchestration] |
| Zuul | – | – | Speculative queue across projects, with `Depends-On` [V 47] | Retests the queue without a failed change [V 47] | CI-server scale [I] |
| Mergiraf | – | – | Syntax-aware merge driver covering TypeScript, JSON, and YAML [V 53] | `mergiraf review` shows what it decided [V 52] | Local git merge driver [V 54] |
| weave | Experimental entity claims [V 18] | MCP preview and check tools [V 18] | Entity-level merge driver [V 18] | – | Local merge driver; self-reported benchmarks [V 18] |
| `git rerere` | – | Records resolutions made in test merges [V 57] | Replays them at the real merge [V 57] | – | Built into git |
| `git merge-tree --write-tree` | – | Merges two commits with no worktree or index [V 58] | Exit status 1 means conflicts [V 58] | – | Built into git; Clash uses it [V 1, §Clash] |
| Jujutsu | – | Conflicts live in commits, so rebases succeed [V 59] | Megamerge of every branch [V 70] | Work and tests run on the combined state [V 70] | Separate VCS over git [I] |
| AI resolution (VS Code, Copilot, Haack's skill) | – | – | Proposes or applies resolutions [V 60, 62, 63] | Copilot reruns builds and tests [S 61] | Haack's skill runs locally in Claude Code [V 63] |
| git.git `seen`, linux-next | – | – | All in-flight topics merged into a throwaway branch [V 68, 69] | Tests the combination; drops what conflicts or fails [V 68, 69] | Pattern, not a tool |
| git-branchless | – | – | `git sync` rebases every stack, skipping those that conflict [V 49] | `git test` runs a command per commit, cached by tree [V 50] | Local; Apache-2.0 [V 76] |
| Per-objective acceptance list | Each feature starts as failing [V 71] | Agents flip only the `passes` field [V 71] | – | Each session starts with an end-to-end check [V 71] | Pattern, not a tool |

## Summary

- **Textual conflicts between co-active agent PRs are common.** Replayed merges conflicted for 19.8% of pairs by one agent and 41.7% across agents, as a lower bound [V 28]. A separate replay of 107K agent PRs against their bases found conflicts in 27.67% [V 29].
- **Most of those conflicts are small.** The median conflicting merge in agent PRs has two chunks, of three and two lines a side, with a heavy tail [V 30]. Humans still commit 96.1% of those merges [V 30].
- **Real semantic breakage looks rare, and constructed breakage looks near-certain.** One benchmark found interference in 1 of 834 runs on real Django PR pairs, and in 97% of constructed interface changes [V 32]. A message describing the landed change recovered 82% of the constructed runs [V 32].
- **Reservations and claims trade parallelism for reliability.** Static pre-write admission doubled pair pass rates and serialised 96.7% of runs [V 33]. Cursor found locks cut 20 agents to the throughput of two or three [V 13].
- **Replay is cheaper than prediction.** A lineage model caught 81–83% of conflicts at one-third of the replay budget. Its authors say a full replay, at a median 0.02 s, is the better choice when cheap [V 31].
- **Merge queues share one rule.** Test the base plus everything ahead, and land only the tested commit [V 36, 46, 47]. Path or build-target scopes let unrelated changes skip each other [V 38, 40, 42].
- **A syntax-aware merge driver runs locally for TypeScript.** Mergiraf covers `.ts`, `.tsx`, `.json`, and `.yaml` and falls back to git's line merge [V 52, 53]. weave makes a stronger claim from its own benchmark [V 18].
- **The after-merge check has old precedent.** git.git's `seen` and linux-next rebuild a throwaway merge of every in-flight branch and test it [V 68, 69]. Crystal found a third of conflicts hid behind clean merges [V 20].

## How often agent-parallel work conflicts, and how hard

| Study | Population | Measure | Result | Caveat |
|---|---|---|---|---|
| Xu et al. 2026 [V 28] | 33,596 agent PRs in 2,807 repos, five agents, December 2024 to July 2025 | Three-way merge replay of 716 co-active pairs, one per repo | 119 of 601 same-agent pairs conflict (19.8%); 48 of 115 cross-agent pairs (41.7%) | Textual only, so a lower bound; ten repos hold 91.4% of raw pairs |
| Xu et al. 2026, structure [V 28] | The 167 conflicting pairs | Conflicted files by kind | 84.4% source, 3.9% manifests and lockfiles; about 42% modify/delete or add/add | No line or hunk counts |
| AgenticFlict 2026 [V 29] | 142K+ agent PRs in 59K+ repos | Merge simulation of each PR against its base | 29K+ of 107K+ processed PRs conflict (27.67%); 336K+ conflict regions | Not pairwise; per-agent rates not in the abstract |
| Campos Junior and Murta 2026 [V 30] | 14,960 conflicting internal merges in 12,299 agent PRs | Who resolved, and the size of each conflict | Humans commit 96.1%; the median merge has 2 chunks, the 90th percentile 10 | Two agents' profiles each come from one repo |
| Campos Junior and Murta 2026, per agent [V 30] | Same | Share of internal merges that conflict | From 10.5% for Copilot to 47.8% for Cursor | Internal merges pull the base into the PR branch |
| Subramanian et al. 2026 [V 31] | 715 agent PR pairs | Replay against the merge base | 167 conflict; 79 of those had disjoint authored file sets | The authors trace the 79 to PRs built on different bases |
| Xia et al. 2026 [V 32] | 417 real Django PR pairs, and 12 constructed helpers | Tests on each patch, then on the combination | Real: 1 run in 834 interfered. Constructed: 97% | Pairs with textual conflicts, about 36%, were filtered out first |
| Khatua et al. 2026 [V 34] | Over 600 two-agent tasks in 12 libraries and four languages | Merged patches against both features' tests | Two agents succeed about 30% less often than one doing both | Benchmark tasks chosen to overlap |
| Nikolaev 2026 [V 33] | 30 CooperBench pairs, three seeds, 360 runs | Pre-write admission against declared scope | Pair pass 23.3% to 50.0%; integration success 65.6% to 96.7% | 96.7% of runs serialised; no speedup shown |
| Carlini 2026 [V 14] | 16 agents on one compiler, about 2,000 sessions | Practitioner report | "Merge conflicts are frequent, but Claude is smart enough to figure that out." New features "frequently broke existing functionality" | No counts |
| Lin 2026 [V 13] | Hundreds of workers on one branch | Practitioner report | Workers pushed "with minimal conflicts"; locks cut 20 agents to two or three | No counts |
| Brun et al. 2011 [V 20] | Nine open-source projects, humans | Replay of history | 17% of merges had textual conflicts; mean lifetime 9.8 days, median 1.6 | Pre-agent; build and test data from three projects only |
| Brun et al. 2011, higher-order [V 20] | Git, Perl5, and Voldemort | Build and test of each merge | Of 399 conflicts, 33% were build or test failures behind clean merges | 2011 merge algorithms |

Three readings follow from the table [I]:

- **Frequency.** Between a fifth and two-fifths of co-active agent PR pairs conflict textually, and none of the studies isolated branches cut from one shared baseline.
- **Difficulty.** The typical conflict is a few lines, and the tail is long. The SBES authors call the median "well within the range that automated resolvers … handle reliably" [V 30].
- **Semantics.** Real merged pairs rarely interfered in the one study that measured it [V 32]. The human-era figure of a third is older and pre-agent [V 20]. The two do not agree, and neither covers TypeScript.

With one shared baseline, disjoint changed-file sets rule out textual conflicts except through rename detection [I]. Subramanian et al. traced their 79 disjoint-set conflicts to PRs on different bases, which is not that case [V 31].

## Awareness and reservations among agents

### Claude Code agent teams

Status: experimental, off unless `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` [V 2].

- **Planning.** The lead creates tasks with three states and dependencies, and a blocked task cannot be self-claimed [V 2]. "Task claiming uses file locking to prevent race conditions" [V 2].
- **During work.** Teammates share the lead's checkout. The docs say "Two teammates editing the same file leads to overwrites. Break the work so each teammate owns a different set of files" [V 2].
- **After merge.** `TaskCompleted` and `TeammateIdle` hooks can refuse a completion or keep a teammate working [V 2].
- **Where it lives.** Team config sits in `~/.claude/teams/` and tasks in `~/.claude/tasks/`. A session has exactly one team [V 2].
- **Fit.** Teams coordinate inside one lead session. Two peer mains or background workers do not share a team [I].

### MCP Agent Mail

Status: the Python version has about 2.2k stars and v0.3.2 on 2026-04-16. Its README says it is "no longer maintained" in favour of the Rust port [V 3, 76]. The Rust port has 225 stars and v0.3.39 on 2026-10-13 [V 76].

- **Planning.** Agents call `file_reservation_paths` with globs, a TTL, and an `exclusive` flag. "File reservations are advisory leases, not hard locks" [V 4].
- **Conflicts.** Reservations "always return both `granted` and `conflicts`", so a reserving agent learns of overlap and still proceeds [V 3].
- **During work.** Its Claude Code hooks run `am file_reservations active` at session start and `am file_reservations soon` before each `Edit` [V 5, lines 1210-1240].
- **Merge.** A pre-commit guard "blocks commits conflicting with other agents' active exclusive file reservations" [V 3]. A pre-push guard fails closed when its scan cannot finish while another agent holds a lease, unless set to warn [V 4].
- **Planning aid.** Agents can read active reservations as an MCP resource, or run `am robot reservations --conflicts` [V 4].
- **Writes to Claude Code config.** Setup merges an MCP entry into `~/.claude.json`, under `projects.<path>.mcpServers` [V 5, lines 495-505]. It merges hooks into the project's `.claude/settings.json` and keeps user entries [V 5, lines 158-170, 1286-1318].
- **Licence.** MIT with a rider: "no rights are granted to any Restricted Party", meaning OpenAI, Anthropic, and anyone acting for them [V 6]. Whether the rider touches this operator is a legal question this report does not assess [I].

### Foremerge

Status: 530 stars, v0.6.0 on 2026-10-25, Apache-2.0, created 2026-08-21 [V 76]. Its README describes a pre-1.0, local-first MVP [V 7].

- **Planning.** Agents publish intents with scopes written as `KIND:KEY=OPERATION`, such as `symbol:PaymentService=replace` [V 7]. Kinds include `file`, `symbol`, `api`, `schema`, and `migration` [V 7].
- **The check.** Rules compare declared operations, so identical inputs give identical verdicts [V 7]. The README warns that the rules can miss synonyms and can warn on compatible work [V 7].
- **During work.** Claims never lock anything [V 7].
- **Merge.** Acceptance refuses unresolved conflicts unless overridden with a reason. Foremerge does not merge, rebase, or push [V 7].
- **State.** One SQLite file under the git common directory, so linked worktrees share it [V 7].
- **Writes to Claude Code config.** `foremerge setup claude` writes `.claude/skills/foremerge/SKILL.md` and `.mcp.json` at the repo root [V 8, lines 304-313; V 9]. It does not touch `~/.claude` [V 8].
- **Evidence.** The README says no coordinated-against-uncoordinated benchmark has been published [V 7].

### Practitioner reports

- **Cursor's locks failed.** "Agents would hold locks for too long, or forget to release them entirely" [V 13]. Optimistic concurrency worked better, but flat peers became "risk-averse" [V 13].
- **Cursor's planners and workers.** Planners create tasks, and workers "don't coordinate with other workers". An integrator role for conflict resolution created more bottlenecks than it solved [V 13].
- **Carlini's lock files.** Each agent claims a task by writing a file to `current_tasks/`. "If two agents try to claim the same task, git's synchronization forces the second agent to pick a different one" [V 14].
- **Carlini's regressions.** Agents broke each other's work until he "built a continuous integration pipeline … so that new commits can't break existing code" [V 14].

### Small coordination tools

| Tool | What it does | Claude Code integration | Status [V 76] |
|---|---|---|---|
| agent-worktrees | `wt claim <name> <path>` records path prefixes; `wt check` exits 1 on overlap [V 15] | Instructions in `CLAUDE.md`; no hooks [V 15] | 0 stars, created 2026-10-25, MIT |
| claude-presence | Presence registry, advisory locks on named resources such as ports, and a broadcast inbox; no file tracking [V 16] | `.mcp.json`; copies commands into `~/.claude/commands/`; optional hooks in `~/.claude/settings.json` [V 16] | 12 stars, v0.4.0 on 2026-07-24, MIT |
| conflict-check | Per branch pair, an LLM reviews same-file diffs and `ts-morph` finds changed TypeScript symbols still referenced [V 17] | Standalone CLI; needs a Gemini or Anthropic key [V 17] | 1 star, last push 2026-09-05, MIT |
| CrossWatch | Dashboard of files more than one agent is editing [S 19] | Hooks, per the excerpt [S 19] | 0 stars, one push on 2026-03-18, no licence |
| weave claims | Entity claims over an Automerge CRDT, behind `WEAVE_EXPERIMENTAL=1` [V 18] | `weave-mcp` server [V 18] | See §Mergiraf and weave |

### Research on coordination before writing

- **Claim Plane.** A stronger model declared each task's scope once, and a pre-write gate refused writes outside it [V 33]. Static admission serialised 96.7% of runs, including 93.3% of clean ones [V 33]. Dynamic admission failed closed in 46 of 90 runs, 45 of them on files already declared [V 33].
- **CooperBench.** Two agents on overlapping features succeed about 30% less often than one agent doing both [V 34]. Its authors name jammed channels, broken commitments, and wrong expectations of each other's plans [V 34].
- **Passes Alone, Fails Together.** An accurate description of the other worker's completed change recovered 82% of constructed failures [V 32]. Messages written during parallel work were not tested [V 32].

## Conflict prediction from research and industry

| Find | Detects | When | Reported accuracy |
|---|---|---|---|
| Crystal [V 20] | Textual, build, and test conflicts, by merging others' commits on clones | Continuously, in the background | Not a classifier; it runs the real merge, build, and tests [V 20] |
| Palantír [S 23] | Same-file and dependency conflicts in others' uncommitted workspaces | As edits happen | Two lab studies: users found and resolved more conflicts earlier [S 23] |
| Cassandra [V 24] | Predicted conflicts, as constraints over the task list | When tasks are scheduled | "Would have successfully avoided a majority of conflicts" in four projects [V 24] |
| ConE [V 25] | Files edited in more than one open PR, by extent of overlap and how rarely the files are edited concurrently | On open PRs | 775 alerts on 26,000 PRs in 234 repos; over 70% rated useful [V 25] |
| SubmitQueue [V 26, 27] | Changes that touch a common set of build targets | At submission | Logistic model of build success at 97% accuracy, per the summary [V 27] |
| Subramanian et al. [V 31] | Textual conflicts, from lineage features | When a PR opens | AUROC 0.88 to 0.90; zero-shot LLM 0.70 [V 31] |
| SAM [S 35] | Semantic conflicts, with generated unit tests | At merge | 9 of 29 conflicts found in Java [S 35] |
| Clash [V 1, §Clash] | Textual conflicts between every worktree pair | Live, or before an edit | Runs the real merge, so no prediction error [I] |

Two findings bear on file-list prediction:

- **ConE's motivating study.** Files edited concurrently in different PRs are more likely to introduce bugs [V 25].
- **Replay beats a model when replay is cheap.** Subramanian et al. found exact replay took a median 0.02 s. "Verify everything" was the better choice, and triage paid off only as a ranking [V 31].

The name Crystal also belongs to stravu's agent desktop app, deprecated in favour of Nimbalyst [V 1, §Nimbalyst]. The research tool shares nothing with it. Its code survives only as Google Code exports with no push since 2015 [V 21].

## Merge queues and stacking

### The shared rule

Every queue read tests a change on the base plus the changes ahead of it, and lands only what it tested:

- **GitHub.** A queued PR is grouped with "the latest version of the `base_branch`" and the PRs ahead of it, in a temporary branch [V 36]. A failed PR leaves the queue, and the PRs behind it are rebuilt without it [V 36].
- **bors-ng.** Approved PRs batch into a `staging` branch. On a pass, main fast-forwards to that exact commit; a failing batch is bisected [V 46].
- **Zuul.** It "assumes that all jobs will succeed and tests them in parallel accordingly", then retests without a failed change [V 47].
- **Gas Town.** By default its Go code batches up to five MRs and waits 30 s to fill a batch. It bisects a failing batch [V 11, lines 10-35].

### Lanes for unrelated changes

- **Mergify scopes.** File patterns or build-tool output assign scopes, and "Pull requests that overlap in scope are tested together first" [V 38].
- **Trunk parallel queues.** An impacted target "can be as expressive as a Bazel target or the name of a file folder". Folder targets "can also work with fewer guarantees around correctness" [V 40].
- **Aviator affected targets.** Disjoint targets merge "independently in any order", and overlapping PRs are stacked and tested together [V 42]. Nx's `nx show projects --affected` is one documented source [V 42].
- **Uber SubmitQueue.** "Roughly speaking, two changes conflict if they both affect a common set of build targets" [V 27].

### Stacking

- **Graphite.** The queue is "stack-aware" and can "process and validate the entire stack in parallel" [V 44]. The CLI's npm package lists no licence; its latest version, 1.8.6, dates from 2026-05-05 [V 45].
- **av.** Aviator's MIT CLI for stacked GitHub PRs. `av sync` restacks branches and deletes merged ones [V 48].
- **git-branchless.** `git sync` rebases every local stack onto main in memory and "skips any commit stacks which would have merge conflicts" [V 49].
- **git itself.** `git rebase --update-refs` moves every branch that points into the rebased range, except branches checked out in a worktree [V 51].

### Gas Town's Refinery

Status: Gas Town has about 18.6k stars and v1.2.1 on 2026-06-06, MIT [V 76]. The survey covers the rest of Gas Town [V 1, §Fleet orchestration].

- **Its job.** The prompt is "checkout branch → rebase → run tests → merge to target → push" [V 10, line 48].
- **Conflicts.** "Trivial? → fix … Complex? → git rebase --abort, reopen source issue, notify witness" [V 10, lines 100-109].
- **Gates.** It runs "setup → typecheck → lint → build → test" and cannot merge until they pass or a failure is filed [V 10, lines 215-227].
- **Integration branches.** An epic gets its own branch. Workers start from it, the Refinery merges into it, and the whole epic lands as one merge [V 12].

### Status of queues and stacking tools

| Tool | Kind | Stars [V 76] | Last release [V 76] | Licence [V 76] |
|---|---|---|---|---|
| GitHub merge queue | Hosted | n/a | n/a | n/a; organisation-owned repos only [S 73] |
| Mergify, Trunk, Aviator queue | Hosted | n/a | n/a | Pricing not read |
| Graphite | Hosted, with CLI | n/a | CLI 1.8.6, 2026-05-05 [V 45] | None declared on npm [V 45] |
| bors-ng | Self-hosted | 1.5k | No release; archived, last push 2024-04-04 | Apache-2.0 |
| rust-lang/bors | Self-hosted | 183 | No release; pushed 2026-10-26 | Apache-2.0 |
| av | CLI | 510 | Nightly, 2026-10-26 | MIT |
| git-branchless | CLI | 4.1k | v0.11.1, 2026-05-21 | Apache-2.0 |
| git-town | CLI | 3.4k | v24.1.0, 2026-09-26 | MIT |
| spr | CLI | 542 | v2.0.0-beta.1, 2026-10-12 | MIT |
| ghstack | CLI | 1k | v0.14.0, 2025-12-30 | MIT |
| Sapling | VCS | 7.2k | 2026-10-28 | GPL-2.0 |
| Jujutsu | VCS | 32.3k | v0.46.0, 2026-10-07 | Apache-2.0 |

### What a local operator could borrow

Queues assume a PR and CI, and GitHub's needs an organisation-owned repo [V 36; S 73]. Their mechanisms are plain git, so the following carry over without them [I]:

- **Test the combination.** Build the tip plus everything ahead of a change in a throwaway branch, and land only that commit.
- **Fast-forward to what was tested.** bors and Graphite both land the exact tested commit [V 46, 44].
- **Scope lanes from the build graph.** For Nx or Turborepo repos, the affected-projects output that Aviator and Mergify consume is local [V 42, 38].
- **Bisect a failed batch.** Gas Town's Refinery and bors both do it [V 11, 46].

## Making the merge cheap

### Mergiraf and weave

| | Mergiraf | weave |
|---|---|---|
| What | Syntax-aware merge driver on tree-sitter [V 52] | Entity-level merge driver on tree-sitter [V 18] |
| TypeScript and Node | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`, `.yaml`; no Markdown, no lockfiles [V 53] | TypeScript, JavaScript, JSON, YAML, and Markdown, among about 40 [V 18] |
| Fallback | Returns git's line merge whenever that is conflict-free [V 52] | git's line merge for unsupported or large files [V 18] |
| Install | Driver in `~/.config/git/config`; attributes global or per repo [V 54] | `weave setup`, `--local`, or `--global` [V 18] |
| Scope of the merge | `merge`, `revert`, `rebase`, and `cherry-pick` [V 52] | Merges, plus a Jujutsu merge-tool config [V 18] |
| Review | `mergiraf review` after it resolves a conflict [V 52] | MCP `weave_preview` and `weave_check` [V 18] |
| Evidence | None on the pages read | Self-reported: 31 of 31 synthetic cases, against Mergiraf's 28 [V 18] |
| Status [V 76] | 469 stars on Codeberg, v0.20.0 on 2026-09-26, GPL-3.0-only | 1.3k stars, v0.7.0 on 2026-10-30, MIT or Apache-2.0 [V 18] |
| `~/.claude` | Never mentioned [V 52, 54] | Its MCP server is added by hand with `claude mcp add --scope user` [V 18] |

- **Mergiraf's caution.** It keeps conflict markers when a case looks suspicious, and it needs the `diff3` conflict style [V 52, 54]. It warns that `zdiff3` can make the reconstructed base unparseable [V 54].
- **weave's regressions.** On 4,971 real file merges it reports 344 wins and 86 regressions, where git merged cleanly and weave did not [V 18]. It calls the regressions "expected and by design" [V 18].

### Java-only research tools

- **Spork.** An AST merge for Java whose README recommends Mergiraf for production use [V 55]. 72 stars, last release v0.5.1 in 2021, MIT [V 76].
- **IntelliMerge.** A refactoring-aware Java merge that runs as a standalone tool, not a driver [V 56]. 24 stars, last release in 2021, MIT [V 76].

### Built into git and Jujutsu

- **`git rerere`.** It records "conflicted automerge results and corresponding hand resolve results" and replays them later [V 57]. A resolution made in a throwaway test merge "will be reused when you do the actual merge later" [V 57]. Defaults prune resolved records after 60 days [V 57].
- **`git merge-tree --write-tree`.** It "does not read from or write to either the working tree or index", and exits 1 on conflicts [V 58]. Clash builds on it [V 1, §Clash].
- **A test merge in a checkout.** Gas Town's Refinery checks out the target and runs `git merge --no-commit --no-ff`, then aborts or resets [V 77, lines 1876-1905].
- **Jujutsu.** It "can record conflicted states in commits", so "the rebase operation will succeed" and you resolve "whenever you want" [V 59].

### AI resolution

| Find | Where it runs | What it does | Verification |
|---|---|---|---|
| VS Code | Editor, with Copilot | Experimental; reads the merge base and both sides and "attempts to preserve the intent of both changes" [V 60] | You test it yourself [V 60] |
| Copilot cloud agent | GitHub's cloud | `@copilot` resolves a PR's conflicts [S 61]; Agent Merge watches a PR and fixes conflicts and failing workflows [V 62] | Checks that "the build and tests still pass" [S 61] |
| Haack's `/resolve-conflicts` | Claude Code, locally | Mergiraf first, then sorts what is left: lockfiles regenerated, migrations asked about, the rest resolved by the model [V 63] | Not described [V 63] |
| LLMinus | Standalone CLI | Embeds past kernel resolutions and prompts any LLM with similar cases; a build step catches compile breaks [V 64] | Trialled on about 40 linux-next branches; no accuracy given [V 64] |
| MergeBERT, Gmerge | Research, 2022 | 63–68% accuracy for MergeBERT [S 66]; Gmerge's results are "mixed" [V 65] | Pre-agent models |

The SBES study adds two agent-era facts. Agents commit unresolved conflict markers in 0.76% of resolutions, against 9.85% for humans [V 30]. In lockfiles, Copilot and Devin take the second side, the upstream one, in 88% and 84% of chunks [V 30].

## Checking after integration

### The problem

- **Definition.** Fowler's semantic conflict is a change "which can be safely merged on a textual level" but causes "the program to behave differently" [V 67]. Tests "catch lots of semantic conflicts in practice", and frequent integration finds them sooner [V 67].
- **Size.** Crystal found that 33% of 399 conflicts in three projects were build or test failures behind clean merges [V 20].

### Throwaway integration of every in-flight branch

- **git.git's `seen`.** "To test the interaction of several topics, merge them into a throw-away branch. You must never base any work on such a branch!" [V 68]. It is rewound and rebuilt from the surviving topics [V 68].
- **linux-next.** It is rebuilt daily from every subsystem tree, and "any tree that has a conflict will be dropped from that days tree" [V 69]. A tree that fails to build is dropped too [V 69].
- **Jujutsu megamerge.** You work on an octopus merge of every branch, so "You are always working on the combined sum of all of your work" [V 70]. `jj absorb` routes edits back to their branches [V 70].
- **git-branchless.** `git sync` rebases every stack and reports which ones conflict [V 49]. `git test --exec` runs a command on each commit, in parallel worktrees with `--jobs`, cached by tree [V 50].

### Per-objective acceptance

- **Feature list.** Anthropic's harness has an initialiser write every feature as failing [V 71]. Agents edit that file "only by changing the status of a passes field" [V 71]. It chose JSON because the model "is less likely to inappropriately change or overwrite" it [V 71].
- **Start-of-session check.** Each session first runs "a basic test on the development server to catch any undocumented bugs" [V 71].
- **Known-good oracle.** Carlini compared output against GCC, and used delta debugging to find "pairs of files that failed together but worked independently" [V 14].
- **Combined tests.** Passes Alone, Fails Together grades every condition on one combined test set and discards agents' edits to test files [V 32].
- **One gate.** agentic-coding-swarm-protocol's `land` "takes a lock, … rebases, … runs the full gate, fast-forwards and publishes" [V 72]. The repo has 0 stars and was created on 2026-10-28 [V 76].

## Writes to `~/.claude` and launches of Claude Code

| Find | Writes Claude Code config | Launches its own Claude Code |
|---|---|---|
| Claude Code agent teams | Its own `~/.claude/teams/` and `~/.claude/tasks/` [V 2] | It is Claude Code |
| MCP Agent Mail | `~/.claude.json`, and hooks in the project's `.claude/settings.json` [V 5] | No; you launch agents yourself [V 3] |
| Foremerge | `.claude/skills/` and `.mcp.json` in the repo [V 8] | No mention [V 7] |
| claude-presence | `.mcp.json`, `~/.claude/commands/`, optional hooks in `~/.claude/settings.json` [V 16] | No mention [V 16] |
| agent-worktrees | None; `CLAUDE.md` text by hand [V 15] | No mention [V 15] |
| weave | None by setup; its MCP server by hand at user scope [V 18] | No mention [V 18] |
| Mergiraf | None; git config only [V 54] | No |
| Gas Town | Settings under its own folders, passed with `--settings` [V 1, §Fleet orchestration] | Yes, in tmux [V 1, §Fleet orchestration] |
| Haack's skill | A user skill you copy in [V 63] | No; it runs inside Claude Code [V 63] |
| conflict-check | None [V 17] | No; it calls a model API [V 17] |

## Not read

- The full texts of Palantír, Cassandra, SubmitQueue, and SAM; their figures come from abstracts, a review, a summary, or excerpts.
- AgenticFlict beyond its abstract, so its per-agent rates and conflict sizes.
- Pricing for Mergify, Trunk, Aviator, and Graphite.
- Aviator's queue-mode and parallel-mode pages, known only from excerpts.
- GitHub's "About merge queues" page, which returned 404; its availability statement comes from excerpts.
- Graydon Hoare's original "not rocket science rule" post, which returned 404.
- CrossWatch's README, Callipso, and the Rust crates `catenary-mcp` and `task-graph-mcp`, seen only in search results.
