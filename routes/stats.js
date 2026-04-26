const express     = require('express');
const router      = express.Router();
const pool        = require('../config/db');
const CompanyUser = require('../models/companyUser');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const role = req.query.role || req.user.role;
    const cu   = await CompanyUser.findByUserId(req.user.user_id).catch(() => null);
    const cId  = cu?.company_id || null;

    /* ── BUYER ──────────────────────────────────────────────────────────────── */
    if (role === 'buyer') {
      const [r1, r2, r3] = await Promise.all([
        cId ? pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'active')::int AS active_rfqs
           FROM rfqs WHERE buyer_company_id = $1`, [cId]
        ) : Promise.resolve({ rows: [{ active_rfqs: 0 }] }),

        cId ? pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled'))::int AS pending_orders,
             COALESCE(SUM(order_value) FILTER (WHERE status = 'delivered'), 0) AS total_spend
           FROM orders WHERE buyer_company_id = $1`, [cId]
        ) : Promise.resolve({ rows: [{ pending_orders: 0, total_spend: 0 }] }),

        cId ? pool.query(
          `SELECT COUNT(*)::int AS saved FROM saved_suppliers WHERE buyer_company_id = $1`, [cId]
        ) : Promise.resolve({ rows: [{ saved: 0 }] }),
      ]);

      const spend = Number(r2.rows[0].total_spend || 0);
      return res.json({ data: {
        activeRfqs:     r1.rows[0].active_rfqs,
        pendingOrders:  r2.rows[0].pending_orders,
        totalSpend:     spend > 0 ? `₹${spend.toLocaleString('en-IN')}` : '₹0',
        savedSuppliers: r3.rows[0].saved,
      }});
    }

    /* ── SUPPLIER ───────────────────────────────────────────────────────────── */
    if (role === 'supplier') {
      const [r1, r2, r3, r4] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS open_rfqs FROM rfqs WHERE status = 'active'`),

        cId ? pool.query(
          `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS active_quotes
           FROM rfq_responses WHERE supplier_company_id = $1`, [cId]
        ) : Promise.resolve({ rows: [{ active_quotes: 0 }] }),

        cId ? pool.query(
          `SELECT COALESCE(SUM(order_value) FILTER (WHERE status = 'delivered'), 0) AS revenue
           FROM orders WHERE supplier_company_id = $1`, [cId]
        ) : Promise.resolve({ rows: [{ revenue: 0 }] }),

        cId ? pool.query(
          `SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS avg_rating
           FROM reviews WHERE supplier_company_id = $1`, [cId]
        ).catch(() => ({ rows: [{ avg_rating: 0 }] }))
          : Promise.resolve({ rows: [{ avg_rating: 0 }] }),
      ]);

      const rev    = Number(r3.rows[0].revenue || 0);
      const rating = parseFloat(r4.rows[0].avg_rating || 0);
      return res.json({ data: {
        openRfqs:     r1.rows[0].open_rfqs,
        activeQuotes: r2.rows[0].active_quotes,
        revenue:      rev > 0 ? `₹${rev.toLocaleString('en-IN')}` : '₹0',
        rating:       rating > 0 ? String(rating) : '—',
      }});
    }

    /* ── ADMIN ──────────────────────────────────────────────────────────────── */
    if (role === 'admin') {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE is_active = true`),
        pool.query(`SELECT COUNT(*)::int AS total FROM companies WHERE is_active = true`),
        pool.query(`SELECT COUNT(*)::int AS total FROM products WHERE status = 'active'`),
        pool.query(
          `SELECT COUNT(*)::int AS active_orders,
                  COALESCE(SUM(order_value), 0) AS monthly_revenue
           FROM orders WHERE created_at >= now() - interval '30 days'`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS pending
           FROM companies WHERE verified_status = 'pending' AND is_active = true`
        ),
      ]);

      const rev = Number(r4.rows[0].monthly_revenue || 0);
      return res.json({ data: {
        totalUsers:     r1.rows[0].total,
        totalCompanies: r2.rows[0].total,
        totalProducts:  r3.rows[0].total,
        activeOrders:   r4.rows[0].active_orders,
        monthlyRevenue: rev >= 10_000_000 ? `${(rev / 10_000_000).toFixed(1)} Cr`
                      : rev >= 100_000    ? `${(rev / 100_000).toFixed(1)}L`
                      : `₹${rev.toLocaleString('en-IN')}`,
        pendingKyc:     r5.rows[0].pending,
      }});
    }

    res.status(400).json({ error: 'Invalid role parameter', code: 'VALIDATION_ERROR' });
  } catch (err) { next(err); }
});

module.exports = router;
