import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ATTACHMENT_ROOT,
  contentTypeFor,
  type StoredFile,
} from './storage.js';

export interface Session {
  userId: string;
}

export interface Request {
  params: Record<string, string>;
  session: Session | null;
}

/** GET /attachments/:name — streams back one of the caller's own uploads. */
export async function downloadAttachment(req: Request): Promise<StoredFile> {
  if (req.session === null) {
    throw new Error('unauthenticated');
  }
  const name = req.params.name;
  const full = path.join(ATTACHMENT_ROOT, req.session.userId, name);
  const bytes = await fs.readFile(full);
  return { bytes, contentType: contentTypeFor(name) };
}
