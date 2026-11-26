import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth';
import { storageConfigured, uploadImage } from '../../integrations/storage';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new AppError(415, 'UNSUPPORTED_FILE', 'Only JPEG, PNG or WebP images are allowed'))),
});

/** Checks magic bytes so a renamed file cannot pass as an image. */
function looksLikeImage(buf: Buffer) {
  return (
    (buf[0] === 0xff && buf[1] === 0xd8) || // jpeg
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || // png
    (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP')
  );
}

export const uploadRouter = Router();
uploadRouter.get('/status', (_req, res) => res.json({ enabled: storageConfigured() }));
uploadRouter.post(
  '/image',
  requireAuth,
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw AppError.badRequest('No file uploaded');
    if (!looksLikeImage(req.file.buffer)) throw new AppError(415, 'UNSUPPORTED_FILE', 'The file is not a valid image');
    const folder = String(req.query.folder ?? 'misc').replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'misc';
    res.status(201).json(await uploadImage(req.file.buffer, folder));
  }),
);
