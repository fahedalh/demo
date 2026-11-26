import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';
import type { AdminRole, Role } from '@masar/shared';

export interface AccessClaims {
  sub: string;
  role: Role;
  adminRole: AdminRole | null;
  tv: number; // token version — bumped on suspension / password change
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'masar-api',
    audience: 'masar',
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'masar-api', audience: 'masar' }) as AccessClaims;
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
