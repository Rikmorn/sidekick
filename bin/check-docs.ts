import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromMarkdown } from 'mdast-util-from-markdown';

// sidekick's own docs check, run in CI; the shipped CLI never imports it.

export type Finding = { file: string; line?: number; message: string };
export type Check = (root: string, files: readonly string[]) => Finding[];
export type Link = { url: string; line: number };

type MdNode = ReturnType<typeof fromMarkdown>['children'][number];

const MODULES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
);
const REMARK = path.join(MODULES, '.bin', 'remark');
const VALIDATE_LINKS = path.join(MODULES, 'remark-validate-links', 'index.js');
const PERMALINK =
  /^https:\/\/github\.com\/Rikmorn\/sidekick\/(?:blob|tree)\/([^/]+)\/([^?#]*)/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WORKING = 'docs/superpowers';

const decode = (text: string): string => {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
};

const nodeLinks = (node: MdNode): Link[] => {
  const own: Link[] =
    node.type === 'link' || node.type === 'image' || node.type === 'definition'
      ? [{ url: node.url, line: node.position?.start.line ?? 0 }]
      : [];
  const nested = 'children' in node ? node.children.flatMap(nodeLinks) : [];
  return [...own, ...nested];
};

export const linksOf = (markdown: string): Link[] =>
  fromMarkdown(markdown).children.flatMap(nodeLinks);

export const targetOf = (file: string, url: string): string | null => {
  if (url === '' || url.startsWith('#') || SCHEME.test(url)) {
    return null;
  }
  const withoutSuffix = decode(url.split(/[?#]/)[0] ?? '');
  const resolved = withoutSuffix.startsWith('/')
    ? path.posix.normalize(withoutSuffix.slice(1))
    : path.posix.join(path.posix.dirname(file), withoutSuffix);
  return path.posix.normalize(resolved);
};

const git = (root: string, args: readonly string[]) =>
  spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

export const markdownFiles = (root: string): string[] => {
  const listed = git(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    '*.md',
  ]);
  if (listed.status !== 0) {
    throw new Error(`git ls-files failed: ${listed.stderr}`);
  }
  const names = new Set(listed.stdout.split('\0').filter(Boolean));
  return [...names]
    .filter((name) => fs.existsSync(path.join(root, name)))
    .sort();
};

const linksIn = (root: string, file: string): Link[] =>
  linksOf(fs.readFileSync(path.join(root, file), 'utf8'));

const permalinkOf = (url: string) => {
  const match = PERMALINK.exec(url);
  return match
    ? { ref: match[1], target: decode(match[2]).replace(/\/$/, '') }
    : null;
};

export const checkPermalinks: Check = (root, files) => {
  const exists = new Map<string, boolean>();
  const resolves = (ref: string, target: string): boolean => {
    const key = `${ref}:${target}`;
    const known = exists.get(key);
    if (known !== undefined) {
      return known;
    }
    const found = git(root, ['cat-file', '-e', key]).status === 0;
    exists.set(key, found);
    return found;
  };
  return files.flatMap((file) =>
    linksIn(root, file).flatMap(({ url, line }): Finding[] => {
      const permalink = permalinkOf(url);
      if (permalink === null || resolves(permalink.ref, permalink.target)) {
        return [];
      }
      return [
        {
          file,
          line,
          message: `permalink path ${permalink.target} is missing at ${permalink.ref}`,
        },
      ];
    }),
  );
};

const isWorking = (target: string): boolean =>
  target === WORKING || target.startsWith(`${WORKING}/`);

export const checkWorkingFileLinks: Check = (root, files) =>
  files.flatMap((file) =>
    linksIn(root, file).flatMap(({ url, line }): Finding[] => {
      const target = targetOf(file, url) ?? permalinkOf(url)?.target ?? null;
      return target !== null && isWorking(target)
        ? [
            {
              file,
              line,
              message: `links into ${WORKING}/, which is gitignored and absent for readers`,
            },
          ]
        : [];
    }),
  );

export const CHECKS: Check[] = [checkPermalinks, checkWorkingFileLinks];

// repository:false stops the plugin from reading a GitHub permalink as a local path.
const runRemark = (root: string, files: readonly string[]) =>
  spawnSync(
    REMARK,
    [
      '--quiet',
      '--frail',
      '--no-stdout',
      '--no-config',
      '--use',
      `${VALIDATE_LINKS}=repository:false`,
      ...files,
    ],
    { cwd: root, encoding: 'utf8' },
  );

const fail = (message: string): never => {
  console.error(`check-docs: ${message}`);
  process.exit(2);
};

const repoRoot = (): string => {
  const top = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) {
    return fail('not inside a git repository');
  }
  const root = top.stdout.trim();
  const shallow = git(root, ['rev-parse', '--is-shallow-repository']);
  if (shallow.stdout.trim() === 'true') {
    return fail(
      'shallow clone, so permalinks to older commits cannot resolve; fetch full history (in CI, set fetch-depth: 0)',
    );
  }
  return root;
};

const main = (): never => {
  const root = repoRoot();
  const files = markdownFiles(root);
  if (files.length === 0) {
    process.exit(0);
  }
  // remark-cli reads stdin when given no files, so it runs only on a non-empty list.
  const remark = runRemark(root, files);
  if (remark.error || remark.status === null || remark.status > 1) {
    return fail(
      `cannot run remark at ${REMARK}: ${remark.error?.message ?? remark.stderr}`,
    );
  }
  const findings = CHECKS.flatMap((check) => check(root, files));
  for (const { file, line, message } of findings) {
    console.error(`${file}${line === undefined ? '' : `:${line}`}: ${message}`);
  }
  if (remark.stderr !== '') {
    console.error(remark.stderr.trimEnd());
  }
  return process.exit(remark.status === 1 || findings.length > 0 ? 1 : 0);
};

if (import.meta.main) {
  main();
}
