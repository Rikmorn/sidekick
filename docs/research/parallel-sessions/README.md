# parallel-sessions

How should one operator run worktrees and parallel sessions day to day? The cases are several features in one repo, support work on main beside them, and one feature across sibling repos. What do Claude Code, superpowers, sidekick, and community tools already do for each?

## Reports

- [2026-10-31-worktree-handling-in-sidekick-and-superpowers.md](./2026-10-31-worktree-handling-in-sidekick-and-superpowers.md): how superpowers' `using-git-worktrees` decides, and where sidekick's skills, hooks, and worker CLI use, bypass, or conflict with it. It also covers a dispatched worker's worktree lifecycle and its failure points, and what two sessions in one repo share.
- [2026-10-31-claude-code-worktree-features.md](./2026-10-31-claude-code-worktree-features.md): Claude Code 2.1.316's native worktree and parallel-session features, from `--worktree` and `EnterWorktree` to agent isolation and background sessions. It also covers several repos, cross-session messages, and what none of them does.
- [2026-10-31-worktree-from-a-worktree-probe.md](./2026-10-31-worktree-from-a-worktree-probe.md): where `claude --bg --worktree` puts a worktree when launched from a linked worktree, what it starts from, and what that means for `sidekick worker dispatch`.
- [2026-10-31-overlap-and-merge-coordination.md](./2026-10-31-overlap-and-merge-coordination.md): how tools and research surface and resolve overlap between parallel changes, at planning, during work, at merge, and after merge. It gives the evidence on how often agent work conflicts and how hard the conflicts are.
- [2026-10-31-parallel-agent-tools-survey.md](./2026-10-31-parallel-agent-tools-survey.md): community tools for parallel agent sessions, compared on setup, integration, collisions, awareness, and several repos. It says what each writes to Claude Code's config, and lists the failure modes practitioners report.
- [2026-10-31-worktree-probes-for-the-rule.md](./2026-10-31-worktree-probes-for-the-rule.md): #286's probes. It gives the command shapes the isolation guard refuses, counted over every transcript. It says what hooks see when a worktree is made and when the guard refuses. It also covers which spelling gives each base, and how sidekick's and the work repo's gates behave in a worktree.

## Served

The `parallel-sessions` design, planned as #282 to #291, with #266 and #267.
