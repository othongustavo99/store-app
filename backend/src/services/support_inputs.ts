import { z } from 'zod';
import { uuidParam } from '../security/validation.js';

// Payloads estritos: IDs de loja, autor, status pago e timestamps não vêm do cliente.
export const supportTicketInput = z.object({
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(1).max(4000),
  orderId: uuidParam.optional(),
}).strict();
export const supportMessageInput = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
export const supportStateInput = z.object({ status: z.enum(['OPEN','CLOSED']) }).strict();
