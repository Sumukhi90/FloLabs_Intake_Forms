import { z } from 'zod';

const emailSchema = z.email().max(254);
const topicSchema = z.string()
  .max(128)
  .refine((topic) => !/[\u0000-\u001f\u007f]/.test(topic))
  .transform((topic) => topic.trim())
  .pipe(z.string().min(1).max(128));

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!emailSchema.safeParse(normalized).success) throw new Error('INVALID_EMAIL');
  return normalized;
}

export function normalizeTopic(topic: string): string {
  const normalized = topicSchema.safeParse(topic);
  if (!normalized.success) throw new Error('INVALID_TOPIC');
  return normalized.data;
}
