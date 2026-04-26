const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  }
  next();
}

/* ── Users ─────────────────────────────────────────────────────────────────── */

// GET /api/admin/users
router.get('/users', authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const offset = (page - 1) * parseInt(limit);

    const conds  = [];
    const vals   = [];
    let   idx    = 1;

    if (search) {
      conds.push(`(u.email ILIKE $${idx} OR u.full_name ILIKE $${idx})`);
      vals.push(`%${search}%`); idx++;
    }
    if (role)              { conds.push(`r.name = $${idx++}`);     vals.push(role); }
    if (status === 'active')    conds.push(`u.is_active = true`);
    if (status === 'suspended') conds.push(`u.is_active = false`);

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    vals.push(parseInt(limit), offset);

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.created_at,
              r.name AS role,
              c.legal_name AS company, c.city
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN company_users cu ON cu.user_id = u.id AND cu.is_active = true
       LEFT JOIN companies c ON c.id = cu.company_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      vals
    );

    const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
    res.json({ data: rows, total: count });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/suspend
router.patch('/users/:id/suspend', authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = now()
       WHERE id = $1 RETURNING id, email, full_name, is_active`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    res.json({
      data: user,
      message: user.is_active ? 'User reactivated' : 'User suspended',
    });
  } catch (err) { next(err); }
});

/* ── Companies ─────────────────────────────────────────────────────────────── */

// GET /api/admin/companies
router.get('/companies', authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, verified_status, search } = req.query;
    const offset = (page - 1) * parseInt(limit);

    const conds = ['c.is_active = true'];
    const vals  = [];
    let   idx   = 1;

    if (verified_status) { conds.push(`c.verified_status = $${idx++}`); vals.push(verified_status); }
    if (search)          { conds.push(`c.legal_name ILIKE $${idx++}`);  vals.push(`%${search}%`);   }

    vals.push(parseInt(limit), offset);

    const { rows } = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*)::int FROM products p WHERE p.supplier_company_id = c.id AND p.status = 'active') AS product_count,
         (SELECT u.email FROM company_users cu JOIN users u ON u.id = cu.user_id WHERE cu.company_id = c.id AND cu.is_active = true LIMIT 1) AS owner_email
       FROM companies c
       WHERE ${conds.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      vals
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/admin/verifications  — pending KYC queue
router.get('/verifications', authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.legal_name, c.city, c.country, c.verified_status,
              c.created_at, c.employee_count, c.is_buyer, c.is_supplier,
         (SELECT crn.registration_number
          FROM company_registration_numbers crn
          WHERE crn.company_id = c.id AND crn.reg_type = 'gst' LIMIT 1) AS gst_number,
         (SELECT crn.registration_number
          FROM company_registration_numbers crn
          WHERE crn.company_id = c.id AND crn.reg_type = 'pan' LIMIT 1) AS pan_number,
         u.email    AS owner_email,
         u.full_name AS owner_name
       FROM companies c
       LEFT JOIN company_users cu ON cu.company_id = c.id AND cu.is_active = true
       LEFT JOIN users u ON u.id = cu.user_id
       WHERE c.verified_status IN ('pending', 'under_review') AND c.is_active = true
       ORDER BY c.created_at ASC`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// PATCH /api/admin/companies/:id/verify
router.patch('/companies/:id/verify', authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be verified or rejected', code: 'VALIDATION_ERROR' });
    }

    const { rows: [company] } = await pool.query(
      `UPDATE companies
       SET verified_status = $1, review_notes = $2,
           reviewed_at = now(), reviewed_by = $3, updated_at = now()
       WHERE id = $4
       RETURNING id, legal_name, verified_status, city`,
      [status, notes || null, req.user.user_id, req.params.id]
    );
    if (!company) return res.status(404).json({ error: 'Company not found', code: 'NOT_FOUND' });

    req.io?.emit('kyc:updated', company);
    res.json({ data: company, message: `Company ${status}` });
  } catch (err) { next(err); }
});

/* ── Platform Stats ─────────────────────────────────────────────────────���───── */

// GET /api/admin/stats
router.get('/stats', authenticateToken, adminOnly, async (req, res, next) => {
  try {
    const [users, cos, products, orders, kyc] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active = true)::int AS active FROM users`),
      pool.query(`SELECT COUNT(*)::int AS total FROM companies WHERE is_active = true`),
      pool.query(`SELECT COUNT(*)::int AS total FROM products WHERE status = 'active'`),
      pool.query(
        `SELECT COUNT(*)::int AS active_orders,
                COALESCE(SUM(total_amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0) AS monthly_revenue
         FROM orders`
      ),
      pool.query(`SELECT COUNT(*)::int AS pending FROM companies WHERE verified_status = 'pending' AND is_active = true`),
    ]);

    const rev = Number(orders.rows[0].monthly_revenue || 0);
    res.json({ data: {
      totalUsers:     users.rows[0].active,
      totalCompanies: cos.rows[0].total,
      totalProducts:  products.rows[0].total,
      activeOrders:   orders.rows[0].active_orders,
      monthlyRevenue: rev >= 10_000_000 ? `${(rev / 10_000_000).toFixed(1)} Cr`
                    : rev >= 100_000    ? `${(rev / 100_000).toFixed(1)}L`
                    : `₹${rev.toLocaleString('en-IN')}`,
      pendingKyc:     kyc.rows[0].pending,
    }});
  } catch (err) { next(err); }
});

module.exports = router;
