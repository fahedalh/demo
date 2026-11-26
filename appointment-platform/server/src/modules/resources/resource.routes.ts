import { z } from 'zod';
import { objectId } from '../../utils/objectId';
import { tenantId } from '../../middleware/tenant';
import { tenantCrud } from '../common/crud';
import { assertOwned } from '../common/ownership';
import { weeklyScheduleZ } from '../common/zod';
import { Branch } from '../branches/branch.model';
import { Resource } from './resource.model';

const body = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(40),
  branch: objectId.optional(),
  description: z.string().max(1000).optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  workingHours: weeklyScheduleZ.optional(),
  isActive: z.boolean().optional(),
});

export const resourceRouter = tenantCrud({
  name: 'Resource',
  model: Resource,
  create: body,
  update: body.partial(),
  readPermission: ['business:read'],
  writePermission: 'resources:manage',
  searchFields: ['name', 'type'],
  sort: { type: 1, name: 1 },
  softDelete: true,
  beforeWrite: async (req, data) => {
    if (data.branch) await assertOwned(Branch, [data.branch as string], tenantId(req), 'branch');
    return data;
  },
});
