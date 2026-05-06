const express     = require('express');
const router      = express.Router();
const pool        = require('../config/db');
const CompanyUser = require('../models/companyUser');
const { authenticateToken } = require('../middleware/auth');

async function getCompany(userId) {
  return await CompanyUser.findByUserId(userId) || null;
}

async function requireCompany(userId) {
  const cu = await CompanyUser.findByUserId(userId);
  if (!cu) { const e = new Error('No company linked to this account. Please complete your company profile.'); e.status = 403; throw e; }
  return cu;
}

// Normalise RFQ row to a consistent shape the frontend expects
function normalise(r) {
  return {
    ...r,
    budget:    r.target_price,
    deadline:  r.expiry_date,
    unit:      r.quantity_unit,
    category:  r.category_name || null,
    responses: Number(r.responses || 0),
  };
}

/* ── GET /api/rfqs ──────────────────────────────────────────────────────────── */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role === 'buyer') {
      const cu = await getCompany(req.user.user_id);
      if (!cu) return res.json({ data: [] });
      const { rows } = await pool.query(
        `SELECT r.*,
           cat.name AS category_name,
           (SELECT COUNT(*) FROM rfq_responses rr WHERE rr.rfq_id = r.id)::int AS responses
         FROM rfqs r
         LEFT JOIN categories cat ON cat.id = r.category_id
         WHERE r.buyer_company_id = $1
         ORDER BY r.created_at DESC`,
        [cu.company_id]
      );
      return res.json({ data: rows.map(normalise) });
    }

    // supplier / admin — active only
    const { rows } = await pool.query(
      `SELECT r.*,
         cat.name    AS category_name,
         co.legal_name AS buyer_name,
         (SELECT COUNT(*) FROM rfq_responses rr WHERE rr.rfq_id = r.id)::int AS responses
       FROM rfqs r
       LEFT JOIN categories cat ON cat.id = r.category_id
       LEFT JOIN companies  co  ON co.id  = r.buyer_company_id
       WHERE r.status = 'active'
       ORDER BY r.created_at DESC`
    );
    res.json({ data: rows.map(normalise) });
  } catch (err) { next(err); }
});

/* ── POST /api/rfqs ─────────────────────────────────────────────────────────── */
router.post('/', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ error: 'Buyers only', code: 'FORBIDDEN' });
  }
  try {
    const cu = await requireCompany(req.user.user_id);
    const { title, product, category, quantity, unit, budget, deadline, description, destination } = req.body;

    if (!title || !quantity || !deadline) {
      return res.status(400).json({ error: 'title, quantity and deadline are required', code: 'VALIDATION_ERROR' });
    }

    // Resolve category_id from name string
    let category_id = null;
    if (category) {
      const { rows: cats } = await pool.query(
        `SELECT id FROM categories WHERE name ILIKE $1 LIMIT 1`, [category]
      );
      category_id = cats[0]?.id || null;
    }

    const desc = description || product || null;
    const { rows: [rfq] } = await pool.query(
      `INSERT INTO rfqs
         (buyer_company_id, title, description, category_id,
          quantity, quantity_unit, target_price, expiry_date,
          destination_country, status)
       VALUES ($1,$2,$3,$4,$5,$6,
               $7::numeric, $8::date,
               LEFT($9, 100), 'active')
       RETURNING *`,
      [cu.company_id, title, desc, category_id,
       quantity, unit || 'pieces',
       budget  || null, deadline,
       destination || 'IN']
    );

    const result = normalise({ ...rfq, category_name: category || null });
    req.io?.emit('rfq:new', result);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

/* ── GET /api/rfqs/:id ──────────────────────────────────────────────────────── */
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { rows: [rfq] } = await pool.query(
      `SELECT r.*,
         cat.name    AS category_name,
         co.legal_name AS buyer_name, co.city AS buyer_city,
         (SELECT COUNT(*) FROM rfq_responses rr WHERE rr.rfq_id = r.id)::int AS responses
       FROM rfqs r
       LEFT JOIN categories cat ON cat.id = r.category_id
       LEFT JOIN companies  co  ON co.id  = r.buyer_company_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rfq) return res.status(404).json({ error: 'RFQ not found', code: 'NOT_FOUND' });

    const { rows: quotes } = await pool.query(
      `SELECT rr.id, rr.supplier_company_id, rr.quoted_price AS price_per_unit, rr.currency,
              rr.delivery_time_days, rr.min_order_quantity, rr.validity_days,
              rr.message AS notes, rr.status, rr.created_at,
              cs.legal_name AS supplier_name, cs.city AS supplier_city
       FROM rfq_responses rr
       JOIN companies cs ON cs.id = rr.supplier_company_id
       WHERE rr.rfq_id = $1
       ORDER BY rr.created_at ASC`,
      [req.params.id]
    );

    res.json({ data: { ...normalise(rfq), rfq_responses: quotes } });
  } catch (err) { next(err); }
});

/* ── POST /api/rfqs/:id/quotes — supplier submits quote ─────────────────────── */
router.post('/:id/quotes', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'supplier') {
    return res.status(403).json({ error: 'Suppliers only', code: 'FORBIDDEN' });
  }
  try {
    const cu = await requireCompany(req.user.user_id);

    // Prevent duplicate
    const { rows: ex } = await pool.query(
      `SELECT id FROM rfq_responses WHERE rfq_id = $1 AND supplier_company_id = $2`,
      [req.params.id, cu.company_id]
    );
    if (ex.length) return res.status(409).json({ error: 'You already submitted a quote', code: 'ALREADY_EXISTS' });

    const {
      price_per_unit, quoted_price, currency,
      delivery_time_days, lead_time,
      min_order_quantity, validity_days,
      message, notes,
    } = req.body;

    const price    = Number(quoted_price || price_per_unit);
    const delivery = delivery_time_days || (lead_time ? parseInt(lead_time) : null);
    const msg      = message || notes || null;

    if (!price) return res.status(400).json({ error: 'quoted_price is required', code: 'VALIDATION_ERROR' });

    const { rows: [quote] } = await pool.query(
      `INSERT INTO rfq_responses
         (rfq_id, supplier_company_id, quoted_price, currency,
          delivery_time_days, min_order_quantity, validity_days, message, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [req.params.id, cu.company_id, price, currency || 'INR',
       delivery || null, min_order_quantity || null, validity_days || 7, msg]
    );

    req.io?.emit('quote:new', { rfqId: req.params.id, quote });
    res.status(201).json({ data: quote });
  } catch (err) { next(err); }
});

/* ── PATCH /api/rfqs/:id ────────────────────────────────────────────────────── */
router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const cu   = await requireCompany(req.user.user_id);
    const { status } = req.body;
    const ok = ['closed', 'cancelled', 'active'];
    if (!ok.includes(status)) return res.status(400).json({ error: `status must be one of: ${ok}`, code: 'VALIDATION_ERROR' });

    const { rows: [rfq] } = await pool.query(
      `UPDATE rfqs SET status = $1, updated_at = now()
       WHERE id = $2 AND buyer_company_id = $3
       RETURNING *`,
      [status, req.params.id, cu.company_id]
    );
    if (!rfq) return res.status(404).json({ error: 'RFQ not found or access denied', code: 'NOT_FOUND' });
    res.json({ data: normalise(rfq) });
  } catch (err) { next(err); }
});

module.exports = router;
