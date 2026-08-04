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

/** Rolling window average over the trailing `window` samples. */
export function rollingMean(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let end = window; end <= values.length + 1; end++) {
    const slice = values.slice(end - window, end);
    out.push(mean(slice));
  }
  return out;
}
