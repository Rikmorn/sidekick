export function sum(values: number[]): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
  }
  return total;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
