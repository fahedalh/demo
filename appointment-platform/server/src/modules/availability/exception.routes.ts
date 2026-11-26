import { z } from 'zod';
import { tenantId } from '../../middleware/tenant';
import { AppError } from '../../utils/AppError';
import { objectId } from '../../utils/objectId';
import { tenantCrud } from '../common/crud';
import { assertOwned } from '../common/ownership';
import { Branch } from '../branches/branch.model';
import { Resource } from '../resources/resource.model';
import { Staff } from '../staff/staff.model';
import { AvailabilityException } from './exception.model';

const body = z
  .object({
    scope: z.enum(['business', 'branch', 'staff', 'resource']),
    ref: objectId.optional(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    kind: z.enum(['closed', 'open']).default('closed'),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.end > v.start, { message: 'End must be after start', path: ['end'] })
  .refine((v) => v.scope === 'business' || !!v.ref, { message: 'Select what this applies to', path: ['ref'] });

const models = { branch: Branch, staff: Staff, resource: Resource } as const;

export const exceptionRouter = tenantCrud({
  name: 'AvailabilityException',
  model: AvailabilityException,
  create: body,
  update: z.object({ start: z.coerce.date(), end: z.coerce.date(), kind: z.enum(['closed', 'open']), reason: z.string().max(200) }).partial(),
  readPermission: ['business:read'],
  writePermission: ['staff:manage', 'bookings:own'],
  sort: { start: 1 },
  extraFilter: (req) => {
    const f: Record<string, unknown> = { end: { $gte: new Date(Date.now() - 7 * 86_400_000) } };
    if (!req.tenant!.permissions.has('staff:manage')) Object.assign(f, { scope: 'staff', ref: req.tenant!.staffId });
    if (typeof req.query.scope === 'string') f.scope = req.query.scope;
    return f;
  },
  beforeWrite: async (req, data, mode) => {
    const t = req.tenant!;
    if (!t.permissions.has('staff:manage')) {
      // Staff members may only manage their own time off.
      if (mode === 'update' || data.scope !== 'staff' || String(data.ref) !== t.staffId) throw AppError.forbidden('You can only add time off for yourself');
    }
    const scope = data.scope as keyof typeof models | 'business' | undefined;
    if (scope && scope !== 'business') await assertOwned(models[scope], [data.ref as string], tenantId(req), 'ref');
    if (scope === 'business') data.ref = undefined;
    if (data.start && data.end && (data.end as Date) <= (data.start as Date)) throw AppError.badRequest('End must be after start');
    return data;
  },
});
