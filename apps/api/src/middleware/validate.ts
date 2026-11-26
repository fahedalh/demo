import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../lib/errors';

/** Parses req.body / req.query with a zod schema and replaces it with the parsed value. */
export const validate =
  (schema: ZodType, source: 'body' | 'query' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      return next(
        badRequest(
          result.error.issues[0]?.message ?? 'Invalid request',
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
    }
    if (source === 'body') req.body = result.data;
    else (req as any).validatedQuery = result.data;
    next();
  };

export function q<T>(req: Request): T {
  return (req as any).validatedQuery as T;
}
