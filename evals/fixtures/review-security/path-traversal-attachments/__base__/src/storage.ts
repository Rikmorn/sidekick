import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const ATTACHMENT_ROOT =
  process.env.ATTACHMENT_ROOT ?? '/var/app/attachments';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

export interface StoredFile {
  bytes: Buffer;
  contentType: string;
}

export function contentTypeFor(name: string): string {
  return (
    CONTENT_TYPES[path.extname(name).toLowerCase()] ??
    'application/octet-stream'
  );
}

/**
 * Uploads live under a per-user directory with a server-generated name; the
 * returned name is what the client stores and later asks for.
 */
export async function saveUpload(
  userId: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const name = `${randomUUID()}${EXTENSIONS[contentType] ?? '.bin'}`;
  const dir = path.join(ATTACHMENT_ROOT, userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), bytes);
  return name;
}
