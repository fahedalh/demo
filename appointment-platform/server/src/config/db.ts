import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);
// NoSQL-injection protection is done at the HTTP layer (middleware/sanitize.ts strips $-keys from
// body/query) and by Zod validation. Mongoose's global sanitizeFilter is intentionally NOT enabled:
// it would also neutralise the operators ($in, $gte…) used by the application's own queries.

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { autoIndex: true });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
