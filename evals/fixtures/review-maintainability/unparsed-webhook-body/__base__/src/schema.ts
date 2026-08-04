import { z } from 'zod';

export const SubscriptionEventSchema = z.object({
  id: z.string().min(1),
  plan: z.enum(['starter', 'growth', 'scale']),
  seats: z.number().int().positive(),
});

export type SubscriptionEvent = z.infer<typeof SubscriptionEventSchema>;
