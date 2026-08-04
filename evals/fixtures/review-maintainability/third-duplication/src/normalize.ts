export interface ContactRow {
  email: string;
  phone: string;
  company: string;
}

export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') {
    throw new Error('email is empty after trimming');
  }
  return trimmed.normalize('NFKC');
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') {
    throw new Error('phone is empty after trimming');
  }
  return trimmed.normalize('NFKC');
}

export function normalizeCompany(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') {
    throw new Error('company is empty after trimming');
  }
  return trimmed.normalize('NFKC');
}
