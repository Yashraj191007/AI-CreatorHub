import { z } from 'zod';

export const subscribeSchema = z.object({
  planId: z.string().min(1, 'planId is required'),
});
