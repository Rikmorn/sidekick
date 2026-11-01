# sk-* Memory

A session writes only what it owns in the shared memory store, and reads the rest. Sessions of many repos write the store at once. The store's `README.md` gives its layout, and what a search leaves out.

## Where a session writes

- **Its own record,** `sessions/<date>-<session id>.md` in its repo folder. One session writes it, so no other write collides with it.
- **Its repo folder,** the memory folder Claude Code's memory prompt names.
- **Its family folder,** the repo folder's parent, unless that parent is the store's root, where the store's `README.md` sits. The family's repos share it.

Never write another repo's folder, whose own sessions keep its index and its state. A fact about a sibling repo goes in the family folder, where every repo in the family can find it.

## Workstreams

A workstream is one objective, across however many sessions, branches, and repos it takes. Each has one file, so every session on it reads the same state:

- A status line says whether it is open or closed.
- Its front matter lists its branches in each repo, so a session on one of those branches finds it.
- Its state section is the handoff between sessions. Keep it current, since the next session on the workstream starts from it.

A workstream that spans repos lives in the family folder.

## The index

Claude Code's memory prompt gives each memory file one pointer line in `MEMORY.md`. Keep the index short by keeping files few:

- A fact joins the file it belongs to: its workstream, the reference file for what outlasts any workstream, the support file, or the script catalogue. Prefer a new file only for a new workstream, because each file adds a line every session loads.
- So the index lists the open workstreams, and points to those three files and to one archive file.
- When a workstream closes, its pointer moves to the archive file. Its file stays put, since searches leave the store's `archive/` folder out.
- A file in the family folder takes its pointer in the family's own index, and in the index of each repo that uses it.
- Session records take no pointer, since a line per session would outgrow any cap.

Keep the index under the line cap the user's instructions set, and within the lines Claude Code's prompt says it loads.

## One home per fact

A fact kept in two places goes stale in one of them, and the next session trusts the stale copy. Prefer the repo's ADR, design, or tracker for a team-facing decision, because colleagues read those and not this store. Memory then points to it.

## Procedures, scripts, and support

- Prefer a skill for a procedure that repeats. Claude Code loads a skill when its task comes up, and a procedure kept in memory can go unfound.
- The script catalogue says what each one-off script does, how it runs, and when it last ran. A later session can then run it again, and judge whether it still fits.
- Production issues and support work go in the support file, so the next incident starts from what the last one found.
- When the repo has a family, the support file and script catalogue live in the family folder, since support and scripts span its repos. Otherwise they live in the repo folder.

## Scopes

The operator's own facts stay in the user-level rules, which load in every repo, while a copy in the store reaches one folder. Family and repo facts go in the store.

## Writing

- Every item carries its date, its scope, and its origin: the session, issue, or source it came from. A later reader judges by them whether it still holds.
- Every file but a session's own record is shared. Change a shared file by targeted edits, never by rewriting it whole: a rewrite regenerates it from one session's view and drops what others added.
