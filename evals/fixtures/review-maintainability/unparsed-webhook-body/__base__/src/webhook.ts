import { SubscriptionEventSchema } from './schema.js';

export type HandlerResult =
  | { outcome: 'accepted'; id: string }
  | { outcome: 'rejected'; reason: string };

export async function handleSubscriptionChanged(
  req: Request,
): Promise<HandlerResult> {
  const parsed = SubscriptionEventSchema.safeParse(await req.json());
  if (!parsed.success) {
    return { outcome: 'rejected', reason: 'subscription payload is malformed' };
  }
  return { outcome: 'accepted', id: parsed.data.id };
}
