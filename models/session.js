// models/session.js
const pool = require('../config/db');

class Session {
  static async create({ user_id, refresh_token_hash, device_info, ip_address, expires_at }) {
    const { rows } = await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, expires_at, created_at`,
      [user_id, refresh_token_hash, device_info || null, ip_address || null, expires_at]
    );
    return rows[0];
  }

  static async findByTokenHash(refresh_token_hash) {
    const { rows } = await pool.query(
      `SELECT * FROM user_sessions
       WHERE refresh_token_hash = $1 AND expires_at > now()`,
      [refresh_token_hash]
    );
    return rows[0] || null;
  }

  static async deleteByTokenHash(refresh_token_hash) {
    await pool.query(
      `DELETE FROM user_sessions WHERE refresh_token_hash = $1`,
      [refresh_token_hash]
    );
  }

  static async deleteAllForUser(user_id) {
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [user_id]);
  }

  static async purgeExpired() {
    await pool.query(`DELETE FROM user_sessions WHERE expires_at <= now()`);
  }
}

module.exports = Session;
