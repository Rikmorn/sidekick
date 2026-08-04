import { db } from './db.js';

export interface Note {
  id: string;
  owner_id: string;
  title: string;
  body: string;
}

/** Built by the router from the authenticated session. */
export interface Ctx {
  userId: string;
}

const MAX_PAGE = 50;
const MAX_TITLE = 200;
const MAX_BODY = 20000;

export async function listNotes(ctx: Ctx, limit: number): Promise<Note[]> {
  const { rows } = await db().query<Note>(
    `select id, owner_id, title, body
       from notes
      where owner_id = $1
      order by updated_at desc
      limit $2`,
    [ctx.userId, Math.min(limit, MAX_PAGE)],
  );
  return rows;
}

export type CreateResult =
  | { ok: true; note: Note }
  | { ok: false; reason: string };

/** POST /notes — creates a note owned by the caller. */
export async function createNote(
  ctx: Ctx,
  input: { title?: unknown; body?: unknown },
): Promise<CreateResult> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body : '';
  if (title.length === 0 || title.length > MAX_TITLE) {
    return { ok: false, reason: `title must be 1-${MAX_TITLE} characters` };
  }
  if (body.length > MAX_BODY) {
    return { ok: false, reason: `body must be at most ${MAX_BODY} characters` };
  }
  const { rows } = await db().query<Note>(
    `insert into notes (id, owner_id, title, body)
     values (gen_random_uuid(), $1, $2, $3)
     returning id, owner_id, title, body`,
    [ctx.userId, title, body],
  );
  return { ok: true, note: rows[0] };
}
