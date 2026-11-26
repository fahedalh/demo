import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

export const storageConfigured = () => !!env.CLOUDINARY_URL;

/** Uploads an image buffer to Cloudinary (CLOUDINARY_URL is read by the SDK from the environment). */
export async function uploadImage(buffer: Buffer, folder: string): Promise<{ url: string; publicId: string }> {
  if (!storageConfigured()) throw new AppError(503, 'UPLOADS_DISABLED', 'File uploads are not configured on this server (set CLOUDINARY_URL)');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: `bookly/${folder}`, resource_type: 'image' }, (err, result) => {
      if (err || !result) return reject(err ?? new Error('Upload failed'));
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
    stream.end(buffer);
  });
}
