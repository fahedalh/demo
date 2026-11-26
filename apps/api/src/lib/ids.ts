import { randomBytes, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

export function shortCode(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}

export const rideCode = () => shortCode('MS', 6);
export const receiptNumber = () => `RC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${shortCode('', 6).slice(1)}`;
export const pin4 = () => String(randomInt(0, 10_000)).padStart(4, '0');
export const otp6 = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
