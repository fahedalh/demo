import { DateTime } from 'luxon';
import type { Locale, NotificationChannel, NotificationEvent } from '@bookly/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { channels } from '../integrations/messaging';
import { Notification, NotificationDelivery, NotificationTemplate } from '../modules/notifications/notification.model';
import { Business } from '../modules/businesses/business.model';
import { User } from '../modules/users/user.model';
import type { BookingDoc } from '../modules/bookings/booking.model';
import { emitToBusiness, emitToUser } from '../realtime/socket';
import { DEFAULT_TEMPLATES, renderTemplate } from './notification.templates';
import { hasFeature } from './planLimits';

async function resolveTemplate(businessId: unknown, event: NotificationEvent, channel: NotificationChannel, locale: Locale) {
  const custom = await NotificationTemplate.findOne({
    event,
    channel,
    locale,
    isActive: true,
    $or: [{ business: businessId }, { business: null }],
  })
    .sort({ business: -1 })
    .lean();
  if (custom) return { subject: custom.subject ?? '', body: custom.body };
  return DEFAULT_TEMPLATES[event][locale] ?? DEFAULT_TEMPLATES[event].en;
}

export function bookingVars(booking: BookingDoc, businessName: string, locale: Locale, extra: Record<string, string> = {}) {
  const start = DateTime.fromJSDate(booking.start).setZone(booking.timezone).setLocale(locale === 'ar' ? 'ar' : 'en');
  return {
    customerName: booking.snapshot?.customerName ?? '',
    businessName,
    serviceName: booking.snapshot?.serviceName ?? '',
    staffName: booking.snapshot?.staffName ?? '',
    date: start.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY),
    time: start.toLocaleString(DateTime.TIME_SIMPLE),
    reference: booking.reference,
    link: `${env.APP_URL}/track?ref=${booking.reference}`,
    ...extra,
  };
}

/**
 * Sends a booking lifecycle notification to the customer (all enabled channels) and an in-app
 * notification to the business team. Never throws — notification failures must not fail bookings.
 */
export async function notifyBooking(event: NotificationEvent, booking: BookingDoc, extra: Record<string, string> = {}) {
  try {
    const business = await Business.findById(booking.business).lean();
    if (!business) return;
    const customerUser = booking.user ? await User.findById(booking.user).lean() : null;
    const locale = ((customerUser?.locale ?? business.locale) || 'en') as Locale;
    const vars = bookingVars(booking, business.name, locale, extra);

    // Customer: in-app
    if (customerUser) {
      const tpl = await resolveTemplate(business._id, event, 'in_app', locale);
      const n = await Notification.create({ user: customerUser._id, business: business._id, event, title: renderTemplate(tpl.subject, vars), body: renderTemplate(tpl.body, vars), link: `/account/bookings/${booking._id}` });
      emitToUser(customerUser._id, 'notification', n.toJSON());
    }

    // Customer: external channels
    const settings = business.settings?.notifications;
    const to = { email: booking.snapshot?.customerEmail, whatsapp: booking.snapshot?.customerPhone, sms: booking.snapshot?.customerPhone };
    const wanted: Array<'email' | 'whatsapp' | 'sms'> = [];
    if (settings?.email !== false && to.email) wanted.push('email');
    if (settings?.whatsapp && to.whatsapp && (await hasFeature(business._id, 'whatsapp'))) wanted.push('whatsapp');
    if (settings?.sms && to.sms) wanted.push('sms');
    for (const ch of wanted) {
      const tpl = await resolveTemplate(business._id, event, ch, locale);
      const text = renderTemplate(tpl.body, vars);
      const result = await channels[ch].send(to[ch]!, { subject: renderTemplate(tpl.subject, vars), text, html: `<p>${text.replace(/[<>&]/g, '')}</p>` });
      await NotificationDelivery.create({ business: business._id, event, channel: ch, to: to[ch], status: result.status, error: result.error });
    }

    // Business team: in-app + live calendar refresh
    if (['booking.received', 'booking.cancelled', 'booking.rescheduled', 'payment.received'].includes(event)) {
      const team = await User.find({ 'memberships.business': business._id }, { memberships: 1 }).lean();
      const staffId = booking.staff ? String(booking.staff) : null;
      const recipients = team.filter((u) => {
        const m = u.memberships.find((x) => String(x.business) === String(business._id));
        return m && (m.role !== 'staff' || (staffId && String(m.staff) === staffId));
      });
      const title = renderTemplate(
        {
          'booking.received': 'New booking: {{serviceName}} · {{date}} {{time}}',
          'booking.cancelled': 'Cancelled: {{serviceName}} · {{date}} {{time}}',
          'booking.rescheduled': 'Rescheduled: {{serviceName}} → {{date}} {{time}}',
          'payment.received': 'Payment received for {{reference}}',
        }[event as string] ?? event,
        { ...vars, date: DateTime.fromJSDate(booking.start).setZone(booking.timezone).toFormat('dd LLL'), time: DateTime.fromJSDate(booking.start).setZone(booking.timezone).toFormat('HH:mm') },
      );
      const docs = await Notification.insertMany(
        recipients.map((u) => ({ user: u._id, business: business._id, event, title, body: `${vars.customerName} · ${vars.reference}`, link: `/dashboard/${business._id}/bookings?ref=${booking.reference}` })),
      );
      docs.forEach((d) => emitToUser(d.user, 'notification', d.toJSON()));
    }
    emitToBusiness(business._id, 'booking:changed', { id: String(booking._id), event });
  } catch (err) {
    logger.error({ err, event }, 'notification dispatch failed');
  }
}
