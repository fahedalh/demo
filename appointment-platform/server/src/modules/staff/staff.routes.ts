import { z } from 'zod';
import { tenantId } from '../../middleware/tenant';
import { assertLimit } from '../../services/planLimits';
import { invalidate } from '../../services/cache';
import { AppError } from '../../utils/AppError';
import { tenantCrud } from '../common/crud';
import { assertOwned } from '../common/ownership';
import { hexColor, idList, weeklyScheduleZ } from '../common/zod';
import { hashPassword } from '../auth/auth.service';
import { Branch } from '../branches/branch.model';
import { Service } from '../services/service.model';
import { User } from '../users/user.model';
import { Staff } from './staff.model';

const body = z.object({
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(120).optional(),
  bio: z.string().max(1500).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  color: hexColor.optional(),
  branches: idList.optional(),
  services: idList.optional(),
  workingHours: weeklyScheduleZ.optional(),
  acceptsBookings: z.boolean().optional(),
  isActive: z.boolean().optional(),
  /** Creates (or links) a login so the staff member can use the staff workspace. */
  login: z.object({ enabled: z.boolean(), password: z.string().min(8).max(128).optional() }).optional(),
});

export const staffRouter = tenantCrud({
  name: 'Staff',
  model: Staff,
  create: body,
  update: body.partial(),
  readPermission: ['business:read'],
  writePermission: 'staff:manage',
  searchFields: ['name', 'title', 'email'],
  sort: { createdAt: 1 },
  softDelete: true,
  beforeWrite: async (req, data, mode) => {
    const b = tenantId(req);
    if (mode === 'create' || data.isActive === true) await assertLimit(b, 'staff');
    await assertOwned(Branch, data.branches as string[], b, 'branches');
    await assertOwned(Service, data.services as string[], b, 'services');
    if (data.avatar === '') data.avatar = undefined;
    if (data.email === '') data.email = undefined;
    const login = data.login as z.infer<typeof body>['login'];
    if (login?.enabled && !data.email && mode === 'create') {
      throw new AppError(422, 'VALIDATION_ERROR', 'Email is required to create a login', { fields: { email: ['Required for staff login'] } });
    }
    const { login: _login, services: _services, ...rest } = data;
    return rest;
  },
  afterWrite: async (req, doc, mode) => {
    const b = tenantId(req);
    const input = req.body as z.infer<typeof body>;
    if (mode !== 'delete' && input.services) {
      await Service.updateMany({ business: b, _id: { $in: input.services } }, { $addToSet: { staff: doc._id } });
      await Service.updateMany({ business: b, _id: { $nin: input.services } }, { $pull: { staff: doc._id } });
    }
    if (mode === 'delete') await Service.updateMany({ business: b }, { $pull: { staff: doc._id } });
    if (mode !== 'delete' && input.login?.enabled && doc.email) {
      let user = await User.findOne({ email: doc.email });
      if (!user) {
        if (!input.login.password) throw new AppError(422, 'VALIDATION_ERROR', 'Set an initial password for the new login', { fields: { 'login.password': ['Required'] } });
        user = await User.create({ name: doc.name, email: doc.email, phone: doc.phone, role: 'staff', passwordHash: await hashPassword(input.login.password) });
      }
      const has = user.memberships.some((m) => String(m.business) === String(b));
      if (!has) user.memberships.push({ business: b, role: 'staff', staff: doc._id });
      await user.save();
      doc.user = user._id;
      await doc.save();
    }
    await invalidate(`biz:${b}`);
  },
});
