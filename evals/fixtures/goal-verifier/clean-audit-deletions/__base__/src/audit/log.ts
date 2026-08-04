export interface AuditEntry {
  action: string;
  actorId: string;
  targetId: string;
  outcome: string;
  at: string;
}

export class AuditLog {
  private readonly rows: AuditEntry[] = [];

  append(entry: AuditEntry): void {
    this.rows.push(entry);
  }

  entries(): readonly AuditEntry[] {
    return this.rows;
  }
}
