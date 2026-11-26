import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../utils/AppError';

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/** Validates and replaces req.body/query/params with the parsed (coerced, stripped) values. */
export const validate =
  (schemas: Schemas) =>
  (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const fields = result.error.flatten().fieldErrors;
        return next(new AppError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields', { fields }));
      }
      if (key === 'query') {
        // req.query is a getter in some Express versions; mutate in place.
        Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
        Object.assign(req.query, result.data);
      } else {
        (req as unknown as Record<string, unknown>)[key] = result.data;
      }
    }
    next();
  };

export type Infer<T extends ZodTypeAny> = z.infer<T>;
