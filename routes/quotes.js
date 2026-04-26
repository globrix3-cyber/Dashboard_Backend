const express     = require('express');
const router      = express.Router();
const pool        = require('../config/db');
const CompanyUser = require('../models/companyUser');
const { authenticateToken } = require('../middleware/auth');

// GET /api/quotes — supplier's submitted quotes
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);
    if (!cu) return res.json({ data: [] }); // no company yet

    const { rows } = await pool.query(
      `SELECT rr.id, rr.quoted_price, rr.currency,
              rr.delivery_time_days, rr.min_order_quantity,
              rr.validity_days, rr.message, rr.status, rr.created_at,
              r.title AS rfq_title, r.expiry_date AS deadline,
              r.quantity, r.quantity_unit
       FROM rfq_responses rr
       JOIN rfqs r ON r.id = rr.rfq_id
       WHERE rr.supplier_company_id = $1
       ORDER BY rr.created_at DESC`,
      [cu.company_id]
    );

    const data = rows.map(q => ({
      id:          q.id,
      rfqTitle:    q.rfq_title,
      totalAmount: q.quoted_price,
      leadTime:    q.delivery_time_days ? `${q.delivery_time_days} days` : 'TBD',
      status:      q.status,
      currency:    q.currency,
      deadline:    q.deadline,
      moq:         q.min_order_quantity,
      validity:    q.validity_days,
      notes:       q.message,
      createdAt:   q.created_at,
    }));

    res.json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/quotes/:id — withdraw / update a pending quote
router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);
    if (!cu) return res.status(403).json({ error: 'No company linked', code: 'FORBIDDEN' });

    const { status, message, quoted_price, delivery_time_days, validity_days } = req.body;
    const fields = [];
    const vals   = [];
    let   idx    = 1;

    if (status)             { fields.push(`status = $${idx++}`);             vals.push(status); }
    if (message)            { fields.push(`message = $${idx++}`);            vals.push(message); }
    if (quoted_price)       { fields.push(`quoted_price = $${idx++}`);       vals.push(quoted_price); }
    if (delivery_time_days) { fields.push(`delivery_time_days = $${idx++}`); vals.push(delivery_time_days); }
    if (validity_days)      { fields.push(`validity_days = $${idx++}`);      vals.push(validity_days); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update', code: 'VALIDATION_ERROR' });

    vals.push(req.params.id, cu.company_id);

    const { rows: [quote] } = await pool.query(
      `UPDATE rfq_responses SET ${fields.join(', ')}
       WHERE id = $${idx++} AND supplier_company_id = $${idx++}
       RETURNING *`,
      vals
    );
    if (!quote) return res.status(404).json({ error: 'Quote not found or access denied', code: 'NOT_FOUND' });
    res.json({ data: quote });
  } catch (err) { next(err); }
});

module.exports = router;
