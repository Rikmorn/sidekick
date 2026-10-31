> Research for the `memory` design (`docs/designs/memory/`), which PM planned as #270 to #281; it serves #269. Run 2026-10-31 by Claude for the operator, on Claude Code 2.1.314, in headless `claude -p` sessions. A record: it takes only the edits `sk-pm-conventions.md` §Placement test (tense) lists.

# Where a repo's auto-memory can live (2026-10-31)

Three routes for keeping one repo's auto-memory in a folder outside `~/.claude/projects/`, each tested in a throwaway repo with a plain `git worktree add` worktree. One session in the main checkout saved a fact, then a session in the worktree read it back from the startup index alone.

## Results

| Route | Main checkout saves to the store | Worktree reads it back | Verdict |
|---|---|---|---|
| `autoMemoryDirectory` in a gitignored `.claude/settings.local.json` | Yes | Yes, although the worktree has no `.claude/` folder at all | Works |
| `autoMemoryDirectory` in a committed `.claude/settings.json` | Yes | Yes | Works in headless sessions |
| No setting; Claude Code's own `memory/` folder replaced by a symlink into the store | No: the write was blocked as a sensitive file, because the link resolves outside the allowed directories | Nothing to read | Fails |

- **Measured:** with either settings route, Claude Code created no default `memory/` folder for the repo, and the session's instructions named the store path.
- **Measured:** the worktree session resolved the main checkout's local setting. Why it does is not confirmed. One reading is that Claude Code resolves memory settings by the git repository rather than by the checkout.
- **Not tested:** an interactive session in an untrusted folder. The settings reference says a repository-supplied `autoMemoryDirectory` loads no memory, which the headless committed-file route contradicted. Headless sessions may treat the folder as trusted. The gitignored local route avoids the question.
- **Measured:** sessions could write the memory folder but not list it with Bash, since it sits outside their working directory.

## A family folder through local settings

A second probe on 2026-10-31 asked whether one repo's gitignored local settings can give its sessions a shared family folder. The settings were `autoMemoryDirectory`, `permissions.additionalDirectories` naming the family folder, and `env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD = "1"`. The family folder held a `CLAUDE.md` naming a codename.

| Session | Writes into the family folder | The family `CLAUDE.md` in context |
|---|---|---|
| Main checkout, settings only | Allowed | No |
| Worktree, settings only | Allowed | No |
| Worktree, with the variable also set in the shell | Not tried | No |
| Worktree, with `--add-dir <family folder>` on the command line | Not tried | Yes |

- **Measured:** a folder added through `permissions.additionalDirectories` is writable, from a worktree too, but its `CLAUDE.md` does not load. Only a folder given with `--add-dir` loads it. The memory docs describe the variable only with `--add-dir`.
- **Measured:** the worktree again took the main checkout's local settings, this time `additionalDirectories` and `env` as well as `autoMemoryDirectory`.

## Method

The script in this section ran the first two routes and a first attempt at the third. That attempt was skipped, because Claude Code creates an empty `memory/` folder at session start, which the script did not expect. A second run on a fresh repo removed that empty folder, put the symlink in its place, and ran the save and the worktree read.

```bash
#!/bin/bash
# Probes three routes for keeping a repo's auto-memory in a global store folder.
# local: autoMemoryDirectory in a gitignored .claude/settings.local.json
# project: autoMemoryDirectory in a committed .claude/settings.json
# link: no setting; Claude Code's own memory folder for the repo is a symlink into the store
# Each route: one session in the main checkout saves a fact, then a worktree session reads it.
set -uo pipefail

P="$1"   # probe root, must not exist
mkdir -p "$P/store" "$P/out" || exit 1
cd "$P"

mkrepo() {
  git init -q -b main "$1"
  git -C "$1" config user.email probe@example.invalid
  git -C "$1" config user.name probe
  echo "# $1" > "$1/README.md"
}

run() { # name cwd prompt
  local name=$1 cwd=$2 prompt=$3
  ( cd "$cwd" && claude -p "$prompt" --permission-mode acceptEdits --max-turns 8 --output-format json \
      > "$P/out/$name.json" 2> "$P/out/$name.err" )
  jq -r --arg n "$name" '"[\($n)] cost=\(.total_cost_usd) turns=\(.num_turns)\n\(.result)"' "$P/out/$name.json" 2>/dev/null \
    || { echo "[$name] no JSON"; tail -3 "$P/out/$name.err"; }
  echo
}

SAVE='Save this to your auto-memory for future sessions, then reply with the absolute path of the file you wrote: the probe value is %s.'
READ='First state the absolute path of your auto-memory directory exactly as your instructions give it, or say none is given. Then answer from your memory only, without searching files: what is the probe value?'

# Route 1: local settings, gitignored
mkrepo local
printf '.claude/settings.local.json\n' > local/.gitignore
git -C local add -A && git -C local commit -q -m init
mkdir -p local/.claude
printf '{ "autoMemoryDirectory": "%s" }\n' "$P/store/local" > local/.claude/settings.local.json
git -C local worktree add -q ../local-wt -b wt

# Route 2: project settings, committed
mkrepo project
mkdir -p project/.claude
printf '{ "autoMemoryDirectory": "%s" }\n' "$P/store/project" > project/.claude/settings.json
git -C project add -A && git -C project commit -q -m init
git -C project worktree add -q ../project-wt -b wt

# Route 3: symlink from Claude Code's own folder into the store
mkrepo link
git -C link add -A && git -C link commit -q -m init
git -C link worktree add -q ../link-wt -b wt

run local-save local "$(printf "$SAVE" teal)"
run local-read-main local "$READ"
run local-read-wt local-wt "$READ"

run project-save project "$(printf "$SAVE" otter)"
run project-read-wt project-wt "$READ"

# Find Claude Code's per-project folder for the link repo: run one session there first.
run link-init link 'Reply with the single word ok.'
KEY=$(ls -t "$HOME/.claude/projects" | grep -E -- '-probe-link$' | head -1)
echo "link repo key: $KEY"
if [ -n "$KEY" ] && [ ! -e "$HOME/.claude/projects/$KEY/memory" ]; then
  mkdir -p "$P/store/link"
  ln -s "$P/store/link" "$HOME/.claude/projects/$KEY/memory"
  echo "linked $HOME/.claude/projects/$KEY/memory -> $P/store/link"
else
  echo "link route skipped: key missing or memory folder already exists"
fi
run link-save link "$(printf "$SAVE" 42)"
run link-read-wt link-wt "$READ"

echo "=== store tree"
find "$P/store" -type f | sed "s|$P/||"
echo "=== default memory folders for the probe repos"
for d in "$HOME"/.claude/projects/*-probe-*; do
  [ -e "$d/memory" ] && { echo "$(basename "$d")/memory:"; ls -la "$d/memory" | tail -n +2; }
done
```
