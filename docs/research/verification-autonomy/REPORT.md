# Track A — Verification & the Autonomy Frontier

**Research question:** How do you manufacture verifiers where none exist (domains without compilers/types/tests), and how do you stop a verify→learn→memory loop from reinforcing its own errors?

**Method:** deep-research workflow (6 search angles → 30 sources → 140 claims → 25 adversarially verified by 3-vote quorum → 19 confirmed, 6 killed → 9 synthesized findings). Run `wf_44c48264-654`, 2026-06-06.

**Companion file:** [`sources-self-verification-llm-judge.md`](./sources-self-verification-llm-judge.md) (sub-questions 1–2, with extra leads not formally verified).

---

## Headline

Manufacture verifiers by **importing independence, not ground truth.** A single model cannot reliably check its own reasoning — intrinsic self-correction without an external signal does not improve and often *degrades* output, because the bottleneck is error *detection*, not correction. So the durable lever is decoupling the verifier from the generator: independent verification questions (CoVe), a **cross-family** judge, adversarial debate adjudicated by a weaker judge.

The binding constraint is therefore **not "verification" in the abstract — it is verifier independence.** And independence has a hard ceiling: the **self-consistent error** (a model, and even a quorum of *correlated* models, confidently repeating the same wrong answer) is invisible to consistency-based checks, does not shrink with scale, and correlates ~60% across models sharing architecture/provider. That caps quorum and keeps **human escalation on confident-but-uncertain cases structurally necessary.**

For the learn→memory leg: a naive evolving memory **diverges** — error accumulates (worst-case drift linear in the task horizon) and a poisoned lesson persists until explicitly cleaned. Convergence requires **validating a lesson independently before persisting it.**

---

## Confirmed findings

Each: confidence · sources · **bucket** · *durability*.

1. **Self-critique alone doesn't work.** Without external/oracle feedback, intrinsic self-correction fails to improve and often degrades reasoning; the bottleneck is error detection. — high · Huang et al., *LLMs Cannot Self-Correct Reasoning Yet*, ICLR 2024 (arXiv:2310.01798) · **IN-REPO** (codify "no self-validation" gating) · *durable principle; the gap itself is partly model-level (RL like SCoRe may narrow it).*

2. **Independence is the mechanism, not re-checking.** CoVe reduces hallucination specifically when verification questions are answered *without seeing the draft* (factored > joint). — high · Dhuliawala et al., CoVe, ACL 2024 Findings (arXiv:2309.11495) · **IN-REPO** (independent-verification-questions skill) · *durable structural move; effect sizes modest.*

3. **LLM-as-judge is usable but only conditionally.** Strong judges hit ~85% agreement with humans (≈ human–human ~81–82%) without ties, dropping to ~66% with ties. — high · Zheng et al., NeurIPS 2023 (arXiv:2306.05685) · **HARNESS/CONFIG** (bounded judge step, never unconditional trust) · *model-level capability, improves over time.*

4. **Judges carry named, exploitable biases** (position, verbosity, self-preference); a same-family judge is structurally compromised. — high · 2306.05685 + Self-Preference Bias (arXiv:2410.21819) · **HARNESS/CONFIG** (judge from a different family) **+ MODEL/PROVIDER** · *cross-family quorum durable; bias magnitude partly an RLHF artifact (track). [Correction logged: "statistically significant" overreached — no p-values reported.]*

5. **Self-consistency has near-peaked; cross-model verification beats it,** and cost is controllable by routing the cross-model check only to the uncertain subset. — high · *Verify when Uncertain*, ICML 2025 (arXiv:2502.15845) + arXiv:2508.14314 · **IN-REPO** (cross-model quorum + uncertainty-gated escalation) **+ HARNESS/CONFIG** (route verify to another model) · *durable; gains modest (AUROC +0.07–0.10); cross-model can amplify shared bias.*

6. **The ceiling: self-consistent errors.** A model repeatedly emits the same wrong answer, so consistency-based detection is structurally blind; all four mainstream detector families fail, and frequency is *stable or rising* with scale. Cross-model is only a partial remedy — model pairs agree on the same wrong answer ~60% of the time when both err, more under shared architecture/provider. — high · *Too Consistent to Detect*, EMNLP 2025 (arXiv:2505.17656) + arXiv:2506.07962 · **MODEL/PROVIDER** (track — capability won't fix it) **+ IN-REPO** (never treat agreement as proof) · *durable disconfirming result; this is the strongest evidence against "stronger models will solve verification."* **[Spot-checked by Claude — paper real, claim accurate.]**

7. **Consistency is necessary but not sufficient.** Accuracy implies consistency, not vice versa; cross-model agreement catches factual errors but degrades on abstract/judgment questions even when models individually know the answer. — high · Patwardhan et al., IEEE TPS-ISA 2024 (arXiv:2502.07036) + SAC3 (arXiv:2311.01740) · **IN-REPO** (never gate solely on consistency; escalate judgment calls) · *definitional, model-independent — durable.*

8. **Adversarial debate is a viable ground-truth-free oversight signal:** a weaker judge can adjudicate stronger experts without labels, and optimizing debaters for persuasiveness *improves* the judge's truth-finding (opposite of single-advocate consultancy). — medium · Khan et al., ICML 2024 (arXiv:2402.06782) + arXiv:2407.04622 · **IN-REPO** (debate/refutation verifier for judgment-heavy outputs) · *durable in principle, but shown under information-asymmetry reading tasks; symmetric-info debate failed and open-ended transfer is unproven.*

9. **The learn→memory leg diverges without a validation gate.** Naive evolving memory accumulates persistent error (worst-case drift linear in horizon); poisoned memory persists until explicitly cleaned. Validate a lesson independently *before* persisting. — medium · SSGM, *Governing Evolving Memory in LLM Agents*, Mar 2026 (arXiv:2603.11768) + arXiv:2512.16962 + arXiv:2601.05504 · **IN-REPO + HARNESS/CONFIG** (memory-write validation gate; periodic reconciliation against source traces) · *validate-before-persist is durable and the most directly actionable finding for the positive recursive loop.* **[Spot-checked by Claude — SSGM real; "consistency verification … prior to memory consolidation" is exactly the gate. The linear-drift theorem is worst-case/idealized — cite as motivation, not a measured law.]**

---

## Refuted (killed by the adversarial pass — useful negative results)

- **Rubric-based verification as a reliable lever** — *multiple* specific claims (the unifying-framework story, an 80% 5-shot chemistry-grading ceiling, a 0.47→0.85 reasoning-boost on peer review) all failed (0-3 / 1-2). arXiv:2603.00077. **Takeaway: on the evidence found, rubrics are NOT a substantiated verifier-manufacturing method — plausible, but unsupported here. Do not lean on rubric scores as a gate without our own validation.**
- **Self-preference = perplexity/familiarity bias** (specific mechanistic claim) — 0-3, arXiv:2410.21819.
- **The specific debate accuracy numbers (76%/88% vs 48%/60%)** — 1-2 (the *framing* in finding 8 survived; the exact figures did not).
- **Periodic reconciliation gives an O(N·ε) drift bound** — 0-3, arXiv:2603.11768 companion claim. Only the directional "validate-before-persist" survives.

---

## Consolidated action map (three buckets)

**IN-REPO** (this repo can build it as a skill/rule/hook/agent):
- Codify "no self-validation" as a hard rule for *gating* (it already echoes sk-agent-prompts.md Rule 5 — this research vindicates and sharpens it).
- Verifier must be **independent of the generator**: CoVe-style independent verification questions; **cross-family** quorum (NOT same-model quorum — finding 4).
- **Never gate on consistency/agreement alone** (findings 6, 7) — agreement ≠ correctness; route judgment-heavy/abstract outputs to escalation.
- Debate/refutation verifier for judgment-heavy outputs (finding 8, with conditions).
- **Memory-write validation gate**: validate a lesson independently before persisting; reconcile periodically against source traces (finding 9).

**HARNESS/CONFIG** (Claude Code settings / hooks / MCP / model routing):
- Route the verify/judge step to a **different model family** than the producer.
- **Uncertainty-gated escalation**: cheap self-check first, escalate the uncertain subset to cross-model verification, then to a human (finding 5).
- Surface judge calibration/uncertainty before it gates an action.

**MODEL/PROVIDER-LEVEL** (not ours — track only):
- The self-consistent-error ceiling (finding 6) — strongest reason human escalation stays necessary.
- Judge self-preference as a pretraining/RLHF artifact; intrinsic self-verification training (ReVISE-style).

---

## Durability verdict

The **durable** designs all leverage the reasoning engine via *structural independence*: verifier-generator decoupling (CoVe), cross-family judging, adversarial debate, uncertainty-gated escalation, validate-before-persist memory gates. The **track-only** items are capability artifacts that may shift but won't be solved by scale (notably the self-consistent-error ceiling, which is *disconfirming* evidence for "stronger models will fix verification"). Nothing here is a hand-built program that a better model obviates — the lever is *how you arrange independent reasoners*, which survives model upgrades.

---

## Open questions (for follow-up research)

1. Empirically measured (not worst-case) drift rate of an ungoverned verify-learn-memory loop, and the minimal validation gate that flips it from diverging to converging in a non-code domain.
2. How much does cross-family/cross-provider selection *actually* decorrelate errors for this harness's domains? Residual Claude↔non-Anthropic independence on judgment tasks is unmeasured (the ~60% pairwise error-agreement bounds it).
3. A deployable calibration/uncertainty threshold telling the agent to stop and escalate on abstract/judgment outputs where cross-model agreement degrades.
4. Does ground-truth-free debate transfer beyond information-asymmetry reading tasks to open-ended generation/planning (where symmetric-info debate already failed)?

---

## Provenance & honesty notes

- **Recognized from training (high personal confidence):** 2310.01798, 2306.05685, 2309.11495, 2402.06782, METR long-task horizon, cognition.ai multi-agent skepticism.
- **Post-cutoff (Jan 2026) — I cannot vouch from memory; relied on the workflow's adversarial verification, plus I spot-checked the two most load-bearing:** 2505.17656 (self-consistent errors) and 2603.11768 (SSGM memory governance) — **both confirmed real and accurately summarized** via direct fetch.
- **Taken on the workflow's verification, NOT independently checked by me:** 2502.15845, 2506.07962, 2502.07036, 2311.01740, 2410.21819, 2407.04622, 2512.16962, 2601.05504, and the leads in the companion sources file (several carry 2025–2026 IDs). Spot-check these before treating any as load-bearing.
- The companion `sources-*.md` lists additional leads (ReVISE, calibration-for-self-improvement, "illusions of reflection") that were collected but **not** run through the adversarial verifier — treat as unverified pointers.
