import { z } from 'zod';
import { nameField, passwordField } from '../security/validation.js';

export const editProfileSchema = z.object({ name: nameField }).strict();
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordField,
}).strict().refine(v => v.currentPassword !== v.newPassword, {
  message: 'A nova senha precisa ser diferente da anterior.',
  path: ['newPassword'],
});

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;

export const addressBodySchema = z.object({
  label: z.string().trim().min(1).max(60),
  zipCode: z.string().regex(/^\d{8}$/),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(30),
  complement: z.string().trim().max(120).default(''),
  neighborhood: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.enum(states),
  isPrimary: z.boolean().default(false),
}).strict();

export const addressIdParam = z.object({ id: z.string().uuid() }).strict();
