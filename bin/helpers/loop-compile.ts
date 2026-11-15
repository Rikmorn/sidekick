import type { ClassState, LoopManifest } from './loop-manifest.js';
import { parseRule } from './loop-rules.js';
import { NO_UPDATES_ENV, type Settings } from './profile-launch.js';
import { realPathOf } from './sidekick-home.js';

/** What `compileLoop` reads: the parsed loop, where it lives, and whether `--record` forces a trial. */
export interface CompileInput {
  name: string;
  manifest: LoopManifest;
  loopDir: string;
  profileDir: string;
  record: boolean;
}

/** Each class's state as launched; every class is `record` under `--record`. */
export function effectiveStates(
  manifest: LoopManifest,
  record: boolean,
): Record<string, ClassState> {
  return Object.fromEntries(
    Object.entries(manifest.mandate.classes).map(([name, c]) => [
      name,
      record ? 'record' : c.state,
    ]),
  );
}

/** The verbs every loop may run, pinned to its name. Both `arm` spellings the skill runs, bare and with flags, are named, so the allow list is explicit. */
export function fixedVerbRules(name: string): string[] {
  return [
    `Bash(sidekick loop record ${name} *)`,
    `Bash(sidekick loop arm ${name})`,
    `Bash(sidekick loop arm ${name} *)`,
  ];
}

// An `Edit` rule's absolute form: `//` then the real path without its leading slash.
const editDeny = (dir: string): string =>
  `Edit(//${realPathOf(dir).replace(/^\/+/, '')}/**)`;

/**
 * Compiles the loop's mandate into the settings overlay `start` passes to
 * `composeSettings`: `reads` and `act` rules allowed, `record` and `ask`
 * rules and `never` denied, plus the fixed verbs, the self-deny, and the env.
 */
export function compileLoop(input: CompileInput): Settings {
  const { name, manifest, loopDir, profileDir, record } = input;
  const states = effectiveStates(manifest, record);
  const classes = Object.entries(manifest.mandate.classes);
  const rulesIn = (wantAct: boolean): string[] =>
    classes
      .filter(([cls]) => (states[cls] === 'act') === wantAct)
      .flatMap(([, c]) => c.allow);
  return {
    permissions: {
      allow: [
        ...manifest.mandate.reads,
        ...rulesIn(true),
        ...fixedVerbRules(name),
      ],
      deny: [
        ...manifest.mandate.never,
        ...rulesIn(false),
        editDeny(loopDir),
        editDeny(profileDir),
      ],
      blockReadsOutsideWorkingDirectories: true,
    },
    env: {
      SIDEKICK_LOOP: name,
      ...NO_UPDATES_ENV,
      // An empty value reads as absent, which covers a daemon started from a main's shell.
      SIDEKICK_MAIN: '',
    },
    crossSessionInbound: 'accept',
  };
}

const stringList = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : [];

/** Rules in both `permissions.allow` and `permissions.deny`, which deny wins. */
export function overlapRules(overlay: Settings): string[] {
  const p = overlay.permissions;
  if (typeof p !== 'object' || p === null) return [];
  const rules = Object.fromEntries(Object.entries(p));
  const deny = new Set(stringList(rules.deny));
  return [...new Set(stringList(rules.allow))].filter((r) => deny.has(r));
}

const landCommand = 'sidekick loop land';

// A Bash specifier as a pattern: `*` is anything, a trailing `:*` is the legacy form of ` *`.
const specifierMatches = (specifier: string, command: string): boolean => {
  const glob = specifier.replace(/:\*$/, ' *');
  const pattern = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(command);
};

// Whether the rule lets a Bash call run the landing, with or without arguments.
function allowsLand(rule: string): boolean {
  const parsed = parseRule(rule);
  if (parsed?.tool !== 'Bash') return false;
  if (parsed.specifier === undefined) return true;
  return (
    specifierMatches(parsed.specifier, landCommand) ||
    specifierMatches(parsed.specifier, `${landCommand} x`)
  );
}

/**
 * One line per `act` class whose rules would let the loop run `sidekick loop
 * land`, which ADR-0015 Decision 5 keeps as a request the operator runs.
 * Nothing warns under `--record`, since every class records.
 */
export function landActWarnings(
  manifest: LoopManifest,
  record: boolean,
): string[] {
  const states = effectiveStates(manifest, record);
  return Object.entries(manifest.mandate.classes)
    .filter(([cls, c]) => states[cls] === 'act' && c.allow.some(allowsLand))
    .map(
      ([cls]) =>
        `class ${cls} is act and allows \`${landCommand}\`; a landing stays a request the operator runs (ADR-0015 Decision 5)`,
    );
}
