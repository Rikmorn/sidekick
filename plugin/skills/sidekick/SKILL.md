---
name: sidekick
description: What the sidekick bundle is, what it depends on, and how to deliver its rules into a repo. Use when asked what sidekick is, how to install or update it, or where the sk-* rules come from.
user-invocable: true
---

# sidekick

sidekick is a plugin bundle, not a harness. Superpowers and the official code-review plugin do the design, plan, execute, and review work; they install as this plugin's dependencies. sidekick adds three things around them: the house guidance (the `sk-*` rules), a project-management layer on GitHub for the repos where the operator owns the tracking, and design-side extensions the ecosystem lacks. ADR-0009 in the sidekick repo records why.

## The rules

The portable rules ship inside the plugin under `rules/`. Claude Code reads rules from a repo's `.claude/rules/` or from the user-level `~/.claude/rules/`, and a plugin cannot write there by itself, so delivery is one explicit command:

```
sidekick rules install --project   # writes sk-*.md into this repo's .claude/rules/
sidekick rules install --user      # writes them into the user-level rules directory
sidekick rules check --project     # reports drift and overlap; changes nothing
```

`sidekick` is on the Bash tool's PATH whenever the plugin is enabled. The command writes and removes only files named `sk-*.md`. That prefix is sidekick's namespace: a hand-written file under it is removed on the next install if the plugin does not ship it, so keep your own rules out of the `sk-` prefix. Other rule files are never edited; when one overlaps an sk rule by heading or opening sentence, the check reports it and leaves the decision to you.

## What is coming

The PM layer (session-start pickup, filing, closing with a learning record, milestone to release) and the design-side extensions (a design pass before brainstorming, a sealed review after a spec, a goal-backward verdict after a build, decision capture) arrive in later releases. Each one runs beside a superpowers skill; none replaces one.
