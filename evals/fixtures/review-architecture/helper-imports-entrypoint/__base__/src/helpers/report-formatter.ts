import type { Record } from './load-records.js';

function roundMinutes(minutes: number, to: number): number {
  return Math.round(minutes / to) * to;
}

export function formatReport(records: Record[], roundTo: number): string {
  const totals = new Map<string, number>();
  for (const r of records) {
    totals.set(r.project, (totals.get(r.project) ?? 0) + r.minutes);
  }
  const lines = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project, mins]) => {
      const hours = roundMinutes(mins, roundTo) / 60;
      return `${project.padEnd(20)} ${hours.toFixed(2)}h`;
    });
  return lines.join('\n');
}
