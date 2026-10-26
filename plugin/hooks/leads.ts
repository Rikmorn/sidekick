export type Branch = '' | '├ ' | '└ ';

/** The branch for the item at `index` of `count`: the last takes `└ `. */
export function branchAt(index: number, count: number): Branch {
  return index === count - 1 ? '└ ' : '├ ';
}

/** What a branch carries down past the rows under its item. */
export function trunkOf(branch: Branch): string {
  switch (branch) {
    case '':
      return '';
    case '├ ':
      return '│ ';
    case '└ ':
      return '  ';
  }
}
