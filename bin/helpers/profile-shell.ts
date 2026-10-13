import { isProfileName } from './profile-manifest.js';

/** The shells `profile alias` can print a function for. */
export type Shell = 'zsh' | 'bash';

// Reads `claude plugin list --json` on stdin and prints the installPath of the
// user-scope sidekick@rikmorn entry; exits 1 when there is none. It holds no
// single quote, since each shell form wraps it in single quotes.
const FIND_INSTALL =
  'let s="";process.stdin.on("data",d=>{s+=d}).on("end",()=>{try{const e=JSON.parse(s).find(x=>x.id==="sidekick@rikmorn"&&x.scope==="user");if(e&&typeof e.installPath==="string"){process.stdout.write(e.installPath);return}}catch{}process.exit(1)})';

const NO_INSTALL = 'skp: no user-scope sidekick@rikmorn install';

const ZSH_FUNCTION = `skp() {
  emulate -L zsh
  if (( $# < 1 )); then print -u2 'usage: skp <profile> [claude arguments...]'; return 2; fi
  local name=$1; shift
  local list cli out
  list=$(claude plugin list --json) || { print -u2 'skp: claude plugin list failed'; return 1; }
  cli=$(print -r -- "$list" | node -e '${FIND_INSTALL}') || { print -u2 '${NO_INSTALL}'; return 1; }
  out=$(node "$cli/bin/sidekick" profile argv "$name") || return
  local -a args=("\${(@0)out}")
  (( \${#args} )) && [[ -z \${args[-1]} ]] && args[-1]=()
  claude "\${args[@]}" "$@"
}
`;

const BASH_FUNCTION = `skp() {
  if [ $# -lt 1 ]; then echo 'usage: skp <profile> [claude arguments...]' >&2; return 2; fi
  local name="$1"; shift
  local list cli tmp rc a
  list=$(claude plugin list --json) || { echo 'skp: claude plugin list failed' >&2; return 1; }
  cli=$(printf '%s' "$list" | node -e '${FIND_INSTALL}') || { echo '${NO_INSTALL}' >&2; return 1; }
  tmp=$(mktemp) || return 1
  node "$cli/bin/sidekick" profile argv "$name" >| "$tmp"; rc=$?
  if [ "$rc" -ne 0 ]; then rm -f "$tmp"; return "$rc"; fi
  local args=()
  while IFS= read -r -d '' a; do args+=("$a"); done < "$tmp"
  rm -f "$tmp"
  claude "\${args[@]}" "$@"
}
`;

/**
 * Print the `skp` function for `shell`, then one `alias <name>='skp <name>'`
 * line per name. Throws on a name that is not a valid profile name, since the
 * name lands unquoted in shell source.
 */
export const shellFunction = (shell: Shell, aliasNames: string[]): string => {
  for (const name of aliasNames) {
    if (!isProfileName(name)) {
      throw new Error(`invalid alias name: ${JSON.stringify(name)}`);
    }
  }
  const aliases = aliasNames.map((name) => `alias ${name}='skp ${name}'\n`);
  return [shell === 'zsh' ? ZSH_FUNCTION : BASH_FUNCTION, ...aliases].join('');
};
