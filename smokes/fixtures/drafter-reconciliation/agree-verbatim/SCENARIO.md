# Fixture: agree-verbatim (default path preserved)

**Dispatch:** sk-rfc-drafter, fresh (no feedback).

**Inputs:**
- slug: `shortcut-palette`
- scope_statement: "Add a discoverable cmd+k shortcut palette to the admin UI."
- complexity: medium
- architecture_section: a `## Architecture` whose `### Recommendation` is "React context provider + useShortcut hook" with one `### Alternatives considered` (global event listener — rejected).
- analogues: 2 entries from the admin shell.
- synthesis_output: present (UI shortcut libs).

**Expected:** `## Architecture` in the draft is the `architecture_section` inserted **verbatim** — no paraphrase, no rewrite, no demotion. Decisions derive from it and agree. PASS = byte-identical Architecture body + consistent Decisions. This proves g_4 (no regression to default-verbatim).
