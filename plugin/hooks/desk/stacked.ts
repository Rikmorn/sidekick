// The desk pane's stacked form, below 80 columns, for a pane docked beside the
// transcript: sessions grouped under their repository, each a head row and a
// detail row, nested as a tree rather than set in columns. Every icon is a
// state; where a session sits in the tree says whose it is.

import type { ThemeKey } from 'claude-code';
import { type Branch, branchAt, trunkOf } from '../leads';
import { fit, width } from '../lines';
import { fitRow, rowWidth, type StyledRow, type StyledRun } from '../styled';
import {
  CONTEXT_COLUMNS,
  contextRuns,
  countRuns,
  lookOf,
  marksText,
  type PaneEntry,
} from './look';
import type {
  Context,
  DeskTree,
  Status,
  TreeChild,
  TreeElsewhere,
  TreeOther,
} from './tree';

type Subagent = TreeChild['subagents'][number];

// A name keeps this many columns before its context gives up the bar.
const NAME_COLUMNS_MIN = 8;
// A detail row keeps this many columns of its text before the profile gives way.
const DETAIL_COLUMNS_MIN = 12;
// More would push the sessions after them out of the pane.
const SUBAGENT_ROWS_MAX = 3;
// The least room between this main's name and its counts.
const ROOT_GAP_MIN = 2;
const RULE = '─';

// A session or a subagent: a head row, a detail row, then what hangs below it.
interface Node {
  icon: StyledRun;
  name: StyledRun;
  marks: string;
  context?: Context;
  detail: StyledRun[];
  profile?: string;
  needsYou: boolean;
  below: Item[];
}

type Item = { kind: 'node'; node: Node } | { kind: 'more'; count: number };

// A Map, since the status is another process's word and a plain object would answer `constructor`.
const SUBAGENT_LOOKS: ReadonlyMap<string, { icon: string; tone: ThemeKey }> =
  new Map([
    ['running', { icon: '◐', tone: 'suggestion' }],
    ['waiting', { icon: '●', tone: 'warning' }],
  ]);
const SUBAGENT_IDLE = { icon: '○', tone: 'inactive' } as const;

// What a session does, in a question's tone while it waits. Without a work
// line the state's word stands in; a word the icon cannot say leads the line.
function detailRuns(status: Status, work: string | undefined): StyledRun[] {
  const look = lookOf(status);
  if (work === undefined) return [{ text: look.label, tone: look.tone }];
  const tone: ThemeKey = status.kind === 'needs' ? 'warning' : 'inactive';
  const said: StyledRun = { text: work, tone };
  return status.kind === 'other'
    ? [{ text: `${look.label} · `, tone: look.tone }, said]
    : [said];
}

function subagentNode(subagent: Subagent): Node {
  const look = SUBAGENT_LOOKS.get(subagent.status) ?? SUBAGENT_IDLE;
  const detail: StyledRun[] =
    subagent.description === ''
      ? []
      : [{ text: subagent.description, tone: 'inactive', italic: true }];
  return {
    icon: { text: look.icon, tone: look.tone },
    name: { text: subagent.type, tone: 'suggestion' },
    marks: '',
    detail,
    needsYou: false,
    below: [],
  };
}

function subagentItems(subagents: readonly Subagent[]): Item[] {
  const shown = subagents.slice(0, SUBAGENT_ROWS_MAX);
  const more = subagents.length - shown.length;
  return [
    ...shown.map(
      (subagent): Item => ({
        kind: 'node',
        node: subagentNode(subagent),
      }),
    ),
    ...(more > 0 ? [{ kind: 'more' as const, count: more }] : []),
  ];
}

// The fields every session's node shares, absent ones left out.
function sessionNode(
  session: TreeChild | TreeOther,
  name: StyledRun,
  marks: string,
  below: Item[],
): Node {
  const look = lookOf(session.status);
  return {
    icon: { text: look.icon, tone: look.tone },
    name,
    marks,
    ...(session.context === undefined ? {} : { context: session.context }),
    detail: detailRuns(session.status, session.work),
    ...(session.profile === undefined ? {} : { profile: session.profile }),
    needsYou: session.status.kind === 'needs',
    below,
  };
}

function childNode(child: TreeChild): Node {
  const name: StyledRun = { text: child.name, tone: 'text', bold: true };
  return sessionNode(
    child,
    name,
    marksText(child),
    subagentItems(child.subagents),
  );
}

function otherNode(other: TreeOther, workers: readonly TreeOther[]): Node {
  const name: StyledRun = { text: other.name, tone: 'text' };
  const nested = workers.map(
    (worker): Item => ({ kind: 'node', node: otherNode(worker, []) }),
  );
  return sessionNode(other, name, '', [
    ...subagentItems(other.subagents),
    ...nested,
  ]);
}

// The context whole while the name keeps its floor, else the text alone, else
// none. The row sets it flush right, so a lone text's padding would only take
// columns from the name.
function headContext(node: Node, room: number): StyledRun[] {
  const floor = Math.min(width(node.name.text), NAME_COLUMNS_MIN);
  const contextRoom = Math.min(CONTEXT_COLUMNS, room - floor - 1);
  const [first, ...rest] = contextRuns(node.context, contextRoom);
  return first === undefined
    ? []
    : [{ ...first, text: first.text.trimStart() }, ...rest];
}

// The icon, the name, and the marks, then the context flush right; the name gives way first.
function headRow(lead: string, node: Node, columns: number): StyledRow {
  const left: StyledRun[] = [
    { text: lead, tone: 'subtle' },
    { ...node.icon, text: `${node.icon.text} ` },
  ];
  const marks: StyledRun[] =
    node.marks === '' ? [] : [{ text: ` ${node.marks}`, tone: 'warning' }];
  const room = columns - rowWidth(left) - rowWidth(marks);
  const context = headContext(node, room);
  const nameRoom = room - (context.length === 0 ? 0 : rowWidth(context) + 1);
  const name = { ...node.name, text: fit(node.name.text, nameRoom) };
  const head = [...left, name, ...marks].filter((run) => run.text !== '');
  const gap = columns - rowWidth(head) - rowWidth(context);
  if (context.length === 0 || gap < 1) return head;
  return [...head, { text: ' '.repeat(gap), tone: 'subtle' }, ...context];
}

// The detail at the left, and the profile flush right while the detail keeps its floor.
function detailRow(lead: string, node: Node, columns: number): StyledRow {
  const leadRun: StyledRun = { text: lead, tone: 'subtle' };
  const room = columns - width(lead);
  const profile = node.profile ?? '';
  const floor = Math.min(rowWidth(node.detail), DETAIL_COLUMNS_MIN);
  const showsProfile = profile !== '' && room - width(profile) - 1 >= floor;
  if (!showsProfile) return [leadRun, ...node.detail];
  const detail = fitRow(node.detail, room - width(profile) - 1);
  const gap = room - rowWidth(detail) - width(profile);
  return [
    leadRun,
    ...detail,
    { text: ' '.repeat(gap), tone: 'subtle' },
    { text: profile, tone: 'subtle' },
  ];
}

function itemEntries(
  item: Item,
  prefix: string,
  branch: Branch,
  columns: number,
): PaneEntry[] {
  if (item.kind === 'node')
    return nodeEntries(item.node, prefix, branch, columns);
  const row: StyledRow = [
    { text: prefix + branch, tone: 'subtle' },
    { text: `+${item.count} more`, tone: 'inactive' },
  ];
  return [{ row, needsYou: false }];
}

function nodeEntries(
  node: Node,
  prefix: string,
  branch: Branch,
  columns: number,
): PaneEntry[] {
  const under = prefix + trunkOf(branch);
  const detailLead = under + (node.below.length > 0 ? '│ ' : '  ');
  return [
    { row: headRow(prefix + branch, node, columns), needsYou: node.needsYou },
    ...(node.detail.length === 0
      ? []
      : [{ row: detailRow(detailLead, node, columns), needsYou: false }]),
    ...node.below.flatMap((item, index) =>
      itemEntries(item, under, branchAt(index, node.below.length), columns),
    ),
  ];
}

// A rule across the pane, with the repository's name near its start; a group
// with no name, outside a repository, takes the rule alone.
function headerEntry(repo: string, columns: number): PaneEntry {
  if (repo === '') {
    return {
      row: [{ text: RULE.repeat(columns), tone: 'subtle' }],
      needsYou: false,
    };
  }
  const lead = `${RULE} `;
  const tail = ` ${RULE.repeat(Math.max(0, columns - width(lead) - width(repo) - 1))}`;
  const row: StyledRow = [
    { text: lead, tone: 'subtle' },
    { text: repo, tone: 'inactive', bold: true },
    { text: tail, tone: 'subtle' },
  ];
  return { row, needsYou: false };
}

// This main's name, then its counts flush right in whole phrases.
function rootEntry(tree: DeskTree, columns: number): PaneEntry {
  const { root } = tree;
  const name: StyledRun = {
    text: root.name === undefined ? '▣' : `▣ ${root.name}`,
    tone: 'claude',
    bold: true,
  };
  const counts = countRuns(root, columns - rowWidth([name]) - ROOT_GAP_MIN);
  const gap = columns - rowWidth([name]) - rowWidth(counts);
  const row: StyledRow =
    counts.length === 0
      ? [name]
      : [name, { text: ' '.repeat(gap), tone: 'subtle' }, ...counts];
  return { row, needsYou: false };
}

function blockEntries(block: TreeElsewhere, columns: number): PaneEntry[] {
  return nodeEntries(otherNode(block, block.workers), '', '', columns);
}

function childrenEntries(tree: DeskTree, columns: number): PaneEntry[] {
  return tree.children.flatMap((child, index) =>
    nodeEntries(
      childNode(child),
      '',
      branchAt(index, tree.children.length),
      columns,
    ),
  );
}

/**
 * The tree's rows below 80 columns, a group per repository: first each other
 * repository with a session that needs you, then this main's, then the rest in
 * the listing's order. This main's group holds its sessions that need you, this
 * main and its workers, then its other sessions.
 */
export function stackedEntries(tree: DeskTree, columns: number): PaneEntry[] {
  const own = tree.root.repo;
  const blocks = [...tree.waiting, ...tree.others];
  const repos = [...new Set(blocks.map((block) => block.repo))].filter(
    (repo) => repo !== own,
  );
  const isWaiting = (repo: string) =>
    tree.waiting.some((block) => block.repo === repo);
  const group = (repo: string) => [
    headerEntry(repo, columns),
    ...blocks
      .filter((block) => block.repo === repo)
      .flatMap((block) => blockEntries(block, columns)),
  ];
  const ownOf = (list: readonly TreeElsewhere[]) =>
    list
      .filter((block) => block.repo === own)
      .flatMap((block) => blockEntries(block, columns));
  return [
    ...repos.filter(isWaiting).flatMap(group),
    headerEntry(own ?? '', columns),
    ...ownOf(tree.waiting),
    rootEntry(tree, columns),
    ...childrenEntries(tree, columns),
    ...ownOf(tree.others),
    ...repos.filter((repo) => !isWaiting(repo)).flatMap(group),
  ];
}
