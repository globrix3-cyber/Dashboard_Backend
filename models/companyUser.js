const pool = require('../config/db');

class CompanyUser {
  static async create({ user_id, company_id, invited_by }) {
    const { rows } = await pool.query(
      `INSERT INTO company_users (user_id, company_id, invited_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user_id, company_id, invited_by || null]
    );
    return rows[0];
  }

  static async findByUserId(user_id) {
    const { rows } = await pool.query(
      `SELECT cu.*, c.legal_name, c.brand_name, c.is_buyer, c.is_supplier
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.user_id = $1 AND cu.is_active = true`,
      [user_id]
    );
    return rows[0] || null;
  }

  static async findByCompanyId(company_id) {
    const { rows } = await pool.query(
      `SELECT cu.id, cu.is_active, cu.created_at,
              u.id AS user_id, u.email, u.avatar_url,
              r.name AS role
       FROM company_users cu
       JOIN users u ON u.id = cu.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE cu.company_id = $1
       ORDER BY cu.created_at ASC`,
      [company_id]
    );
    return rows;
  }

  // Check if a user is a member of a specific company
  static async isMember(user_id, company_id) {
    const { rows } = await pool.query(
      `SELECT id FROM company_users
       WHERE user_id = $1 AND company_id = $2 AND is_active = true`,
      [user_id, company_id]
    );
    return rows.length > 0;
  }

  static async deactivate(id) {
    await pool.query(
      `UPDATE company_users SET is_active = false WHERE id = $1`,
      [id]
    );
  }
}

module.exports = CompanyUser;