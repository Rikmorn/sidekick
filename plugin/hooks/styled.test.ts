import { expect, test } from 'claude-code/testing';
import {
  cutRow,
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

test('rowWidth counts every run in code points', () => {
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
