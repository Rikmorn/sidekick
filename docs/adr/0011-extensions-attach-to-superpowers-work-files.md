# ADR-0011 — Extensions attach to superpowers' work files through hooks on Read

**Status:** Accepted (2026-09-30). Amends ADR-0010's Decision 1, which names the Skill tool as the one attachment point. Issues #161 and #134, milestone R8.

## Context

ADR-0010 attaches sidekick's extensions when a superpowers skill loads. That moment reaches the session that loaded the skill, not the subagents the skill dispatches. Sidekick's reviewer rule, to re-run the checks an implementer claims, has to reach superpowers' reviewers, which are subagents. The plan offers no channel that carries it. Superpowers keeps process rules out of the constraints it hands a reviewer. A re-reviewer has no constraints at all. A batched dispatch gets a brief the controller writes, and the whole-branch reviewer gets no brief (#161). A reviewer also reads a diff, and a diff loads no path-scoped rule, so `sk-clean-code.md` §Comments never reaches it (#134).

The reviewers that `subagent-driven-development` and `executing-plans` dispatch read a review package. Superpowers' `review-package` script writes it as `review-<base>..<head>.diff` in the plan's workspace under `.superpowers/sdd/`. A probe on 2026-09-30, on Claude Code 2.1.286, established two facts:

- A plugin's `PostToolUse` hook with the matcher `Read` fires when a subagent reads a file. Its input carries the subagent's `agent_id` and `agent_type`.
- The hook's `additionalContext` attaches to that subagent's transcript, beside the read's result, and not to the parent's.

## Decision

1. A sidekick extension that acts when a superpowers work file is read attaches through a `PostToolUse` hook on `Read`. `plugin/hooks/post-read` checks the input in bash, and starts `sidekick hook post-read` only when the input carries the tokens a review package path has. That command decides from the file's path.
2. ADR-0010's Decision 2 holds: the hook adds context only. On input it does not recognise, or on any failure, it prints nothing and exits 0.
3. The file's name is the contract, as a skill's name is under ADR-0010. The first entry is the review package. It gets sidekick's reviewer lines: reproduce the checks the implementer claims, and hold the comments the diff adds to `sk-clean-code.md` §Comments. The hook reads that section at runtime from the plugin's own copy of the rule.

## Consequences

**Positive:** a reviewer that reads a package gets the lines as it reads the diff. That holds for a task, a batch, a fix round, and the whole branch. The plan carries nothing for it.

The hook is plugin content, so it works under `claude --plugin-dir` before a release.

Three reviewers never open a package and get no lines. A standalone `requesting-code-review` run gets SHAs and git commands instead. A task reviewer or re-reviewer whose diff file is missing fetches the diff with git. In superpowers' no-bash fallback, the controller writes a diff file under a name it picks itself.

**Negative, accepted:**

- Every `Read` in every session starts the bash wrapper. It stops a read whose content lacks any of the four tokens `superpowers`, `sdd`, `review-`, and `.diff`. A file that mentions all four, such as a plan, a design note, or a test, starts `node`. The CLI then decides from the path. The cost, measured on 2026-09-30 with `bash plugin/hooks/post-read` as the best of five runs on this machine: about 5 ms for a small file, 9 ms for 100 KB of content, and 90 ms for 2 MB, none starting `node`. A read that starts `node` costs about 40 ms for a small file and about 290 ms for 2 MB.
- The Comments paragraph appears only when the package shows files the rule covers. The hook reads the `paths:` frontmatter of `sk-clean-code.md`, collects the changed paths visible in the read's content, and matches `**/*.<ext>` patterns by suffix. A rule without `paths:`, or with a pattern of another shape, always gets it. A paged read that shows no file list gets the lead line and the reproduce paragraph only.
- The hook fires wherever the plugin is enabled, including repos sidekick does not manage, such as odin.
- Superpowers renaming or moving its review package silences the hook without an error. A test pins the name in this repo; a consumer repo sees nothing.
- Context is advice, and a reviewer may not act on it. Superpowers asks each reviewer to list the checks it ran, so its report shows whether it did.

## Assumptions

- A `PostToolUse` hook keeps firing inside subagents, with its context reaching the subagent. Measured once, on 2.1.286.
- Superpowers keeps writing review packages as `review-<base>..<head>.diff` in the plan's workspace.

## Revisit when

- Superpowers ships its own extension point for reviewers.
- The package's name or place changes.
- Reviewers' reports show the lines going unused.

## Links

ADR-0010 · #161 · #134
