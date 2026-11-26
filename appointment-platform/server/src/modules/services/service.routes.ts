import { z } from 'zod';
import { tenantId } from '../../middleware/tenant';
import { invalidate } from '../../services/cache';
import { tenantCrud } from '../common/crud';
import { assertOwned } from '../common/ownership';
import { customFieldZ, hexColor, idList, sessionModesZ } from '../common/zod';
import { Branch } from '../branches/branch.model';
import { Business } from '../businesses/business.model';
import { Resource } from '../resources/resource.model';
import { Staff } from '../staff/staff.model';
import { Service } from './service.model';

const body = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  group: z.string().trim().max(60).optional(),
  image: z.string().url().optional().or(z.literal('')),
  duration: z.number().int().min(5).max(1440),
  bufferBefore: z.number().int().min(0).max(240).optional(),
  bufferAfter: z.number().int().min(0).max(240).optional(),
  price: z.number().min(0).max(1_000_000),
  depositPercent: z.number().min(0).max(100).nullable().optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  staff: idList.optional(),
  branches: idList.optional(),
  resources: idList.optional(),
  sessionModes: sessionModesZ.optional(),
  requiresApproval: z.boolean().nullable().optional(),
  customFields: z.array(customFieldZ).max(20).optional(),
  color: hexColor.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Keeps the business's public price range in sync with its active services. */
export async function refreshPriceRange(businessId: unknown) {
  const [agg] = await Service.aggregate([
    { $match: { business: businessId, isActive: true } },
    { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
  ]);
  await Business.updateOne({ _id: businessId }, { $set: { priceRange: { min: agg?.min ?? 0, max: agg?.max ?? 0 } } });
}

export const serviceRouter = tenantCrud({
  name: 'Service',
  model: Service,
  create: body,
  update: body.partial(),
  readPermission: ['business:read'],
  writePermission: 'services:manage',
  searchFields: ['name', 'group'],
  sort: { sortOrder: 1, name: 1 },
  softDelete: true,
  beforeWrite: async (req, data) => {
    const b = tenantId(req);
    await assertOwned(Staff, data.staff as string[], b, 'staff');
    await assertOwned(Branch, data.branches as string[], b, 'branches');
    await assertOwned(Resource, data.resources as string[], b, 'resources');
    if (data.image === '') data.image = undefined;
    for (const k of ['depositPercent', 'requiresApproval'] as const) if (data[k] === null) data[k] = undefined;
    return data;
  },
  afterWrite: async (req) => {
    await refreshPriceRange(tenantId(req));
    await invalidate(`biz:${tenantId(req)}`);
  },
});
