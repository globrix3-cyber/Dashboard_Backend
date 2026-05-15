const express     = require('express');
const router      = express.Router();
const pool        = require('../config/db');
const CompanyUser = require('../models/companyUser');
const { authenticateToken } = require('../middleware/auth');

async function requireCompany(userId) {
  const cu = await CompanyUser.findByUserId(userId);
  if (!cu) {
    const e = new Error('No company linked to this account.');
    e.status = 403;
    throw e;
  }
  return cu;
}

function nextContractNumber(client) {
  return client.query(`SELECT 'CTR-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('contract_number_seq')::text,4,'0') AS num`)
    .then(r => r.rows[0].num);
}

/* ── GET /api/contracts ────────────────────────────────────────────────────── */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);
    if (!cu) return res.json({ data: [] });

    let rows;
    if (req.user.role === 'buyer') {
      ({ rows } = await pool.query(
        `SELECT c.id, c.contract_number, c.title, c.status,
                c.total_value, c.currency, c.delivery_deadline, c.created_at,
                c.buyer_signed_at, c.supplier_signed_at,
                cs.legal_name AS supplier_name
         FROM contracts c
         JOIN companies cs ON cs.id = c.supplier_company_id
         WHERE c.buyer_company_id = $1
         ORDER BY c.created_at DESC`,
        [cu.company_id]
      ));
    } else if (req.user.role === 'supplier') {
      ({ rows } = await pool.query(
        `SELECT c.id, c.contract_number, c.title, c.status,
                c.total_value, c.currency, c.delivery_deadline, c.created_at,
                c.buyer_signed_at, c.supplier_signed_at,
                cb.legal_name AS buyer_name
         FROM contracts c
         JOIN companies cb ON cb.id = c.buyer_company_id
         WHERE c.supplier_company_id = $1
         ORDER BY c.created_at DESC`,
        [cu.company_id]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT c.id, c.contract_number, c.title, c.status,
                c.total_value, c.currency, c.delivery_deadline, c.created_at,
                cb.legal_name AS buyer_name, cs.legal_name AS supplier_name
         FROM contracts c
         JOIN companies cb ON cb.id = c.buyer_company_id
         JOIN companies cs ON cs.id = c.supplier_company_id
         ORDER BY c.created_at DESC`
      ));
    }

    res.json({ data: rows });
  } catch (err) { next(err); }
});

/* ── POST /api/contracts ───────────────────────────────────────────────────── */
router.post('/', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ error: 'Only buyers can create contracts', code: 'FORBIDDEN' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cu = await requireCompany(req.user.user_id);

    const {
      rfq_id, quote_id, supplier_company_id,
      title, product_description,
      quantity, quantity_unit,
      unit_price, total_value, currency,
      payment_terms, payment_method, incoterms,
      delivery_destination, delivery_deadline, lead_time_days,
      quality_standards, inspection_terms, warranty_terms,
      dispute_resolution, governing_law, special_terms,
      valid_until,
    } = req.body;

    if (!title || !supplier_company_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'title and supplier_company_id are required', code: 'VALIDATION_ERROR' });
    }

    const contractNumber = await nextContractNumber(client);

    const { rows: [contract] } = await client.query(
      `INSERT INTO contracts (
         contract_number,
         rfq_id, quote_id,
         buyer_company_id, supplier_company_id,
         status,
         title, product_description,
         quantity, quantity_unit,
         unit_price, total_value, currency,
         payment_terms, payment_method, incoterms,
         delivery_destination, delivery_deadline, lead_time_days,
         quality_standards, inspection_terms, warranty_terms,
         dispute_resolution, governing_law, special_terms,
         valid_until, created_by,
         buyer_signed_at, buyer_signed_by
       ) VALUES (
         $1,$2,$3,$4,$5,
         'pending_supplier',
         $6,$7,$8,$9,$10,$11,$12,
         $13,$14,$15,$16,
         $17::date,$18,$19,$20,$21,
         $22,$23,$24,
         $25::date,$26,
         NOW(),$26
       ) RETURNING *`,
      [
        contractNumber,
        rfq_id || null, quote_id || null,
        cu.company_id, supplier_company_id,
        title, product_description || null,
        quantity || null, quantity_unit || null,
        unit_price || null, total_value || null, currency || 'USD',
        payment_terms || null, payment_method || null, incoterms || null,
        delivery_destination || null, delivery_deadline || null, lead_time_days || null,
        quality_standards || null, inspection_terms || null, warranty_terms || null,
        dispute_resolution || null, governing_law || null, special_terms || null,
        valid_until || null, req.user.user_id,
      ]
    );

    // Notify supplier via notification row
    const { rows: [supplierUser] } = await client.query(
      `SELECT cu.user_id FROM company_users cu WHERE cu.company_id = $1 LIMIT 1`,
      [supplier_company_id]
    );
    if (supplierUser) {
      await client.query(
        `INSERT INTO notifications (user_id, type, subject, body)
         VALUES ($1, 'contract_received', 'New Contract Awaiting Your Signature', $2)`,
        [supplierUser.user_id, `Buyer has sent contract "${title}" (${contractNumber}) for your review.`]
      );
    }

    await client.query('COMMIT');

    // Attach company names
    const { rows: [buyer] }    = await pool.query(`SELECT legal_name FROM companies WHERE id = $1`, [cu.company_id]);
    const { rows: [supplier] } = await pool.query(`SELECT legal_name FROM companies WHERE id = $1`, [supplier_company_id]);

    const result = { ...contract, buyer_name: buyer?.legal_name, supplier_name: supplier?.legal_name };

    req.io?.emit('contract:new', { contractId: contract.id, supplierCompanyId: supplier_company_id });
    res.status(201).json({ data: result });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/* ── GET /api/contracts/:id ────────────────────────────────────────────────── */
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const cu = await CompanyUser.findByUserId(req.user.user_id);

    const { rows: [contract] } = await pool.query(
      `SELECT c.*,
         cb.legal_name AS buyer_name,   cb.city AS buyer_city,
         cs.legal_name AS supplier_name, cs.city AS supplier_city,
         ub.full_name  AS buyer_signed_by_name,
         us.full_name  AS supplier_signed_by_name
       FROM contracts c
       JOIN companies cb ON cb.id = c.buyer_company_id
       JOIN companies cs ON cs.id = c.supplier_company_id
       LEFT JOIN users ub ON ub.id = c.buyer_signed_by
       LEFT JOIN users us ON us.id = c.supplier_signed_by
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (!contract) return res.status(404).json({ error: 'Contract not found', code: 'NOT_FOUND' });

    if (cu && req.user.role !== 'admin') {
      const allowed = contract.buyer_company_id === cu.company_id ||
                      contract.supplier_company_id === cu.company_id;
      if (!allowed) return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    res.json({ data: contract });
  } catch (err) { next(err); }
});

/* ── PATCH /api/contracts/:id ──────────────────────────────────────────────── */
router.patch('/:id', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ error: 'Only buyers can edit contract terms', code: 'FORBIDDEN' });
  }
  try {
    const cu = await requireCompany(req.user.user_id);

    const { rows: [existing] } = await pool.query(
      `SELECT * FROM contracts WHERE id = $1 AND buyer_company_id = $2`,
      [req.params.id, cu.company_id]
    );
    if (!existing) return res.status(404).json({ error: 'Contract not found or access denied', code: 'NOT_FOUND' });
    if (existing.status !== 'pending_supplier') {
      return res.status(400).json({ error: 'Contract can only be edited while pending supplier signature', code: 'INVALID_STATE' });
    }

    const {
      title, product_description,
      quantity, quantity_unit, unit_price, total_value, currency,
      payment_terms, payment_method, incoterms,
      delivery_destination, delivery_deadline, lead_time_days,
      quality_standards, inspection_terms, warranty_terms,
      dispute_resolution, governing_law, special_terms, valid_until,
    } = req.body;

    const { rows: [updated] } = await pool.query(
      `UPDATE contracts SET
         title               = COALESCE($1,  title),
         product_description = COALESCE($2,  product_description),
         quantity            = COALESCE($3,  quantity),
         quantity_unit       = COALESCE($4,  quantity_unit),
         unit_price          = COALESCE($5,  unit_price),
         total_value         = COALESCE($6,  total_value),
         currency            = COALESCE($7,  currency),
         payment_terms       = COALESCE($8,  payment_terms),
         payment_method      = COALESCE($9,  payment_method),
         incoterms           = COALESCE($10, incoterms),
         delivery_destination= COALESCE($11, delivery_destination),
         delivery_deadline   = COALESCE($12::date, delivery_deadline),
         lead_time_days      = COALESCE($13, lead_time_days),
         quality_standards   = COALESCE($14, quality_standards),
         inspection_terms    = COALESCE($15, inspection_terms),
         warranty_terms      = COALESCE($16, warranty_terms),
         dispute_resolution  = COALESCE($17, dispute_resolution),
         governing_law       = COALESCE($18, governing_law),
         special_terms       = COALESCE($19, special_terms),
         valid_until         = COALESCE($20::date, valid_until),
         updated_at          = NOW()
       WHERE id = $21
       RETURNING *`,
      [
        title, product_description,
        quantity, quantity_unit, unit_price, total_value, currency,
        payment_terms, payment_method, incoterms,
        delivery_destination, delivery_deadline, lead_time_days,
        quality_standards, inspection_terms, warranty_terms,
        dispute_resolution, governing_law, special_terms, valid_until,
        req.params.id,
      ]
    );

    res.json({ data: updated });
  } catch (err) { next(err); }
});

/* ── POST /api/contracts/:id/sign ──────────────────────────────────────────── */
router.post('/:id/sign', authenticateToken, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cu = await requireCompany(req.user.user_id);
    const role = req.user.role;

    if (role !== 'buyer' && role !== 'supplier') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only buyers and suppliers can sign contracts', code: 'FORBIDDEN' });
    }

    const { rows: [contract] } = await client.query(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!contract) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contract not found', code: 'NOT_FOUND' });
    }

    // Access check
    if (role === 'buyer'    && contract.buyer_company_id    !== cu.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    if (role === 'supplier' && contract.supplier_company_id !== cu.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    if (contract.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot sign a cancelled contract', code: 'INVALID_STATE' });
    }
    if (contract.status === 'active' || contract.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Contract is already active', code: 'INVALID_STATE' });
    }

    let newStatus = contract.status;
    let updateCol, signedBy;

    if (role === 'supplier') {
      if (contract.supplier_signed_at) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You already signed this contract', code: 'ALREADY_EXISTS' });
      }
      updateCol = 'supplier_signed_at = NOW(), supplier_signed_by = $2';
      signedBy  = req.user.user_id;
      newStatus = contract.buyer_signed_at ? 'active' : 'pending_buyer';
    } else {
      if (contract.buyer_signed_at) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You already signed this contract', code: 'ALREADY_EXISTS' });
      }
      updateCol = 'buyer_signed_at = NOW(), buyer_signed_by = $2';
      signedBy  = req.user.user_id;
      newStatus = contract.supplier_signed_at ? 'active' : 'pending_supplier';
    }

    const { rows: [updated] } = await client.query(
      `UPDATE contracts
       SET ${updateCol}, status = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, signedBy, newStatus]
    );

    // Notify the other party
    const notifyCompanyId = role === 'supplier'
      ? contract.buyer_company_id
      : contract.supplier_company_id;
    const notifyLabel = role === 'supplier' ? 'Supplier signed' : 'Buyer signed';

    const { rows: [notifyUser] } = await client.query(
      `SELECT cu.user_id FROM company_users cu WHERE cu.company_id = $1 LIMIT 1`,
      [notifyCompanyId]
    );
    if (notifyUser) {
      const bodyMsg = newStatus === 'active'
        ? `Contract "${contract.title}" (${contract.contract_number}) is now active — both parties have signed.`
        : `${notifyLabel} contract "${contract.title}" (${contract.contract_number}). Your signature is required.`;
      await client.query(
        `INSERT INTO notifications (user_id, type, subject, body)
         VALUES ($1, $2, $3, $4)`,
        [
          notifyUser.user_id,
          newStatus === 'active' ? 'contract_active' : 'contract_signature_needed',
          newStatus === 'active' ? 'Contract Now Active' : 'Contract Signature Required',
          bodyMsg,
        ]
      );
    }

    await client.query('COMMIT');

    req.io?.emit('contract:signed', { contractId: req.params.id, status: newStatus });
    res.json({ data: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/* ── POST /api/contracts/:id/cancel ────────────────────────────────────────── */
router.post('/:id/cancel', authenticateToken, async (req, res, next) => {
  try {
    const cu = await requireCompany(req.user.user_id);

    const { rows: [contract] } = await pool.query(
      `SELECT * FROM contracts WHERE id = $1`,
      [req.params.id]
    );
    if (!contract) return res.status(404).json({ error: 'Contract not found', code: 'NOT_FOUND' });

    const isBuyer    = req.user.role === 'buyer'    && contract.buyer_company_id    === cu.company_id;
    const isSupplier = req.user.role === 'supplier' && contract.supplier_company_id === cu.company_id;
    if (!isBuyer && !isSupplier) {
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    if (['active', 'completed', 'cancelled'].includes(contract.status)) {
      return res.status(400).json({ error: `Cannot cancel a ${contract.status} contract`, code: 'INVALID_STATE' });
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE contracts SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    res.json({ data: updated });
  } catch (err) { next(err); }
});

/* ── POST /api/contracts/:id/order ─────────────────────────────────────────── */
router.post('/:id/order', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ error: 'Only buyers can place orders', code: 'FORBIDDEN' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cu = await requireCompany(req.user.user_id);

    const { rows: [contract] } = await client.query(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!contract) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contract not found', code: 'NOT_FOUND' });
    }
    if (contract.buyer_company_id !== cu.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    }
    if (contract.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only place an order from an active contract', code: 'INVALID_STATE' });
    }

    // Generate order number
    const orderNum = `ORD-${Date.now().toString(36).toUpperCase()}`;

    const { rows: [order] } = await client.query(
      `INSERT INTO orders (
         buyer_company_id, supplier_company_id,
         order_number, order_value, currency,
         delivery_deadline, status
       ) VALUES ($1,$2,$3,$4,$5,$6::date,'confirmed')
       RETURNING *`,
      [
        contract.buyer_company_id,
        contract.supplier_company_id,
        orderNum,
        contract.total_value,
        contract.currency,
        contract.delivery_deadline,
      ]
    );

    // Insert order item from contract data
    if (contract.title || contract.product_description) {
      await client.query(
        `INSERT INTO order_items (order_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          contract.title,
          contract.quantity || 1,
          contract.unit_price || contract.total_value,
          contract.total_value,
        ]
      );
    }

    // Mark contract as completed
    await client.query(
      `UPDATE contracts SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    // If sourced from an RFQ, close it
    if (contract.rfq_id) {
      await client.query(
        `UPDATE rfqs SET status = 'closed', updated_at = NOW() WHERE id = $1`,
        [contract.rfq_id]
      );
    }
    if (contract.quote_id) {
      await client.query(
        `UPDATE rfq_responses SET status = 'accepted' WHERE id = $1`,
        [contract.quote_id]
      );
    }

    // Notify supplier
    const { rows: [supplierUser] } = await client.query(
      `SELECT cu.user_id FROM company_users cu WHERE cu.company_id = $1 LIMIT 1`,
      [contract.supplier_company_id]
    );
    if (supplierUser) {
      await client.query(
        `INSERT INTO notifications (user_id, type, subject, body)
         VALUES ($1, 'order_placed', 'New Order Placed', $2)`,
        [supplierUser.user_id, `A new order ${orderNum} has been placed from contract ${contract.contract_number}.`]
      );
    }

    await client.query('COMMIT');

    req.io?.emit('order:new', { orderId: order.id, supplierCompanyId: contract.supplier_company_id });
    res.status(201).json({ data: { order, contractId: contract.id } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
