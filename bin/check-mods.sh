#!/bin/sh
# Proves, after a Claude Code upgrade, that sidekick's mods load and fire: the
# static checks, then one headless Haiku run whose transcript must hold the
# gauge's compaction wording and no canary. It also proves the desk still reads
# agent view's listing: a background Haiku session waits on a permission
# prompt, and `sidekick desk --json` must name it so, with no warnings. A full
# pass records the build in .claude-code-version.
#
# CHECK_MODS_PLUGIN=<folder> checks that plugin folder, its bin/sidekick
# included, in place of plugin/, and skips validating the marketplace.
# CHECK_MODS_LIVE_ONLY=1 skips the static checks. Either one proves less, so
# its pass leaves the record as it was.
set -eu
fail() { echo "check:mods: $*" >&2; exit 1; }

root=$(git rev-parse --show-toplevel) || fail "run it from inside the sidekick repo"
given=${CHECK_MODS_PLUGIN:-$root/plugin}
# The live run starts in a scratch folder, so a relative path would miss.
plugin=$(cd "$given" 2>/dev/null && pwd) || fail "no plugin folder at $given"
live_only=${CHECK_MODS_LIVE_ONLY:-}

command -v claude >/dev/null 2>&1 || fail "claude is not on PATH"
command -v uuidgen >/dev/null 2>&1 || fail "needs uuidgen on PATH"
command -v node >/dev/null 2>&1 || fail "needs node on PATH"
version=$(claude --version | awk '{print $1}')
[ -n "$version" ] || fail "claude --version printed nothing"

if [ "$live_only" != 1 ]; then
  (cd "$root" && bun run typecheck:mods) || fail "bun run typecheck:mods failed"
  if [ -z "${CHECK_MODS_PLUGIN:-}" ]; then
    claude plugin validate --strict "$root" || fail "claude plugin validate --strict $root failed"
  fi
  claude plugin validate --strict "$plugin" || fail "claude plugin validate --strict $plugin failed"
  claude plugin test "$plugin" || fail "claude plugin test $plugin failed"
fi

# The run's limit is a compaction point of 117,000: autoCompactWindow 150,000
# less Claude Code's 33,000 margin, which must agree with COMPACTION_MARGIN in
# bin/helpers/context-monitor.ts. The warning prints it as "of 117,000 tokens",
# so a Claude Code upgrade that moves the margin changes that text and fails
# the check below. The monitor speaks from 65% of it, so the
# figure that counts a.txt must land between 76,050 and 117,000.
# A figure lags one batch, so a second Read must follow in a batch of its own.
# Haiku sent both Reads in one turn when the prompt named both files, so only
# a.txt's last line names the second file, under a name nobody can guess.
# Measured on 2026-10-15 with Claude Code 2.1.300 and claude-haiku-5-5: the
# first request counted 42,776 tokens, and 1,600 lines of a.txt (168,679
# bytes) added 89,824, about 56 tokens a line. 965 lines put the figure near
# 97,000, the band's middle, so a drift of 20,000 either way still lands.
a_lines=965
# Read refuses a file over 25,000 tokens by default (read from the 2.1.300
# binary, not observed); a.txt is larger.
read_tokens=100000
settings='{"enabledPlugins":{"sidekick@rikmorn":false},"sidekick":{"profile":"check"},"autoCompactWindow":150000}'

expected_limit=117,000
work=$(mktemp -d)
b=$(mktemp "$work/b.XXXXXX")
echo "The second file, read after the first." >"$b"
# Varied lines of words and numbers. They run near two bytes a token, which
# keeps a.txt well inside Read's caps of 2,000 lines and 262,144 bytes (read
# from the 2.1.300 binary, not observed).
awk -v lines="$a_lines" -v second="$b" 'BEGIN {
  n = split("amber basin cedar delta ember fjord granite harbor island juniper kestrel lagoon meadow nectar orchard prairie quartz river summit tundra upland valley willow yarrow zephyr", w, " ")
  for (i = 1; i <= lines; i++) {
    s = sprintf("%04d", i)
    for (j = 1; j <= 12; j++) {
      word = w[(i * 7 + j * 13 + int(i / 5)) % n + 1]
      s = (j % 2) ? s " " word "-" (i * j * 31) % 97 : s " " word
    }
    print s
  }
  print "The second file is " second
}' >"$work/a.txt"

sid=$(uuidgen | tr '[:upper:]' '[:lower:]')
prompt="Use the Read tool to read $work/a.txt. Its last line names a second file. After you see that result, use the Read tool to read the second file. Then reply with the single word ok."
# A parent session's limit must not reach the child: only the child's own
# gauge may produce the compaction wording.
status=0
(
  cd "$work" || exit 1
  unset CLAUDE_CODE_AUTO_COMPACT_WINDOW SIDEKICK_CONTEXT_LIMIT CLAUDE_PLUGIN_OPTION_CONTEXT_WINDOW
  CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS=$read_tokens claude -p "$prompt" \
    --model haiku --session-id "$sid" --allowedTools Read --plugin-dir "$plugin" \
    --settings "$settings" >"$work/out.txt" 2>"$work/err.txt"
) || status=$?

projects="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
transcript=$(find "$projects" -name "$sid.jsonl" 2>/dev/null | head -n 1)
where="stderr $work/err.txt, stdout $work/out.txt, transcript ${transcript:-not found for session $sid under $projects}"

if grep -F -q 'hooks module did not load' "$work/err.txt"; then
  fail "a hooks module did not load; $where"
fi
[ "$status" -eq 0 ] || fail "the headless run exited $status; $where"
[ -n "$transcript" ] || fail "the headless run left no transcript; $where"
grep -F -q "\"file_path\":\"$b\"" "$transcript" ||
  fail "the model never read the second file, so no batch followed the figure that counts a.txt; run it again; $where"
grep -F -q 'of the way to compaction' "$transcript" ||
  fail "the transcript holds no 'of the way to compaction' line: the gauge's limit did not reach the monitor, or the figure after a.txt left the band from 76,050 to 117,000 and a_lines needs resizing; $where"
grep -F -q "of $expected_limit tokens" "$transcript" ||
  fail "the compaction warning does not name $expected_limit tokens: Claude Code's 33,000 margin may have moved. Re-measure it, update COMPACTION_MARGIN in bin/helpers/context-monitor.ts and expected_limit here; $where"
if grep -F -q 'its mods are not running in this session' "$transcript"; then
  fail "the transcript holds the canary, so the monitor saw no gauge value for this session; $where"
fi
rm -rf "$work"

# The desk stage keeps a blocked row with a waitingFor in every run, so a
# renamed listing value fails here. The mode is passed explicitly, so a run
# started from a session that bypasses permissions still meets a prompt.
desk_name=sidekick-desk-check
desk_reason='permission prompt'
# The desk probes saw a background session's start run up to 16 seconds
# before its first turn (docs/research/control-centre/2026-10-15-desk-probes.md),
# so 90 s leaves room for the start and the turn that asks.
desk_timeout=90
desk_every=3
desk_work=$(mktemp -d)
desk_target="$desk_work/touched.txt"
desk_prompt="Use the Bash tool to run exactly this command, once: touch '$desk_target'. Then reply with the single word ok."
desk_job=

# Stops and removes the session once it has an id. claude rm exits 0 whether it
# removes or keeps, so only its text tells.
end_desk_session() {
  [ -n "$desk_job" ] || return 0
  claude stop "$desk_job" >/dev/null 2>&1 || true
  removed=$(claude rm "$desk_job" 2>&1) || true
  case $removed in
    removed*) ;;
    *) echo "check:mods: claude rm $desk_job did not say removed, so the session $desk_name may remain: $removed" >&2 ;;
  esac
}
trap end_desk_session EXIT
# POSIX sh need not run the EXIT trap on a signal, so a signal exits through it.
trap 'exit 1' HUP INT TERM

(
  cd "$root" || exit 1
  claude --bg --model haiku --permission-mode default -n "$desk_name" -- "$desk_prompt"
) >"$desk_work/launch.txt" 2>"$desk_work/launch-err.txt" ||
  fail "claude --bg failed; its output is in $desk_work/launch.txt and launch-err.txt"
# The line reads `backgrounded · <id> · <name>`, measured on Claude Code
# 2.1.300; a bare `backgrounded <id>` counts when it is the only one. This
# mirrors jobIdFrom in bin/helpers/worker-record.ts, which the CLI does not
# expose.
desk_job=$(awk -v name="$desk_name" '
  $1 == "backgrounded" {
    lines++
    if (NF == 5 && $2 == "·" && $4 == "·" && $5 == name) named = $3
    if (NF == 2) bare = $2
  }
  END { if (named != "") print named; else if (lines == 1 && bare != "") print bare }
' "$desk_work/launch.txt")
[ -n "$desk_job" ] ||
  fail "claude --bg printed no job id for $desk_name, so stop that session by hand; its output is in $desk_work/launch.txt"

# Exits 0 when the snapshot's waiting names the session for the reason, 1
# while it does not, 2 when it does but warnings is not empty, and 3 when stdin
# holds no snapshot.
desk_verdict='
const [name, reason] = process.argv.slice(1);
let snapshot;
try {
  snapshot = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
} catch {
  process.exit(3);
}
if (snapshot.ok !== true) process.exit(1);
if (!Array.isArray(snapshot.waiting) || !Array.isArray(snapshot.warnings)) process.exit(3);
const named = snapshot.waiting.some((w) => w.name === name && w.reason === reason);
if (!named) process.exit(1);
process.exit(snapshot.warnings.length === 0 ? 0 : 2);
'
# The desk runs outside any repository, so no worker of the caller's can add a
# warning that has nothing to do with the upgrade.
desk_waited=0
while :; do
  desk_snapshot=$(cd "$desk_work" && node "$plugin/bin/sidekick" desk --json) ||
    fail "node $plugin/bin/sidekick desk --json failed: $desk_snapshot"
  desk_status=0
  printf '%s\n' "$desk_snapshot" | node -e "$desk_verdict" "$desk_name" "$desk_reason" || desk_status=$?
  case $desk_status in
    0) break ;;
    1) ;;
    2) fail "the desk names $desk_name as waiting on a $desk_reason, but its warnings are not empty, so a listing value may have changed; the snapshot: $desk_snapshot" ;;
    *) fail "sidekick desk --json printed no snapshot: $desk_snapshot" ;;
  esac
  [ ! -e "$desk_target" ] ||
    fail "$desk_name ran its command without a prompt, so a setting allows it; the last snapshot: $desk_snapshot"
  [ "$desk_waited" -lt "$desk_timeout" ] ||
    fail "the desk did not name $desk_name as waiting on a $desk_reason within $desk_timeout s; the last snapshot: $desk_snapshot; the launch output is in $desk_work"
  sleep "$desk_every"
  desk_waited=$((desk_waited + desk_every))
done
end_desk_session
desk_job=
rm -rf "$desk_work"

if [ -n "${CHECK_MODS_PLUGIN:-}" ] || [ "$live_only" = 1 ]; then
  echo "check:mods: pass on Claude Code $version, a partial run, so .claude-code-version stays as it was; transcript $transcript"
  exit 0
fi

record="$root/.claude-code-version"
previous=
if [ -f "$record" ]; then previous=$(tr -d '[:space:]' <"$record"); fi
types="$root/.cache/claude-code-types"
old="$types/$previous.d.ts"
new="$types/$version.d.ts"
if [ -n "$previous" ] && [ -f "$old" ] && [ -f "$new" ] && ! cmp -s "$old" "$new"; then
  echo "check:mods: the API declarations changed from $previous to $version:"
  # git diff exits 1 when the files differ.
  git diff --no-index --stat "$old" "$new" || true
fi
printf '%s\n' "$version" >"$record"
echo "check:mods: pass on Claude Code $version, recorded in .claude-code-version; transcript $transcript"
