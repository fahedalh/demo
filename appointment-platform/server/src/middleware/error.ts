import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof ZodError) e = new AppError(422, 'VALIDATION_ERROR', 'Invalid input', { fields: err.flatten().fieldErrors });
  else if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [v.message]]));
    e = new AppError(422, 'VALIDATION_ERROR', 'Invalid input', { fields });
  } else if (err instanceof mongoose.Error.CastError) e = new AppError(400, 'BAD_ID', 'Malformed identifier');
  else if ((err as { code?: number })?.code === 11000) {
    const keys = Object.keys((err as { keyValue?: object }).keyValue ?? {});
    e = new AppError(409, 'DUPLICATE', `Duplicate value for ${keys.join(', ') || 'a unique field'}`, { fields: Object.fromEntries(keys.map((k) => [k, ['Already in use']])) });
  } else if ((err as { type?: string })?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  else if ((err as { type?: string })?.type === 'entity.parse.failed') e = new AppError(400, 'BAD_JSON', 'Malformed JSON body');
  else {
    logger.error({ err, path: req.path }, 'Unhandled error');
    e = new AppError(500, 'INTERNAL', 'Something went wrong on our side');
  }
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
}
