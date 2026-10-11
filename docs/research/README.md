# Research

One line per topic. Each topic's `README.md` lists its reports and the issues it served.

- [agentic-loops](./agentic-loops/README.md): When does an outer programmatic loop beat a single agentic invocation, and which parts of building one stay durable as models improve?
- [context-memory](./context-memory/README.md): How should an autonomous agent manage context and persistent memory so quality does not silently degrade and a wrong lesson does not poison later runs?
- [docs-structure](./docs-structure/README.md): How a repo's `docs/` should be laid out by lifecycle, who keeps each part true, and which checks catch drift.
- [enforcement-surface](./enforcement-surface/README.md): How should a harness design its enforcement surface: which check sits at which layer, and how are per-project gates generated, sealed, and kept fresh?
- [eval-harness](./eval-harness/README.md): How should a harness test the prompt, agent, and skill layer, and how does prior art split those tests by how each expectation is checked?
- [guidance-authoring](./guidance-authoring/README.md): How do sidekick's two guidance-authoring rules, for agent prompts and for standing guidance, compare with what the wider ecosystem prescribes?
- [knowledge-layer](./knowledge-layer/README.md): Should sidekick rent, build, or glue together a knowledge layer that makes its repo's docs and records queryable by both operator and agent?
- [memory](./memory/README.md): What is memory for an AI assistant, and how should it be represented, related, consolidated, retrieved, and inspected?
- [orchestration](./orchestration/README.md): When does multi-agent orchestration beat a single strong agent, and should agents communicate in natural language rather than forced structured output?
- [platform-coupling](./platform-coupling/README.md): Should sidekick's orchestration loops be built on Claude Code's platform primitives, kept hand-rolled in skills, or split, and which coupling posture minimises regret?
- [pm-layer](./pm-layer/README.md): Which existing GitHub-tracking plugins, skills, and practices should sidekick's project-management layer adopt, borrow from, or write itself?
- [prompting](./prompting/README.md): For capable agentic models, where does declarative guardrail prompting beat imperative prompting, and does the repo's agent-prompt discipline hold up against the literature?
- [reasoning-capability](./reasoning-capability/README.md): Why does an AI discuss a problem shallowly by default yet sharply once guided to research, and is the cause calibration, over-confidence, or budgeting?
- [release-check](./release-check/README.md): How should a milestone's release be checked as a whole, and when?
- [verification-autonomy](./verification-autonomy/README.md): How do you manufacture verifiers where none exist, and how do you stop a verify-learn-memory loop from reinforcing its own errors?
