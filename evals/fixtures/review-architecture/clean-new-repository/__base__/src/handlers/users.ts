import {
  findById,
  updateDisplayName,
} from '../repositories/user-repository.js';

export async function patchDisplayName(
  actorId: string,
  userId: string,
  body: unknown,
): Promise<Response> {
  const name = (body as { displayName?: unknown })?.displayName;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return new Response('displayName required', { status: 400 });
  }
  if ((await findById(userId)) === null) {
    return new Response('not found', { status: 404 });
  }
  void actorId;
  await updateDisplayName(userId, name.trim());
  return new Response(null, { status: 204 });
}
