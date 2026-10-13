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
  builtin emulate -L zsh
  if (( $# < 1 )); then builtin print -u2 'usage: skp <profile> [claude arguments...]'; builtin return 2; fi
  local name=$1; builtin shift
  local list cli out
  list=$(command claude plugin list --json) || { builtin print -u2 'skp: claude plugin list failed'; builtin return 1; }
  cli=$(builtin print -r -- "$list" | command node -e '${FIND_INSTALL}') || { builtin print -u2 '${NO_INSTALL}'; builtin return 1; }
  out=$(command node "$cli/bin/sidekick" profile argv "$name") || builtin return
  local -a args=("\${(@0)out}")
  (( \${#args} )) && [[ -z \${args[-1]} ]] && args[-1]=()
  command claude "\${args[@]}" "$@"
}
`;

const BASH_FUNCTION = `skp() {
  if [ $# -lt 1 ]; then builtin echo 'usage: skp <profile> [claude arguments...]' >&2; builtin return 2; fi
  local name="$1"; builtin shift
  local list cli tmp rc a
  list=$(command claude plugin list --json) || { builtin echo 'skp: claude plugin list failed' >&2; builtin return 1; }
  cli=$(builtin printf '%s' "$list" | command node -e '${FIND_INSTALL}') || { builtin echo '${NO_INSTALL}' >&2; builtin return 1; }
  tmp=$(command mktemp "\${TMPDIR:-/tmp}/skp.XXXXXX") || builtin return 1
  command node "$cli/bin/sidekick" profile argv "$name" >| "$tmp"; rc=$?
  if [ "$rc" -ne 0 ]; then command rm -f "$tmp"; builtin return "$rc"; fi
  local args=()
  while IFS= builtin read -r -d '' a; do args+=("$a"); done < "$tmp"
  command rm -f "$tmp"
  command claude "\${args[@]}" "$@"
}
`;

// The reserved words of zsh and bash that a profile name can spell. An
// alias expands even where the shell expects one of them.
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'case',
  'coproc',
  'declare',
  'do',
  'done',
  'elif',
  'else',
  'end',
  'esac',
  'export',
  'fi',
  'float',
  'for',
  'foreach',
  'function',
  'if',
  'in',
  'integer',
  'local',
  'nocorrect',
  'readonly',
  'repeat',
  'select',
  'then',
  'time',
  'typeset',
  'until',
  'while',
]);

const SKP_RUNS_THROUGH: ReadonlySet<string> = new Set(['command', 'builtin']);

/**
 * Why `name` cannot be an alias, since `alias <name>='skp <name>'` would break
 * the shell's own words; undefined when it can.
 */
export function aliasNameRefusal(name: string): string | undefined {
  if (name === 'skp') {
    return '"skp" cannot be an alias: the alias would replace the skp function itself.';
  }
  if (SKP_RUNS_THROUGH.has(name)) {
    return `"${name}" cannot be an alias: skp runs its commands through command and builtin, and the alias would take them over.`;
  }
  if (RESERVED_WORDS.has(name)) {
    return `"${name}" cannot be an alias: it is a reserved word in zsh or bash, and the alias would break shell code that uses it.`;
  }
  return undefined;
}

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
