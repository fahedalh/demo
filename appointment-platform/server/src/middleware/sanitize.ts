import type { NextFunction, Request, Response } from 'express';

/** Removes keys starting with `$` or containing `.` to block NoSQL operator injection. */
function clean(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith('$') || k.includes('.')) continue;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

export function sanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  if (req.query && typeof req.query === 'object') {
    const cleaned = clean({ ...req.query }) as Record<string, unknown>;
    Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
    Object.assign(req.query, cleaned);
  }
  next();
}
