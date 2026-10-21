// config/redis.js
require('dotenv').config();
const { createClient } = require('redis');
const logger = require('../utils/logger');

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

redis.on('error', (err) => logger.error('Redis error', { message: err.message }));
redis.on('connect', () => logger.info('Redis connected'));

redis.connect().catch((err) => logger.error('Redis connect failed', { message: err.message }));

module.exports = redis;
