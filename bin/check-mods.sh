#!/bin/sh
# Proves, after a Claude Code upgrade, that sidekick's mods load and fire: the
# static checks, then one headless Haiku run whose transcript must hold the
# gauge's compaction wording and no canary. A full pass records the build in
# .claude-code-version.
#
# CHECK_MODS_PLUGIN=<folder> checks that plugin folder in place of plugin/ and
# skips validating the marketplace. CHECK_MODS_LIVE_ONLY=1 skips the static
# checks. Either one proves less, so its pass leaves the record as it was.
set -eu
fail() { echo "check:mods: $*" >&2; exit 1; }

root=$(git rev-parse --show-toplevel) || fail "run it from inside the sidekick repo"
given=${CHECK_MODS_PLUGIN:-$root/plugin}
# The live run starts in a scratch folder, so a relative path would miss.
plugin=$(cd "$given" 2>/dev/null && pwd) || fail "no plugin folder at $given"
live_only=${CHECK_MODS_LIVE_ONLY:-}

command -v claude >/dev/null 2>&1 || fail "claude is not on PATH"
command -v uuidgen >/dev/null 2>&1 || fail "needs uuidgen on PATH"
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
