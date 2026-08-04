export interface Row {
  id: string;
  amount: number;
}

/** Parse one `<id>,<amount>` line from the settlement export. */
export function parseRow(line: string): Row {
  const [id, amount] = line.split(',');
  return { id, amount: Number(amount) };
}
