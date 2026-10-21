import { expect, test } from 'claude-code/testing';
import { clockText, isBoardWrite, queuedWith } from './logic';

test('isBoardWrite is true for the writes pickup reads', () => {
  const writes = [
    'gh project item-edit 2 --owner @me --url u --field Status --value Done',
    'gh project item-add 2 --owner @me --url u',
    'gh issue close 228 -R o/r --reason completed',
    'gh issue reopen 1',
    'gh issue create --title t --body-file f',
    'gh issue edit 211 --add-label x',
    'gh api -X PATCH repos/o/r/milestones/9 --input f',
    'gh api --method PATCH repos/o/r/milestones/9 -f description=x',
    'cd /x && gh issue close 3',
    'git fetch; gh issue close 3 | cat',
    'true || gh issue reopen 4',
    'git commit -m x',
    'git push',
    'cd x && git push origin main',
    `body="$(sidekick pm pickup --report --milestone "R9")" && gh api graphql -f query='mutation($p:ID!){createProjectV2StatusUpdate(input:{projectId:$p}){statusUpdate{id}}}' -f p=PVT_1`,
  ];
  for (const command of writes) {
    expect(isBoardWrite(command)).toBe(true);
  }
});

test('isBoardWrite is false for reads and look-alikes', () => {
  const reads = [
    'gh issue list',
    'gh issue view 211',
    'gh project item-list 2',
    'gh api repos/o/r/milestones/9',
    'gh api graphql -f query=mutation{deleteProjectV2Item(input:{})}',
    'git commit-tree HEAD^{tree}',
    'git pushx',
    'git log',
    'echo git commit',
    'sidekick pm pickup --brief',
    'git log --grep "gh issue close"',
    '',
  ];
  for (const command of reads) {
    expect(isBoardWrite(command)).toBe(false);
  }
});

test('isBoardWrite accepts a quoted match, which costs one refresh', () => {
  expect(isBoardWrite('echo "done; gh issue close 3"')).toBe(true);
});

test('queuedWith counts the queued run as asked once any request was', () => {
  expect(queuedWith(undefined, 'unasked')).toBe('unasked');
  expect(queuedWith(undefined, 'asked')).toBe('asked');
  expect(queuedWith('unasked', 'unasked')).toBe('unasked');
  expect(queuedWith('unasked', 'asked')).toBe('asked');
  expect(queuedWith('asked', 'unasked')).toBe('asked');
});

test('clockText gives local HH:MM', () => {
  expect(clockText(new Date(2026, 9, 16, 9, 5).getTime())).toBe('09:05');
  expect(clockText(new Date(2026, 9, 16, 23, 59).getTime())).toBe('23:59');
});
