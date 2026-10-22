import { expect, test } from 'claude-code/testing';
import { isLaunch, renameCommand, verdictOf } from './logic';

test('isLaunch is true for a worker dispatch and a background profile launch', () => {
  const launches = [
    'sidekick worker dispatch b.md --permission-mode default',
    'sidekick worker dispatch b.md --permission-mode default --allow-push',
    'sidekick profile launch qa --bg',
    'sidekick profile launch --bg qa',
    'sidekick profile launch --bg qa -n probe -- do the thing',
    'cd x && sidekick worker dispatch b.md --permission-mode default',
    'git fetch; sidekick profile launch --bg qa',
    '"$CLAUDE_PLUGIN_ROOT"/bin/sidekick profile launch qa --bg',
    '"$CLAUDE_PLUGIN_ROOT/bin/sidekick" worker dispatch b.md --permission-mode default',
    '/abs/plugin/bin/sidekick worker dispatch b.md --permission-mode default',
    "'/Users/someone/My Projects/plugin/bin/sidekick' profile launch --bg qa",
    'cd x && "$CLAUDE_PLUGIN_ROOT"/bin/sidekick worker dispatch b.md --permission-mode default',
  ];
  for (const command of launches) {
    expect(isLaunch(command)).toBe(true);
  }
});

test('isLaunch is false for other verbs, a foreground launch, and look-alikes', () => {
  const others = [
    'sidekick profile launch qa',
    'sidekick profile launch qa -- --bg',
    'sidekick profile list',
    'sidekick profile argv qa --bg',
    'sidekick worker finish b.md',
    'sidekick pm pickup --brief',
    'echo sidekick worker dispatch',
    'echo "sidekick profile launch qa --bg"',
    'grep -rn "sidekick worker dispatch" docs',
    '/abs/bin/sidekick-dev worker dispatch b.md',
    'sidekickx worker dispatch b.md',
    '',
  ];
  for (const command of others) {
    expect(isLaunch(command)).toBe(false);
  }
});

test('renameCommand carries a spaced name whole, as one argument', () => {
  expect(renameCommand('Single word reply')).toEqual({
    command: 'rename',
    args: 'Single word reply',
  });
});

test('verdictOf freezes a listed name only while it does not hold', () => {
  expect(verdictOf({ version: 1, name: 'main-a-84', held: false })).toEqual({
    kind: 'freeze',
    name: 'main-a-84',
  });
  expect(verdictOf({ version: 1, name: 'main-a-84', held: true })).toEqual({
    kind: 'held',
  });
  expect(verdictOf({ version: 1, name: null, held: true })).toEqual({
    kind: 'held',
  });
  expect(verdictOf({ version: 1, name: 'main-a-84', held: null })).toEqual({
    kind: 'unsure',
    reason: 'whether the name holds is unknown',
  });
  expect(verdictOf({ version: 1, name: null, held: false })).toEqual({
    kind: 'unsure',
    reason: 'the listing gives the session no name',
  });
});
