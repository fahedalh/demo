import { Router } from 'express';
import { z } from 'zod';
import { BOOKING_FLOW_STEPS, THEME_PRESETS } from '@bookly/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { cached, invalidate } from '../../services/cache';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { Business } from '../businesses/business.model';
import { customFieldZ, hexColor, localizedZ, sessionModesZ } from '../common/zod';
import { Category } from './category.model';

const body = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/),
  name: localizedZ,
  description: localizedZ.optional(),
  icon: z.string().max(40).optional(),
  color: hexColor.optional(),
  image: z.string().url().optional(),
  terminology: z.object({ staff: localizedZ, service: localizedZ, resource: localizedZ }).partial().optional(),
  bookingFlow: z
    .object({
      steps: z.array(z.enum(BOOKING_FLOW_STEPS)).min(1).refine((s) => s.includes('datetime'), 'The date/time step is required'),
      requireStaff: z.boolean(),
      resourceFirst: z.boolean(),
      sessionModes: sessionModesZ,
      customFields: z.array(customFieldZ).max(20),
    })
    .partial()
    .optional(),
  subcategories: z.array(localizedZ).max(30).optional(),
  theme: z.enum(THEME_PRESETS).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const categoryRouter = Router();

categoryRouter.get(
  '/',
  ah(async (_req, res) => {
    const items = await cached('categories:active', 300, async () => {
      const cats = await Category.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
      const counts = await Business.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
      return cats.map((c) => ({ ...c, businessCount: counts.find((x) => String(x._id) === String(c._id))?.n ?? 0 }));
    });
    res.json({ items });
  }),
);

/** Admin management */
export const adminCategoryRouter = Router();
adminCategoryRouter.use(requireAuth, requireRole('super_admin'));

adminCategoryRouter.get('/', ah(async (_req, res) => res.json({ items: await Category.find().sort({ sortOrder: 1 }).lean() })));

adminCategoryRouter.post(
  '/',
  validate({ body }),
  ah(async (req, res) => {
    const cat = await Category.create(req.body);
    await invalidate('categories');
    await audit(req, 'category.created', { type: 'Category', id: cat._id });
    res.status(201).json(cat);
  }),
);

adminCategoryRouter.patch(
  '/:id',
  validate({ params: z.object({ id: objectId }), body: body.partial() }),
  ah(async (req, res) => {
    const cat = await Category.findById(req.params.id);
    if (!cat) throw AppError.notFound('Category');
    const { bookingFlow, terminology, ...rest } = req.body as z.infer<typeof body>;
    cat.set(rest);
    if (bookingFlow) for (const [k, v] of Object.entries(bookingFlow)) cat.set(`bookingFlow.${k}`, v);
    if (terminology) for (const [k, v] of Object.entries(terminology)) cat.set(`terminology.${k}`, v);
    await cat.save();
    await invalidate('categories');
    await audit(req, 'category.updated', { type: 'Category', id: cat._id });
    res.json(cat);
  }),
);

adminCategoryRouter.delete(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  ah(async (req, res) => {
    const inUse = await Business.countDocuments({ category: req.params.id });
    if (inUse) throw AppError.conflict(`${inUse} businesses use this category. Deactivate it instead.`, 'IN_USE');
    await Category.deleteOne({ _id: req.params.id });
    await invalidate('categories');
    await audit(req, 'category.deleted', { type: 'Category', id: req.params.id });
    res.status(204).end();
  }),
);
