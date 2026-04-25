// config/db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false, // ✅ REQUIRED for Aiven
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('🔥 Unexpected DB error:', err);
});

console.log('✅ PostgreSQL pool created (Aiven SSL fix applied)');

module.exports = pool;