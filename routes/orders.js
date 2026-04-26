const express     = require('express');
const router      = express.Router();
const pool        = require('../config/db');
const CompanyUser = require('../models/companyUser');
const { authenticateToken } = require('../middleware/auth');

// GET /api/orders
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);
    if (!cu) return res.json({ data: [] }); // no company yet — empty list

    let rows;
    if (req.user.role === 'buyer') {
      ({ rows } = await pool.query(
        `SELECT o.id, o.order_number, o.status, o.order_value, o.currency,
                o.delivery_deadline, o.created_at,
                cs.legal_name AS supplier,
                (SELECT p.name FROM order_items oi
                 LEFT JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id = o.id LIMIT 1) AS product
         FROM orders o
         LEFT JOIN companies cs ON cs.id = o.supplier_company_id
         WHERE o.buyer_company_id = $1
         ORDER BY o.created_at DESC`,
        [cu.company_id]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT o.id, o.order_number, o.status, o.order_value, o.currency,
                o.delivery_deadline, o.created_at,
                cb.legal_name AS buyer,
                (SELECT p.name FROM order_items oi
                 LEFT JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id = o.id LIMIT 1) AS product
         FROM orders o
         LEFT JOIN companies cb ON cb.id = o.buyer_company_id
         WHERE o.supplier_company_id = $1
         ORDER BY o.created_at DESC`,
        [cu.company_id]
      ));
    }

    const data = rows.map(o => ({
      id:           o.id,
      orderNo:      o.order_number || `ORD-${String(o.id).slice(0, 8).toUpperCase()}`,
      product:      o.product      || 'Order',
      amount:       Number(o.order_value) || 0,
      status:       o.status       || 'confirmed',
      supplier:     o.supplier     || null,
      buyer:        o.buyer        || null,
      deliveryDate: o.delivery_deadline,
      createdAt:    o.created_at,
    }));

    res.json({ data });
  } catch (err) { next(err); }
});

// GET /api/orders/:id
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);
    const { rows: [order] } = await pool.query(
      `SELECT o.*,
         cb.legal_name AS buyer_name,   cb.city AS buyer_city,
         cs.legal_name AS supplier_name, cs.city AS supplier_city
       FROM orders o
       LEFT JOIN companies cb ON cb.id = o.buyer_company_id
       LEFT JOIN companies cs ON cs.id = o.supplier_company_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });

    if (cu && order.buyer_company_id !== cu.company_id && order.supplier_company_id !== cu.company_id) {
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    const { rows: items } = await pool.query(
      `SELECT oi.*, COALESCE(p.name, oi.product_name) AS product_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );

    res.json({ data: { ...order, amount: Number(order.order_value), items } });
  } catch (err) { next(err); }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);
    if (!cu) return res.status(403).json({ error: 'No company', code: 'FORBIDDEN' });

    const { status } = req.body;
    const allowed = ['confirmed', 'in_production', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed}`, code: 'VALIDATION_ERROR' });
    }

    const { rows: [order] } = await pool.query(
      `UPDATE orders SET status = $1, updated_at = now()
       WHERE id = $2 AND supplier_company_id = $3
       RETURNING id, order_number, status`,
      [status, req.params.id, cu.company_id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found or access denied', code: 'NOT_FOUND' });

    req.io?.emit('order:statusUpdated', order);
    res.json({ data: order });
  } catch (err) { next(err); }
});

module.exports = router;
