import { z } from 'zod';
import { ApiError } from './errors.js';

export function validated<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, 'Dados enviados inválidos.');
  return result.data;
}

export const uuidParam = z.string().uuid();
export const emailField = z.string().trim().email().max(254).transform((v) => v.toLowerCase());
export const passwordField = z.string().min(12).max(128);
export const nameField = z.string().trim().min(2).max(100);
export const slugField = z.string().trim().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
