// Starts a throwaway single-node MongoDB replica set for local development/testing.
// Usage: node scripts/mongo-dev.cjs  → prints the URI and keeps running until Ctrl+C.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
(async () => {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ port: Number(process.env.MONGO_PORT || 27017) }] });
  console.log(`MongoDB ready: ${rs.getUri('bookly')}`);
  const stop = async () => { await rs.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => { console.error(e); process.exit(1); });
