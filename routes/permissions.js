// routes/permissions.js
const express    = require('express');
const router     = express.Router();
const Permission = require('../models/permission');
const { authenticateToken } = require('../middleware/auth');

// All permission routes are owner-only — enforced inline
function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required', code: 'PERM_DENIED' });
  }
  next();
}

// GET /api/permissions  — list all
router.get('/', authenticateToken, ownerOnly, async (req, res, next) => {
  try {
    const rows = await Permission.listAll();
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/permissions/:role  — list by role
router.get('/:role', authenticateToken, ownerOnly, async (req, res, next) => {
  try {
    const rows = await Permission.findByRole(req.params.role);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// PUT /api/permissions  — upsert a rule
// Body: { role, module, can_read, can_write, can_delete }
router.put('/', authenticateToken, ownerOnly, async (req, res, next) => {
  try {
    const { role, module, can_read, can_write, can_delete } = req.body;
    if (!role || !module) {
      return res.status(400).json({ error: 'role and module are required', code: 'VALIDATION_ERROR' });
    }
    if (!['owner', 'manager', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role', code: 'VALIDATION_ERROR' });
    }
    const row = await Permission.upsert({ role, module, can_read, can_write, can_delete });
    res.json({ message: 'Permission saved', data: row });
  } catch (err) { next(err); }
});

// DELETE /api/permissions  — remove a rule
// Body: { role, module }
router.delete('/', authenticateToken, ownerOnly, async (req, res, next) => {
  try {
    const { role, module } = req.body;
    if (!role || !module) {
      return res.status(400).json({ error: 'role and module are required', code: 'VALIDATION_ERROR' });
    }
    await Permission.delete({ role, module });
    res.json({ message: 'Permission deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
