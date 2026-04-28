import { z } from 'zod';
import { MongoIdSchema, PositiveIntSchema } from '../common';

export const ChatSessionStatusSchema = z.enum(['PENDING', 'ACTIVE', 'COMPLETED', 'FAILED']);
export const ChatMessageRoleSchema   = z.enum(['USER', 'ASSISTANT', 'WORKER_STEP']);
export const WorkflowEventTypeSchema = z.enum(['step', 'token', 'done', 'error']);

export const ChatSessionSchema = z.object({
  userId:               MongoIdSchema,
  title:                z.string().optional(),
  status:               ChatSessionStatusSchema.default('PENDING'),
  processInstanceId:    z.string().optional(),
  processDefinitionKey: z.string().default('health-ai-workflow'),
});

export const ChatMessageSchema = z.object({
  sessionId: MongoIdSchema,
  userId:    MongoIdSchema,
  role:      ChatMessageRoleSchema,
  content:   z.string(),
  sequence:  PositiveIntSchema,
  metadata:  z.record(z.string(), z.unknown()).optional(),
});

export const WorkflowEventSchema = z.object({
  type:    WorkflowEventTypeSchema,
  label:   z.string().optional(),
  content: z.string().optional(),
  status:  z.enum(['processing', 'done', 'failed']).optional(),
  intent:  z.array(z.string()).optional(),
  error:   z.string().optional(),
});

export type ChatSession   = z.infer<typeof ChatSessionSchema>;
export type ChatMessage   = z.infer<typeof ChatMessageSchema>;
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;
