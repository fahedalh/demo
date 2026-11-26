/**
 * Private document storage. Files are written outside any static directory with random names
 * and are only streamed back through an authorised endpoint. Swap for S3/GCS (signed URLs)
 * in production by re-implementing these three functions.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env';

const root = path.resolve(process.cwd(), env.STORAGE_DIR);

export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Magic-number sniffing so a renamed executable can't pose as an image/PDF. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

export async function saveFile(folder: string, buf: Buffer, mime: string): Promise<string> {
  const key = path.posix.join(folder.replace(/[^a-zA-Z0-9_-]/g, ''), `${randomUUID()}.${ALLOWED_MIME[mime]}`);
  const full = path.join(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { mode: 0o600 });
  return key;
}

export async function readStoredFile(key: string): Promise<Buffer> {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('invalid key');
  return readFile(full);
}

export async function deleteStoredFile(key: string) {
  const full = path.resolve(root, key);
  if (full.startsWith(root + path.sep)) await unlink(full).catch(() => undefined);
}
