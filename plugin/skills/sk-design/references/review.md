# Adversarial review

A reviewer that did not write the note, and never saw the conversation behind it, looks for the reasons the recommendation is wrong. Its value comes from two things: fresh context, and evidence it checks against the repo. An opinion without evidence adds little, so every finding cites what it rests on.

## Dispatch

Dispatch one fresh general-purpose subagent through the Agent tool, on the session's model. Its prompt is the template in §The reviewer's prompt, with `<NOTE_PATH>` filled in. Send nothing else: no summary of the conversation, no word on who wrote the note, and no confidence cues such as "this looks solid". A reviewer judges text more kindly when it is told the text is liked or owned.

The reviewer returns its findings as data. The author writes them into the note; the reviewer never edits it.

## The reviewer's prompt

```text
You are reviewing a design note before a decision is taken on it. Your job is to find the strongest reasons its recommendation is wrong, so the decision is made with them in view. You are not approving the note, and there is no verdict to give.

The note is <NOTE_PATH>. Your working directory is the repository it describes. Read the note, then the code and docs it cites, and any it should have cited.

Start from a pre-mortem. Assume the recommendation was adopted, and six months later it forced a large refactor or failed in use. Work out what happened. Then look at:
- Claims the note marks verified. Re-read the lines they cite, and flag any you cannot reproduce. Name assumptions the recommendation rests on that the note does not label.
- Prior art. A library, a platform feature, or an existing instance in this repository that the note missed or dismissed too quickly.
- Options. The strongest case for the best rejected option, and an option nobody considered.
- The cost of the next change and the blast radius. Where either is understated.
- Any hack or deferred debt. Whether the note states what it costs to carry.

Constraints:
- Read-only: never edit files, branches, or git state. The author writes the note.
- Ground each finding in evidence you can show: a file:line, or a command and what it printed.
- A finding belongs under Findings only when it affects correctness, a stated requirement, or the decision. Everything else goes under Minor. An ungrounded finding goes under Minor, marked unverified.
- A sound note can yield few findings. Report what you find, and do not pad the list.

Return this, and nothing after it:

## Findings
1. <the finding, in one or two sentences>
   Evidence: <file:line, or the command and what it printed>
   Affects: correctness | a requirement | the decision, because <one line>

## Minor
- <the finding> (<evidence, or "unverified">)
```

## Answering

In the note's Review section, answer each finding under Findings:

- **Accepted:** say what changed in the note.
- **Rejected:** give the reason, held to the same evidence standard as the finding.

List the minor findings as they came, and answer one only when you act on it. The operator sees each challenge beside its answer, and their objections outrank the reviewer's.

Run one round. Run a second only when the answers changed the recommendation, and stop after it, naming anything still open.
