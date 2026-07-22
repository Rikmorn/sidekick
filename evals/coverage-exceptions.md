# Coverage exceptions — the unmeasured-because ledger

`sidekick graph coverage` lists every agent and skill with no eval case naming it
as a subject. Most of those are simply not measured yet. Some are genuinely hard
or not worth measuring — and that judgement should be **stated, not implied by
silence**, which is what this file is for.

**Format** — one entry per line, subject ID and reason:

```
- agent:sk-example — reason this subject is not measured
```

An entry here does not make a subject covered. It records *why* it is not, so a
reader can tell a deliberate exception from an unnoticed hole.

## Entries

<!-- No entries yet: every unmeasured subject currently reads as unmeasured
     without a stated reason, which is the honest starting state. -->
