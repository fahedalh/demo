import type { Request } from 'express';
import { AuditLog } from '../modules/audit/audit.model';
import { logger } from '../config/logger';

export async function audit(
  req: Request | null,
  action: string,
  entity?: { type: string; id?: unknown; business?: unknown },
  meta?: Record<string, unknown>,
) {
  try {
    await AuditLog.create({
      actor: req?.user?.id,
      actorName: req?.user?.name,
      business: entity?.business ?? req?.tenant?.business._id,
      action,
      entity: entity?.type,
      entityId: entity?.id ? String(entity.id) : undefined,
      meta,
      ip: req?.ip,
    });
  } catch (err) {
    logger.warn({ err }, 'audit log write failed');
  }
}
