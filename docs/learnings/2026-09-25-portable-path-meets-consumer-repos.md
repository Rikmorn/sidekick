# A portable convention's path meets the consumer repos' tooling

#119, R7 plan B.

## Context

`sk-design` writes explore-scale notes to a path every repo shares. The brainstorm chose `docs/backlog/<topic>/`, and the spec mandated it with no per-repo lookup. During the brainstorm, the orchestrator read each home repo's `docs/README.md` and noted that furnace's `docs/backlog/` was "shaped differently". It weighed only the folder's meaning, and not the tooling behind the folder. The per-task reviews passed, because each task copied the plan's prose verbatim.

## Lesson

A path in a portable convention is a claim on every repo that installs it, including the machinery behind that path. The whole-branch review found furnace's `docs/backlog/<topic>/` to be a register of deferred work. One area folder holds 121 files, every file needs `summary:` frontmatter, and the index generator fails on a file without it. A design note there would break the generator. `sk-milestone`'s close could also delete an area folder in a release commit.

Before a convention mandates a path, check each consumer repo for that path's meaning, what generates or validates files there, and what deletes them. A path no consumer uses avoids the question. Reviews of verbatim-copied prose check the copy, not the claim, so only a review that reads the spec against the consumers catches this.

## Consequences

- Explore notes moved to `docs/designs/<topic>/`, which none of the four home repos uses. A design owns its folder, so the close step deletes only that design's files (`d0e7f41`).
- No rule changed. This is one data point, and `sk-guidance-authoring.md` admits a failure pattern at three or four.
- #121 records what the whole-branch review caught after every task review had passed.
