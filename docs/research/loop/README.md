# loop

How can a repo define a long-lived Claude Code loop with a role and a mandate? How does one command start it, and what keeps it running past restarts and the seven-day cron expiry?

## Reports

- [2026-11-08-loop-probes.md](./2026-11-08-loop-probes.md): what Claude Code 2.1.319 does with `/loop`, background sessions, `--agent` from a local plugin, a respawn, and an idle unattached session.
- [2026-11-11-native-facts-recheck.md](./2026-11-11-native-facts-recheck.md): the docs' and the binary's loop facts re-read on 2.1.322, with quotes, and what changed from the probes' reading.
- [2026-11-11-community-loop-tooling.md](./2026-11-11-community-loop-tooling.md): community and official tooling for scheduled and long-lived agent loops, each judged for use, borrowing, or rejection. It closes with documented practice on mandates and graduated autonomy.

## Served

The `loop` design, at `docs/designs/loop/`, for R11. PM has not planned it yet, so no issue is named here.
