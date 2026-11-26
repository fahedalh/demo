import { createServer } from 'node:http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { createApp } from './app';
import { createSocketServer } from './realtime/socket';
import { dispatch, startScheduler, stopScheduler } from './services/dispatch.service';

const app = createApp();
const http = createServer(app);
const io = createSocketServer(http);

http.listen(env.API_PORT, async () => {
  logger.info(`🚗 Masar API listening on http://localhost:${env.API_PORT}`);
  await dispatch.recover().catch((err) => logger.error({ err }, 'dispatch recovery failed'));
  startScheduler();
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stopScheduler();
  dispatch.clearAllTimers();
  io.close();
  http.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
