import { expect, test } from 'claude-code/testing';
import {
  cutRow,
  fitRow,
  rowElement,
  rowWidth,
  type StyledRow,
  trimRow,
} from './styled';

const ROW: StyledRow = [
  { text: '├  ', tone: 'subtle' },
  { text: 'fix—readme', tone: 'text', bold: true },
  { text: '   ', tone: 'inactive' },
];

test('rowWidth counts every run in columns', () => {
  expect(rowWidth(ROW)).toBe(16);
  expect(rowWidth([])).toBe(0);
});

test('cutRow cuts the run across the cut and drops the runs past it', () => {
  expect(cutRow(ROW, 7)).toEqual([
    { text: '├  ', tone: 'subtle' },
    { text: 'fix—', tone: 'text', bold: true },
  ]);
  expect(cutRow(ROW, 3)).toEqual([{ text: '├  ', tone: 'subtle' }]);
  expect(cutRow(ROW, 99)).toEqual(ROW);
  expect(cutRow(ROW, 0)).toEqual([]);
  expect(cutRow(ROW, -4)).toEqual([]);
});

test('cutRow drops a run left empty', () => {
  expect(cutRow([{ text: '', tone: 'text' }, ...ROW], 99)).toEqual(ROW);
});

test('trimRow drops the spaces at the end, and the runs they leave empty', () => {
  expect(trimRow(ROW)).toEqual([
    { text: '├  ', tone: 'subtle' },
    { text: 'fix—readme', tone: 'text', bold: true },
  ]);
  expect(trimRow([{ text: 'a  ', tone: 'text' }])).toEqual([
    { text: 'a', tone: 'text' },
  ]);
  expect(trimRow([{ text: '   ', tone: 'text' }])).toEqual([]);
});

test('rowElement draws a row Box with a Text per run, carrying its theme key and style', () => {
  expect(
    rowElement([
      { text: 'a', tone: 'claude', bold: true },
      { text: 'b', tone: 'text', dim: true },
      { text: 'c', tone: 'inactive', italic: true },
    ]),
  ).toEqual({
    type: 'Box',
    props: { flexDirection: 'row' },
    children: [
      {
        type: 'Text',
        props: { color: 'claude', weight: 'bold', wrap: 'truncate-end' },
        children: ['a'],
      },
      {
        type: 'Text',
        props: { color: 'text', dimColor: true, wrap: 'truncate-end' },
        children: ['b'],
      },
      {
        type: 'Text',
        props: { color: 'inactive', italic: true, wrap: 'truncate-end' },
        children: ['c'],
      },
    ],
  });
});

test('rowElement draws an empty row as a Box one row high, since an empty Text takes none', () => {
  expect(rowElement([])).toEqual({ type: 'Box', props: { height: 1 } });
});

test('rowElement draws a run with an href as a Text holding a Link', () => {
  expect(
    rowElement([
      { text: 'board #9', tone: 'suggestion', href: 'https://x.test/9' },
    ]),
  ).toEqual({
    type: 'Box',
    props: { flexDirection: 'row' },
    children: [
      {
        type: 'Text',
        props: { color: 'suggestion', wrap: 'truncate-end' },
        children: [
          {
            type: 'Link',
            props: { href: 'https://x.test/9' },
            children: ['board #9'],
          },
        ],
      },
    ],
  });
});

test('cutRow keeps the href of the run it cuts', () => {
  expect(
    cutRow([{ text: 'board #9', tone: 'suggestion', href: 'u' }], 5),
  ).toEqual([{ text: 'board', tone: 'suggestion', href: 'u' }]);
});

test('fitRow draws a row that fits as cutRow draws it', () => {
  expect(fitRow(ROW, 16)).toEqual(ROW);
  expect(fitRow(ROW, 99)).toEqual(ROW);
  expect(fitRow([{ text: '', tone: 'text' }, ...ROW], 99)).toEqual(ROW);
  expect(fitRow([], 0)).toEqual([]);
});

test('fitRow ends a cut row in an ellipsis, in the style of the run the cut falls in', () => {
  expect(fitRow(ROW, 7)).toEqual([
    { text: '├  ', tone: 'subtle' },
    { text: 'fix…', tone: 'text', bold: true },
  ]);
  expect(fitRow(ROW, 4)).toEqual([
    { text: '├  ', tone: 'subtle' },
    { text: '…', tone: 'text', bold: true },
  ]);
  expect(fitRow(ROW, 3)).toEqual([{ text: '├ …', tone: 'subtle' }]);
  expect(fitRow([{ text: '', tone: 'text' }, ...ROW], 4)).toEqual([
    { text: '├  ', tone: 'subtle' },
    { text: '…', tone: 'text', bold: true },
  ]);
});

test('fitRow keeps the ellipsis alone in one column, and nothing below one', () => {
  expect(fitRow(ROW, 1)).toEqual([{ text: '…', tone: 'subtle' }]);
  expect(fitRow(ROW, 0)).toEqual([]);
  expect(fitRow(ROW, -4)).toEqual([]);
});

test('fitRow keeps the href of the run it cuts', () => {
  expect(
    fitRow([{ text: 'board #9', tone: 'suggestion', href: 'u' }], 5),
  ).toEqual([{ text: 'boar…', tone: 'suggestion', href: 'u' }]);
});
