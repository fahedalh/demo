import type { Locale, NotificationEvent } from '@bookly/shared';

type T = { subject: string; body: string };

/** Built-in defaults; businesses override per event/channel/locale in `notificationtemplates`. */
export const DEFAULT_TEMPLATES: Record<NotificationEvent, Record<Locale, T>> = {
  'booking.received': {
    en: { subject: 'Booking request received — {{serviceName}}', body: 'Hi {{customerName}}, we received your booking for {{serviceName}} on {{date}} at {{time}} with {{businessName}}. Reference: {{reference}}. {{link}}' },
    ar: { subject: 'تم استلام طلب الحجز — {{serviceName}}', body: 'مرحباً {{customerName}}، استلمنا حجزك لخدمة {{serviceName}} يوم {{date}} الساعة {{time}} لدى {{businessName}}. رقم الحجز: {{reference}}. {{link}}' },
  },
  'booking.confirmed': {
    en: { subject: 'Your booking is confirmed — {{date}} {{time}}', body: 'Good news {{customerName}}! {{businessName}} confirmed {{serviceName}} on {{date}} at {{time}}. Reference: {{reference}}. {{link}}' },
    ar: { subject: 'تم تأكيد حجزك — {{date}} {{time}}', body: 'أخبار سارة {{customerName}}! أكد {{businessName}} حجز {{serviceName}} يوم {{date}} الساعة {{time}}. رقم الحجز: {{reference}}. {{link}}' },
  },
  'booking.rejected': {
    en: { subject: 'Booking not accepted — {{reference}}', body: 'Sorry {{customerName}}, {{businessName}} could not accept your booking for {{serviceName}} on {{date}} at {{time}}. {{reason}} {{link}}' },
    ar: { subject: 'لم يتم قبول الحجز — {{reference}}', body: 'نعتذر {{customerName}}، لم يتمكن {{businessName}} من قبول حجزك لخدمة {{serviceName}} يوم {{date}} الساعة {{time}}. {{reason}} {{link}}' },
  },
  'booking.cancelled': {
    en: { subject: 'Booking cancelled — {{reference}}', body: 'The booking for {{serviceName}} on {{date}} at {{time}} with {{businessName}} has been cancelled. {{reason}}' },
    ar: { subject: 'تم إلغاء الحجز — {{reference}}', body: 'تم إلغاء حجز {{serviceName}} يوم {{date}} الساعة {{time}} لدى {{businessName}}. {{reason}}' },
  },
  'booking.rescheduled': {
    en: { subject: 'Booking rescheduled — {{date}} {{time}}', body: 'Your {{serviceName}} booking with {{businessName}} is now on {{date}} at {{time}}. Reference: {{reference}}. {{link}}' },
    ar: { subject: 'تم تغيير موعد الحجز — {{date}} {{time}}', body: 'أصبح موعد حجز {{serviceName}} لدى {{businessName}} يوم {{date}} الساعة {{time}}. رقم الحجز: {{reference}}. {{link}}' },
  },
  'booking.reminder': {
    en: { subject: 'Reminder: {{serviceName}} on {{date}} at {{time}}', body: 'Hi {{customerName}}, a reminder of your {{serviceName}} appointment with {{businessName}} on {{date}} at {{time}}. {{link}}' },
    ar: { subject: 'تذكير: {{serviceName}} يوم {{date}} الساعة {{time}}', body: 'مرحباً {{customerName}}، نذكرك بموعد {{serviceName}} لدى {{businessName}} يوم {{date}} الساعة {{time}}. {{link}}' },
  },
  'payment.received': {
    en: { subject: 'Payment received — {{amount}}', body: 'We received your payment of {{amount}} for {{serviceName}} ({{reference}}). Thank you!' },
    ar: { subject: 'تم استلام الدفعة — {{amount}}', body: 'استلمنا دفعتك بقيمة {{amount}} لخدمة {{serviceName}} ({{reference}}). شكراً لك!' },
  },
  'review.request': {
    en: { subject: 'How was your visit to {{businessName}}?', body: 'Hi {{customerName}}, thanks for visiting {{businessName}}. Would you rate your {{serviceName}} experience? {{link}}' },
    ar: { subject: 'كيف كانت زيارتك إلى {{businessName}}؟', body: 'مرحباً {{customerName}}، شكراً لزيارتك {{businessName}}. هل تقيّم تجربتك مع {{serviceName}}؟ {{link}}' },
  },
};

export function renderTemplate(tpl: string, vars: Record<string, string | number | undefined>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] === undefined ? '' : String(vars[k]))).replace(/\s{2,}/g, ' ').trim();
}
