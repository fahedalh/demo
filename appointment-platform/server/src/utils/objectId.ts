import { Types } from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id);
export const sameId = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);
