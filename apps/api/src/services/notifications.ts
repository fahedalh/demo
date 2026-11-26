/**
 * In-app notifications: persisted (so they survive reconnects) and pushed over Socket.IO.
 * A push provider (FCM/APNs) or SMS/email adapter would hook into `notify` here.
 */
import { prisma } from '../lib/prisma';
import { emitToUser } from '../realtime/io';
import { logger } from '../lib/logger';

export async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  try {
    const n = await prisma.notification.create({ data: { userId, type, title, body, data: data as any } });
    emitToUser(userId, 'notification', {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: (n.data as Record<string, unknown>) ?? null,
      readAt: null,
      createdAt: n.createdAt.toISOString(),
    });
    return n;
  } catch (err) {
    logger.error({ err }, 'notify failed');
    return null;
  }
}

/** Bilingual notification copy, picked by the recipient's locale. */
export const copy = {
  driverAssigned: (ar: boolean, name: string, eta: number) =>
    ar
      ? { title: 'تم تعيين سائق', body: `${name} في طريقه إليك — يصل خلال ${eta} د تقريباً` }
      : { title: 'Driver on the way', body: `${name} is heading to you — about ${eta} min away` },
  driverArrived: (ar: boolean) =>
    ar
      ? { title: 'وصل السائق', body: 'سائقك بانتظارك في نقطة الالتقاء' }
      : { title: 'Your driver has arrived', body: 'Meet your driver at the pickup point' },
  tripStarted: (ar: boolean) =>
    ar ? { title: 'بدأت الرحلة', body: 'رحلة موفقة!' } : { title: 'Trip started', body: 'Enjoy your ride!' },
  tripCompleted: (ar: boolean, amount: string) =>
    ar
      ? { title: 'وصلت بالسلامة', body: `إجمالي الرحلة ${amount}` }
      : { title: 'You have arrived', body: `Trip total ${amount}` },
  rideCancelled: (ar: boolean) =>
    ar
      ? { title: 'أُلغيت الرحلة', body: 'تم إلغاء رحلتك' }
      : { title: 'Ride cancelled', body: 'Your ride was cancelled' },
  noDriver: (ar: boolean) =>
    ar
      ? { title: 'لا يوجد سائقون متاحون', body: 'لم نعثر على سائق قريب الآن. حاول مرة أخرى بعد قليل.' }
      : {
          title: 'No drivers available',
          body: "We couldn't find a nearby driver right now. Please try again shortly.",
        },
  paymentFailed: (ar: boolean) =>
    ar
      ? { title: 'تعذّر الدفع', body: 'لم تنجح عملية الدفع بالبطاقة. يرجى تحديث طريقة الدفع.' }
      : {
          title: 'Payment failed',
          body: 'We could not charge your card. Please update your payment method.',
        },
  newMessage: (ar: boolean, name: string) =>
    ar ? { title: `رسالة من ${name}`, body: '' } : { title: `Message from ${name}`, body: '' },
};
