# Explore scale

An explore note designs something with no build in hand: a large change, a subsystem to evaluate, a direction to plan. It starts when the operator asks for one, or when a shape note outgrows one spec. It usually lasts several sessions, and it ends in a breakdown that PM turns into issues.

## Where it lives

The note is `docs/designs/<topic>/design.md`, with a short kebab-case topic. Pick a topic no other design uses, so the folder belongs to this design alone. The files only this design uses sit beside it: a sub-problem's own note, spike results, and the source of any rendered pages. Research reports go to `docs/research/<topic>/` when they are written, and the notes cite them there, so deleting the folder loses none of them. The docs layout that `SKILL.md` §Two scales names says how both folders work. The folder stays fluid until PM plans it, and is deleted once the work it planned is done.

The status line carries the lifecycle:

- `exploring` while the design is open;
- `ready for PM` once the breakdown is written and reviewed;
- `planned (#NN, #NN)` once PM has filed its pieces, listing the issues they became.

After those issues close, the folder is deleted: by `sk-milestone`'s close in a tracked repo, by the operator elsewhere. A design the operator drops before PM has no issues to close, so it is deleted when they drop it, and git history keeps it. If it may return, record the topic, the research topics it cites, and the last commit that held the folder. In a tracked repo that record is a `backlog` issue; elsewhere it goes wherever the operator tracks work.

## Resuming

The note is the memory between sessions, so write each decision into it when it is made, not only into the conversation. Invoked without a topic, list the `design.md` notes under `docs/designs/` whose status reads `exploring`, and ask which to continue. Read the whole note before adding to it.

## Adopting an exploration written elsewhere

An exploration begun outside this skill, under another tool or in another folder, comes in without starting over:

1. Move its notes under `docs/designs/<topic>/`, each in its own shape. Move its research reports under `docs/research/<topic>/` under their own names, since renaming breaks links, and write the index the docs layout asks for.
2. Write `design.md` as their index, with status `exploring`. It says what is here, where a reader starts, and which of this skill's sections the notes do not yet fill. Add it beside any index the notes already have, since renaming that index breaks the links to it.
3. Repoint only the links the move broke, then check that every relative link resolves.
4. Credit a gate only where the operator's approval of it is on record: in a note, an issue comment, or a commit message. List each credited gate in `design.md`, with where its approval is recorded. Resume at the first gate not credited, or at gate 1 with the existing notes as its input. When the first gate is credited, mark each goal stated where the record shows the operator's approval. Confirm the rest with the operator before resuming.

The lens table and the review are owed as for any explore note, before the third gate.

## Gates

Approve in three gates, not one and not seven.

1. **Problem and constraints first, on their own**, with what was read, and each goal marked stated or inferred for the operator to confirm. For an evaluation, the system map as it stands goes in this gate. Everything rests on them, and they are cheap to correct early.
2. **Sub-problems one at a time**, when the operator pulls a thread. Each gets its own options and stance, as a section of the note or a sibling file.
3. **The integrated note once, after review**: options, recommendation, breakdown, and sequence together, because they are one choice. Check that the sub-decisions compose.

## Lenses

Record each lens from `SKILL.md` §Lenses in a table: whether it is load-bearing here, and where it bites. "Not load-bearing here" is an answer; a skipped lens is not.

## Evaluating with no change in hand

An evaluation fills the same sections in their as-is form:

- **Problem** holds the forces and the findings. The forces are the changes known to be coming, what is expensive today, and what the operator has said matters. Measure what is expensive: call sites, switch arms, the modules a recent change touched. Each finding carries a `file:line`, the principle it works against, and what it costs the next change, operability, or testability. Rank findings by blast radius, not by how easy the fix is.
- **Constraints** says what was read and what was not. An assessment that does not say what it skipped cannot be trusted on what it found.
- **System map** is as it stands: responsibilities per module, and dependency direction against the binding rules. Where state lives and who writes it, and which kinds of change are a registration today.
- **Options** are the proposals, two or three, each shippable alone with its pattern card. Findings with no proposal attached are a valid outcome.
- **Decision** is per proposal.

## The breakdown

At explore scale, Blast radius becomes the breakdown PM receives:

- the pieces, each a brief a cold reader can act on: the problem, what resolves it, what is out of scope, how it is verified;
- the order, and what each piece depends on;
- what ships alone, with additive contract changes first;
- whether the whole is a release, and so a milestone, or a set of loose issues.

With the breakdown written and the review answered, set the status to `ready for PM`.

## Hand-off to PM

In a tracked repo, `sk-milestone`'s opening lists notes marked `ready for PM` beside the `backlog` issues whose conditions hold. Each accepted piece is filed through `sk-track` as a self-contained issue, and the note's status becomes `planned (#NN, …)`. Each research topic the note cites lists the same issues in its index. Its reports then keep a link to the work once the folder is gone. The issues stand alone, so deleting the folder later loses nothing they need.

In an untracked repo, the operator takes the breakdown to wherever the work is tracked, and deletes the folder when it is done.

## Escalating from a shape note

When a shape-scale design outgrows one spec, move its note to `docs/designs/<topic>/design.md`. Set its scale to `explore` and its status to `exploring`. Stop the brainstorm and tell the operator the design has outgrown one spec; they decide whether to replan.
