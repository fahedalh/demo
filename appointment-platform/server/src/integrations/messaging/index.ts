/**
 * Outbound messaging adapters. Each adapter is a no-op that reports `skipped` when its credentials
 * are missing, so development works without any third-party accounts.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export type SendResult = { status: 'sent' | 'skipped' | 'failed'; error?: string };

export interface MessageChannel {
  key: 'email' | 'whatsapp' | 'sms' | 'push';
  isConfigured(): boolean;
  send(to: string, message: { subject?: string; text: string; html?: string }): Promise<SendResult>;
}

let transporter: Transporter | null = null;
const mailer = () =>
  (transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  }));

export const emailChannel: MessageChannel = {
  key: 'email',
  isConfigured: () => !!env.SMTP_HOST,
  async send(to, m) {
    if (!this.isConfigured()) {
      logger.info({ to, subject: m.subject }, '[email:dev] not sent (SMTP not configured)');
      return { status: 'skipped' };
    }
    try {
      await mailer().sendMail({ from: env.EMAIL_FROM, to, subject: m.subject, text: m.text, html: m.html });
      return { status: 'sent' };
    } catch (e) {
      return { status: 'failed', error: (e as Error).message };
    }
  },
};

/** WhatsApp Business Cloud API (text messages; template messages are a roadmap item). */
export const whatsappChannel: MessageChannel = {
  key: 'whatsapp',
  isConfigured: () => !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  async send(to, m) {
    if (!this.isConfigured()) {
      logger.info({ to }, '[whatsapp:dev] not sent (WhatsApp not configured)');
      return { status: 'skipped' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^\d]/g, ''), type: 'text', text: { body: m.text } }),
      });
      return res.ok ? { status: 'sent' } : { status: 'failed', error: `HTTP ${res.status}` };
    } catch (e) {
      return { status: 'failed', error: (e as Error).message };
    }
  },
};

export const smsChannel: MessageChannel = {
  key: 'sms',
  isConfigured: () => !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
  async send(to, m) {
    if (!this.isConfigured()) {
      logger.info({ to }, '[sms:dev] not sent (Twilio not configured)');
      return { status: 'skipped' };
    }
    try {
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: env.TWILIO_FROM!, Body: m.text }),
      });
      return res.ok ? { status: 'sent' } : { status: 'failed', error: `HTTP ${res.status}` };
    } catch (e) {
      return { status: 'failed', error: (e as Error).message };
    }
  },
};

/** Push notifications: interface only — web push / FCM adapter is on the roadmap. */
export const pushChannel: MessageChannel = {
  key: 'push',
  isConfigured: () => false,
  async send() {
    return { status: 'skipped' };
  },
};

export const channels = { email: emailChannel, whatsapp: whatsappChannel, sms: smsChannel, push: pushChannel };
