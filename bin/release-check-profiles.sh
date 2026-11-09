#!/bin/sh
# Runs every user-level profile's launch checks with the given sidekick binary,
# and stops on the first refusal, naming the profile.
set -eu
fail() { echo "release:install: $*" >&2; exit 1; }

[ "$#" -eq 1 ] || fail "usage: sh bin/release-check-profiles.sh <sidekick binary>"
bin=$1

# The user store as storeRoots in bin/helpers/profile-store.ts finds it; naming
# it in SIDEKICK_PROFILES_DIR leaves out the repo store, so nothing shadows it.
store=${SIDEKICK_PROFILES_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/profiles}

listing=$(SIDEKICK_PROFILES_DIR=$store "$bin" profile list) ||
  fail "a profile in $store is invalid: $listing"

# Profile names hold no whitespace (bin/helpers/profile-manifest.ts), so the first field is the name.
for name in $(printf '%s\n' "$listing" | awk 'NF { print $1 }'); do
  SIDEKICK_PROFILES_DIR=$store "$bin" profile argv "$name" >/dev/null ||
    fail "the user-level profile \"$name\" refused; fix what the lines before this one name, then run this again"
done
echo "release:install: every user-level profile in $store passed its launch checks"
