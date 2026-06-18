# Eval harness — prior art (grounding step for `3.4`)

**Status:** small grounding step (2026-06-18) to seed the `3.4` eval keystone — *tests for the prompt/agent/skill layer*. Not exhaustive; go deeper when `3.4` is scheduled. Sources are canonical docs/papers (see end); two honesty flags are called out for verification before the harness convention is locked.

## The shared vocabulary: the 3-layer model

We talk about "prompt tests" in **3 layers, split by how the expectation is checked**:

1. **Deterministic shell** — schema / structure / parsing checks; exact `assertEquals`. Cheap, no model. *(Our kernel CLIs — `goal-verdict`, `hash-rfc`, `classify-deviation`, `branch-precheck` — already live here: extracting logic to the kernel is what moves it into layer 1.)*
2. **Structured-value assertions** — assert on the *constrained JSON fields* of an agent's output (`verdict == "fail"`, a finding tied to `g2`). Stable across runs because structured output varies far less than prose. **Refinement from the research:** this is not a third *mechanism* — it's layer-1 machinery pointed at the agent's structured output; its justification is *stability*, not a different check. Same substrate as layer 1.
3. **Reasoning-quality** — irreducibly fuzzy ("did it find the *real* bug?"); graded by a **sealed** LLM-as-judge against a rubric; statistical (pass-rate over N).

**Substrate-by-subject:** kernel CLIs → any process runner (bun/bats/jq); agents/skills → must be dispatched by the agent runtime (a Claude skill or the SDK), then graded mechanically + by a sealed judge. Invariants regardless of substrate: a known input, a genuinely checkable expectation, a suite convention (not one-offs), and producer≠verifier sealing when a judge grades.

**The orthogonal axis the research surfaced (fold into `3.4`):** prior art's primary split is *what* is graded — **trajectory vs outcome** [10]. Agents need both a tool-use/transcript dimension and a final-state dimension, and Anthropic warns against over-grading the *path* ("grade what the agent produced, not the path it took" — agents find valid unanticipated routes) [10]. Our "how it's checked" layers are orthogonal to this "what is graded" axis; `3.4` should cross the two and bias toward outcome-grading.

---

## Landscape (tools + case-format shape)

The field has converged on a common skeleton: **known input + a list of assertions, each either mechanical or model-graded, optionally run N times for a statistical verdict.**

- **promptfoo** [1][2] — YAML. A case is `{vars, assert: [...]}`. The `assert` list mixes *deterministic* types (`equals`, `contains`, `regex`, `is-json`, `is-valid-openai-tools-call`, `javascript`/`python`, `latency`/`cost`) and *model-graded* types (`llm-rubric`, `g-eval`, `factuality`, RAG `context-faithfulness`, agent `trajectory:goal-success`). **One case can hold both kinds in a single list** — the key pattern for us.
- **OpenAI Evals** [3][4] — JSONL dataset + YAML registry entry. Built-in graders: exact-match, includes, regex, fuzzy, json-schema, and `model-graded` (a separate judge model).
- **DeepEval** [5][6] — `LLMTestCase(input, actual_output, expected_output)` scored by metric objects; flagship judge **G-Eval** uses CoT to turn freeform criteria into eval steps. Docs explicitly say G-Eval is for open-ended qualities, *not* rule-based exact-match — same mechanical-vs-judge split.
- **Braintrust** [7] — `Eval(name, {data, task, scores})`; splits **code-based** scorers (format/length/deterministic) from **LLM-as-judge** (style/tone/subjective). All I/O JSON-encodable.
- **LangSmith / AgentEvals** [8][9] — dataset + evaluators over traces; adds **trajectory** evaluators (tool-call sequence), via reference-match or LLM judge.
- **Anthropic** [10][11] — discipline, not a framework: three grader types (code / model / human); code-grading is "the best grading method if an eval allows for it… fast and highly reliable" [11].

**Universal pattern: input + a list of typed assertions, mechanical and judge coexisting per case.** Validates our layering.

## LLM-as-judge + non-determinism

- **Code first, judge only where needed**, and calibrate the judge against human labels [10][11][12].
- **Known judge biases** [13][14]: position, verbosity, self-preference. Mitigations (none fully eliminable): randomize/average option order (pairwise), mask model identity, address length in the rubric, ensemble/quorum, calibrate vs humans.
- **Pointwise (our use)** avoids position bias but needs a sharp rubric + an explicit "Unknown / insufficient-evidence" exit [10].
- **Non-determinism is irreducible** even at temp 0 [15][16] → lock temperature low and, for layer-3, **aggregate over N runs with a pass-rate threshold**; report **pass@k** ("can it" — ≥1 of k) and **pass^k** ("is it reliable" — all k) [10][17]. A single judge run is noise, not signal.
- **Start small:** 20–50 tasks drawn from real failures is a strong start; large early effect sizes mean small samples suffice [10].

## Recommendations for our harness convention (seeds `3.4`)

1. **Case-dir layout: input + an assertion manifest per case; suite by directory convention** (promptfoo/Braintrust shape) [1][7].
2. **Express the layer as a `type` on each assertion, not separate files** — layers 1–2 as `type: code`/`structured` (assert on parsed JSON), layer 3 as `type: judge` (rubric + threshold), mixed in one list [2]. "Mix per case" is the default.
3. **Seal the judge structurally** — give it only `{artifact, rubric}`, never the producer's reasoning; mask producer identity; explicit "Unknown" exit; quorum + average at high stakes [10][14].
4. **Layer-3 verdicts are statistical** — run N at low temp, threshold a pass-rate; report pass@k and pass^k [10][17].
5. **Add a trajectory axis for agent cases and prefer outcome-grading** — allow assertions over tool-call trajectory *and* final state, but bias toward outcomes to avoid brittle path-tests [8][10].
6. **Recursion on-brand with "own the loop":** the deterministic core of the *checker* itself (jsonpath/schema assert) can be a TDD'd kernel CLI — so the part of the eval harness that *can* be deterministic is itself unit-tested; only the judge stays fuzzy + sealed.

## Honesty flags (verify before locking the convention)

- **(a)** The "self-grading is *net-negative*" claim underpinning our sealing rule is well-supported by our internal `.claude/rules/sk-agent-prompts.md` but I did **not** find it stated that strongly in canonical external sources this session — the external literature supports *judge independence + bias mitigation* (weaker). Verify before over-claiming it in the harness rationale.
- **(b)** The CI-tiering recommendation (mechanical per-commit, judge nightly/pre-release) is an inference from cost/latency framing, not a single quoted prescription.

## Sources

1. promptfoo — Test Case Configuration: https://www.promptfoo.dev/docs/configuration/test-cases/
2. promptfoo — Assertions & Metrics: https://www.promptfoo.dev/docs/configuration/expected-outputs/
3. OpenAI Evals — repo + model-graded: https://github.com/openai/evals
4. OpenAI Cookbook — Getting Started with OpenAI Evals: https://github.com/openai/openai-cookbook/blob/main/examples/evaluation/Getting_Started_with_OpenAI_Evals.ipynb
5. DeepEval — LLM eval metrics (G-Eval; open-ended vs rule-based): https://deepeval.com/docs/metrics-llm-evals
6. Confident AI — G-Eval definitive guide: https://www.confident-ai.com/blog/g-eval-the-definitive-guide
7. Braintrust — LLM evaluation guide (code vs judge scorers; statistical aggregation): https://www.braintrust.dev/articles/llm-evaluation-guide
8. LangChain — LLM evaluation framework (trajectories vs outputs): https://www.langchain.com/resources/llm-evaluation-framework
9. LangChain docs — Trajectory evals: https://docs.langchain.com/langsmith/trajectory-evals
10. Anthropic — Demystifying evals for AI agents (graders; trajectory vs outcome; pass@k / pass^k; start 20–50): https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
11. Anthropic Cookbook — Building Evals (code-grading as default): https://github.com/anthropics/anthropic-cookbook/blob/main/misc/building_evals.ipynb
12. Deepchecks — LLM-judge calibration: https://deepchecks.com/llm-judge-calibration-automated-issues/
13. arXiv 2410.02736 — Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge: https://arxiv.org/pdf/2410.02736
14. Evidently AI — LLM-as-a-judge guide: https://www.evidentlyai.com/llm-guide/llm-as-a-judge (self-preference: https://arxiv.org/pdf/2410.21819)
15. Thinking Machines — Defeating Nondeterminism in LLM Inference: https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/
16. arXiv 2506.09501 — Numerical Sources of Nondeterminism in LLM Inference: https://arxiv.org/html/2506.09501v2
17. Braintrust — LLM evaluation guide (confidence intervals, regression): https://www.braintrust.dev/articles/llm-evaluation-guide
