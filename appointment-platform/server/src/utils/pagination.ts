import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
