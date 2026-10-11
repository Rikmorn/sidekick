#!/bin/sh
# Updates the user-scope sidekick install, then installs and checks the user-level rules
# from the released binary, never from PATH.
set -eu
cd "$(git rev-parse --show-toplevel)"

fail() { echo "release:install: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || fail "needs jq on PATH"
want=$(jq -er .version plugin/.claude-plugin/plugin.json) || fail "plugin/.claude-plugin/plugin.json has no version"

claude plugin update -s user sidekick@rikmorn

list=$(claude plugin list --json) || fail "claude plugin list failed"
root=$(printf '%s' "$list" | jq -r '[.[] | select(.id == "sidekick@rikmorn" and .scope == "user")][0].installPath // empty') || fail "could not read the plugin list"
[ -n "$root" ] || fail "no user-scope install of sidekick@rikmorn; install it with: claude plugin install sidekick@rikmorn"

bin="$root/bin/sidekick"
[ -x "$bin" ] || fail "$bin is not an executable"
got=$("$bin" --version) || fail "$bin --version failed"
[ "$got" = "$want" ] || fail "the user install is $got, but plugin.json says $want; push master, then run this again"

"$bin" rules install --user
exec "$bin" rules check --user --strict
