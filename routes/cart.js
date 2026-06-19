const express = require('express');
const router  = express.Router();
const Cart    = require('../models/cart');
const { authenticateToken } = require('../middleware/auth');

// GET /api/cart
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const rows = await Cart.list(req.user.user_id);
    res.json({ data: rows });
  } catch (err) {
    if (err.status === 403) return res.json({ data: [] }); // no company yet
    next(err);
  }
});

// POST /api/cart — add (or increment) a line item
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { product_id, variant_id, quantity } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: 'product_id is required', code: 'VALIDATION_ERROR' });
    }
    const row = await Cart.add(req.user.user_id, { product_id, variant_id, quantity });
    res.status(201).json({ data: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: 'CART_ERROR' });
    next(err);
  }
});

// PATCH /api/cart/:id — set exact quantity
router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity) {
      return res.status(400).json({ error: 'quantity is required', code: 'VALIDATION_ERROR' });
    }
    const row = await Cart.setQuantity(req.user.user_id, req.params.id, quantity);
    res.json({ data: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: 'CART_ERROR' });
    next(err);
  }
});

// DELETE /api/cart/:id
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    await Cart.remove(req.user.user_id, req.params.id);
    res.json({ data: { id: req.params.id } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: 'CART_ERROR' });
    next(err);
  }
});

// DELETE /api/cart — clear entire cart
router.delete('/', authenticateToken, async (req, res, next) => {
  try {
    await Cart.clear(req.user.user_id);
    res.json({ data: { cleared: true } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: 'CART_ERROR' });
    next(err);
  }
});

module.exports = router;
