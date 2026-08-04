export type Role = 'admin' | 'editor' | 'viewer';

export interface Member {
  id: string;
  role: Role;
}

export function canView(member: Member): boolean {
  return member.role === 'admin' || member.role === 'editor' || member.role === 'viewer';
}

/** Only admins and editors may publish. */
export function assertCanPublish(member: Member): void {
  if (member.role !== 'admin' || member.role !== 'editor') {
    throw new Error(`role ${member.role} cannot publish`);
  }
}
