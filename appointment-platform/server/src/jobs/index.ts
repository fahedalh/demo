import { DateTime } from 'luxon';
import { logger } from '../config/logger';
import { Booking } from '../modules/bookings/booking.model';
import { Business } from '../modules/businesses/business.model';
import { notifyBooking } from '../services/notification.service';

/**
 * Lightweight in-process scheduler. Each job is idempotent (guarded by *_SentAt fields and
 * conditional updates), so running several API instances is safe; for large deployments move
 * these to a dedicated worker (see ARCHITECTURE.md).
 */
async function sendReminders() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 49 * 3_600_000);
  const due = await Booking.find({ status: 'confirmed', reminderSentAt: null, start: { $gt: now, $lte: horizon } }).limit(200);
  const businesses = new Map<string, number[]>();
  for (const b of due) {
    const key = String(b.business);
    if (!businesses.has(key)) {
      const biz = await Business.findById(key, { 'settings.notifications.reminderHours': 1 }).lean();
      businesses.set(key, biz?.settings?.notifications?.reminderHours?.length ? biz.settings.notifications.reminderHours : [24]);
    }
    const maxHours = Math.max(...businesses.get(key)!);
    if (b.start.getTime() - now.getTime() > maxHours * 3_600_000) continue;
    const claimed = await Booking.updateOne({ _id: b._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (claimed.modifiedCount) await notifyBooking('booking.reminder', b);
  }
}

async function requestReviews() {
  const since = DateTime.now().minus({ days: 3 }).toJSDate();
  const done = await Booking.find({ status: 'completed', reviewRequestedAt: null, end: { $gte: since, $lte: new Date(Date.now() - 2 * 3_600_000) } }).limit(200);
  for (const b of done) {
    const claimed = await Booking.updateOne({ _id: b._id, reviewRequestedAt: null }, { $set: { reviewRequestedAt: new Date() } });
    if (claimed.modifiedCount) await notifyBooking('review.request', b, { link: `${process.env.APP_URL ?? ''}/account/bookings/${b._id}?review=1` });
  }
}

const jobs: Array<{ name: string; everyMs: number; run: () => Promise<void> }> = [
  { name: 'reminders', everyMs: 60_000, run: sendReminders },
  { name: 'review-requests', everyMs: 10 * 60_000, run: requestReviews },
];

const timers: NodeJS.Timeout[] = [];
export function startJobs() {
  for (const job of jobs) {
    let running = false;
    timers.push(
      setInterval(async () => {
        if (running) return;
        running = true;
        try {
          await job.run();
        } catch (err) {
          logger.error({ err, job: job.name }, 'job failed');
        } finally {
          running = false;
        }
      }, job.everyMs),
    );
  }
  logger.info(`Started ${jobs.length} background jobs`);
}

export function stopJobs() {
  timers.forEach(clearInterval);
}
