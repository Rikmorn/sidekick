# References — promoted specs & provenance

Specs that have **shipped** — promoted out of `../backlog/` once executed and kept as the provenance record for the change: *what* was applied, *why*, and the sources behind each rule. This is where "want to know more" goes, so the shipped artifacts themselves (prompts, rules) can stay lean and citation-free.

Distinct from siblings: `../adr/` = decisions + revisit triggers; `../research/` = the underlying evidence reports; `../backlog/` = specs **not yet** shipped.

**Convention:** a backlog item moves here (via `git mv`, history preserved) when its work lands; its `Status:` line is updated to **Shipped** with the implementing commit(s).

## Index
- [sk-agent-prompts-revisions](./sk-agent-prompts-revisions.md) — the 7 surgical edits to `.claude/rules/sk-agent-prompts.md` — **Shipped (E1, commits `3c5a340` + `d972545`)**
