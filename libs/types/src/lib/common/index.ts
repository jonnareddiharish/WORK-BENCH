import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive building blocks
// ---------------------------------------------------------------------------

export const MongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB ObjectId');

export const IsoDateSchema = z.string().datetime({ offset: true });

export const PositiveIntSchema = z.number().int().positive();

export const NonEmptyStringSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PaginationMetaSchema = z.object({
  page: PositiveIntSchema,
  limit: PositiveIntSchema,
  total: z.number().int().nonnegative(),
  totalPages: PositiveIntSchema,
});

// ---------------------------------------------------------------------------
// Generic API envelope
// ---------------------------------------------------------------------------

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: PaginationMetaSchema.optional(),
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type MongoId = z.infer<typeof MongoIdSchema>;
export type IsoDate = z.infer<typeof IsoDateSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
