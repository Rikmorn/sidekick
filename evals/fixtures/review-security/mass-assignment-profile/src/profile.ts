import { type Request, requireSession } from './session.js';
import { type User, users } from './users.js';

/** PATCH /me — lets a signed-in user edit their own profile. */
export async function updateProfile(req: Request): Promise<User> {
  const session = requireSession(req);
  const fields = req.body as Partial<User>;
  return users().patch(session.userId, fields);
}

/** GET /me */
export async function getProfile(req: Request): Promise<User> {
  const session = requireSession(req);
  const user = await users().get(session.userId);
  if (user === null) {
    throw new Error('not found');
  }
  return user;
}
