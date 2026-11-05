/** Variables that point git at a repo other than the one in the working folder. */
export const REPO_LOCATING_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

/** A copy of `env` without the variables that redirect git away from its working folder. */
export function envWithoutRepoVars(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = { ...env };
  for (const name of REPO_LOCATING_VARS) delete kept[name];
  return kept;
}
