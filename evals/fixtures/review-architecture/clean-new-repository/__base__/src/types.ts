export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface AuditEntry {
  actorId: string;
  subjectId: string;
  action: string;
  at: string;
}
