require('dotenv').config();
const { Pool }  = require('pg');
const logger    = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Aiven
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => logger.info('PostgreSQL client connected'));
pool.on('error',   (err) => logger.error('Unexpected PostgreSQL error', { message: err.message }));

module.exports = pool;
