const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateProductId = (req, res, next) => {
  if (!UUID_RE.test(req.params.productId || '')) {
    return res.status(400).json({ error: 'Invalid product id', code: 'VALIDATION_ERROR' });
  }
  next();
};

router.use(authenticateToken);

// GET /api/wishlist → { data: [product_id, ...] } (most recently saved first)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    res.json({ data: rows.map((r) => r.product_id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/wishlist/:productId — idempotent add
router.post('/:productId', validateProductId, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rowCount } = await pool.query(
      `INSERT INTO wishlist_items (user_id, product_id)
       SELECT $1, p.id FROM products p WHERE p.id = $2
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [req.user.user_id, productId]
    );
    if (rowCount === 0) {
      // Either already saved (fine) or the product doesn't exist (404).
      const exists = await pool.query('SELECT 1 FROM products WHERE id = $1', [productId]);
      if (exists.rowCount === 0) {
        return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' });
      }
    }
    res.status(rowCount ? 201 : 200).json({ data: { product_id: productId, saved: true } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/wishlist/:productId — idempotent remove
router.delete('/:productId', validateProductId, async (req, res, next) => {
  try {
    const { productId } = req.params;
    await pool.query(
      'DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2',
      [req.user.user_id, productId]
    );
    res.json({ data: { product_id: productId, saved: false } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
