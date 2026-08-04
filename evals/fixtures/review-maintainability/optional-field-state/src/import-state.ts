export interface ImportSummary {
  fileName: string;
  rowCount: number;
}

export function describeSummary(summary: ImportSummary): string {
  return `${summary.fileName}: ${summary.rowCount} rows imported`;
}

export interface ImportState {
  fileName: string;
  inFlight?: boolean;
  summary?: ImportSummary;
  failure?: string;
}

export function describeImport(state: ImportState): string {
  if (state.inFlight === true) {
    return `${state.fileName}: importing`;
  }
  if (state.failure !== undefined) {
    return `${state.fileName}: failed - ${state.failure}`;
  }
  if (state.summary !== undefined) {
    return describeSummary(state.summary);
  }
  return `${state.fileName}: queued`;
}
