/**
 * One-time passwords for phone/email verification, password reset and passwordless login.
 * Codes are hashed at rest, expire after 10 minutes and allow 5 attempts.
 * Delivery is pluggable: `console` logs the code (development); add Twilio/SES adapters here.
 */
import { createHash } from 'node:crypto';
import type { OtpPurpose } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { otp6 } from '../lib/ids';
import { env } from '../config/env';
import { badRequest } from '../lib/errors';

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

interface OtpDelivery {
  send(target: string, code: string, purpose: OtpPurpose): Promise<void>;
}

const consoleDelivery: OtpDelivery = {
  async send(target, code, purpose) {
    logger.info({ target, purpose }, `📨 OTP for ${target}: ${code} (console delivery — development only)`);
  },
};

const delivery: OtpDelivery = { console: consoleDelivery }[env.OTP_DELIVERY];

/** Last code generated per target, exposed to tests only. */
export const lastOtpForTests = new Map<string, string>();

export async function issueOtp(target: string, purpose: OtpPurpose, userId?: string | null) {
  const recent = await prisma.otpCode.count({
    where: { target, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent > 0) throw badRequest('Please wait a minute before requesting another code');
  const code = otp6();
  await prisma.otpCode.create({
    data: {
      target,
      purpose,
      userId: userId ?? null,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  if (!env.isProd) lastOtpForTests.set(`${purpose}:${target}`, code);
  await delivery.send(target, code, purpose);
}

export async function consumeOtp(target: string, purpose: OtpPurpose, code: string) {
  const otp = await prisma.otpCode.findFirst({
    where: { target, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.attempts >= 5) throw badRequest('Code is invalid or has expired');
  if (otp.codeHash !== hash(code)) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw badRequest('Incorrect code');
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return otp;
}
