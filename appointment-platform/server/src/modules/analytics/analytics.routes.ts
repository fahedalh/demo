import { Router } from 'express';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { hasFeature } from '../../services/planLimits';
import { ah } from '../../utils/asyncHandler';
import { Booking } from '../bookings/booking.model';
import { Business } from '../businesses/business.model';
import { Customer } from '../customers/customer.model';
import { Payment } from '../payments/payment.model';
import { Plan, Subscription } from '../plans/plan.model';
import { Review } from '../reviews/review.model';
import { User } from '../users/user.model';

const rangeQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });

function fillSeries(from: DateTime, days: number, rows: Array<{ _id: string; [k: string]: unknown }>, keys: string[]): Array<{ date: string } & Record<string, number>> {
  return Array.from({ length: days }, (_, i) => {
    const date = from.plus({ days: i }).toISODate()!;
    const row = rows.find((r) => r._id === date);
    return { date, ...Object.fromEntries(keys.map((k) => [k, (row?.[k] as number) ?? 0])) } as { date: string } & Record<string, number>;
  });
}

export const businessAnalyticsRouter = Router({ mergeParams: true });

businessAnalyticsRouter.get(
  '/',
  can('analytics:read', 'bookings:own'),
  validate({ query: rangeQuery }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const business = req.tenant!.business;
    const b = tenantId(req) as Types.ObjectId;
    const tz = business.timezone;
    const from = DateTime.now().setZone(tz).startOf('day').minus({ days: days - 1 });
    const to = DateTime.now().setZone(tz).endOf('day');
    const staffScope = req.tenant!.permissions.has('analytics:read') ? {} : { staff: new Types.ObjectId(req.tenant!.staffId) };
    const match = { business: b, start: { $gte: from.toJSDate(), $lte: to.toJSDate() }, ...staffScope };
    const todayStart = DateTime.now().setZone(tz).startOf('day').toJSDate();
    const todayEnd = DateTime.now().setZone(tz).endOf('day').toJSDate();

    const [statusAgg, series, revenueSeries, topServices, staffLoad, newCustomers, rating, today, pending, heat] = await Promise.all([
      Booking.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: '$price.amount' } } }]),
      Booking.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$start', timezone: tz } }, bookings: { $sum: 1 } } }]),
      Payment.aggregate([
        { $match: { business: b, purpose: { $ne: 'subscription' }, status: { $in: ['succeeded', 'refunded'] }, paidAt: { $gte: from.toJSDate(), $lte: to.toJSDate() } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: tz } }, revenue: { $sum: { $cond: [{ $eq: ['$kind', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } },
      ]),
      Booking.aggregate([{ $match: { ...match, status: { $nin: ['cancelled', 'rejected'] } } }, { $group: { _id: '$snapshot.serviceName', n: { $sum: 1 }, value: { $sum: '$price.amount' } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
      Booking.aggregate([{ $match: { ...match, status: { $in: ['confirmed', 'completed'] }, staff: { $ne: null } } }, { $group: { _id: '$snapshot.staffName', minutes: { $sum: '$snapshot.duration' }, n: { $sum: 1 } } }, { $sort: { minutes: -1 } }, { $limit: 10 }]),
      Customer.countDocuments({ business: b, createdAt: { $gte: from.toJSDate() } }),
      Review.aggregate([{ $match: { business: b, status: 'published' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]),
      Booking.find({ business: b, start: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['pending', 'confirmed', 'completed'] }, ...staffScope }).sort({ start: 1 }).limit(20).populate('service', 'name color').populate('staff', 'name color').lean(),
      Booking.countDocuments({ business: b, status: 'pending', start: { $gte: new Date() }, ...staffScope }),
      (await hasFeature(b, 'advancedAnalytics'))
        ? Booking.aggregate([{ $match: { ...match, status: { $nin: ['cancelled', 'rejected'] } } }, { $group: { _id: { d: { $dayOfWeek: { date: '$start', timezone: tz } }, h: { $hour: { date: '$start', timezone: tz } } }, n: { $sum: 1 } } }])
        : Promise.resolve(null),
    ]);
    const by = (s: string) => statusAgg.find((x) => x._id === s)?.n ?? 0;
    const total = statusAgg.reduce((a, x) => a + x.n, 0);
    const revenue = revenueSeries.reduce((a, x) => a + x.revenue, 0);
    const bookingsSeries = fillSeries(from, days, series, ['bookings']);
    const revSeries = fillSeries(from, days, revenueSeries, ['revenue']);
    res.json({
      range: { from: from.toISODate(), to: to.toISODate(), days },
      currency: business.currency,
      kpis: {
        bookings: total,
        revenue: Math.round(revenue * 100) / 100,
        bookedValue: statusAgg.filter((x) => !['cancelled', 'rejected'].includes(x._id)).reduce((a, x) => a + x.value, 0),
        newCustomers,
        cancellationRate: total ? by('cancelled') / total : 0,
        noShowRate: by('completed') + by('no_show') ? by('no_show') / (by('completed') + by('no_show')) : 0,
        rating: Math.round((rating[0]?.avg ?? 0) * 10) / 10,
        reviews: rating[0]?.n ?? 0,
        pending,
      },
      status: Object.fromEntries(statusAgg.map((x) => [x._id, x.n])),
      series: bookingsSeries.map((d, i) => ({ ...d, revenue: revSeries[i].revenue })),
      topServices: topServices.map((s) => ({ name: s._id, bookings: s.n, value: s.value })),
      staffLoad: staffLoad.map((s) => ({ name: s._id, hours: Math.round((s.minutes / 60) * 10) / 10, bookings: s.n })),
      heatmap: heat ? heat.map((x: { _id: { d: number; h: number }; n: number }) => ({ day: x._id.d - 1, hour: x._id.h, n: x.n })) : null,
      today,
    });
  }),
);

export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(requireAuth, requireRole('super_admin'));
adminAnalyticsRouter.get(
  '/',
  validate({ query: rangeQuery }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const from = DateTime.utc().startOf('day').minus({ days: days - 1 });
    const [bizStatus, roles, bookings, gmv, bookingSeries, signupSeries, subs, categories, topBusinesses] = await Promise.all([
      Business.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      Booking.countDocuments({ createdAt: { $gte: from.toJSDate() } }),
      Payment.aggregate([{ $match: { purpose: 'booking', status: { $in: ['succeeded', 'refunded'] }, kind: { $ne: 'refund' }, paidAt: { $gte: from.toJSDate() } } }, { $group: { _id: '$currency', sum: { $sum: '$amount' } } }]),
      Booking.aggregate([{ $match: { createdAt: { $gte: from.toJSDate() } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, bookings: { $sum: 1 } } }]),
      User.aggregate([{ $match: { createdAt: { $gte: from.toJSDate() } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, signups: { $sum: 1 } } }]),
      Subscription.find({ status: { $in: ['active', 'trialing'] } }).populate('plan', 'name price key').lean(),
      Business.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }, { $lookup: { from: 'businesscategories', localField: '_id', foreignField: '_id', as: 'c' } }, { $project: { n: 1, name: { $first: '$c.name.en' } } }, { $sort: { n: -1 } }]),
      Booking.aggregate([{ $match: { createdAt: { $gte: from.toJSDate() } } }, { $group: { _id: '$business', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 5 }, { $lookup: { from: 'businesses', localField: '_id', foreignField: '_id', as: 'b' } }, { $project: { n: 1, name: { $first: '$b.name' }, slug: { $first: '$b.slug' } } }]),
    ]);
    const plans = await Plan.find().lean();
    const mrr = subs.reduce((a, s) => {
      const p = s.plan as unknown as { price: { monthly: number; annual: number } } | null;
      if (!p) return a;
      return a + (s.interval === 'annual' ? p.price.annual / 12 : p.price.monthly);
    }, 0);
    const bs = fillSeries(from, days, bookingSeries, ['bookings']);
    const ss = fillSeries(from, days, signupSeries, ['signups']);
    res.json({
      kpis: {
        businesses: bizStatus.reduce((a, x) => a + x.n, 0),
        activeBusinesses: bizStatus.find((x) => x._id === 'active')?.n ?? 0,
        pendingBusinesses: bizStatus.find((x) => x._id === 'pending')?.n ?? 0,
        users: roles.reduce((a, x) => a + x.n, 0),
        bookings,
        mrr: Math.round(mrr * 100) / 100,
        gmv,
      },
      roles: Object.fromEntries(roles.map((r) => [r._id, r.n])),
      series: bs.map((d, i) => ({ ...d, signups: ss[i].signups })),
      plans: plans.map((p) => ({ name: p.name, subscribers: subs.filter((s) => String((s.plan as unknown as { _id: unknown })?._id) === String(p._id)).length })),
      categories: categories.map((c) => ({ name: c.name ?? 'Unknown', businesses: c.n })),
      topBusinesses: topBusinesses.map((b) => ({ name: b.name, slug: b.slug, bookings: b.n })),
    });
  }),
);
