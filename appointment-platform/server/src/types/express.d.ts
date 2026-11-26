import type { Permission, PlatformRole, MemberRole } from '@bookly/shared';
import type { BusinessDoc } from '../modules/businesses/business.model';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: PlatformRole; email: string; name: string };
      tenant?: {
        business: BusinessDoc;
        memberRole: MemberRole | 'super_admin';
        permissions: Set<Permission>;
        staffId?: string;
      };
    }
  }
}
export {};
