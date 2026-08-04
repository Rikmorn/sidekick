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
