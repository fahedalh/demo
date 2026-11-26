import { z } from 'zod';
import { tenantCrud } from '../common/crud';
import { addressZ, toAddress, weeklyScheduleZ } from '../common/zod';
import { assertLimit } from '../../services/planLimits';
import { invalidate } from '../../services/cache';
import { tenantId } from '../../middleware/tenant';
import { Branch } from './branch.model';

const body = z.object({
  name: z.string().trim().min(2).max(120),
  address: addressZ.optional(),
  phone: z.string().trim().max(30).optional(),
  timezone: z.string().max(60).optional(),
  workingHours: weeklyScheduleZ.optional(),
  isActive: z.boolean().optional(),
});

export const branchRouter = tenantCrud({
  name: 'Branch',
  model: Branch,
  create: body,
  update: body.partial(),
  readPermission: ['business:read'],
  writePermission: 'branches:manage',
  searchFields: ['name', 'address.city'],
  sort: { createdAt: 1 },
  softDelete: true,
  beforeWrite: async (req, data, mode) => {
    if (mode === 'create' || data.isActive === true) await assertLimit(tenantId(req), 'branches');
    if (data.address) data.address = toAddress(data.address as z.infer<typeof addressZ>);
    return data;
  },
  afterWrite: async (req) => invalidate(`biz:${tenantId(req)}`),
});
