> Research record for #186, conducted 2026-10-11 by a research subagent and spot-checked by the orchestrator. Frozen at birth, per `docs/README.md` §research.

# Prior art for a milestone-level holistic release check

Provenance: a research subagent gathered the sources on 2026-10-11 for #186. Each source carries the subagent's own label: [fetched] read in the source; [secondary] read in a page quoting the source; [snippet] search summary only; [recalled] model knowledge, unconfirmed.

On the same day the orchestrator re-read five quotes at their source and found each as quoted: NoLiMa (arXiv 2502.05167), DocPrism (arXiv 2511.00215), SRE book ch. 32, Huang et al. (arXiv 2310.01798), and ChatEval (arXiv 2308.07201). For ChatEval it read the abstract and §4.1, which give 60.0% accuracy against a single-agent baseline of 53.8% on one benchmark. Every other label stands as the subagent reported it.

**Bottom line.** Established practice nearly always checks at two points: once early against the plan, and once late against a frozen candidate. A late check is advisory, but the release owner can block on it. Strong evidence argues against heavyweight external approval gates. Thinner evidence supports the specific techniques: premortems, perspective-based reading, and LLM consistency review. Most of the evidence comes from large organisations with separate teams, and the LLM evidence comes from benchmarks rather than prose-guidance review.

## 1. Timing

Most mature processes review at both ends, and name late-only review as a weakness.

- NASA: reviews at every phase; Mission Concept and System Requirements reviews at the start, ORR/FRR at the end. FRR "examines tests, demonstrations, analyses, and audits that determine the system's readiness for a safe and successful flight/launch." ORR "examines the actual system characteristics and the procedures used in the system or product's operation." https://www.nasa.gov/sites/default/files/atoms/files/nasa_systems_engineering_handbook_0.pdf [fetched]
- Microsoft SDL: security advisor from "project inception through completion of the Final Security Review", aim "to avoid security-related surprises late in the process". FSR "conducted two to six months prior to software completion"; "The software must be in a stable state before the FSR, with only minimal non-security changes expected prior to release." https://Acsac.org/2004/papers/Lipner.pdf [fetched]
- Google SRE ch. 27: launch reviews "days to weeks before the launch". https://sre.google/sre-book/reliable-product-launches/ [fetched]
- Google SRE ch. 32 names late engagement as PRR's main flaw: "The SRE engagement starts very late in the development lifecycle"; remedy Early Engagement Model, "the earlier an SRE team consultation happens, the better the service will be." https://sre.google/sre-book/evolving-sre-engagement-model/ [fetched]
- Scrum Guide 2020: DoD gates each item continuously ("If a Product Backlog item does not meet the Definition of Done, it cannot be released or even presented at the Sprint Review"); Sprint Review adapts rather than gates ("inspect the outcome of the Sprint and determine future adaptations"). https://scrumguides.org/scrum-guide.html [fetched]
- Shape Up ch. 8: betting table meets during cool-down; cool-down is "a period with no scheduled work". https://basecamp.com/shapeup/2.2-chapter-08 [fetched]

Premortem evidence is thin:
- Klein HBR 2007 frames it as a planning-phase exercise. https://hbr.org/2007/09/performing-a-project-premortem [fetched, summary page only]
- Mitchell, Russo, Pennington 1989: "temporal perspective" had little effect; "outcome uncertainty strongly affected the nature of explanations". https://colab.ws/articles/10.1002%2Fbdm.3960020103 [fetched]
- Klein's 30% is about number of reasons, not accuracy; "The academic literature on the premortem is thin." https://corporate.jcx.au/premortem [secondary]
- Gallop & Bischoff 2016 (101 PMs/engineers): more quality and black-swan risks than brainstorming. same page [secondary]

Integration: Fowler, "Conflicts that stay undetected for weeks can be very hard to resolve"; "integration hell". https://martinfowler.com/articles/continuousIntegration.html [fetched; practitioner essay]

Implications: cross-plan contradictions exist only once both plans land, so close-time (or after-each-plan against the cumulative branch) is the only point that sees them; "forgot something" / "contradicts identity" can be seen at planning time; FSR stable-candidate rule implies checking a frozen candidate, with fixes re-running deterministic gates.

## 2. Coverage

- Czerwonka et al., ICSE 2015: "Code review usefulness is negatively correlated with the size of a code review… The decrease however only starts to be noticeable for reviews with 20 or more changed files." https://microsoft.com/en-us/research/wp-content/uploads/2015/05/PID3556473.pdf [fetched]
- SmartBear/Cisco: "no more than 200 to 400 lines of code (LOC) at a time". https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/ [fetched; vendor study]
- Lost in the Middle: performance "significantly degrades when models must access relevant information in the middle of long contexts… even for explicitly long-context models". https://arxiv.org/abs/2307.03172 [fetched]
- NoLiMa: with low literal overlap, "At 32K, for instance, 11 models drop below 50% of their strong short-length baselines"; GPT-4o 99.3% → 69.7%. https://arxiv.org/abs/2502.05167 [fetched]. Inference: contradicting guidance rarely shares wording.
- Context Rot (Chroma 2025): "Model performance degrades as input length increases"; "even a single distractor reduces performance". https://www.trychroma.com/research/context-rot [fetched]
- PRR uses a "service-specific checklist", gauges maturity "along the various axes of concern to SRE" (ch. 32) [fetched]. Checklist admission (ch. 27): "Every question's importance must be substantiated, ideally by a previous launch disaster"; "it is easy for the checklist to grow to an unmanageable size", re-curated "once or twice a year" [fetched].
- PBR (Basili 1996); Ciolkowski 2009 meta-analysis "no clear positive effect", PBR teams beat ad hoc but worse than checklist teams, "strong indicators of researcher bias". https://ebse.webspace.durham.ac.uk/?p=130 [snippet]
- ChatEval: "diverse role prompts (different personas) are essential… utilizing the same role description in the prompt can lead to a degradation in performance". https://arxiv.org/abs/2308.07201 [fetched]. Counter: multi-agent debate "do[es] not reliably outperform other proposed prompting strategies". https://proceedings.mlr.press/v235/smit24a.html [fetched]

Implication: splitting by dimension is justified mainly by smaller focused contexts; evidence that distinct perspectives find more is weak; a whole-project semantic read in one context has the worst evidence.

## 3. Who runs it, and sealing

- NASA IV&V independence = technical, managerial, financial; technical = practitioners "use their expertise to assess development processes and products independent of the developer". https://www.nasa.gov/ivv-overview [fetched]. One operator can reach only technical.
- Panickssery et al.: "linear correlation between self-recognition capability and the strength of self-preference bias". https://arxiv.org/abs/2404.13076 [fetched]
- Zheng et al.: "position, verbosity, and self-enhancement biases". https://arxiv.org/abs/2306.05685 [fetched]
- Inference, untested: same-family reviewers may favour same-family output even sealed from its reasoning.
- Huang et al.: "LLMs struggle to self-correct their responses without external feedback… performance even degrades after self-correction". https://arxiv.org/abs/2310.01798 [fetched]
- Kamoi et al.: "Self-correction works well in tasks that can use reliable external feedback". https://arxiv.org/abs/2406.01297 [fetched]
- McAleese et al. (CriticGPT): critics catch "more bugs than human contractors paid for code review" but "hallucinated bugs"; "Human-machine teams … catch similar numbers of bugs to LLM critics while hallucinating less than LLMs alone". https://arxiv.org/abs/2407.00215 [fetched]
- Czerwonka et al.: "Without prior exposure to the part of code base being reviewed, on average only 33% of any reviewer's comments are deemed useful", ~67% by third exposure [fetched]. Implication: seal from authors' reasoning, not from what the project is.
- Large orgs: SRE Launch Coordination Engineering, "a dedicated consulting team within SRE" (ch. 27); Microsoft "central security team" (Lipner) [fetched].

## 4. Where findings go and what blocks

- Chromium release_blockers.md: "Only mark bugs as blockers if the product must not be shipped with the bug present."; "Do not mark an issue as a blocker 'to ensure someone looks at it.'"; "Provide detailed rationale whenever adding or removing a blocking label."; release owners "have the final say". https://chromium.googlesource.com/chromium/src/+/HEAD/docs/process/release_blockers.md [fetched]
- Python devguide: `release-blocker` holds the current release, `deferred-blocker` the next; "the branch's release manager will review them and determine if they indeed qualify". https://devguide.python.org/triage/labels/ [fetched]
- Rust Forge: "Backports of PRs to the beta branch are usually only done to fix regressions". https://forge.rust-lang.org/release/backporting.html [fetched]
- Kubernetes release-blocking-jobs.md: blocking signals must be reliable (75% weekly pass, every ≤3 h, responsive owner); others "informing", known failures "tolerated"; "unexplained non-flake failures should still block the release until investigated". https://github.com/kubernetes/sig-release/blob/master/release-blocking-jobs.md [fetched]
- Tricorder (Sadowski et al., CACM 2018): build-stopping checks "produce no effective false positives"; review-time checks "allowed to include up to 10% effective false positives". https://6826.csail.mit.edu/2020/papers/google-analysis-cacm.pdf [fetched]
- DocPrism: "Plain use of LLMs for this task yields unacceptably high inconsistency flag rates… over 90% of functions are flagged"; filtering "from 98% to 14%". https://arxiv.org/abs/2511.00215 [fetched]
- Fukuda et al.: LLMs "can be utilized to identify inconsistencies" in design docs; no precision figure. https://arxiv.org/abs/2509.09975 [fetched]
- FindBugs dashboard "saw little use because a bug dashboard was outside the developers' usual workflow" (Sadowski) [fetched].
- The FSR is not a pass/fail exercise, and its objective is not "to find every remaining security vulnerability"; "If the FSR finds a pattern of remaining vulnerabilities, the proper response is not just to fix the vulnerabilities found, but to revisit the earlier phase." (Lipner) [fetched]
- Fagan 1976: categorising inspection data "for process analysis" is "an important factor in attaining the improvements". https://www.ifsq.org/work-fagan-1976.html [fetched]

## Counterarguments

- DORA 2019 State of DevOps pp. 49–51: "Formal change management processes that require the approval of an external body such as a change advisory board (CAB) or a senior manager for significant changes have a negative impact on software delivery performance. Survey respondents were 2.6 times more likely to be low performers if their organization had this kind of formal approval process in place." / "We investigated whether a more formal approval process was associated with lower change fail rates and we found no evidence to support this hypothesis." / "Organizations often respond to problems with software releases by introducing additional process and more heavyweight approvals. Analysis suggests this approach will make things worse." / "Organizations should 'shift left' to peer review-based approval during the development process." https://services.google.com/fh/files/misc/state-of-devops-2019.pdf [fetched]
- Accelerate: "External approvals were negatively correlated with lead time, deployment frequency, and restore time"; "It is, in fact, worse than having no change approval process at all." https://www.goodreads.com/work/quotes/57250986 [secondary]
- DORA 2023: "Teams with faster code reviews have 50% higher software delivery performance". https://dora.dev/research/2023/dora-report/2023-dora-accelerate-state-of-devops-report.pdf [fetched]. DORA capability page recasts CAB as "strategic". https://dora.dev/capabilities/streamlining-change-approval/ [fetched]
- ITIL 4 Change Enablement §4.2: "the closer the authority sits to the work being done … the better. Amassing lots of decisions to higher-level authorities … might contribute to the illusion of control". https://www.mitsm.de/wp-content/uploads/2025/09/PIC_Sample-Paper2_Answers-Rationale_Digital.pdf [secondary]
- Caveat: DORA is cross-sectional/correlational; mechanism = delay and bigger batches from waiting on an outside body. Operator-run LLM check adds little waiting, but a milestone-close review is big-batch by construction.
- Czerwonka: "Only about 15% of comments provided by reviewers indicate a possible defect, much less a blocking defect" [fetched]. Bacchelli & Bird 2013: "Reviews are less about defects than expected". https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/ [fetched]
- Deming point 3, "cease dependence on inspection to achieve quality" [recalled].
- Deterministic checks stronger where they apply (Tricorder bars + DocPrism flag rate): make expressible invariants deterministic; LLM judges only meaning.
- Gaps: no study of end-of-milestone holistic review as such; none of LLMs checking prose guidance for self-consistency; LLM evidence from QA, code bugs, code–doc pairs.

## Implications drawn by the researcher (each rests on stated assumptions)

1. Both ends, light at the start: premortem against the outcome sentence at Opening (value = more candidate risks for operator triage, not accuracy); frozen-candidate review at close before the ask (cross-plan contradictions invisible until both land). If milestones grow, a per-plan check against the cumulative branch.
2. LLM scope = milestone diff + files it references + files referencing it; whole-project invariants to deterministic checks. Assumes release-relevant contradictions involve at least one touched file (untested).
3. A few lenses, each earned by a recorded failure (SRE checklist rule); case for splitting is smaller contexts.
4. Seal from authors' reasoning, not the project's identity; each finding quotes both sides with file:line; different model family would reduce self-preference (unverified for Claude-on-Claude).
5. Blocking stays with the operator; LLM findings advisory until verified; candidate blockers = regression, verified contradiction in shipped guidance, unwired addition caught deterministically; written reason per blocker; rest to sk-track backlog. sk-pm-conventions: a doc a change made stale is part of that change.
6. Recurring finding → fix upstream (deterministic check or per-plan reviewer line), else the close review grows into the gate DORA warns against.

Transfer: coordination-cost and managerial-independence arguments don't apply to one person; batch size, precision, and late-engagement arguments do.
