# control-centre

What can Claude Code's extension and session surface do for running many sessions at once? How can it scope what each session loads and remembers, and show all of it in one place? What already exists?

## Reports

- [2026-10-12-claude-code-surface.md](./2026-10-12-claude-code-surface.md): mods, background sessions, the context budget, profiles, status lines, GSD's footprint, and Ralph, with probes run on the operator's machine.
- [2026-10-12-memory-and-context.md](./2026-10-12-memory-and-context.md): auto memory's mechanics, the operator's memory measured, Anthropic's guidance, memory tools, and writing on memory hygiene.
- [2026-10-12-probes.md](./2026-10-12-probes.md): the design's three assumed constraints probed, `autoMemoryDirectory` in a profile, two background writers on one memory folder, and an audit of sidekick's memory folder.
- [2026-10-12-extension-and-loop-fit.md](./2026-10-12-extension-and-loop-fit.md): `skill.prompt` against ADR-0009, ADR-0010, and ADR-0011, probed on superpowers' skills; what fits each kind of pause #140 names; and background sessions' git defaults.
- [2026-10-13-profile-launch-probes.md](./2026-10-13-profile-launch-probes.md): what a profile launch rests on. It covers `--settings` and a dropped object, the clean room under `$HOME`, a folder as `--add-dir`, what hides `AGENTS.md`, `doctor`, and background respawn. It ends with a bench and a steering test.
- [2026-10-14-repo-profiles-and-switching-probes.md](./2026-10-14-repo-profiles-and-switching-probes.md): what #213 rests on. It covers a profile folder stored in a repo, and switching a profile by resume. It also covers why a session cannot relaunch itself, plugin dependencies read through `plugin list`, and the session id after `/clear`.
- [2026-10-14-switch-bench-and-folder-probes.md](./2026-10-14-switch-bench-and-folder-probes.md): what #213's bench measured across a resume, MCP server instructions and hooks among it. It also covers where a resume should start, and `plugin list` under a profile's flags.
- [2026-10-14-dispatched-worker-probes.md](./2026-10-14-dispatched-worker-probes.md): what #206's dispatched workers rest on. It covers the push block and the worktree in a background session, messages across permission modes, cleanup with `claude rm`, and `sk-worker` as a first prompt.
- [2026-10-14-dispatched-worker-bench.md](./2026-10-14-dispatched-worker-bench.md): #206's verbs run end to end, from brief to `finish`. It covers the deny rule's spellings, `--settings` against the project layer, how a finished worker lists and stops, and `--plugin-dir` beside an installed sidekick.
- [2026-10-15-mod-foundation-probes.md](./2026-10-15-mod-foundation-probes.md): what #207, #208, and #225 rest on. It covers what `validate` and `claude plugin test` catch, a headless module, where a label and a status line draw, and a variable a module sets. It also covers the compaction point across models, a hook's `systemMessage`, and the files the engine writes.
- [2026-10-15-desk-probes.md](./2026-10-15-desk-probes.md): what #210 rests on. It covers the session listing state by state, its polling cost, and the `Notification` hook's reach. It also covers attach, `$.store` across sessions, where a band and a pane draw, and deleting unpushed work. It ends with a survey of mods that show other sessions.
- [2026-10-16-board-band-probes.md](./2026-10-16-board-band-probes.md): what #211's band reads at session start. It covers a settings hook's SessionStart text seen from a mod, JSON against plain stdout, the order of the two start events, identical matchers, and `classic.PostToolUse` on Bash.
- [2026-10-16-view-placement-probes.md](./2026-10-16-view-placement-probes.md): where #233's and #239's views can draw. It covers rows a mod draws under the prompt, and what a docked pane narrows. It also covers a plugin's status line and a footer label, on the main screen and in fullscreen.

## Served

The `control-centre` design, planned as R9's #146, #203, #204, #205, #206, #207, #208, #209, #210, #211, #213, #214, #215. The `loop` design, not started.
