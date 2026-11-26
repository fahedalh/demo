import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/** Records an admin action in AdminActivityLog. Never throws (auditing must not break the action). */
export async function audit(req: Request, action: string, entityType: string, entityId?: string | null, metadata?: unknown) {
  if (!req.user) return;
  try {
    await prisma.adminActivityLog.create({
      data: { adminId: req.user.id, action, entityType, entityId: entityId ?? null, metadata: (metadata ?? undefined) as any, ip: req.ip },
    });
  } catch (err) {
    logger.error({ err }, 'failed to write audit log');
  }
}
