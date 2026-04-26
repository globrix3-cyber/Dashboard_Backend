const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { authenticateToken: authenticate } = require('../middleware/auth');
const productModel = require('../models/product');
const logger = require('../utils/logger');

// Validation helper
function validationGuard(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ 
      error: errors.array()[0].msg, 
      code: 'VALIDATION_ERROR' 
    });
  }
  return false;
}

// Supplier guard
function supplierOnly(req, res, next) {
  if (!req.user || req.user.role !== 'supplier') {
    return res.status(403).json({ error: 'Suppliers only', code: 'FORBIDDEN' });
  }
  next();
}

/* ====================== CATEGORIES ====================== */
// GET /api/products/categories
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await productModel.getCategories();
    res.json({ message: 'Categories fetched', data: categories });
  } catch (err) { 
    next(err); 
  }
});

// GET /api/products/categories/:id/attributes
router.get('/categories/:id/attributes', async (req, res, next) => {
  try {
    const attrs = await productModel.getCategoryAttributes(req.params.id);
    res.json({ message: 'Attributes fetched', data: attrs });
  } catch (err) { 
    next(err); 
  }
});

/* ====================== TAGS ====================== */
// GET /api/products/tags
router.get('/tags', authenticate, async (req, res, next) => {
  try {
    const tags = await productModel.getAllTags();
    res.json({ message: 'Tags fetched', data: tags });
  } catch (err) { 
    next(err); 
  }
});

// POST /api/products/tags
router.post(
  '/tags',
  authenticate,
  supplierOnly,
  body('name').trim().notEmpty().withMessage('Tag name is required'),
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    try {
      const tag = await productModel.upsertTag(req.body.name);
      res.status(201).json({ message: 'Tag created/updated', data: tag });
    } catch (err) { 
      next(err); 
    }
  }
);

/* ====================== PRODUCTS ====================== */

// GET /api/products
router.get('/', authenticate, async (req, res, next) => {
  try {
    const products = await productModel.findAll({
      userId: req.user?.user_id,
      role:   req.user?.role,
    });
    res.json({ message: 'Products fetched', data: products || [] });
  } catch (err) { 
    next(err); 
  }
});

// POST /api/products
router.post(
  '/',
  authenticate,
  supplierOnly,
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('category_id').notEmpty().withMessage('Category is required'),
    body('min_order_quantity').isNumeric().withMessage('Min order quantity must be a number'),
  ],
  async (req, res, next) => {
    if (validationGuard(req, res)) return;
    try {
      const product = await productModel.create(req.user.id, req.body);
      logger.success(`Product created: ${product?.id}`);
      res.status(201).json({ message: 'Product created', data: product });
    } catch (err) { 
      next(err); 
    }
  }
);

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' });
    }
    res.json({ message: 'Product fetched', data: product });
  } catch (err) { 
    next(err); 
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, supplierOnly, async (req, res, next) => {
  try {
    const product = await productModel.update(req.user.id, req.params.id, req.body);
    res.json({ message: 'Product updated', data: product });
  } catch (err) { 
    next(err); 
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, supplierOnly, async (req, res, next) => {
  try {
    await productModel.remove(req.user.id, req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) { 
    next(err); 
  }
});

module.exports = router;