import http from 'http';
import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeRedis, getRedis } from './config/redis';
import { startJobs, stopJobs } from './jobs';
import { initSocket } from './realtime/socket';

async function main() {
  await connectDb();
  getRedis();
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  if (env.JOBS_ENABLED) startJobs();
  server.listen(env.PORT, () => logger.info(`API listening on ${env.API_URL} (docs: ${env.API_URL}/api/docs)`));

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    server.close();
    await Promise.allSettled([disconnectDb(), closeRedis()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
