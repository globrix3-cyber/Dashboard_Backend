// models/user.js
const pool = require('../config/db');

class User {
  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, phone_number, email_verified, phone_verified,
              is_active, preferred_language, avatar_url, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  }

  static async create({ email, password_hash, phone_number, preferred_language, full_name }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, phone_number, preferred_language, full_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, phone_number, preferred_language, created_at`,
      [email, password_hash, phone_number || null, preferred_language || 'en', full_name || null]
    );
    return rows[0];
  }

  static async update(id, fields) {
    const allowed = ['phone_number', 'preferred_language', 'avatar_url', 'email_verified', 'phone_verified', 'is_active', 'full_name'];
    const updates = [];
    const values  = [];
    let   idx     = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, phone_number, preferred_language, avatar_url, is_active, updated_at`,
      values
    );
    return rows[0] || null;
  }

  static async updatePassword(id, password_hash) {
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [password_hash, id]
    );
  }
}

module.exports = User;
