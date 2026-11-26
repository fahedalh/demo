import { Router } from 'express';
import { z } from 'zod';
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, SUPPORTED_LOCALES } from '@bookly/shared';
import { requireAuth } from '../../middleware/auth';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { DEFAULT_TEMPLATES } from '../../services/notification.templates';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { paginate } from '../../utils/pagination';
import { Notification, NotificationDelivery, NotificationTemplate } from './notification.model';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), unread: z.enum(['true', 'false']).optional() }) }),
  ah(async (req, res) => {
    const { page, limit, unread } = req.query as unknown as { page: number; limit: number; unread?: string };
    const filter: Record<string, unknown> = { user: req.user!.id };
    if (unread === 'true') filter.readAt = null;
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user!.id, readAt: null }),
    ]);
    res.json({ ...paginate(items, total, page, limit), unread: unreadCount });
  }),
);

notificationRouter.post('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ user: req.user!.id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
}));

notificationRouter.post(
  '/:id/read',
  validate({ params: z.object({ id: objectId }) }),
  ah(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, user: req.user!.id }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);

/** Business notification templates (overrides of the built-in defaults). */
export const templateRouter = Router({ mergeParams: true });

templateRouter.get(
  '/',
  can('settings:manage'),
  ah(async (req, res) => {
    const custom = await NotificationTemplate.find({ business: tenantId(req) }).lean();
    res.json({ defaults: DEFAULT_TEMPLATES, custom, events: NOTIFICATION_EVENTS, channels: NOTIFICATION_CHANNELS.filter((c) => c !== 'push') });
  }),
);

templateRouter.put(
  '/',
  can('settings:manage'),
  validate({ body: z.object({ event: z.enum(NOTIFICATION_EVENTS), channel: z.enum(NOTIFICATION_CHANNELS), locale: z.enum(SUPPORTED_LOCALES), subject: z.string().max(200).optional(), body: z.string().trim().min(1).max(5000), isActive: z.boolean().default(true) }) }),
  ah(async (req, res) => {
    const { event, channel, locale, ...rest } = req.body;
    const t = await NotificationTemplate.findOneAndUpdate({ business: tenantId(req), event, channel, locale }, { $set: rest }, { upsert: true, new: true, runValidators: true });
    await audit(req, 'template.saved', { type: 'NotificationTemplate', id: t._id }, { event, channel, locale });
    res.json(t);
  }),
);

templateRouter.delete(
  '/:templateId',
  can('settings:manage'),
  validate({ params: z.object({ businessId: objectId, templateId: objectId }) }),
  ah(async (req, res) => {
    await NotificationTemplate.deleteOne({ _id: req.params.templateId, business: tenantId(req) });
    res.status(204).end();
  }),
);

templateRouter.get(
  '/deliveries',
  can('settings:manage'),
  ah(async (req, res) => res.json({ items: await NotificationDelivery.find({ business: tenantId(req) }).sort({ createdAt: -1 }).limit(100).lean() })),
);
