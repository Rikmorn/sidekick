export interface ImportSummary {
  fileName: string;
  rowCount: number;
}

export function describeSummary(summary: ImportSummary): string {
  return `${summary.fileName}: ${summary.rowCount} rows imported`;
}
