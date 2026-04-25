const express  = require('express');
const router   = express.Router();
const pool     = require('../config/db');
const User     = require('../models/user');
const { authenticateToken, checkPermission } = require('../middleware/auth');

// GET /api/users/me
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

    res.json({ data: { ...user, role: req.user.role } });
  } catch (err) { next(err); }
});

// PATCH /api/users/me
router.patch('/me', authenticateToken, async (req, res, next) => {
  try {
    const updated = await User.update(req.user.user_id, req.body);
    if (!updated) return res.status(400).json({ error: 'No valid fields to update', code: 'VALIDATION_ERROR' });
    res.json({ message: 'Profile updated', data: updated });
  } catch (err) { next(err); }
});

// GET /api/users — permission gated
router.get('/', authenticateToken, checkPermission('users', 'can_read'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * parseInt(limit);

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.phone_number, u.is_active, u.created_at,
              r.name AS role
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;