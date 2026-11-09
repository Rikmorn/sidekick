# sk-* Memory

A session writes only what it owns in the shared memory store, and reads the rest. Sessions of many repos write the store at once. The store's `README.md` gives its layout, and what a search leaves out.

## Where a session writes

- **Its own record,** `sessions/<date>-<session id>.md` in its repo folder. One session writes it, so no other write collides with it.
- **Its repo folder,** the memory folder Claude Code's memory prompt names.
- **Its family folder,** the repo folder's parent, unless that parent is the store's root, where the store's `README.md` sits. The family's repos share it.

Never write another repo's folder, whose own sessions keep its index and its state. A fact about a sibling repo goes in the family folder, where every repo in the family can find it.

## Workstreams

A workstream is one objective, across however many sessions, branches, and repos it takes. Each has one file, so every session on it reads the same state:

- `metadata.kind` is `workstream`, and `metadata.status` is `open` or `closed`.
- `metadata.branches` lists its branches as one string of `<repo>:<branch>` pairs joined by `, `, so a session on one of those branches finds it.
- Its sections are State, Next steps, Key files, and Context. State and Next steps are the handoff between sessions, so keep them current. Move what happened into session records.
- A session record's `metadata.kind` is `session`, `metadata.session` is its session id, and `metadata.workstream` names the workstream it served.
- A worker writes only its own record. The session that lands the worker's work folds the record into the workstream.

The memory hook prints the record's path and the matched workstream at session start. Save with `sk-save`.

A workstream that spans repos lives in the family folder.

## The index

Claude Code's memory prompt gives each memory file one pointer line in `MEMORY.md`. Keep the index short by keeping files few:

- A fact joins the file it belongs to: its workstream, the reference file for what outlasts any workstream, the support file, or the script catalogue. Prefer a new file only for a new workstream, because each file adds a line every session loads.
- So the index lists the open workstreams, and points to those three files and to one archive file.
- When a workstream closes, set `metadata.status: closed`, since an `open` one keeps appearing in the menu and in the title and branch matches. Its pointer moves to the archive file. Its file stays put, since searches leave the store's `archive/` folder out.
- A session that writes a family file points to it from the family's `MEMORY.md` and from its own repo's index.
- Session records take no pointer, since a line per session would outgrow any cap.

Keep the index under the line cap the user's instructions set, and within the lines Claude Code's prompt says it loads.

## One home per fact

A fact kept in two places goes stale in one of them, and the next session trusts the stale copy. Prefer the repo's ADR, design, or tracker for a team-facing decision, because colleagues read those and not this store. Memory then points to it.

## Procedures, scripts, and support

- A procedure that repeats belongs in a skill, which Claude Code loads when its task comes up. A skill is a repo file, which the store does not own. Suggest one to the operator rather than writing it, and keep the procedure in memory until it exists.
- The script catalogue says what each one-off script does, how it runs, and when it last ran. A later session can then run it again, and judge whether it still fits.
- Production issues and support work go in the support file, so the next incident starts from what the last one found.
- When the repo has a family, the support file and script catalogue live in the family folder, since support and scripts span its repos. Otherwise they live in the repo folder.

## Scopes

The operator's own facts stay in the user-level rules, which load in every repo. A folder in the store reaches only the repos it serves. Family and repo facts go in the store.

A new fact about the operator goes in the repo folder like any other, with its date and origin. Claude Code's prompt already saves `user` and `feedback` memories there. The user-level rules change only on the operator's review, so tell the operator when the fact may belong there.

## Writing

- Every item carries its date, its scope, and its origin: the session, issue, or source it came from. A later reader judges by them whether it still holds.
- Every file but a session's own record is shared. Change a shared file by targeted edits, never by rewriting it whole: a rewrite regenerates it from one session's view and drops what others added.
- Keep the session's current directory in the repo, and reach the store by absolute path. `sidekick memory link` asks you to list the store in `permissions.additionalDirectories`, and Claude Code keeps a `cd` that ends inside a listed directory. The repo's hooks, such as a formatter, then run from the store and rewrite its files.
