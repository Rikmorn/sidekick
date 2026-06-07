# Sources — Memory & Knowledge for AI Assistants (First Principles)

deep-research run, 2026-06-07. 23 claims survived 3-vote adversarial verification; 2 refuted.
All confirmed findings grounded in PRIMARY sources, verified verbatim against the source in-run.
`[primary]` = peer-reviewed paper or arXiv preprint fetched and confirmed. `[disputed-rigor]` = real and accurately represented, but evaluation rigor or scores are contested (directional finding stands).

## Taxonomy / first principles
- **arXiv:2309.02427** — CoALA, "Cognitive Architectures for Language Agents" (Sumers, Yao, Narasimhan, Griffiths; Princeton; TMLR 2023). Storage dimension = working + long-term (episodic/semantic/procedural); procedural = weights + code. [primary]
- **arXiv:2501.11739** — DeChant, "Episodic memory in AI agents poses risks that should be studied and mitigated" (Columbia, Jan 2025). Tulving taxonomy; LLMs map to semantic+procedural, LACK episodic; bigger-context-won't-obviate-memory (3 reasons); 4 normative design principles (interpretable, user add/delete, isolable, not-agent-editable). [primary]
- **10.1145/3748302 / arXiv:2404.13501** — Zhang et al., "A Survey on the Memory Mechanism of LLM-based Agents" (ACM TOIS, accepted Jul 2025). Memory as foundational for self-evolution; three dimensions = sources / forms / operations (write/manage/read). [primary]
- **arXiv:2512.23343** — "AI Meets Brain: Memory Systems from Cognitive Neuroscience to Autonomous Agents" (Dec 2025). Statelessness premise; nature×scope taxonomy. [primary; post-cutoff]
- **arXiv:2512.13564** — Hu, Liu et al., "Memory in the Age of AI Agents: Forms, Functions and Dynamics" (Dec 2025 / Jan 2026). Forms (token-level/parametric/latent); functions (factual/experiential/working); dynamics (formation→evolution→retrieval); eval gaps (no unified protocol; no agent-memory-vs-RAG criterion). [primary; post-cutoff]

## Representation / relationships (relationship-aware systems)
- **arXiv:2502.12110** — "A-MEM: Agentic Memory for LLM Agents" (NeurIPS 2025). Zettelkasten linking; structured notes (desc/keywords/tags); agent-driven memory evolution updates existing memories. [primary]
- **arXiv:2501.13956** — "Zep: A Temporal Knowledge Graph Architecture for Agent Memory." Core = Graphiti, temporally-aware KG synthesizing unstructured + structured data, maintaining historical relationships; positioned vs static-document RAG. [primary]

## Mechanisms / state of the art / frontiers
- **arXiv:2603.07670** — Pengfei Du, "Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers" (Mar 2026). Five mechanism families (context-resident compression / retrieval-augmented stores / reflective self-improvement / hierarchical virtual context / policy-learned management); eval shift static→agentic, "stubborn gaps"; open frontiers (continual consolidation, causally-grounded retrieval, trustworthy reflection, learned forgetting, multimodal embodied). [primary; single-author preprint; post-cutoff]

## Retrieval / evaluation benchmarks
- **arXiv:2402.17753** — Maharana et al., "Evaluating Very Long-Term Conversational Memory of LLM Agents" (LoCoMo; ACL/EMNLP 2024). ~300 turns / ~9K tokens / up to 35 sessions; long-context AND RAG both substantially lag human; distinct temporal/causal reasoning failure mode. [primary; disputed-rigor — score dispute Zep 84%→58.44%→75.14%; directional finding corroborated by LongMemEval, MemoryAgentBench]
- **arXiv:2602.16313** — MemoryArena (Stanford Digital Economy Lab). Agents near-saturated on LoCoMo collapse to ~40-60% in agentic setting. [primary; post-cutoff]
- Benchmarks named (not all independently fetched): LongMemEval, StreamBench, SWE-bench Verified, GAIA, BrowseComp.

## Refuted in-run (transparency)
- "Agent memory stored in four formats; relationships captured ONLY by graph format, not text/vectors" (arXiv:2512.23343) — 0-3.
- "2603.07670 proposes a 3-axis taxonomy (temporal scope / substrate / control policy) replacing classical typology" — 0-3 (paper's actual structure = five mechanism families).

## Named-but-not-deep-verified
- MemGPT/Letta (named in the family survey as hierarchical virtual context); Mem0 (named as LoCoMo adopter); Reflexion / Generative Agents / ExpeL (named as reflective family). Real and named; internals not independently verified in this run.
- Practitioner positions (Karpathy repo-as-context; PKM/Obsidian/"second brain") addressed via adjacent primary evidence (DeChant anti-repo argument; forms/observability), NOT independently fetched — treat as opinion-grounded.

## Cross-track carryover (from prior context-memory track)
- arXiv:2603.11768 — SSGM, validate-before-persist memory governance. [spot-checked in prior track]
