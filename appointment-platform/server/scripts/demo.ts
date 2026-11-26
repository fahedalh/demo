/* eslint-disable no-console */
/**
 * One-command demo: throwaway MongoDB (mongodb-memory-server) → demo seed → API + built web app.
 *   npm run demo          → http://localhost:4000
 * Data lives in memory and is discarded on exit. For real use, see README (npm run dev / docker).
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.PORT ?? 4000);
const BASE = `http://localhost:${PORT}`;
const DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Client build missing — run: npm run build -w client');
  console.log('Starting throwaway MongoDB…');
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, { MONGODB_URI: rs.getUri('bookly_demo'), APP_URL: BASE, API_URL: BASE, CORS_ORIGINS: BASE, PAYMENTS_TEST_PROVIDER: 'true' });

  const { connectDb } = await import('../src/config/db');
  const { createApp } = await import('../src/app');
  const { initSocket } = await import('../src/realtime/socket');
  const { startJobs } = await import('../src/jobs');
  const { seed } = await import('../src/scripts/seed');
  await connectDb(process.env.MONGODB_URI);
  console.log('Seeding demo data…');
  await seed(() => undefined);

  const root = express();
  root.use(express.static(DIST, { index: false, maxAge: '1h' }));
  root.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  root.use(createApp());
  const server = http.createServer(root);
  initSocket(server);
  startJobs();
  server.listen(PORT, () => {
    console.log(`\n  Bookly is running →  ${BASE}\n  API docs           →  ${BASE}/api/docs\n`);
    console.log('  Super admin     admin@bookly.dev   / Admin123!');
    console.log('  Business owner  clinic@bookly.dev  / Owner123!  (also salon@, tutor@, legal@, auto@, hive@, civic@)');
    console.log('  Staff           layla@bookly.dev   / Staff123!');
    console.log('  Customer        sara@example.com   / Customer123!\n');
    console.log('  Data is in-memory and resets when you stop (Ctrl+C).');
  });
  const stop = async () => {
    server.close();
    await rs.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
