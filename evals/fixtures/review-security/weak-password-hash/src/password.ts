import { createHash, randomBytes } from 'node:crypto';

export interface PasswordRecord {
  salt: string;
  hash: string;
}

/** Derive the stored credential for a new or rotated password. */
export function hashPassword(plaintext: string): PasswordRecord {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha1')
    .update(salt + plaintext)
    .digest('hex');
  return { salt, hash };
}

export function verifyPassword(
  plaintext: string,
  record: PasswordRecord,
): boolean {
  const candidate = createHash('sha1')
    .update(record.salt + plaintext)
    .digest('hex');
  return candidate === record.hash;
}
