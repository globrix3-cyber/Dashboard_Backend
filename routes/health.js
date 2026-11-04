// routes/health.js — uptime/liveness check. Mounted before the rate limiter.
const express = require('express');
const pool    = require('../config/db');
const redis   = require('../config/redis');
const { version } = require('../package.json');

const router = express.Router();

const DB_TIMEOUT_MS    = 3000;
const REDIS_TIMEOUT_MS = 2000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkDb() {
  try {
    await withTimeout(pool.query('SELECT 1'), DB_TIMEOUT_MS);
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis() {
  // Redis is optional; don't queue commands on a client that isn't connected.
  if (!redis.isReady) return 'unavailable';
  try {
    await withTimeout(redis.ping(), REDIS_TIMEOUT_MS);
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

router.get('/', async (req, res) => {
  const [db, redisStatus] = await Promise.all([checkDb(), checkRedis()]);

  let status = 'ok';
  if (db !== 'ok') status = 'down';
  else if (redisStatus !== 'ok') status = 'degraded';

  res.set('Cache-Control', 'no-store');
  res.status(status === 'down' ? 503 : 200).json({
    status,
    db,
    redis:    redisStatus,
    uptime_s: Math.floor(process.uptime()),
    version,
  });
});

module.exports = router;
