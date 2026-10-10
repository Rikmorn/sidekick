# Docs layout

How each `docs/` folder that sidekick's skills write works. A repo's own `README.md` in one of these folders extends or overrides its section here, so read that first when it exists. A repo may add folders of its own, and sidekick's skills leave those alone. A repo's `docs/README.md`, when it has one, is its taxonomy, and it can cite this file rather than restate it.

Each folder's files share one lifecycle, apart from its `README.md`, which is living. Nothing that must outlive a design sits in its folder, so closing work never moves a file before a deletion.

## designs/

Designs in progress at `sk-design`'s explore scale, one folder per topic: `docs/designs/<topic>/`. The topic is short, kebab-case, and used by no other design.

- **Index:** `design.md`, whose status line reads `exploring`, `ready for PM`, or `planned (#NN, …)`.
- **Holds:** the files only this design uses: a sub-problem's own note, spike results, and the source of any rendered pages. Built output is gitignored. A spike result worth keeping past the design is a research report.
- **Not here:** research reports. They go to `research/<topic>/` when they are written, and the notes cite them there.
- **Lifecycle:** fluid while the design is open. The folder is deleted once the issues it became have closed, or when the operator drops the design. `sk-design`'s `references/explore.md` §Where it lives says who deletes it and how a dropped design can return.

## research/

Grounding reports, one folder per topic: `docs/research/<topic>/`. Research lands here when it is written, whether it is proactive or done inside an issue or a design. Research done for a design usually takes the design's topic. Scratch that no committed file cites stays in `superpowers/` and goes with the work.

- **Index:** `README.md`: the question the topic answers, one line per report, and the issues the research served. The index is living: when PM plans a design whose research this is, add the issues it became.
- **Holds:** reports named `YYYY-MM-DD-<slug>.md`. Each lists its sources and names near the top the issue that asked for it. Research for a design that PM has not planned yet names the design's topic instead.
- **Lifecycle:** a record. A report is frozen once it lands, and a later report names the one it supersedes. Nothing deletes a topic, so a design that never finishes, or two designs open at once, cannot strand or lose one.

## adr/

Decisions that bind work after the work that made them has closed: `docs/adr/NNNN-<slug>.md`, numbered in order.

- **Index:** `README.md`, one line per decision with its status.
- **Holds:** one decision per file: its status, the context, the decision, and the assumptions it rests on.
- **Lifecycle:** a record, and its body is never rewritten. An amendment is a dated line at the top that names its issue. An ADR that supersedes another names it in its own status line, and the index notes it beside the superseded one.

## learnings/

One record per closed issue or milestone that clears the bar: `docs/learnings/YYYY-MM-DD-<slug>.md`, linked from the close comment that produced it. `sk-track` and `sk-milestone` write it.

- **The bar:** a counterfactual. Without this record, would the next engineer repeat the mistake or redo the investigation? Most closes clear no bar. The issue and its close comment already say what was done and why; a record says what was learned.
- **The shape:** the slug is a content name. The issue or milestone it came from (`#NN`) goes near the top, then three headings:
  - **Context.** The situation, briefly: what was being done, and what was expected.
  - **Lesson.** What turned out to be true, stated so it transfers beyond this case.
  - **Consequences.** What changed because of it: a rule amended, a check added, a convention ruled, or nothing yet and why.
- **Lifecycle:** a record. When its lesson graduates into a rule or a reference doc, add `Status: promoted to <rule or doc>` directly under the `#NN` line, and leave the rest as written.

## tech-debt/

Small debt that `sk-design` registers in a repo sidekick does not track: `docs/tech-debt/<area>/<item>.md`, one file per item. In a tracked repo, small debt is an issue instead, and debt that needs more work is a design in either.

- **Lifecycle:** deleted when the debt is paid.

## superpowers/

The working directory that superpowers and sidekick's skills share: specs, plans, run reports, scratch research, and `sk-design`'s shape-scale notes under `designs/`. It is gitignored where the repo chooses.

- **Lifecycle:** disposable, deleted when its work closes. No committed file cites one, because it will be gone.
