// models/permission.js
const pool = require('../config/db');

class Permission {
  static async findByRole(role) {
    const { rows } = await pool.query(
      `SELECT p.module, p.can_read, p.can_write, p.can_delete
       FROM permissions p JOIN roles r ON r.id = p.role_id
       WHERE r.name = $1 ORDER BY p.module`,
      [role]
    );
    return rows;
  }

  static async upsert({ role, module, can_read, can_write, can_delete }) {
    const { rows } = await pool.query(
      `INSERT INTO permissions (role_id, module, can_read, can_write, can_delete)
       VALUES ((SELECT id FROM roles WHERE name = $1), $2, $3, $4, $5)
       ON CONFLICT (role_id, module) DO UPDATE
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
      `DELETE FROM permissions
       WHERE role_id = (SELECT id FROM roles WHERE name = $1) AND module = $2`,
      [role, module]
    );
  }

  static async listAll() {
    const { rows } = await pool.query(
      `SELECT r.name AS role, p.module, p.can_read, p.can_write, p.can_delete
       FROM permissions p JOIN roles r ON r.id = p.role_id
       ORDER BY r.name, p.module`
    );
    return rows;
  }
}

module.exports = Permission;
