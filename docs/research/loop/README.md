# loop

How can a repo define a long-lived Claude Code loop with a role and a mandate? How does one command start it, and what keeps it running past restarts and the seven-day cron expiry?

## Reports

- [2026-11-08-loop-probes.md](./2026-11-08-loop-probes.md): what Claude Code 2.1.319 does with `/loop`, background sessions, `--agent` from a local plugin, a respawn, and an idle unattached session.
- [2026-11-11-native-facts-recheck.md](./2026-11-11-native-facts-recheck.md): the docs' and the binary's loop facts re-read on 2.1.322, with quotes, and what changed from the probes' reading.
- [2026-11-11-community-loop-tooling.md](./2026-11-11-community-loop-tooling.md): community and official tooling for scheduled and long-lived agent loops, each judged for use, borrowing, or rejection. It closes with documented practice on mandates and graduated autonomy.
- [2026-11-12-loop-probes.md](./2026-11-12-loop-probes.md): the loop design's unknowns, measured on 2.1.322 in background probe sessions under `dontAsk`. It covers permissions, cron jobs across a respawn and a cron-fired clear, the sandbox, MCP scoping, messaging a stopped worker, and `finish` after a landing. It names the stances the answers break, and the rows left for an operator-present run.
- [2026-11-12-loop-probes-operator-run.md](./2026-11-12-loop-probes-operator-run.md): the rows that day's probes left for the operator, measured that evening. They cover a cron job across compactions and a typed `/clear`, a background session's push, and a deny rule in managed settings against a mod.

## Served

The `loop` design, for R11, and the issues it became at R11's Opening on 2026-11-12: #360 to #367, and #377.
