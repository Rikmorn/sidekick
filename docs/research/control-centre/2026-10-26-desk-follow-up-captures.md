> Research for #240, the usage guide. A subagent ran it on 2026-10-26 for the operator's #240 session, on Claude Code 2.1.311 (`claude --version`). It ran sidekick at `b9b39b0` on `milestone/r9-control-centre`, loaded with `--plugin-dir`. It recaptures the desk inline, docked, and docked as a tab beside the board, after `9bb60d7` and `6c9d04e` changed the context bar and the desk's cut texts. It is a record and takes only the edits that `sk-pm-conventions.md` §Placement test (tense) lists.

# Captures: the desk's context bar and cut texts, live (2026-10-26)

`9bb60d7` gave the desk's context bar one cell per level, each in its own colour, and gave the number the last lit cell's colour. With `6c9d04e`, every cut text in the desk ends in `…`. The guide's `desk-inline`, `docked`, and `tabs` screens predated both. This run recaptured those three screens in the scenario of the 2026-10-26 board pane captures record, and the guide was redrawn from them. Each capture was saved as plain text and as styled runs, outside the repository.

Where this record says what a doc says, it quotes `docs/reference/LOOP.md` and `docs/reference/USAGE.md` at `b9b39b0`.

Provenance grades:

- **Measured:** run on 2026-10-26 on Claude Code 2.1.311, with the capture or log named.
- **Read:** read on 2026-10-26 in this repository's source at `b9b39b0`, with the line named.
- **Inferred:** reasoned from measured or read facts, as the text says, and not run.

The mods were last checked on Claude Code 2.1.310 (`.claude-code-version`), one build behind the one this run used.

## Summary

| Screen | The bar | The number's colour | The `…` | Capture |
|---|---|---|---|---|
| Inline, 100 by 40, `demo-main` | Five rows. Four sessions under 65% light one `success` cell, `4eba65`, then three `▱` in `subtle`, `505050`. `sidekick-3f`, at 71%, lights `success` then `warning`, `ffc107` | `success` for the four, `warning` for `688k/71%` | Four work cells cut, each ending in `…` | 01 |
| Docked, 160 by 40, `demo-main` | The same five sessions, cells, and colours | The same | Four details cut, each ending in `…` before the profile or at the pane's edge | 02 |
| Two panes docked as tabs, 160 by 40, `board-cap` | Six rows, adding `demo-main` at 6%: the same cells and colours | The same | The same four details, each ending in `…` | 03 |

The docs agree with every screen on these three points (measured, the styled runs of 01 to 03):

- LOOP.md's §The desk reads "The first cell is always lit in `success`. The others light from 65% in `warning`, from 75% in `claude`, and from 85% in `error`. An unlit cell is `▱` in `subtle`."
- LOOP.md reads "The text takes the tone of the last lit cell, so `success` under 65%". At 71%, `688k/71%` draws in `warning`.
- LOOP.md reads "Every text cut to fit ends in `…`". USAGE.md reads "A text cut to fit ends in `…`". No desk text in the three captures stops short without one.

There is no mismatch. One wording point: USAGE.md calls an unlit cell "a dim `▱`". The cell draws in `subtle`, a dim grey, without SGR 2 (measured, the styled runs).

Not tested:

- a lit `claude` or `error` cell, since no session reached 75%;
- the text alone in a row with no room for the bar, and the tokens alone with no limit;
- a cut stacked name, a row cut to the pane's width, and a cut hint;
- ctrl+x Tab in `board-cap`, which the screens needed none of;
- terminal sizes other than 100 by 40 and 160 by 40, and the classic screen.

## Findings

### The bar and the number

**A session under 65% lights one green cell, and its number is green.** Each such row reads `▰▱▱▱` then, say, `62k/6%`. The `▰` and the number draw in `4eba65`, and the three `▱` in `505050` (measured, 01 to 03). This matches `levelOf` (read `plugin/hooks/desk/look.ts:58-66`).

**A session past 65% lights a second cell, and the number takes its colour.** `sidekick-3f`, the operator's session, read `▰▰▱▱  688k/71%` in every capture. Its cells draw `4eba65` then `ffc107`, and the number `ffc107` (measured, 01 row 27, 02 row 15, 03 row 17). It was the only session past 65%. The guide's screens show it as `writer-main`.

### The cut texts

**Inline, each cut work cell ends in `…` at its column.** In 01, the four cut cells are:

```text
□ other-main     needs you  The question didn't go through: you…
├  ● wait-perm      needs you  approve Read: /private/tmp/claude-5…
└  ◐ fan-out        working    waiting on orchestrator reply and s…
– bench          working    background sleep 600 running (task …
```

**Stacked, each cut detail ends in `…`, and the profile stays at the right.** 02 and 03 cut the same four texts. Two keep `worker` after the mark, `approve Read: /private/tmp/claude-501/-U… worker`, and two end at the pane's edge (measured, 02 rows 3, 5, 9, 11). The 2026-10-26 board pane captures record found two stacked cuts bare. Since `9bb60d7` and `6c9d04e`, they end in `…`.

### The rest of each screen

**The inline band again gave way to Claude Code's `↓ 2 more` row.** The pane took rows 20 to 31 of 40, and row 32 read `↓ 2 more` with `[-]` (measured, 01). That fits the guide's legend for that screen.

**`other-main` drew as a main this time.** Its backgrounded fork, `453603e2`, published a key with `role: main`, so the inline desk drew `□ other-main` with a bar (measured, `store-01.json`, 01). The board pane captures record found a fork that published no key and drew `–`. Which way a fork goes was not traced; #250 tracks the case with no key.

**`other-main`'s work line is a model's reply, not its question.** Haiku put the question in a dialog, and the run chose **Chat about this**. The turn then ended `The question didn't go through: you declined the …`, in `warning` (measured, 02 row 3). The guide's screens carry that line.

**The dock kept its width, and the grip stayed dim.** The grip stood at column 107 in 02 and 03, and `dockColumns` read 53 before and after. The grip drew dim in 03, with the keys at the prompt (measured).

## The guide

The `desk-inline`, `docked`, and `tabs` screens in `docs/reference/control-centre-guide.html` were redrawn from 01, 02, and 03. Each legend kept its numbers, and each mark sits on the text it named before. Inline legend 2 said `other-main` reads `–`. It now reads "`other-main` is another main, so it reads `□`", as 01 shows. The redaction swapped the operator's session names and the scratch paths for neutral text of the same length.

## Cleanup

`claude stop`, then `claude rm`, removed the run's four background sessions: `b7b47b31` (`wait-perm`), `b95a0197` (`fan-out`), `453603e2` (`other-main`'s fork), and `797c523d` (`bench`). `claude rm` took both worktrees and their branches, and the scratch repositories were deleted. The three interactive sessions, `demo-main`, `other-main`, and `board-cap`, ended through the driver.

The listing after cleanup matched the one taken before the first session, with no new, gone, or changed rows. `claude daemon status` read `not running`, as before, and no driver remained. Sidekick's store held only the operator's key. This repository changed only by this record, its index line, and the guide.

## Commands

```sh
claude --version
claude agents --json --all
uv run --with pyte python -I <driver> <spec>
sidekick profile argv main
sidekick worker dispatch <brief> --permission-mode default --plugin-dir <plugin>
sidekick worker dispatch <brief> --permission-mode bypassPermissions --plugin-dir <plugin>
claude --model haiku --plugin-dir <plugin> -n other-main
claude --bg --model haiku --plugin-dir <plugin> -n bench -- 'Run sleep 600 in Bash, then say done.'
claude --plugin-dir <plugin> --model haiku -n board-cap
python3 -I <guide update script> <screens> docs/reference/control-centre-guide.html
claude stop <id>
claude rm <id>
claude daemon status
```

`sidekick worker dispatch` ran inside `demo-main`, through its model's Bash tool. Every other command ran from the driver or a shell.
