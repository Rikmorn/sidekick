# Docs layout

How each `docs/` folder that sidekick's rules and skills use works: where it lives, who writes and deletes its files, and how long they last. A repo's own `README.md` in one of these folders extends or overrides its section here, so read that first when it exists. A repo's `docs/README.md`, when it has one, cites this file and lists only what the repo adds or overrides. A copy of a section here goes stale when a release changes the section, and nothing flags the copy.

A repo may add folders of its own, and sidekick's skills leave those alone. The folder-earning test decides whether one is needed. Each top-level `docs/` folder is a distinct retrieval axis: `adr/` is where a reader looks for what binds, and `learnings/` for what was learned. Anything retrievable on an existing axis gets no folder of its own, since a second home splits where a reader looks.

Each folder's files share one lifecycle, apart from its `README.md`, which is living. Nothing that must outlive a design sits in its folder, so closing work never moves a file before a deletion.

## reference/

Present-tense docs of how the project is today: what it is, how to use it, and how it works. This is where `sk-pm-conventions.md` §Placement test (tense) sends true-now content. The default home is `docs/reference/`. A repo whose `docs/README.md` names another home, such as beside the code, keeps its own.

- **Owner:** whoever changes what a doc describes. The change that moves it corrects the doc, as `sk-pm-conventions.md` §Change control says, and the change that retires it deletes the doc.
- **Lifecycle:** living, and in the present tense. How the project got here stays in records (§adr/, §learnings/). A learning whose lesson is promoted here says so in its status line.

## designs/

Designs in progress at `sk-design`'s explore scale, one folder per topic: `docs/designs/<topic>/`. The topic is short, kebab-case, and used by no other design.

- **Index:** `design.md`, whose status line reads `exploring`, `ready for PM`, or `planned (#NN, …)`.
- **Holds:** the files only this design uses: a sub-problem's own note, spike results, and the source of any rendered pages. Built output is gitignored. A spike result worth keeping past the design is a research report.
- **Not here:** research reports. They go to `research/<topic>/` when they are written, and the notes cite them there.
- **Owner:** `sk-design` writes it. `sk-milestone`'s close deletes it in a tracked repo, and the operator deletes it elsewhere or when they drop the design.
- **Lifecycle:** fluid while the design is open, and deleted once the issues it became have closed, or when the operator drops it. `sk-design`'s `references/explore.md` §Where it lives says how a dropped design can return.

## research/

Grounding reports, one folder per topic: `docs/research/<topic>/`. Research lands here when it is written, whether it is proactive or done inside an issue or a design. Research done for a design usually takes the design's topic. Scratch research stays in `superpowers/`, and a finding worth keeping leaves it as an issue or a report here before the operator clears the folder.

- **Index:** `README.md`: the question the topic answers, one line per report, and the issues the research served. The index is living: when PM plans a design whose research this is, add the issues it became.
- **Holds:** reports named `YYYY-MM-DD-<slug>.md`. Each lists its sources and names near the top the issue that asked for it. Research for a design that PM has not planned yet names the design's topic instead.
- **Owner:** the work that does the research writes the report: `sk-design` for a design, or the session working an issue. Nothing deletes a topic, so a design that never finishes, or two designs open at once, cannot strand or lose one.
- **Lifecycle:** a record, taking only the edits `sk-pm-conventions.md` §Placement test (tense) lists. A later report names the one it supersedes.

## adr/

Decisions that bind work after the work that made them has closed: `docs/adr/NNNN-<slug>.md`, numbered in order.

- **Index:** `README.md`, one line per decision with its status.
- **Holds:** one decision per file: its status, the context, the decision, and the assumptions it rests on.
- **Owner:** the work that makes the decision writes it, as `sk-design`'s §Decide and route does for a decision that binds future work. Nothing deletes one; a later ADR supersedes it.
- **Lifecycle:** a record, taking only the edits `sk-pm-conventions.md` §Placement test (tense) lists, and its amendment line names its issue. An ADR that supersedes another names it in its own status line, and the index notes it beside the superseded one.

## learnings/

One record per closed issue or milestone that clears the bar: `docs/learnings/YYYY-MM-DD-<slug>.md`, linked from the close comment that produced it.

- **The bar:** a counterfactual. Without this record, would the next engineer repeat the mistake or redo the investigation? Most closes clear no bar. The issue and its close comment already say what was done and why; a record says what was learned.
- **The shape:** the slug is a content name. The issue or milestone it came from (`#NN`) goes near the top, then three headings:
  - **Context.** The situation, briefly: what was being done, and what was expected.
  - **Lesson.** What turned out to be true, stated so it transfers beyond this case.
  - **Consequences.** What changed because of it: a rule amended, a check added, a convention ruled, or nothing yet and why.
- **Owner:** `sk-track` writes one when it closes an issue, and `sk-milestone` when it closes a milestone. Nothing deletes one.
- **Lifecycle:** a record, taking only the edits `sk-pm-conventions.md` §Placement test (tense) lists. Its status line, `Status: promoted to <rule or doc>`, goes directly under the `#NN` line once its lesson graduates into a rule or a reference doc (§reference/).

## tech-debt/

Small debt that `sk-design` registers in a repo sidekick does not track: `docs/tech-debt/<area>/<item>.md`, one file per item. In a tracked repo, small debt is an issue instead, and debt that needs more work is a design in either.

- **Owner:** `sk-design` writes each item, as its §Decide and route says. The change that pays the debt deletes the item's file.
- **Lifecycle:** living while the debt stands, and deleted when it is paid.

## superpowers/

The working directory that superpowers and sidekick's skills share: specs, plans, run reports, scratch research, and `sk-design`'s shape-scale notes under `designs/`. It is gitignored where the repo chooses.

- **Owner:** superpowers writes specs and plans, `sk-design` its shape-scale notes, `sk-execute` a plan's after-file, and `sk-worker` its run reports. The operator clears the folder when they choose; no skill deletes from it.
- **Lifecycle:** local scratch. Nothing durable cites a working file, by path or in prose, as `sk-pm-conventions.md` §No mirroring says, so clearing the folder strands nothing. A finding born here reaches an issue or a record before its file can go.
