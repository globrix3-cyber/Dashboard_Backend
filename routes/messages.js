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
  if (!cu) { const e = new Error('No company linked. Please complete your company profile.'); e.status = 403; throw e; }
  return cu;
}

/* ── GET /api/conversations ─────────────────────────────────────────────────
   Returns all conversations for the current user's company, with last message
   preview and unread count.
────────────────────────────────────────────────────────────────────────────── */
router.get('/conversations', authenticateToken, async (req, res, next) => {
  try {
    // Admin can see all conversations
    if (req.user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT cv.*,
           cb.legal_name AS buyer_name,
           cs.legal_name AS supplier_name,
           (SELECT m.body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
           (SELECT m.message_type FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_type,
           (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = cv.id) AS message_count
         FROM conversations cv
         LEFT JOIN companies cb ON cb.id = cv.buyer_company_id
         LEFT JOIN companies cs ON cs.id = cv.supplier_company_id
         ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC
         LIMIT 100`
      );
      return res.json({ data: rows });
    }

    const cu = await getCompany(req.user.user_id);
    if (!cu) return res.json({ data: [] });
    const { rows } = await pool.query(
      `SELECT cv.*,
         cb.legal_name AS buyer_name,
         cs.legal_name AS supplier_name,
         r.title AS rfq_title,
         (SELECT m.body FROM messages m
          WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
         (SELECT m.message_type FROM messages m
          WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_type,
         (SELECT COUNT(*)::int FROM messages m
          WHERE m.conversation_id = cv.id
            AND m.sender_user_id != $2
            AND m.is_read = false) AS unread_count
       FROM conversations cv
       LEFT JOIN companies cb ON cb.id = cv.buyer_company_id
       LEFT JOIN companies cs ON cs.id = cv.supplier_company_id
       LEFT JOIN rfqs r ON r.id = cv.rfq_id
       WHERE cv.buyer_company_id = $1 OR cv.supplier_company_id = $1
       ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC`,
      [cu.company_id, req.user.user_id]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

/* ── POST /api/conversations ────────────────────────────────────────────────
   Start a new conversation. Buyer → Supplier, optionally linked to an RFQ.
   Body: { supplier_company_id, rfq_id?, subject?, initial_message }
────────────────────────────────────────────────────────────────────────────── */
router.post('/conversations', authenticateToken, async (req, res, next) => {
  try {
    const cu = await requireCompany(req.user.user_id);
    const { supplier_company_id, rfq_id, subject, initial_message } = req.body;

    if (!supplier_company_id) {
      return res.status(400).json({ error: 'supplier_company_id is required', code: 'VALIDATION_ERROR' });
    }

    // Determine buyer / supplier side
    const isBuyer    = cu.is_buyer    || req.user.role === 'buyer';
    const buyerCo    = isBuyer ? cu.company_id : supplier_company_id;
    const supplierCo = isBuyer ? supplier_company_id : cu.company_id;

    // Reuse existing conversation for same pair + same RFQ
    const { rows: existing } = await pool.query(
      `SELECT id FROM conversations
       WHERE buyer_company_id = $1 AND supplier_company_id = $2
         AND ($3::uuid IS NULL OR rfq_id = $3)
       LIMIT 1`,
      [buyerCo, supplierCo, rfq_id || null]
    );

    let conversationId;
    if (existing.length) {
      conversationId = existing[0].id;
    } else {
      const { rows: [cv] } = await pool.query(
        `INSERT INTO conversations
           (buyer_company_id, supplier_company_id, rfq_id, subject, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [buyerCo, supplierCo, rfq_id || null, subject || null]
      );
      conversationId = cv.id;
    }

    // Post initial message if provided
    if (initial_message?.trim()) {
      await pool.query(
        `INSERT INTO messages
           (conversation_id, sender_user_id, sender_company_id, body, message_type)
         VALUES ($1, $2, $3, $4, 'text')`,
        [conversationId, req.user.user_id, cu.company_id, initial_message.trim()]
      );
      await pool.query(
        `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
        [conversationId]
      );
    }

    // Return full conversation
    const { rows: [cv] } = await pool.query(
      `SELECT cv.*, cb.legal_name AS buyer_name, cs.legal_name AS supplier_name
       FROM conversations cv
       LEFT JOIN companies cb ON cb.id = cv.buyer_company_id
       LEFT JOIN companies cs ON cs.id = cv.supplier_company_id
       WHERE cv.id = $1`,
      [conversationId]
    );

    req.io?.emit('conversation:new', { conversationId, buyerCo, supplierCo });
    res.status(201).json({ data: cv });
  } catch (err) { next(err); }
});

/* ── GET /api/conversations/:id ─────────────────────────────────────────────
   Fetch all messages in a conversation.
────────────────────────────────────────────────────────────────────────────── */
router.get('/conversations/:id', authenticateToken, async (req, res, next) => {
  try {
    const { rows: [cv] } = await pool.query(
      `SELECT cv.*, cb.legal_name AS buyer_name, cs.legal_name AS supplier_name,
         r.title AS rfq_title
       FROM conversations cv
       LEFT JOIN companies cb ON cb.id = cv.buyer_company_id
       LEFT JOIN companies cs ON cs.id = cv.supplier_company_id
       LEFT JOIN rfqs r ON r.id = cv.rfq_id
       WHERE cv.id = $1`,
      [req.params.id]
    );
    if (!cv) return res.status(404).json({ error: 'Conversation not found', code: 'NOT_FOUND' });

    const { rows: msgs } = await pool.query(
      `SELECT m.id, m.body, m.message_type, m.is_read, m.created_at,
              m.sender_user_id,
              u.full_name AS sender_name,
              sc.legal_name AS sender_company,
              sc.id AS sender_company_id
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN companies sc ON sc.id = m.sender_company_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    // Mark messages as read for current user
    if (req.user.user_id) {
      await pool.query(
        `UPDATE messages
         SET is_read = true, read_at = now()
         WHERE conversation_id = $1
           AND sender_user_id != $2
           AND is_read = false`,
        [req.params.id, req.user.user_id]
      );
    }

    res.json({ data: { ...cv, messages: msgs } });
  } catch (err) { next(err); }
});

/* ── POST /api/conversations/:id/messages ───────────────────────────────────
   Send a text message.
   Body: { body }
────────────────────────────────────────────────────────────────────────────── */
router.post('/conversations/:id/messages', authenticateToken, async (req, res, next) => {
  try {
    const cu = await requireCompany(req.user.user_id);
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Message body is required', code: 'VALIDATION_ERROR' });

    const { rows: [msg] } = await pool.query(
      `INSERT INTO messages
         (conversation_id, sender_user_id, sender_company_id, body, message_type)
       VALUES ($1, $2, $3, $4, 'text')
       RETURNING *`,
      [req.params.id, req.user.user_id, cu.company_id, body.trim()]
    );

    await pool.query(
      `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
      [req.params.id]
    );

    // Enrich with sender info for real-time broadcast
    const enriched = {
      ...msg,
      sender_name:       null,
      sender_company_id: cu.company_id,
    };

    req.io?.to(`conv:${req.params.id}`).emit('message:new', enriched);
    res.status(201).json({ data: enriched });
  } catch (err) { next(err); }
});

/* ── POST /api/conversations/:id/quote-offer ────────────────────────────────
   Supplier sends a structured quote offer card inside the chat.
   Body: { price, currency, quantity, lead_time_days, validity_days, notes }
────────────────────────────────────────────────────────────────────────────── */
router.post('/conversations/:id/quote-offer', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'supplier') {
    return res.status(403).json({ error: 'Only suppliers can send quote offers', code: 'FORBIDDEN' });
  }
  try {
    const cu = await requireCompany(req.user.user_id);
    const { price, currency, quantity, lead_time_days, validity_days, notes } = req.body;

    if (!price) return res.status(400).json({ error: 'price is required', code: 'VALIDATION_ERROR' });

    // Store as JSON string in body field
    const offerPayload = JSON.stringify({
      type: 'quote_offer',
      price:           Number(price),
      currency:        currency || 'INR',
      quantity:        quantity || null,
      lead_time_days:  lead_time_days || null,
      validity_days:   validity_days  || 7,
      notes:           notes || null,
    });

    const { rows: [msg] } = await pool.query(
      `INSERT INTO messages
         (conversation_id, sender_user_id, sender_company_id, body, message_type)
       VALUES ($1, $2, $3, $4, 'quote_offer')
       RETURNING *`,
      [req.params.id, req.user.user_id, cu.company_id, offerPayload]
    );

    await pool.query(
      `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
      [req.params.id]
    );

    req.io?.to(`conv:${req.params.id}`).emit('message:new', msg);
    res.status(201).json({ data: msg });
  } catch (err) { next(err); }
});

/* ── PATCH /api/conversations/:id/quote-offer/:msgId/accept ─────────────────
   Buyer accepts a quote offer — creates a placeholder order.
────────────────────────────────────────────────────────────────────────────── */
router.patch('/conversations/:id/quote-offer/:msgId/accept', authenticateToken, async (req, res, next) => {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ error: 'Only buyers can accept quote offers', code: 'FORBIDDEN' });
  }
  try {
    const cu = await getCompany(req.user.user_id);

    // Fetch the offer message
    const { rows: [msg] } = await pool.query(
      `SELECT * FROM messages WHERE id = $1 AND conversation_id = $2 AND message_type = 'quote_offer'`,
      [req.params.msgId, req.params.id]
    );
    if (!msg) return res.status(404).json({ error: 'Quote offer not found', code: 'NOT_FOUND' });

    const offer = JSON.parse(msg.body);

    // Get supplier company from conversation
    const { rows: [cv] } = await pool.query(
      `SELECT buyer_company_id, supplier_company_id, rfq_id FROM conversations WHERE id = $1`,
      [req.params.id]
    );

    // Create order
    const orderNo = `GX-${Date.now().toString(36).toUpperCase()}`;
    const { rows: [order] } = await pool.query(
      `INSERT INTO orders
         (buyer_company_id, supplier_company_id, rfq_id,
          order_number, order_value, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')
       RETURNING id, order_number, status`,
      [cv.buyer_company_id, cv.supplier_company_id, cv.rfq_id || null,
       orderNo, offer.price, offer.currency || 'INR']
    );

    // Post acceptance message in chat
    await pool.query(
      `INSERT INTO messages
         (conversation_id, sender_user_id, sender_company_id, body, message_type)
       VALUES ($1, $2, $3, $4, 'quote_accepted')`,
      [req.params.id, req.user.user_id, cu.company_id,
       JSON.stringify({ type: 'quote_accepted', order_id: order.id, order_number: order.order_number })]
    );

    await pool.query(
      `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
      [req.params.id]
    );

    req.io?.emit('order:new', order);
    res.json({ data: order, message: 'Quote accepted — order created!' });
  } catch (err) { next(err); }
});

module.exports = router;
