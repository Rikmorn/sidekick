# control-centre

What can Claude Code's extension and session surface do for running many sessions at once? How can it scope what each session loads and remembers, and show all of it in one place? What already exists?

## Reports

- [2026-10-12-claude-code-surface.md](./2026-10-12-claude-code-surface.md): mods, background sessions, the context budget, profiles, status lines, GSD's footprint, and Ralph, with probes run on the operator's machine.
- [2026-10-12-memory-and-context.md](./2026-10-12-memory-and-context.md): auto memory's mechanics, the operator's memory measured, Anthropic's guidance, memory tools, and writing on memory hygiene.
- [2026-10-12-probes.md](./2026-10-12-probes.md): the design's three assumed constraints probed, `autoMemoryDirectory` in a profile, two background writers on one memory folder, and an audit of sidekick's memory folder.
- [2026-10-12-extension-and-loop-fit.md](./2026-10-12-extension-and-loop-fit.md): `skill.prompt` against ADR-0009, ADR-0010, and ADR-0011, probed on superpowers' skills; what fits each kind of pause #140 names; and background sessions' git defaults.
- [2026-10-13-profile-launch-probes.md](./2026-10-13-profile-launch-probes.md): what a profile launch rests on. It covers `--settings` and a dropped object, the clean room under `$HOME`, a folder as `--add-dir`, what hides `AGENTS.md`, `doctor`, and background respawn. It ends with a bench and a steering test.
- [2026-10-14-repo-profiles-and-switching-probes.md](./2026-10-14-repo-profiles-and-switching-probes.md): what #213 rests on. It covers a profile folder stored in a repo, and switching a profile by resume. It also covers why a session cannot relaunch itself, plugin dependencies read through `plugin list`, and the session id after `/clear`.

## Served

The `control-centre` design, planned as R9's #146, #203, #204, #205, #206, #207, #208, #209, #210, #211, #213, #214, #215. The `loop` design, not started.
