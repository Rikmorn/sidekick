# Memory & Knowledge for AI Assistants — First Principles

**Research question:** From first principles, what is "memory" for an AI assistant — what must it remember, how should knowledge be represented and RELATED, how is it ingested / consolidated / retrieved / inspected — and what does the state of the art (and its open problems) look like? Investigated on its own terms, NOT anchored on any storage substrate (SQLite / vector DB / "bundled local store" were deliberately excluded as starting points; substrate is treated as downstream of requirements).

**This is a base for a later decision. It is NOT a decision and recommends NO specific tool.**

**Method:** deep-research fan-out -> adversarial 3-vote verification. 23 claims survived; 2 were killed. Every confirmed finding below is grounded in a **primary source** (arXiv papers, ACM TOIS) verified verbatim against the source. Practitioner positions (Karpathy "repo as context", PKM / Obsidian / "second brain") are addressed where they intersect verified claims, and flagged as practitioner-opinion where they are not independently verified here.

**Evaluation lens — the real user pains (used to score every approach):**
- (P1) Not having to **repeat yourself** across sessions.
- (P2) Not having to **game** the memory / guess how to make something stick.
- (P3) **Observability** — seeing what the assistant knows without trudging through markdown.
- (P4) The **placement dilemma** — CLAUDE.md/AGENTS.md vs. trust the memory system.
- (P5) **Knowledge relationships** — connected knowledge + whole-corpus consultation, not just top-k chunks.

---

## Headline

1. **There is a stable, convergent first-principles taxonomy of assistant memory** — five independent primary sources (CoALA, the ACM TOIS survey, "AI Meets Brain", "Memory in the Age of AI Agents", and DeChant's episodic-memory paper) agree on the same skeleton: a **working / short-term** memory plus **long-term** memory split into **episodic (experience)**, **semantic (facts about world+self)**, and **procedural (how-to)**. Grounded in Tulving's cognitive taxonomy and durable — a *requirements* taxonomy, not a substrate.
2. **The pain (P1) is the field's founding premise, verified at the architecture level.** LLMs are **natively stateless** — each inference is independent, so cross-session continuity and experience accumulation must be built externally. "Bigger context window" does **not** substitute (it's RAM, not storage), and is argued against on three explicit grounds. This steelmans *against* the naive "repo as memory / give it everything" position — see Pillar 3.
3. **Representation/relationships (P5) is where the substrate actually starts to matter — and it's an open problem.** Memory has distinct *representational forms* (token-level/explicit, parametric/in-weights, latent/hidden-state), and **observability is a property of the form, not a guarantee** (P3). Relationship-aware designs exist as primary-source systems (A-MEM's Zettelkasten linking; Zep/Graphiti's temporal knowledge graph), but **causally-grounded retrieval and whole-corpus consultation remain named open frontiers**, not solved engineering.
4. **Memory for agents is unsolved and actively failing under test.** Evaluation moved from static recall to multi-session agentic benchmarks (LoCoMo, LongMemEval, MemoryArena); current systems "expose stubborn gaps" — agents near-saturated on static recall collapse to ~40-60% in agentic settings. **Temporal/causal reasoning over accumulated history is a specific, distinct failure mode** beyond raw recall. There is **no unified evaluation protocol** and **no operational criterion** separating "agent memory" from RAG / context engineering / parametric memory.
5. **Forgetting is a feature, not a bug** — the disconfirming "less memory is better" angle is corroborated: learned forgetting is a named open frontier, and consolidation is framed as oscillating between *hoarding* (store everything, drown in noise) and *amnesia* (compress aggressively, lose rare-but-vital facts).

---

## Pillar 1 — Taxonomy from first principles (what must be remembered, and why) [P1, P4]

**Confidence: HIGH** (5 primary sources, all unanimous; convergent taxonomy across independent papers).

The question "what does an assistant need to remember?" has a stable answer that predates LLMs and is reused by every serious framework:

- **CoALA** (Sumers/Yao/Narasimhan/Griffiths, Princeton; TMLR 2023, arXiv:2309.02427) organizes agents along a **storage dimension** = **working memory** + **long-term memory**, with long-term split into **episodic / semantic / procedural** — four distinct modules. Verbatim: working memory "maintains active and readily available information... for the current decision cycle"; episodic "stores experience from earlier decision cycles"; semantic "stores an agent's knowledge about the world and itself"; procedural = "implicit knowledge stored in the LLM weights, and explicit knowledge written in the agent's code."
- **DeChant** (arXiv:2501.11739, Jan 2025) grounds this in **Tulving's** taxonomy: episodic (events you personally participated in), semantic (facts about the world), procedural (how to do something) — and makes the load-bearing point that **current LLMs map to semantic + procedural, and almost entirely LACK episodic memory.** Episodic is precisely the "remember what happened across past sessions" capability the user is missing.
- The **ACM TOIS survey** (Zhang et al., 10.1145/3748302 / arXiv:2404.13501) frames memory as the **foundational component** that lets an agent *accumulate experience rather than treat every session as fresh* — the canonical statement of pain P1.

**What each type buys / what breaks (mapped to pains):**

| Type | Buys | Breaks without it | Pain |
|---|---|---|---|
| Working / short-term | current-task coherence | loses the thread mid-task | — |
| **Episodic** (experience) | "we did this before"; cross-session continuity | **you repeat yourself every session** | **P1** |
| **Semantic** (world+self facts, prefs) | stable facts/preferences | re-state preferences constantly | **P1, P4** |
| **Procedural** (how-to) | reusable workflows/skills | re-derive procedures each time | P1 |

**Durability lens:** a **requirements** map, not a program — tells you *what categories* to persist, not a retrieval algorithm. **Durable.** Note procedural memory's two substrates (CoALA): "how-to" lives partly in *model weights* (improves for free as models improve) and partly in *the surrounding program/code* (skills, rules) — the explicit half is exactly what a harness like sidekick controls.

**Convergent finer-grained taxonomies (same skeleton, different cuts):**
- "AI Meets Brain" (arXiv:2512.23343): two orthogonal axes — **nature** (procedural-experience vs conceptual/semantic) x **scope** (within-trajectory vs across-trajectory).
- "Memory in the Age of AI Agents" (arXiv:2512.13564): a **functional** axis — **factual / experiential / working** — explicitly proposed as *replacing* the bare short/long-term split because it's insufficient for contemporary systems.

These refine CoALA rather than contradict it. The stability across five independent papers is the signal.

---

## Pillar 2 — Representation, forms, and observability [P3, P5]

**Confidence: HIGH** for the forms taxonomy and observability-is-a-property point; **MEDIUM** for "which representation best captures relationships" (active research, single-system primary sources).

**Memory exists in three representational FORMS** ("Memory in the Age of AI Agents", arXiv:2512.13564) — the crux of observability (P3):
- **Token-level** — "explicit, discrete, and externally accessible, supporting transparency, direct manipulation, and symbolic organization." (Markdown, notes, structured text. The *only* inherently inspectable form.)
- **Parametric** — knowledge in model weights; "abstraction and generalization but limiting updatability and interpretability."
- **Latent** — hidden activations / KV caches / embeddings; implicit state "without exposing interpretability to the user."

**Key consequence for P3:** **observability/transparency is a property of the chosen form, not a guarantee.** A vector/embedding store (latent) is, by construction, *not* human-inspectable; a token-level store (markdown/notes) *is*. So "I want to SEE what the assistant knows" is, at the representation layer, an argument *for* token-level forms — but the user's actual complaint is "trudging through endless markdown," i.e. token-level is inspectable but **not navigable/queryable at scale.** The gap is not the *form*; it's the absence of an **index/relationship layer over** the inspectable form. (Requirements observation, not a tool pick.)

**The placement dilemma (P4)** maps onto the same axis: CLAUDE.md/AGENTS.md are **token-level, always-injected** semantic+procedural memory (high transparency, but consumes context every turn, no relevance gating). A dynamic memory system trades guaranteed-consultation for relevance-gated retrieval. Field-consistent framing (unverified-here): persistent files are *guaranteed-in-context but un-scalable*; retrieval is *scalable but not guaranteed-consulted.* (When CLAUDE.md is consulted vs ignored — **not** resolved by a verified primary source; see Open Questions.)

**Relationship-aware representations (P5) — primary-source systems:**
- **A-MEM** (arXiv:2502.12110, NeurIPS 2025) applies the **Zettelkasten** method: each new memory becomes a structured note (contextual description + keywords + tags), and the system **analyzes historical memories to establish links where meaningful similarities exist** -> an *interconnected knowledge network*, not flat storage. The LLM identifies "subtle patterns, causal relationships, and conceptual connections" beyond embedding similarity. Knowledge-graph-*style* (linked atomic notes, not a formal typed-edge KG).
- **Zep / Graphiti** (arXiv:2501.13956) is a **temporally-aware knowledge graph engine** synthesizing unstructured conversational + structured business data **while maintaining historical relationships**, positioned explicitly **against static-document RAG.** The KG/GraphRAG family in a real system.

**Durability lens:** forms taxonomy durable (descriptive). Relationship-aware representation **partly durable, partly at-risk** — the *idea* of connected knowledge leverages reasoning; hand-built linking/graph pipelines (run every utterance through an LLM-evolution step) are absorption candidates. A-MEM's follow-ups (D-MEM, MemPro) already attack its write-cost/token-bloat — the absorption pressure showing up.

---

## Pillar 3 — "Repo as memory / give it everything" vs. dedicated structured memory [P5]

**Confidence: HIGH** (DeChant argues the anti-position from a primary source; corroborated by lost-in-the-middle and the statelessness result).

**Steelman of "repo as context" (Karpathy-style):** put everything in the repo/context, give the model tools to navigate. *When it wins:* the corpus fits comfortably in effective context; transparency is maximal (everything token-level and inspectable — directly serves P3); no ingest/consolidation machinery to get wrong (sidesteps P2 entirely — nothing to "game"); no retrieval can surface the *wrong* thing because the model sees the whole. For a single bounded project this is genuinely strong and the simplest thing addressing P3+P5.

**Steelman of dedicated structured memory:** **DeChant (arXiv:2501.11739) argues expanding context will NOT obviate dedicated memory**, on three explicit grounds: (1) reprocessing the entire history every step is **inefficient**; (2) realistic agent lifetimes (decades) **exceed any plausible context length**; (3) very long contexts **degrade performance** (lost-in-the-middle). Plus the architectural floor: LLMs are **natively stateless** (arXiv:2512.23343) — each inference is independent, so even a giant window is per-session RAM, not cross-session storage. LoCoMo (below) shows **neither** "bigger window" **nor** "top-k RAG" closes the human gap.

**Where each wins (synthesis):** repo-as-context wins for a *bounded, single-project, transparency-first* corpus that fits effective context. Dedicated memory becomes necessary as the corpus exceeds effective context, as cross-session/cross-project continuity is required, and as relationship/temporal structure matters more than raw inclusion. Not mutually exclusive — token-level repo content *is* a memory form; the question is whether you add an index/relationship/retrieval layer on top.

**Durability lens:** the anti-repo arguments rest partly on (3) long-context degradation, whose *mechanism* is contested (see Caveats) but whose *effect* is well-attested. Arguments (1) and (2) are structural and durable. Repo-as-context durability is *inverse* to context-window progress: as effective context grows, its viable corpus grows — but statelessness (cross-session) is not fixed by window size, so it never fully wins for a long-lived assistant.

---

## Pillar 4 — Write / ingest / consolidation path [P2, P4]

**Confidence: HIGH** for the lifecycle structure; **MEDIUM** for any specific consolidation algorithm (single-system sources).

The field models ingest as a **lifecycle of operators**, not a single "save" — the structural answer to "how does something get decided-to-be-remembered and kept from going stale" (P2, and the self-contradiction half of P4):

- **ACM TOIS survey** (10.1145/3748302): three operations — **Memory Writing** (project raw observations into stored content), **Memory Management** (optimize / merge / forget), **Memory Reading** (retrieve by task context).
- **"Memory in the Age of AI Agents"** (arXiv:2512.13564): a **Formation operator** that *selectively transforms* interaction artifacts into memory candidates (extracting info with future utility), then an **Evolution** stage = **consolidation + explicit updating + forgetting** to manage coherence (merge redundant, resolve conflicts, discard low-utility, restructure for retrieval).
- **A-MEM** (arXiv:2502.12110) implements agent-driven **"memory evolution"**: integrating a new memory can **trigger updates to existing historical memories'** descriptions/keywords/tags — the network continuously refines itself. A concrete instance of "reconcile new knowledge against existing knowledge" (the staleness/self-contradiction concern).

**Mapping to P2 (don't game it):** the *selective* formation operator is the field's answer to "how do I make something stick without guessing" — the system decides what has future utility, rather than the user crafting magic phrasing. But this is exactly where it can go wrong: a bad formation/consolidation decision is the failure mode (connects to memory-poisoning / validate-before-persist, established in the prior context-memory track via SSGM arXiv:2603.11768 — noted, not re-litigated).

**Durability lens:** **At-risk.** Consolidation/dedup/conflict-resolution pipelines are hand-built programs substituting for reasoning. A-MEM's write-cost critiques are early evidence that per-utterance evolution is fragile. The *requirement* (reconcile, don't just append) is durable; specific *mechanisms* are absorption candidates.

---

## Pillar 5 — Retrieval & whole-corpus consultation [P5]

**Confidence: HIGH** (LoCoMo is primary/peer-reviewed ACL 2024 with strong corroboration).

The core retrieval question — "consult the *whole* of what's known at the right moment, not just top-k chunks" — is **not solved**:

- **LoCoMo** (arXiv:2402.17753, ACL 2024) — the most widely adopted memory benchmark (used by Mem0, Zep): very-long-term dialogues, ~300 turns / ~9K tokens / up to 35 sessions, built from personas + temporal event graphs with human verification. Targets *exactly* the multi-session cross-session problem an assistant faces.
- **Finding:** both **long-context LLMs** and **RAG** improve but **substantially lag human** performance (human F1 ~88 vs best RAG ~41 / GPT-4 ~32; ~56% gap overall). **Neither "bigger window" nor "top-k retrieval" closes the gap.** The empirical core of P5: top-k is insufficient, and so is whole-context-dumping.
- **Distinct failure mode:** LLMs specifically struggle with **long-range temporal and causal dynamics** — the temporal-reasoning gap (~73%) is *larger* than the overall gap, confirming temporal/causal reasoning over history is a separate weakness, not a recall artifact.

This is why the **causally-grounded retrieval** frontier exists (Pillar 6): semantic similarity answers "what looks like this?" but not "what caused this?" — relevance != the right relationship.

**Durability lens:** the *gap* is a capability finding (track it). Retrieval *architecture* (hybrid semantic+temporal+causal traversal) is named "largely unexplored" — durable as a research direction, at-risk as any specific hand-built retriever.

---

## Pillar 6 — Observability & steerability as a first-class requirement [P3]

**Confidence: HIGH** (DeChant's design principles are primary; corroborated by the forms taxonomy).

Most systems offer little here, but the normative requirements are stated explicitly. **DeChant (arXiv:2501.11739)** proposes four design principles for safe agent memory; two directly encode P3:
1. **Memories must be interpretable by users** — directly (natural-language summaries) or indirectly (queryable / searchable / comparable representations).
2. **Users must be able to add or delete specific memories.**
(The other two: memories isolable/detachable; **memories should NOT be editable by the AI agents** — a guardrail against silent self-corruption.)

Combined with the **forms** result (Pillar 2): observability requires a **token-level** (inspectable) form **plus** a query/search/compare layer over it. The "trudging through markdown" complaint is precisely the *missing query/compare layer*, not a wrong form choice. "See what it knows, audit it, correct it, trust it" decomposes into: interpretable form (token-level) + navigability (index/query) + user write-access (add/delete) + agent-write guardrails.

**Durability lens:** Durable. Requirements on *any* substrate, and the "not agent-editable" principle is a structural guardrail that gets *more* important as models get more capable.

---

## Pillar 7 — Mechanism families & state of the art [P5]

**Confidence: HIGH** (the five-family enumeration is a primary survey, verbatim; grounds the space beyond the prematurely-suggested vector-DB framing).

**Five real mechanism families** people actually use (arXiv:2603.07670, "Memory for Autonomous LLM Agents"):
1. **Context-resident compression** — summarize/compress within the window.
2. **Retrieval-augmented stores** (RAG-style) — vector/dense retrieval is **one** family here, not the whole space.
3. **Reflective self-improvement** — Reflexion / Generative Agents / ExpeL.
4. **Hierarchical virtual context** — MemGPT/Letta-style paging between context and external store.
5. **Policy-learned management** — learned what-to-keep/evict.

The survey calls **"context + retrieval store" the workhorse pattern behind most production agents today.** This explicitly subsumes the vector-DB framing as *one* option among five — confirming that substrate is downstream.

**Named real systems verified in this run:** CoALA (framework), A-MEM (Zettelkasten linking), Zep/Graphiti (temporal KG), MemGPT/Letta (hierarchical, named in the family survey), Reflexion/Generative Agents/ExpeL (reflective). Mem0 and Zep appear as LoCoMo adopters. (MemGPT/Letta and Mem0 internals **not** independently verified beyond being named.)

---

## Pillar 8 — Open problems & disconfirming evidence [P5, and "when less memory is better"]

**Confidence: HIGH** (frontiers and gaps stated verbatim in two primary surveys).

**Named open frontiers** (arXiv:2603.07670): **continual consolidation, causally-grounded retrieval, trustworthy reflection, learned forgetting, multimodal embodied memory.** Three map directly onto this study's hardest sub-questions:
- *continual consolidation* -> the ingest/consolidation path (Pillar 4) is open, not solved.
- *causally-grounded retrieval* -> whole-corpus/relationship retrieval (Pillar 5) is open: "semantic similarity answers 'what looks like this?' but not 'what caused this?'"
- *learned forgetting* -> the disconfirming angle.

**Evaluation gaps** (arXiv:2512.13564): **no unified evaluation protocol** across factual/experiential/working memory, and **no operational criteria** to distinguish "agent memory" from LLM parametric memory, RAG, and context engineering. Benchmarks named (LoCoMo, LongMemEval, StreamBench, SWE-bench Verified, GAIA, BrowseComp) but no standard.

**Eval has shifted and systems are failing** (arXiv:2603.07670 + MemoryArena arXiv:2602.16313): static recall -> multi-session agentic tests interleaving memory with decision-making; four recent benchmarks "expose stubborn gaps." Agents near-saturated on LoCoMo collapse to ~40-60% in MemoryArena. **Memory for agents is an actively-failing problem, not a solved retrieval task.**

**Disconfirming / "less memory is better":** **forgetting is a feature, not a bug** — "essential for robustness, privacy, and efficiency," yet "current systems handle it crudely." The consolidation dilemma oscillates between **hoarding** (store everything -> drown in noise) and **amnesia** (compress aggressively -> lose rare-but-vital facts). Corroborates the prior track's context-degradation findings (lost-in-the-middle, context pollution) and warns against the naive "remember everything" instinct. Where memory hurts: over-retrieval surfaces the wrong thing (LoCoMo's RAG gap), stale/contradictory entries poison future runs (the formation/evolution failure mode), recency/recall bias degrades relevance.

---

## Requirements-first map of the option space (NO substrate recommendation)

The framing constraint forbids a tool pick. The requirements -> option-space map the evidence supports, so a later decision can be made from requirements down:

| Requirement (pain) | What the evidence says you need | Option families that address it | Evidence strength |
|---|---|---|---|
| Don't repeat across sessions (P1) | **episodic** memory (LLMs lack it) + persistent semantic store | any external long-term store; episodic is the gap | **Strong** (5 primary) |
| Don't game it (P2) | a **selective formation** operator deciding what to keep | reflective / formation-evolution pipelines | Medium (single-system) |
| Observability (P3) | **token-level** form + query/compare layer + user add/delete + not-agent-editable | token-level stores with an index; DeChant's 4 principles | **Strong** (primary principles) |
| Placement (P4) | files = guaranteed-in-context but unscalable; retrieval = scalable but not-guaranteed-consulted | hybrid: stable rules in files, dynamic facts in retrieval | Medium (mechanics unverified) |
| Relationships / whole-corpus (P5) | **linked/graph representation + causal/temporal retrieval** (top-k alone fails) | KG/GraphRAG (Zep), Zettelkasten linking (A-MEM), hybrid retrievers | Medium->High (effect strong, best-design open) |

**Where evidence is STRONG:** the taxonomy (what to remember); statelessness as motivation; the forms->observability link; the lifecycle-of-operators shape of ingest; LoCoMo's finding that neither big-window nor top-k closes the gap; the open-frontiers list; forgetting-as-feature.

**Where evidence is THIN:** *which* representation best captures relationships (single-system sources, no head-to-head verified here); persistent-instruction-file mechanics (when CLAUDE.md is consulted vs ignored — no verified primary source); any specific consolidation algorithm's superiority; the local-CLI substrate question (excluded by framing, unresolved by the prior track too).

---

## Action map (three buckets)

**IN-REPO** (skill / rule / hook / agent):
- Treat memory as the **CoALA taxonomy** explicitly — separate **episodic** (session/event log), **semantic** (facts/prefs), **procedural** (skills/rules). Episodic is the missing piece for P1.
- Keep persisted memory in a **token-level / inspectable** form (P3) and add a **navigability layer** (index/query/compare) — the user's pain is missing navigation over markdown, not the markdown itself.
- A **selective formation gate** on memory writes (what has future utility) + **evolution** (reconcile/dedup/conflict-resolve against existing) rather than blind append (P2, P4). Pair with **validate-before-persist** (carried from prior track, SSGM).
- Enforce DeChant's guardrail: **memory is user-editable (add/delete) but the agent should not silently rewrite it.**

**HARNESS / CONFIG** (Claude Code settings / hooks / MCP / persistent-instruction files):
- Persistent-instruction files (CLAUDE.md/AGENTS.md) are **token-level always-injected semantic+procedural memory** — high transparency, no relevance gating, costs context every turn. Use for *stable, must-always-apply* knowledge; route *dynamic/relational* knowledge to a retrieval/index layer (the placement-dilemma split). *(When these are consulted vs ignored: unverified — see Open Questions.)*
- A memory store exposed via MCP is one way to give the model tools to navigate a token-level corpus (the "repo as memory + tools" steelman) without dumping it all into context.

**MODEL / PROVIDER-LEVEL** (track only):
- **Statelessness** is architectural — won't change; the *reason* external memory exists. Track.
- **Parametric/latent memory** (in-weights, hidden-state) improves as models improve but stays non-inspectable — never the answer to P3.
- **Long-context degradation** (lost-in-the-middle / temporal-causal weakness): a capability ceiling; don't bet bigger windows fix cross-session memory. Track.

---

## Durability verdict

**Durable (leverage the reasoning engine):** the memory *taxonomy* (requirements map); statelessness as motivation; the forms->observability principle; DeChant's normative principles (esp. not-agent-editable, which strengthens with model capability); "forgetting is a feature." Requirements/structural facts, not programs.

**At-risk (hand-built programs stronger models may absorb):** specific consolidation/evolution pipelines (A-MEM-style per-utterance LLM linking — cost critiques already surfacing); bespoke retrievers; the repo-as-context position's *corpus ceiling* (rises with context progress, partially absorbing compression-family mechanisms — but never absorbs cross-session persistence).

**Not a safe durability bet:** "bigger context window will make memory unnecessary" — refuted on three grounds (DeChant) plus statelessness plus LoCoMo's unclosed gap.

---

## Caveats & time-sensitivity

- **Heavy reliance on 2025-2026 surveys, several beyond the Jan-2026 model cutoff** (2512.13564, 2512.23343, 2603.07670, 2602.16313). Each verified verbatim against its primary source in-run, but recent and fast-moving — benchmark numbers especially will date.
- **Single-author / non-peer-reviewed preprints** in the mix (2603.07670 is single-author; its frontier list and family enumeration are well-corroborated but not peer-reviewed).
- **LoCoMo's evaluation rigor is disputed** (imperfect gold answers; leaderboard-score dispute Zep 84% -> corrected 58.44% -> counter-claimed 75.14%). Affects *precise scores*, NOT the directional finding (neither window nor top-k closes the human gap), corroborated by independent 2025 benchmarks (LongMemEval, MemoryAgentBench).
- **Refuted in-run (transparency):** (a) "agent memory stored in four formats; relationships captured *only* by the graph format, not text/vectors" (0-3) — relationships not exclusive to graphs; (b) a claimed 2603.07670 three-axis taxonomy (temporal scope / substrate / control policy) replacing the classical typology (0-3) — that paper's actual structure is the five mechanism families.
- **Practitioner space under-verified by design:** Karpathy's repo-as-context and PKM/Obsidian/"second brain" are addressed via the *anti-repo* primary argument (DeChant) and the *forms/observability* result, but the practitioner sources themselves were not independently fetched/verified — treat as opinion-grounded-by-adjacent-evidence, not verified.
- **Framing held:** no substrate (SQLite/vector DB/bundled store) steered the inquiry; substrate appears only as *one* mechanism family (retrieval-augmented stores) among five, exactly as required.

---

## Open questions (emerged, not resolved here)

1. **Persistent-instruction-file mechanics:** when is CLAUDE.md/AGENTS.md actually consulted vs ignored, and how does always-injected token-level memory interact with a dynamic retrieval layer? No verified primary source found — the direct mechanism behind pain P4; needs its own focused track.
2. **Which relationship representation wins for an assistant corpus?** A-MEM (linked notes) vs Zep (typed temporal KG) vs plain markdown+index — no head-to-head verified evidence; "causally-grounded retrieval" is named as an *open frontier*, so there may be no settled answer yet.
3. **The navigability layer over inspectable memory:** what does "see what the assistant knows without trudging through markdown" concretely require (query UI? graph view? generated index?) — evidence says the *need* is a query/compare layer over token-level form, but not its shape.
4. **Forgetting policy:** how to operationalize "forgetting is a feature" without amnesia — the hoarding<->amnesia dilemma is named but unsolved; what triggers eviction in a single-user assistant?
