const pool = require('../config/db');

class Company {
  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, legal_name, brand_name, is_buyer, is_supplier, country,
              state_province, city, pincode, website, logo_url, description,
              employee_count, annual_revenue, verified_status, is_active, created_at, updated_at
       FROM companies WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  static async create({ legal_name, brand_name, is_buyer, is_supplier, country,
                         state_province, city, pincode, website, description, employee_count }) {
    const { rows } = await pool.query(
      `INSERT INTO companies
         (legal_name, brand_name, is_buyer, is_supplier, country, state_province,
          city, pincode, website, description, employee_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [legal_name, brand_name || null, is_buyer || false, is_supplier || false,
       country, state_province || null, city || null, pincode || null,
       website || null, description || null, employee_count || null]
    );
    return rows[0];
  }

  static async update(id, fields) {
    const allowed = ['brand_name', 'website', 'description', 'logo_url', 'employee_count',
                     'annual_revenue', 'state_province', 'city', 'pincode', 'is_active'];
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
      `UPDATE companies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  static async listAll({ page = 1, limit = 20, is_buyer, is_supplier, country, verified_status } = {}) {
    const conditions = ['is_active = true'];
    const values     = [];
    let   idx        = 1;

    if (is_buyer !== undefined)    { conditions.push(`is_buyer = $${idx++}`);        values.push(is_buyer); }
    if (is_supplier !== undefined) { conditions.push(`is_supplier = $${idx++}`);     values.push(is_supplier); }
    if (country)                   { conditions.push(`country = $${idx++}`);         values.push(country); }
    if (verified_status)           { conditions.push(`verified_status = $${idx++}`); values.push(verified_status); }

    const offset = (page - 1) * limit;
    values.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT id, legal_name, brand_name, is_buyer, is_supplier, country, verified_status, created_at
       FROM companies
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values
    );
    return rows;
  }
}

module.exports = Company;