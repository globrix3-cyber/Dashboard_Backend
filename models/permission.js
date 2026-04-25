// models/permission.js
const pool = require('../config/db');

class Permission {
  static async findByRole(role) {
    const { rows } = await pool.query(
      `SELECT module, can_read, can_write, can_delete
       FROM permissions WHERE role = $1 ORDER BY module`,
      [role]
    );
    return rows;
  }

  static async upsert({ role, module, can_read, can_write, can_delete }) {
    const { rows } = await pool.query(
      `INSERT INTO permissions (role, module, can_read, can_write, can_delete)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (role, module) DO UPDATE
         SET can_read   = EXCLUDED.can_read,
             can_write  = EXCLUDED.can_write,
             can_delete = EXCLUDED.can_delete
       RETURNING *`,
      [role, module, can_read || false, can_write || false, can_delete || false]
    );
    return rows[0];
  }

  static async delete({ role, module }) {
    await pool.query(
      `DELETE FROM permissions WHERE role = $1 AND module = $2`,
      [role, module]
    );
  }

  static async listAll() {
    const { rows } = await pool.query(
      `SELECT role, module, can_read, can_write, can_delete
       FROM permissions ORDER BY role, module`
    );
    return rows;
  }
}

module.exports = Permission;
