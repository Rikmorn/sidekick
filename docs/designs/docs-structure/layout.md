# Sub-problem: what the layout defines

Part of `design.md`, gate 2. Status: the operator chose Option 1 on 2026-10-10, with `reviews/` moved to the compaction sub-problem. After review, the record discipline stays in `sk-pm-conventions.md` and the layout cites it · 2026-10-10

## Problem

The layout the plugin ships, `plugin/skills/sidekick/references/docs-layout.md`, covers the record side and the working folders, and not the living side. Four findings meet here:

- F1: the placement test sends true-now content to a "reference doc", and the layout defines no home for one.
- F4: a repo's `docs/README.md` restates the layout's rows, so each layout change strands the copy. aesir's copy has already drifted.
- F8: `reviews/` has no owner and no section.
- Goal 6: each folder names who writes it and who deletes it. Today the layout says so for `designs/` and `learnings/` only.

The `superpowers/` lifecycle (F2), the frozen folders (F3, F9, F10), and the checks (F5, F6) are their own sub-problems. Each depends on what this one decides.

## Constraints

- **Verified**: the layout already lets a repo's folder `README.md` "extend or override its section here", and lets a repo add folders of its own (`docs-layout.md`, opening paragraph).
- **Verified**: `sk-pm-conventions.md` §Change control already states that a doc a change made stale is part of that change. A reference section can cite it rather than restate it.
- **Verified**: the homes in use differ. aesir and furnace keep living docs in `docs/reference/`. sidekick keeps them at its `docs/` root. odin keeps them beside the code they describe, as `services/<name>/README.md`, and its `docs/README.md` maps where.
- **Verified**: sidekick's root living docs have few inbound links. `README.md` links `USAGE.md`. `docs/README.md` links all of them. `USAGE.md` and `LOOP.md` link each other. Nothing in `plugin/` or `bin/` names them.
- **Verified**: `NORTH-STAR.md`, `USAGE.md`, and `LOOP.md` carry `kind:` and `status:` frontmatter, a vestige of the knowledge graph ADR-0009 retired.
- **Verified**: `docs-layout.md` is plugin content, so a change to it reaches every consumer repo with the release. An added section is an additive contract change.
- **Assumed**: #186 decides where its release check's findings go. A layout section for reviews before that design would guess its shape.

## Options

### Option 1: a default reference home, with an owner line per folder

- Add a `reference/` section to the layout. It covers present-tense docs of how the project is today. The default home is `docs/reference/`, and a repo whose `docs/README.md` names another, such as beside the code, keeps its own. The lifecycle is living: corrected in the change that moves what it describes, citing §Change control, with history kept in records. A learning record's `Status: promoted to …` points here.
- Give each section a line naming who writes it and who deletes it.
- A repo's `docs/README.md` cites the layout and lists only what the repo adds or overrides. sidekick's is rewritten that way.
- sidekick follows its own default. `NORTH-STAR.md`, `LIMITS.md`, `USAGE.md`, and `LOOP.md` move to `docs/reference/`, and their vestigial frontmatter goes. The fate of `DESIGN-PRINCIPLES.md` belongs to the compaction sub-problem.
- `reviews/` stays sidekick's own folder, declared in its `docs/README.md`. The layout gains no section for it until #186 decides its output's home.

Pattern card:

1. Convention with an override: a default location the repo can replace. The living/record split follows PEP 1's "historical document rather than a living specification", and Diátaxis' reference type.
2. It gives the placement test's destination a home, and stops taxonomy copies drifting, since a copy that only lists overrides has nothing to go stale. Two consumer repos already use this folder name, though furnace's also holds records under an exception.
3. Already in the repo: the layout's override clause, and aesir's and furnace's `docs/reference/`.
4. Cost: one more section loads in every consumer repo, and sidekick moves four files and repairs about six links. Don't use it if most consumer repos keep reference beside the code; the override covers odin, but a default nobody uses is noise.
5. Next change: a new kind of doc is one section in the layout. A repo's `docs/README.md` changes only when it overrides that section.

### Option 2: name where reference lives, with no default

- The layout adds a short section saying a repo's `docs/README.md` names where its true-now docs live: the root, a folder, or beside the code. It sets no default folder.
- Owner lines and the cite-don't-restate rule as in Option 1.
- sidekick's root living docs stay where they are, and its `docs/README.md` names the root as their home.

Pattern card:

1. Delegation to the repo, with the plugin naming only the decision.
2. It closes F1 in the smallest diff, and imposes nothing on a repo with its own habit.
3. Already in the repo: the layout's "A repo may add folders of its own".
4. Cost: each new consumer repo decides again. A skill promoting a learning can name no default path. sidekick's root docs stay an exception its README has to explain. Don't use it if consistency across the home repos matters.
5. Next change: each repo decides per kind, so the fifth kind is five decisions.

### Option 3: the layout defines every folder

- Option 1, plus a `reviews/` section as a record folder for audits and assessments, and a section for the docs root.
- Every folder a repo might have is defined by the plugin, and a repo's `docs/README.md` becomes optional.

Pattern card:

1. A complete taxonomy owned by the framework.
2. It closes F1 and F8 at once, and leaves nothing unowned.
3. New here.
4. Cost: speculative generality. `reviews/` has one user, sidekick, and #186 has not designed what its check produces. Consumer repos would load sections for folders they never create. Don't use it while one repo is the only evidence.
5. Next change: every folder a single repo wants becomes a plugin change and a release.

## Stance

**Decided 2026-10-10: Option 1.** The operator asked what `reviews/` holds. Its six files are the evidence behind ADR-0004, ADR-0009, ADR-0010, and R6, and nothing has been added since 2026-09-19. Today's loop sends prior-art surveys to `research/` and evaluations to design notes. So `reviews/` does not stay as sidekick's own folder. Its three external prior-art surveys move to `research/` as records, and its three evaluations of the retired system are deleted like the frozen folders. The compaction sub-problem carries that out.

The recommendation, as written before the decision: Option 1. Option 2 leaves the home repos to keep diverging, and Option 3 designs `reviews/` ahead of #186.

It rests on three assumptions:

- Most consumer repos want their living docs in a docs folder. If most keep them beside the code, the default is noise and Option 2 is better.
- Moving sidekick's four root docs costs little. Verified: their inbound links are the five listed in §Constraints. If a link outside the repo cites them, it breaks; none was searched for.
- #186 decides where review findings land. If it chooses `docs/reviews/`, Option 1 extends by one section then.

## Lenses that bite here

| Lens | Load-bearing? | Where it bites |
|---|---|---|
| Contracts, including what an LLM reads | Yes | Skills in every consumer repo read the layout. An added section is additive; renaming a folder would not be |
| Extension points | Yes | A new kind of doc should be a section in the layout, not a branch in each skill |
| Reversibility | Yes, mildly | Moving sidekick's files is undone by a move back; a shipped section is withdrawn by a later release |
| Data model, identity, lifecycle | Yes | Each folder's lifecycle and owner is the whole point of goal 6 |
| Operability | Partly | An owner line makes a missed deletion visible, as F2 shows |
| Boundaries, concurrency, security, performance | Not load-bearing here | Docs carry no runtime path |
| Testability | Deferred | The checks sub-problem decides what a test can assert about the layout |
