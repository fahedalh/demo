import { Router, type Request } from 'express';
import type { Model } from 'mongoose';
import { z, type ZodTypeAny } from 'zod';
import type { Permission } from '@bookly/shared';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { escapeRegex, paginate } from '../../utils/pagination';

interface CrudOptions {
  name: string; // audit entity name
  model: Model<any>;
  create: ZodTypeAny;
  update: ZodTypeAny;
  readPermission: Permission[];
  writePermission: Permission | Permission[];
  searchFields?: string[];
  sort?: Record<string, 1 | -1>;
  populate?: string;
  /** Transform/validate payload before writes (tenant reference checks, address mapping, limits). */
  beforeWrite?: (req: Request, data: Record<string, unknown>, mode: 'create' | 'update') => Promise<Record<string, unknown>>;
  afterWrite?: (req: Request, doc: any, mode: 'create' | 'update' | 'delete') => Promise<void>;
  /** Soft delete by setting isActive=false when the entity is referenced by history. */
  softDelete?: boolean;
  extraFilter?: (req: Request) => Record<string, unknown>;
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).default('all'),
});

/** Tenant-scoped CRUD router. Mount under `/businesses/:businessId/<resource>` after loadTenant. */
export function tenantCrud(o: CrudOptions) {
  const r = Router({ mergeParams: true });
  const idParams = z.object({ businessId: objectId, id: objectId });

  r.get(
    '/',
    can(...o.readPermission),
    validate({ query: listQuery }),
    ah(async (req, res) => {
      const { page, limit, q, active } = req.query as unknown as z.infer<typeof listQuery>;
      const filter: Record<string, unknown> = { business: tenantId(req), ...(o.extraFilter?.(req) ?? {}) };
      if (active !== 'all') filter.isActive = active === 'true';
      if (q && o.searchFields?.length) {
        const rx = new RegExp(escapeRegex(q), 'i');
        filter.$or = o.searchFields.map((f) => ({ [f]: rx }));
      }
      const query = o.model.find(filter).sort(o.sort ?? { createdAt: -1 }).skip((page - 1) * limit).limit(limit);
      if (o.populate) query.populate(o.populate);
      const [items, total] = await Promise.all([query.lean(), o.model.countDocuments(filter)]);
      res.json(paginate(items, total, page, limit));
    }),
  );

  r.get(
    '/:id',
    can(...o.readPermission),
    validate({ params: idParams }),
    ah(async (req, res) => {
      const q = o.model.findOne({ _id: req.params.id, business: tenantId(req), ...(o.extraFilter?.(req) ?? {}) });
      if (o.populate) q.populate(o.populate);
      const doc = await q.lean();
      if (!doc) throw AppError.notFound(o.name);
      res.json(doc);
    }),
  );

  r.post(
    '/',
    can(...([] as Permission[]).concat(o.writePermission)),
    validate({ body: o.create }),
    ah(async (req, res) => {
      let data = req.body as Record<string, unknown>;
      if (o.beforeWrite) data = await o.beforeWrite(req, data, 'create');
      const doc = await o.model.create({ ...data, business: tenantId(req) });
      await audit(req, `${o.name.toLowerCase()}.created`, { type: o.name, id: doc._id });
      await o.afterWrite?.(req, doc, 'create');
      res.status(201).json(doc);
    }),
  );

  r.patch(
    '/:id',
    can(...([] as Permission[]).concat(o.writePermission)),
    validate({ params: idParams, body: o.update }),
    ah(async (req, res) => {
      const doc = await o.model.findOne({ _id: req.params.id, business: tenantId(req), ...(o.extraFilter?.(req) ?? {}) });
      if (!doc) throw AppError.notFound(o.name);
      let data = req.body as Record<string, unknown>;
      if (o.beforeWrite) data = await o.beforeWrite(req, data, 'update');
      doc.set(data);
      await doc.save();
      await audit(req, `${o.name.toLowerCase()}.updated`, { type: o.name, id: doc._id }, { fields: Object.keys(data) });
      await o.afterWrite?.(req, doc, 'update');
      res.json(doc);
    }),
  );

  r.delete(
    '/:id',
    can(...([] as Permission[]).concat(o.writePermission)),
    validate({ params: idParams }),
    ah(async (req, res) => {
      const doc = await o.model.findOne({ _id: req.params.id, business: tenantId(req), ...(o.extraFilter?.(req) ?? {}) });
      if (!doc) throw AppError.notFound(o.name);
      if (o.softDelete) {
        doc.set({ isActive: false });
        await doc.save();
      } else await doc.deleteOne();
      await audit(req, `${o.name.toLowerCase()}.deleted`, { type: o.name, id: doc._id });
      await o.afterWrite?.(req, doc, 'delete');
      res.status(204).end();
    }),
  );

  return r;
}
