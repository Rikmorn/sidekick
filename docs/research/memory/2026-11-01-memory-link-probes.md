> Research for #271, `sidekick memory link`. Run 2026-11-01 by Claude for the operator, on Claude Code 2.1.316, in interactive sessions driven through tmux. The CLI under test was `plugin/bin/sidekick` as built at commit `3919395`. #274, #276, and #278 rest on these results. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# What Claude Code does with a linked repo (2026-11-01)

`sidekick memory link` moves a repo's auto-memory into a store folder and sets `autoMemoryDirectory` in the main checkout's gitignored `.claude/settings.local.json`. Unit tests cover `link` itself. These probes check what Claude Code does with the result, in interactive sessions. The design for #271 rested on four assumptions about that:

- **A1.** A trusted interactive session honours the local key, in the main checkout and in each kind of worktree.
- **A2.** Claude Code keeps the key when it saves a permission approval into the same file.
- **A3.** `--settings` carries the key into an interactive session, so a profile that leaves out `local` still finds the store.
- **A4.** A running session keeps the folder it started with, and recreates the default folder on its next memory write.

All four held. The design also read Claude Code's binary as honouring the local key only in a trusted workspace. An interactive session in an untrusted folder never started, so no session could run without trust.

## Results

| Probe | Verdict |
|---|---|
| Main checkout, trusted | A1 holds: every request's prompt names the store, and the writes land there |
| Sibling worktree, made with `git worktree add ../a1-wt` | A1 holds: it reads the main checkout's memory back and writes to the store |
| Nested worktree at `.claude/worktrees/nested` | A1 holds, as for the sibling |
| Untrusted folder | No session runs: the trust dialog blocks it, and declining exits |
| A permission approval saved into the local file | A2 holds, for a seeded file and for a file holding only the key |
| A session open in the repo when `link` runs | `link` refuses and names the session; `--force` passes over it and names it again |
| That session after `link --force` | A4 holds: it keeps the default folder, and recreates the folder on its next write |
| `link` run from a session in the repo | `link` passes over that session and tells it to restart; its prompt keeps the default folder |
| Profile whose `settingSources` leaves out `local` | A3 holds: the prompt names the store, and the writes land there |
| Clean-room profile, leaving out `user` and `local` | A3 holds, and its writes to the store ask no permission |

- **Measured:** every session that reached a prompt was trusted. Both worktrees started without a trust dialog once the main checkout was trusted. `~/.claude.json` lists `a1` but neither worktree, so the worktrees took its trust without an entry of their own.
- **Measured:** no session that had the key created a default `memory/` folder. Each session without it created one at start. The exploratory session and the control that left out `local` left theirs empty.
- **Measured:** after `link --force`, the running session went on writing to the default folder, recreating it. It wrote the new memory, found its earlier files gone, and rewrote them from its context. So the folder that came back held copies of files already in the store.
- **Measured:** Claude Code adds `node_type`, `originSessionId`, and `modified` to a memory file's front matter when a session writes it. The Write calls carried none of those fields, and the Read results show all three. A rewritten file therefore never matches its earlier copy byte for byte, and `link`'s re-run lists such copies as differing.
- **Measured:** the session that ran `link` itself read the report, then wrote its next memory into the store by hand, against its own prompt. Claude Code asked permission for that Read and for each write. The store was neither the session's memory folder nor an allowed directory.
- **Not tested:** a sibling worktree of a main checkout that was never trusted.
- **Not tested:** where Claude Code keeps the answer "Yes, and always allow access to `<folder>` from this project". It left the local file unchanged, and finding it would mean reading more of `~/.claude.json` than its project list.

## Method

The probe root was `/private/tmp/sk-memprobe.xKwHjA`, made with `mktemp -d /tmp/sk-memprobe.XXXXXX`. Every fixture repo, worktree, profile, and log lived under it. The store was `<root>/store`, set through `SIDEKICK_MEMORY_STORE` in every shell and session that ran `link`. Each fixture repo tracks `.claude/settings.json` holding `{}`, as the operator's repos track files under `.claude/`. Each ignores `.claude/settings.local.json` through `.git/info/exclude`.

Sessions ran with these choices:

- `--model haiku`. The folder a session uses is the harness's choice, not the model's, so the cheapest model measures it as well.
- `--permission-mode default`, so each permission dialog showed. The operator's default is auto mode, which hides them.
- `--session-id <uuid>`, so each transcript's path was known before the session started.
- Their own tmux socket, started from an emptied environment. The launching session's id and sidekick's markers therefore did not reach them.

User settings, plugins, and hooks loaded as usual; only the clean-room profile left out the user settings. The trust dialog highlights "No, exit", so the trusted cases answered with Down, then Enter.

Scoring reads the transcript at `~/.claude/projects/<key>/<session id>.jsonl`, never the pane. The transcript stores the system prompt: each main-thread `api-request` entry names a shape by hash, and the `api-request-shape` entry holds the prompt. Its memory section reads "You have a persistent file-based memory at `<folder>`." That line is the harness's choice, read without asking the model. The score also reads which files the Write and Edit calls targeted, and the model's answer to the read prompt. The pane only drove the sessions. The untrusted probe never wrote a transcript, so its evidence is the files it did not create.

The two prompts follow the 2026-10-31 probes' pattern:

- **Save:** "Save this to your auto-memory for future sessions, then reply with the absolute path of the file you wrote: the probe value for `<probe>` is `<value>`."
- **Read:** "First state the absolute path of your auto-memory directory exactly as your instructions give it, or say none is given. Then answer from your memory only, without searching files or running tools: which probe values do you know?"

## A1: the main checkout and two worktrees

**Setup.** `bash setup.sh <root>` built the repo `a1`, its sibling worktree `a1-wt`, and its nested worktree `a1/.claude/worktrees/nested`, then linked `a1`:

```text
Set autoMemoryDirectory to /private/tmp/sk-memprobe.xKwHjA/store/a1 in /private/tmp/sk-memprobe.xKwHjA/a1/.claude/settings.local.json
No default memory folder at /Users/roberto.sousa/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a1/memory: nothing to copy or archive.
```

`bash a1.sh <root>` then ran one session in each checkout, in order: the read prompt, then the save prompt.

**Evidence.**

| Session | Trust dialog | Requests whose prompt names `store/a1/` | Read back | Wrote |
|---|---|---|---|---|
| `a1` | Shown, answered | 4 of 4 | Nothing, correctly | `store/a1/probe-values.md`, `store/a1/MEMORY.md` |
| `a1-wt` | None | 4 of 4 | teal | Edits to both files in `store/a1/` |
| `a1/.claude/worktrees/nested` | None | 4 of 4 | teal and otter | Edits to both files in `store/a1/` |

The nested session's answer began "The auto-memory directory is `/private/tmp/sk-memprobe.xKwHjA/store/a1/`". It went on: "I know two probe values, both from the `MEMORY.md` index that was loaded into my context at session start." No memory write asked permission. Afterwards none of the three checkouts had a `memory/` folder under `~/.claude/projects/`, and `~/.claude.json` listed `a1` alone.

**Verdict.** A1 holds in all three checkouts. The worktrees took the main checkout's local key, as headless sessions did on 2026-10-31.

## C12: an untrusted folder

**Setup.** `setup.sh` linked the repo `untr`, which no session had opened. `bash untrusted.sh <root>` started a session there.

**Evidence.** The session showed "Quick safety check: Is this a project you created or one you trust?", with "❯ No, exit" highlighted. After 20 seconds unanswered, `~/.claude/projects/` had no folder for `untr`. Enter on the highlighted answer ended `claude`, and the tmux session closed. Afterwards there was still no project folder or transcript, `store/untr/` held only the marker, and `~/.claude.json` did not list `untr`.

**Verdict.** In 2.1.316 an interactive session cannot run in an untrusted folder, so the trust gate on the local key is never reached interactively. Each repo needs its trust dialog answered once. After that, both kinds of worktree started without one (§A1: the main checkout and two worktrees).

## A2: a permission approval saved into the local file

**Setup.** `setup.sh` seeded `a2/.claude/settings.local.json` with an `env` entry and one allow rule, then linked `a2`:

```json
{
  "env": {
    "SK_PROBE_KEEP": "kept"
  },
  "permissions": {
    "allow": [
      "Bash(true)"
    ]
  },
  "autoMemoryDirectory": "/private/tmp/sk-memprobe.xKwHjA/store/a2"
}
```

A session in `a2` was asked to run two commands, and each dialog was answered by hand through `step.sh`. `touch a2-probe.txt` offered "Yes, and always allow access to `/private/tmp/sk-memprobe.xKwHjA/a2` from this project". That answer left the file unchanged, with its modification time from before the session started. `node -e "console.log(6*7)"` offered "Yes, and don't ask again for: `node *`", which was chosen. `bash a2-keyonly.sh <root> a1` then ran that second step in `a1`, whose file held only the key.

**Evidence.** The seeded file's diff after the approval:

```text
7c7,8
<       "Bash(true)"
---
>       "Bash(true)",
>       "Bash(node *)"
```

The key-only file after the approval:

```json
{
  "autoMemoryDirectory": "/private/tmp/sk-memprobe.xKwHjA/store/a1",
  "permissions": {
    "allow": [
      "Bash(node *)"
    ]
  }
}
```

Both sessions' prompts named their store folder in every request.

**Verdict.** A2 holds. Claude Code added the rule and kept every other entry, its order, the two-space indent, and the final newline.

## A session open when `link` runs, and A4

**Setup.** `bash a4.sh <root>` started a session in the repo `a4` before any link. That session saved "amber" into the default folder. The script then ran `link`, then `link --force`. Next it had the running session save "plum" and answer the read prompt. Then it ran `link` again with the session closed, and opened a fresh session.

**Evidence.** With the session open, `link` refused:

```text
link refused, and wrote nothing:
- Other sessions are open in the repo: a4-9e in /private/tmp/sk-memprobe.xKwHjA/a4. Each keeps writing to /Users/roberto.sousa/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory until it restarts. Close them and run link again, or run again with --force: sidekick memory link /private/tmp/sk-memprobe.xKwHjA/a4 --force
```

`link --force` copied both files, set the key, moved the default folder to `archive/default-folders/-private-tmp-sk-memprobe-xKwHjA-a4-2026-11-01`, and committed at 22:57:31 UTC. It then reported:

```text
Passed over with --force: a4-9e in /private/tmp/sk-memprobe.xKwHjA/a4. It keeps writing to /Users/roberto.sousa/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory until it restarts; run link again afterwards to archive what it wrote.
```

All 8 of the running session's requests named the default folder, the 5 sent after that commit included. Its writes after the link, trimmed:

```text
Write ~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory/memprobe-a4-after.md
Edit  ~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory/MEMORY.md   -> "File does not exist."
Write ~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory/memprobe-a4-before.md
Write ~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory/MEMORY.md
```

Its answer to the read prompt named `~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a4/memory/`. The second `link` moved the folder that came back to an archive folder ending `-2026-11-01-2`. It listed all three files as differing from the store or missing there, for a merge by hand. The copy of `memprobe-a4-before.md` differed from the store's only in its `modified` line. The fresh session's prompt named `store/a4/`, and it knew amber alone.

**Verdict.** The refusal and `--force` behave as designed. A4 holds: the running session kept its folder, and its next write recreated it.

## `link` run from a session in the repo

**Setup.** `bash self.sh <root>` started a session in the repo `self`, which saved "sage" into the default folder. The session then ran `node <checkout>/plugin/bin/sidekick memory link .` through its Bash tool, approved once. Last, it saved "rue".

**Evidence.** `link` linked the repo and passed over the session it ran in, so the session's id reached the Bash tool. Its report, trimmed:

```text
Moved /Users/roberto.sousa/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-self/memory to /private/tmp/sk-memprobe.xKwHjA/store/archive/default-folders/-private-tmp-sk-memprobe-xKwHjA-self-2026-11-01
Committed link's paths in the store as "link self"
This session (self-27 in /private/tmp/sk-memprobe.xKwHjA/self) keeps reading and writing /Users/roberto.sousa/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-self/memory until it restarts. Restart it once the link is done.
```

All 8 requests named the default folder, the 4 after the 22:59:24 UTC commit included. For "rue", the model read `.claude/settings.local.json`, then wrote `store/self/probe-self-after.md` and edited `store/self/MEMORY.md`. Claude Code asked first each time. The store's Read offered "Yes, allow reading from `/private/tmp/sk-memprobe.xKwHjA/store/self` during this session". The writes asked "Do you want to create probe-self-after.md?" and "Do you want to make this edit to MEMORY.md?"

**Verdict.** `link` reports the running session as designed, and the harness kept that session's folder (A4). Where its later memories went was the model's choice, made from `link`'s report.

## A3: profile launches

**Setup.** `setup.sh` linked the repo `a3` and made two profiles in its repo store, `a3/.claude/profiles/`. `nolocal` sets `"settingSources": ["user", "project"]`, and `clean` sets `["project"]`. `bash a3.sh <root>` started each with the arguments `sidekick profile argv` printed, as `skp` does. For `nolocal` those were:

```text
--add-dir /private/tmp/sk-memprobe.xKwHjA/a3/.claude/profiles/nolocal
--settings {"autoMemoryDirectory":"/private/tmp/sk-memprobe.xKwHjA/store/a3","sidekick":{"profile":"nolocal"}}
--setting-sources user,project
```

`clean`'s `--settings` also carried `"permissions":{"additionalDirectories":["/private/tmp/sk-memprobe.xKwHjA/store"]}` and the `claudeMdExcludes` pair. A control session then ran with `--setting-sources user,project` and no profile.

**Evidence.**

| Session | Requests whose prompt names `store/a3/` | Read back | Wrote |
|---|---|---|---|
| `nolocal` | 4 of 4 | Nothing, correctly | `store/a3/probe-values.md`, `store/a3/MEMORY.md` |
| `clean` | 4 of 4 | The index line naming `a3-nolocal` | An edit to `store/a3/probe-values.md` |
| Control, no profile | 0 of 1; its one request named `~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-a3/memory/` | Nothing | Nothing |

Neither profile session's writes asked permission. The control left an empty default folder for `a3`.

**Verdict.** A3 holds, for both profiles. The control shows that leaving out `local` drops the key, so the profile's `--settings` is what carried it.

## Cost

Every run used Haiku. Each figure is the "Total cost" line `/cost` printed before `/exit`.

| Run | Cost (USD) |
|---|---|
| Exploratory session, `t0`, which learned the panes and the transcript format | 0.0084 |
| A1: `a1`, `a1-wt`, nested | 0.0106, 0.0102, 0.0104 |
| C12: `untr` | None: no request was sent |
| A2: `a2`, then `a1` | 0.0105, 0.0080 |
| Open session and A4: `a4` before and after, then a fresh session | 0.0163, 0.0074 |
| `link` from a session: `self` | 0.0164 |
| A3: `nolocal`, `clean`, control | 0.0106, about 0.007, 0.0073 |

`clean`'s `/cost` line was not captured. Its main-thread requests used 70% of `nolocal`'s tokens, by `tokens.sh`, which gives the estimate. The measured runs total 0.1161, and about 0.12 with the estimate.

## Sources

- The probe sessions' transcripts under `~/.claude/projects/-private-tmp-sk-memprobe-xKwHjA-*`, read on 2026-11-01. They live only on the machine that ran the probes, until Claude Code's transcript cleanup deletes them.
- The scripts' logs under `<root>/out/`, in the same temporary folder.
- `docs/research/memory/2026-10-31-auto-memory-location-probes.md`, whose method and prompts these probes follow.
- `README.md` §Memory and §Profiles, for the commands.

## Scripts

Each script sources `lib.sh` from its own folder and takes the probe root as its first argument. `SK_BIN` names the built CLI in the checkout the probes ran from. `setup.sh` ran first, then the probes in this record's order, then `final.sh` and `summary.sh`. The `a2` run began with `a2.sh <root> open`, which stops at the first dialog. `step.sh` then answered that dialog, sent the `node` prompt, and answered its dialog. `a2.sh <root> close` scored the run. `a2-keyonly.sh` runs the scored step unattended.

### `lib.sh`

```bash
#!/bin/bash
# Helpers for the `sidekick memory link` probes. Source with P set to the probe root.
# Sessions run on their own tmux socket, from an emptied environment, so no
# variable of the launching session (its id, sidekick's markers) reaches them.
: "${P:?set P to the probe root}"
SK_BIN=/Users/roberto.sousa/Documents/Projects/sidekick.r10-p5-memory/plugin/bin/sidekick
SOCK=skmemprobe
STORE="$P/store"
OUT="$P/out"
PROJECTS="$HOME/.claude/projects"
mkdir -p "$OUT"

sk() { SIDEKICK_MEMORY_STORE="$STORE" node "$SK_BIN" "$@"; }

key_of() { printf '%s' "$1" | sed 's/[^a-zA-Z0-9]/-/g'; }

# A repo that tracks a file under .claude/ and ignores its local settings
# through .git/info/exclude, as the operator's repos do.
mkrepo() { # name
  local r="$P/$1"
  git init -q -b main "$r"
  git -C "$r" config user.email probe@example.invalid
  git -C "$r" config user.name probe
  mkdir -p "$r/.claude"
  echo "# $1" > "$r/README.md"
  echo '{}' > "$r/.claude/settings.json"
  printf '.claude/settings.local.json\n.claude/worktrees/\n' >> "$r/.git/info/exclude"
  git -C "$r" add -A && git -C "$r" commit -q -m init
}

tm() { env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" PATH="$PATH" SHELL=/bin/zsh \
  TERM=xterm-256color LANG="$LANG" TMPDIR="$TMPDIR" tmux -L "$SOCK" "$@"; }

# Start an interactive session: name, cwd, session id, then claude's own arguments.
start() {
  local name=$1 cwd=$2 sid=$3; shift 3
  local cmd
  cmd=$(printf '%q ' claude --model haiku --session-id "$sid" "$@")
  tm new-session -d -s "$name" -x 220 -y 50 -c "$cwd" -e SIDEKICK_MEMORY_STORE="$STORE" "$cmd"
}

pane() { tm capture-pane -p -t "$1"; }

wait_pane() { # name regex seconds
  local i
  for ((i = 0; i < $3; i++)); do
    pane "$1" | grep -Eq "$2" && return 0
    sleep 1
  done
  echo "!! timeout waiting for /$2/ in $1"; pane "$1" | tail -25; return 1
}

say() { # name text
  tm send-keys -t "$1" -l "$2"; sleep 1; tm send-keys -t "$1" Enter
}

key() { tm send-keys -t "$1" "$2"; }

transcript() { echo "$PROJECTS/$(key_of "$1")/$2.jsonl"; } # cwd sid

# Turns end with an assistant message whose stop_reason is end_turn.
ends() { [ -f "$1" ] && jq -s '[.[] | select(.type=="assistant" and .message.stop_reason=="end_turn")] | length' "$1" || echo 0; }

wait_turn() { # transcript turns-already-ended seconds
  local i
  for ((i = 0; i < $3; i++)); do
    [ "$(ends "$1")" -gt "$2" ] && { sleep 3; return 0; }
    sleep 2
  done
  echo "!! timeout waiting for turn $(($2 + 1)) in $1"; return 1
}

# The scored lines: the user prompts, each tool call, its result, and each text reply.
score() { # transcript
  jq -r '
    if .type=="user" and (.message.content|type)=="string" then "USER: " + (.message.content|.[0:200])
    elif .type=="user" then (.message.content[]? | select(.type=="tool_result") | "RESULT: " + ((.content|if type=="array" then map(.text? // "")|join(" ") else tostring end)|.[0:400]))
    elif .type=="assistant" then (.message.content[]? |
      if .type=="text" then "TEXT: " + .text
      elif .type=="tool_use" then "TOOL: " + .name + " " + (.input|tostring|.[0:300])
      else empty end)
    else empty end' "$1"
}

READY='shift\+tab to cycle|for shortcuts|Context '
TRUST='Quick safety check'
ASKS='Do you want to'

# Start a session and trust its folder when asked; says whether the dialog showed.
open_session() { # name cwd sid [claude args...]
  start "$@"
  wait_pane "$1" "$TRUST|$READY" 60 || return 1
  if pane "$1" | grep -Eq "$TRUST"; then
    echo "[$1] trust dialog shown; answering Yes, I trust this folder"
    key "$1" Down; sleep 1; key "$1" Enter
    wait_pane "$1" "$READY" 60 || return 1
  else
    echo "[$1] no trust dialog"
  fi
  sleep 3
}

# Send one prompt and wait for its turn to end. Each permission dialog is saved
# to out/ and answered with its highlighted option, Yes for this call only.
turn() { # name transcript prompt
  local n i
  n=$(ends "$2")
  say "$1" "$3"
  for ((i = 0; i < 120; i++)); do
    [ "$(ends "$2")" -gt "$n" ] && { sleep 3; return 0; }
    if pane "$1" | grep -Eq "$ASKS"; then
      pane "$1" > "$OUT/$1-ask-$i.txt"
      echo "[$1] permission asked:"; pane "$1" | grep -E -A8 "$ASKS" | sed 's/^/    /'
      key "$1" Enter; sleep 2
    fi
    sleep 2
  done
  echo "!! [$1] turn did not end"; return 1
}

# Every folder the transcript's copies of the system prompt name as the
# auto-memory directory, with a count of the copies naming it.
memdirs() { # transcript
  jq -r '.. | strings | scan("persistent file-based memory at `([^`]+)`") | .[0]' "$1" | sort | uniq -c
}

# Per main-thread request, in order: its time and the folder its system prompt
# names. Each request cites a shape by hash; the shape entry holds the prompt.
memreq() { # transcript
  jq -s -r '
    (map(select(.type=="api-request-shape")) | map({key: .shapeHash,
      value: ((.shape | tostring | capture("persistent file-based memory at `(?<d>[^`]+)`") | .d) // "no memory section")})
      | from_entries) as $s
    | .[] | select(.type=="api-request" and .querySource=="repl_main_thread")
    | "\(.timestamp) \($s[.shapeHash] // "shape not stored")"' "$1"
}

# Each file the session's Write and Edit calls targeted.
writes() { # transcript
  jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and (.name=="Write" or .name=="Edit")) | .name + " " + .input.file_path' "$1"
}

# A folder's files, or that it is absent.
tree() { # dir
  if [ -d "$1" ]; then find "$1" -type f -not -path '*/.git/*' | sed "s|$HOME|~|; s|$P/||" | sort; else echo "absent: ${1/#$HOME/~}"; fi
}

open_sessions() { # probe root prefix
  claude agents --json --all | jq -r --arg p "$1" '.[] | select((.cwd // "") | startswith($p)) | [.sessionId, .kind, .state, .cwd] | @tsv'
}

# The session's spend as Claude Code reports it, captured from /cost.
cost() { # name
  say "$1" "/cost"; sleep 4; pane "$1" | grep -E 'Total cost' | head -1; key "$1" Escape; sleep 1
}

finish() { # name
  key "$1" Escape; sleep 1; say "$1" "/exit"; sleep 4; tm kill-session -t "$1" 2>/dev/null; true
}
```

### `setup.sh`

```bash
#!/bin/bash
# Builds the fixture repos and links those whose probes start linked:
#   bash setup.sh <probe root>
# a1: main checkout, a plain sibling worktree, a nested .claude/worktrees/ worktree (A1)
# untr: never trusted (C12)
# a2: local settings seeded with entries link does not own (A2)
# a4, self: linked during their probes, so not here
# a3: two repo-store profiles, one leaving out local, one clean-room (A3)
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"
cd "$P" || exit 1

mkrepo a1
git -C a1 worktree add -q ../a1-wt -b wt
git -C a1 worktree add -q .claude/worktrees/nested -b nested
mkrepo untr
mkrepo a2
printf '{\n  "env": { "SK_PROBE_KEEP": "kept" },\n  "permissions": { "allow": ["Bash(true)"] }\n}\n' \
  > a2/.claude/settings.local.json
mkrepo a4
mkrepo self
mkrepo a3

for r in a1 untr a2 a3; do
  echo "=== link $r"
  sk memory link "$P/$r" > "$OUT/link-$r.txt" 2>&1
  echo "exit $?"; cat "$OUT/link-$r.txt"
done

echo "=== a2 local settings after link"
cat a2/.claude/settings.local.json

echo "=== a3 profiles"
(cd a3 && sk profile new nolocal --description "Probe: leaves out local settings" --repo \
  && sk profile new clean --description "Probe: clean room" --repo)
printf '{\n  "description": "Probe: leaves out local settings",\n  "settingSources": ["user", "project"]\n}\n' \
  > a3/.claude/profiles/nolocal/profile.json
printf '{\n  "description": "Probe: clean room",\n  "settingSources": ["project"]\n}\n' \
  > a3/.claude/profiles/clean/profile.json
for p in nolocal clean; do
  echo "--- show $p"
  (cd a3 && SIDEKICK_PROFILE_SKIP_CHECK= sk profile show "$p") 2>&1 | tail -25
done

echo "=== git status per repo"
for r in a1 a2 a3 untr; do echo "$r: $(git -C "$r" status --porcelain | tr '\n' ' ')"; done
echo "=== store"
find "$STORE" -not -path '*/.git/*' | sed "s|$P/||" | sort
git -C "$STORE" log --oneline
```

### `a1.sh`

```bash
#!/bin/bash
# A1: interactive sessions in the main checkout, a plain sibling worktree, and a
# nested .claude/worktrees/ worktree of one linked repo, each trusted.
#   bash a1.sh <probe root>
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"

SAVE='Save this to your auto-memory for future sessions, then reply with the absolute path of the file you wrote: the probe value for %s is %s.'
READ='First state the absolute path of your auto-memory directory exactly as your instructions give it, or say none is given. Then answer from your memory only, without searching files or running tools: which probe values do you know?'

probe() { # name cwd value
  local name=$1 cwd=$2 value=$3 sid t
  sid=$(uuidgen | tr 'A-Z' 'a-z')
  t=$(transcript "$cwd" "$sid")
  echo "=== $name: $cwd (session $sid)"
  open_session "$name" "$cwd" "$sid" --permission-mode default || return 1
  turn "$name" "$t" "$READ"
  turn "$name" "$t" "$(printf "$SAVE" "$name" "$value")"
  echo "--- cost"; cost "$name"
  finish "$name"
  echo "--- memory folder named by the system prompt"; memdirs "$t"
  echo "--- transcript"; score "$t"
  echo
}

probe a1-main "$P/a1" teal
probe a1-sibling "$P/a1-wt" otter
probe a1-nested "$P/a1/.claude/worktrees/nested" heron

echo "=== store files"
find "$STORE/a1" -type f | sed "s|$P/||" | sort
for f in "$STORE"/a1/*.md; do echo "--- ${f#$P/}"; cat "$f"; done
echo "=== default memory folders for the a1 checkouts"
for c in a1 a1-wt a1/.claude/worktrees/nested; do
  d="$PROJECTS/$(key_of "$P/$c")"
  echo "$c: project folder $( [ -d "$d" ] && echo present || echo absent ), memory/ $( [ -e "$d/memory" ] && echo "present: $(ls -A "$d/memory" | tr '\n' ' ')" || echo absent)"
done
echo "=== trust entries"
jq --arg a "$P/a1" --arg b "$P/a1-wt" --arg c "$P/a1/.claude/worktrees/nested" \
  '[$a, $b, $c] as $k | .projects as $p | $k | map({(.): ($p[.].hasTrustDialogAccepted // "not listed")}) | add' "$HOME/.claude.json"
echo "=== sessions left open"
claude agents --json --all | jq -r --arg p "$P" '.[] | select((.cwd // "") | startswith($p)) | [.sessionId, .cwd, .state] | @tsv'
```

### `untrusted.sh`

```bash
#!/bin/bash
# C12: an interactive session in a linked repo nobody has trusted. The trust
# dialog is left unanswered for a while, then declined with its default answer.
#   bash untrusted.sh <probe root>
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"

sid=$(uuidgen | tr 'A-Z' 'a-z')
d="$PROJECTS/$(key_of "$P/untr")"
echo "=== untr: $P/untr (session $sid)"
start untr "$P/untr" "$sid" --permission-mode default
wait_pane untr "$TRUST|$READY" 60
echo "--- pane at start"; pane untr | grep -v '^\s*$' | head -20
sleep 20
echo "--- after 20 s unanswered: project folder $( [ -d "$d" ] && echo "present: $(ls -A "$d" | tr '\n' ' ')" || echo absent)"
echo "--- declining with the highlighted answer"
key untr Enter; sleep 5
if tm has-session -t untr 2>/dev/null; then
  echo "session still running:"; pane untr | grep -v '^\s*$' | tail -8
  tm kill-session -t untr
else
  echo "claude exited and the tmux session closed"
fi
echo "--- afterwards: project folder $( [ -d "$d" ] && echo "present: $(ls -A "$d" | tr '\n' ' ')" || echo absent)"
echo "--- store/untr: $(ls -A "$STORE/untr" | tr '\n' ' ')"
jq --arg k "$P/untr" '.projects | if has($k) then {listed: true, trusted: .[$k].hasTrustDialogAccepted} else {listed: false} end' "$HOME/.claude.json"
```

### `a2.sh`

```bash
#!/bin/bash
# A2: does Claude Code keep autoMemoryDirectory, and every other entry, when it
# saves a permission approval into the same local settings file?
#   bash a2.sh <probe root> open   start the session and stop at the permission dialog
#   bash a2.sh <probe root> close  after the dialog is answered: score and exit
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"
SIDF="$OUT/a2.sid"
F="$P/a2/.claude/settings.local.json"

case "$2" in
open)
  sid=$(uuidgen | tr 'A-Z' 'a-z'); echo "$sid" > "$SIDF"
  echo "=== a2: $P/a2 (session $sid)"
  echo "--- local settings before"; cat "$F"; cp "$F" "$OUT/a2-before.json"
  open_session a2 "$P/a2" "$sid" --permission-mode default || exit 1
  say a2 'Run exactly this shell command with the Bash tool, nothing else: touch a2-probe.txt'
  wait_pane a2 "$ASKS" 90 && pane a2 | grep -E -A12 "$ASKS" | tee "$OUT/a2-ask.txt"
  ;;
close)
  sid=$(cat "$SIDF"); t=$(transcript "$P/a2" "$sid")
  wait_turn "$t" 0 90
  echo "--- local settings after"; cat "$F"
  echo "--- kept: $(jq -c '{autoMemoryDirectory, env, allow: .permissions.allow}' "$F")"
  echo "--- diff before/after"; diff "$OUT/a2-before.json" "$F"
  echo "--- cost"; cost a2
  finish a2
  echo "--- memory folder named by the system prompt"; memdirs "$t"
  echo "--- transcript"; score "$t"
  ls -la "$P/a2/a2-probe.txt"
  ;;
esac
```

### `a2-keyonly.sh`

```bash
#!/bin/bash
# A2, second shape: a local settings file holding only link's key, as link
# leaves it in a repo with no local settings. One "don't ask again" approval.
#   bash a2-keyonly.sh <probe root> <repo>
set -uo pipefail
P="$1"; R="$2"
source "$(dirname "$0")/lib.sh"
F="$P/$R/.claude/settings.local.json"
name="a2-$R"
sid=$(uuidgen | tr 'A-Z' 'a-z'); t=$(transcript "$P/$R" "$sid")
echo "=== $name: $P/$R (session $sid)"
echo "--- local settings before"; cat "$F"; cp "$F" "$OUT/$name-before.json"
open_session "$name" "$P/$R" "$sid" --permission-mode default || exit 1
say "$name" 'Run exactly this shell command with the Bash tool, nothing else: node -e "console.log(6*7)"'
wait_pane "$name" "$ASKS" 90 || exit 1
pane "$name" | grep -E -A6 "$ASKS" | tee "$OUT/$name-ask.txt"
if pane "$name" | grep -Eq '2\. Yes, and don.t ask again for: node'; then
  key "$name" Down; sleep 1; key "$name" Enter
else
  echo "!! option 2 is not the node rule; answering Yes once"; key "$name" Enter
fi
wait_turn "$t" 0 90
echo "--- local settings after"; cat "$F"
echo "--- diff before/after"; diff "$OUT/$name-before.json" "$F"
echo "--- cost"; cost "$name"
finish "$name"
echo "--- memory folder named by the system prompt"; memdirs "$t"
echo "--- transcript"; score "$t"
```

### `a4.sh`

```bash
#!/bin/bash
# A session open in the repo when link runs: link refuses, then --force passes
# over it (the report names it). A4: that running session then saves a memory;
# where does it land, and which folder do its later requests name?
#   bash a4.sh <probe root>
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"
SAVE='Save this to your auto-memory for future sessions, then reply with the absolute path of the file you wrote: the probe value for %s is %s.'
READ='First state the absolute path of your auto-memory directory exactly as your instructions give it, or say none is given. Then answer from your memory only, without searching files or running tools: which probe values do you know?'
R="$P/a4"; DEF="$PROJECTS/$(key_of "$R")/memory"

sid=$(uuidgen | tr 'A-Z' 'a-z'); t=$(transcript "$R" "$sid")
echo "=== a4-open: $R (session $sid), started before link"
open_session a4-open "$R" "$sid" --permission-mode default || exit 1
turn a4-open "$t" "$(printf "$SAVE" a4-before amber)"
echo "--- default folder"; tree "$DEF"
echo "--- open sessions under the probe root"; open_sessions "$P"

echo "=== link with the session open"
sk memory link "$R"; echo "exit $?"
echo "=== link --force"
sk memory link "$R" --force; echo "exit $?"
echo "--- local settings"; cat "$R/.claude/settings.local.json"
echo "--- default folder"; tree "$DEF"
echo "--- store/a4"; tree "$STORE/a4"
echo "--- archive"; tree "$STORE/archive"

echo "=== the running session saves after link"
turn a4-open "$t" "$(printf "$SAVE" a4-after plum)"
turn a4-open "$t" "$READ"
echo "--- cost"; cost a4-open
finish a4-open
echo "--- memory folder per request, in order"; memreq "$t"
echo "--- writes"; writes "$t"
echo "--- transcript"; score "$t"
echo "--- default folder"; tree "$DEF"
echo "--- store/a4"; tree "$STORE/a4"

echo "=== link again, after the session closed"
sk memory link "$R"; echo "exit $?"
echo "--- default folder"; tree "$DEF"
echo "--- archive"; tree "$STORE/archive"

sid2=$(uuidgen | tr 'A-Z' 'a-z'); t2=$(transcript "$R" "$sid2")
echo "=== a4-new: a fresh session (session $sid2)"
open_session a4-new "$R" "$sid2" --permission-mode default || exit 1
turn a4-new "$t2" "$READ"
echo "--- cost"; cost a4-new
finish a4-new
echo "--- memory folder named by the system prompt"; memdirs "$t2"
echo "--- transcript"; score "$t2"
echo "--- default folder"; tree "$DEF"
echo "--- store log"; git -C "$STORE" log --oneline | head -5
echo "--- open sessions under the probe root"; open_sessions "$P"
```

### `self.sh`

```bash
#!/bin/bash
# link run from a session inside the repo: the session runs the built CLI with
# its Bash tool. link should pass over that session and tell it to restart.
# Then the same session saves a memory, a second reading of A4.
#   bash self.sh <probe root>
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"
SAVE='Save this to your auto-memory for future sessions, then reply with the absolute path of the file you wrote: the probe value for %s is %s.'
R="$P/self"; DEF="$PROJECTS/$(key_of "$R")/memory"

sid=$(uuidgen | tr 'A-Z' 'a-z'); t=$(transcript "$R" "$sid")
echo "=== self: $R (session $sid)"
open_session self "$R" "$sid" --permission-mode default || exit 1
turn self "$t" "$(printf "$SAVE" self-before sage)"
echo "--- default folder"; tree "$DEF"
turn self "$t" "Run exactly this shell command with the Bash tool, nothing else, then quote its full output: node $SK_BIN memory link ."
echo "--- local settings"; cat "$R/.claude/settings.local.json"
echo "--- default folder"; tree "$DEF"
echo "--- store/self"; tree "$STORE/self"
turn self "$t" "$(printf "$SAVE" self-after rue)"
echo "--- cost"; cost self
finish self
echo "--- memory folder per request, in order"; memreq "$t"
echo "--- writes"; writes "$t"
echo "--- transcript"; score "$t"
echo "--- default folder"; tree "$DEF"
echo "--- open sessions under the probe root"; open_sessions "$P"
```

### `a3.sh`

```bash
#!/bin/bash
# A3: profile launches whose settingSources leave out local (nolocal) and also
# user (clean), started interactively from `sidekick profile argv`, as skp does.
# A control session leaves out local with no profile, to show the key is lost.
#   bash a3.sh <probe root>
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"
SAVE='Save this to your auto-memory for future sessions, then reply with the absolute path of the file you wrote: the probe value for %s is %s.'
READ='First state the absolute path of your auto-memory directory exactly as your instructions give it, or say none is given. Then answer from your memory only, without searching files or running tools: which probe values do you know?'
R="$P/a3"; DEF="$PROJECTS/$(key_of "$R")/memory"

argv_of() { # profile; the NUL-separated arguments skp hands to claude
  (cd "$R" && env -i HOME="$HOME" USER="$USER" PATH="$PATH" TMPDIR="$TMPDIR" LANG="$LANG" \
    SIDEKICK_MEMORY_STORE="$STORE" node "$SK_BIN" profile argv "$1") > "$OUT/argv-$1.bin"
}

profile_probe() { # profile value
  local name="a3-$1" sid t args=()
  sid=$(uuidgen | tr 'A-Z' 'a-z'); t=$(transcript "$R" "$sid")
  echo "=== $name: profile $1 in $R (session $sid)"
  argv_of "$1" || { echo "!! profile argv failed"; return 1; }
  while IFS= read -r -d '' a; do args+=("$a"); done < "$OUT/argv-$1.bin"
  echo "--- argv"; printf '  %s\n' "${args[@]}"
  open_session "$name" "$R" "$sid" "${args[@]}" --permission-mode default || return 1
  turn "$name" "$t" "$READ"
  turn "$name" "$t" "$(printf "$SAVE" "$name" "$2")"
  echo "--- cost"; cost "$name"
  finish "$name"
  echo "--- memory folder named by the system prompt"; memdirs "$t"
  echo "--- writes"; writes "$t"
  echo "--- transcript"; score "$t"
  echo "--- default folder"; tree "$DEF"
  echo
}

profile_probe nolocal fern
profile_probe clean moss

sid=$(uuidgen | tr 'A-Z' 'a-z'); t=$(transcript "$R" "$sid")
echo "=== a3-control: --setting-sources user,project, no profile (session $sid)"
open_session a3-control "$R" "$sid" --setting-sources user,project --permission-mode default || exit 1
turn a3-control "$t" "$READ"
echo "--- cost"; cost a3-control
finish a3-control
echo "--- memory folder named by the system prompt"; memdirs "$t"
echo "--- transcript"; score "$t"
echo "--- default folder"; tree "$DEF"
echo "=== store/a3"; tree "$STORE/a3"
echo "--- open sessions under the probe root"; open_sessions "$P"
```

### `final.sh`

```bash
#!/bin/bash
# The state the probes left: open sessions, trust entries for the probe root's
# folders (listed or not, and trusted or not; nothing else is read), Claude
# Code's project folders for them, and the store.
#   bash final.sh <probe root>
set -uo pipefail
P="$1"
source "$(dirname "$0")/lib.sh"
echo "=== tmux"; tm ls 2>&1
echo "=== open sessions under the probe root"; open_sessions "$P"; echo "(end)"
echo "=== trust entries under the probe root"
jq -r --arg p "$P" '.projects | to_entries[] | select(.key | startswith($p)) | "\(.key)\ttrusted=\(.value.hasTrustDialogAccepted)"' "$HOME/.claude.json"
echo "=== project folders for the probe root"
for d in "$PROJECTS"/$(key_of "$P")-*; do
  echo "$(basename "$d"): $(ls -A "$d" | grep -c '\.jsonl$') transcripts, memory/ $( [ -e "$d/memory" ] && echo present || echo absent)"
done
echo "=== store tree"; tree "$STORE"
echo "=== store log"; git -C "$STORE" log --oneline
echo "=== store status"; git -C "$STORE" status --porcelain
```

### `summary.sh`

```bash
#!/bin/bash
# Per probe transcript: how many main-thread requests named each memory folder.
#   bash summary.sh <probe root>
P="$1"
source "$(dirname "$0")/lib.sh"
for t in "$PROJECTS"/$(key_of "$P")-*/*.jsonl; do
  echo "$(basename "$(dirname "$t")" | sed "s/^$(key_of "$P")-//") $(basename "$t" .jsonl | cut -c1-8):"
  memreq "$t" | cut -d' ' -f2- | sort | uniq -c | sed "s|$HOME|~|"
done
```

### `tokens.sh`

```bash
#!/bin/bash
# Token totals of the main thread's API calls, one row per transcript, each
# message counted once: input, output, cache read, cache write.
#   bash tokens.sh <transcript>...
for t in "$@"; do
  jq -s -r --arg f "$(basename "$t")" '
    [.[] | select(.type=="assistant") | {id: .message.id, u: .message.usage}] | unique_by(.id) | map(.u) |
    [$f, (map(.input_tokens) | add), (map(.output_tokens) | add),
     (map(.cache_read_input_tokens) | add), (map(.cache_creation_input_tokens) | add)] | @tsv' "$t"
done
```

### `step.sh`

```bash
#!/bin/bash
# Runs one helper from lib.sh with its arguments, for driving a session by hand:
#   bash step.sh <probe root> <helper> [args...]
P="$1"; shift
source "$(dirname "$0")/lib.sh"
"$@"
```
