export type Role = 'admin' | 'editor' | 'viewer';

export interface Member {
  id: string;
  role: Role;
}

export function canView(member: Member): boolean {
  return member.role === 'admin' || member.role === 'editor' || member.role === 'viewer';
}
