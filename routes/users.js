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
    // People may change only their own profile details - never verification or account status.
    const fields = {};
    for (const key of ['full_name', 'phone_number', 'preferred_language', 'avatar_url']) {
      if (req.body?.[key] === undefined) continue;
      const v = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
      fields[key] = v === '' ? null : v;
    }
    if (fields.phone_number && !/^\+?[0-9 ()-]{7,20}$/.test(fields.phone_number)) {
      return res.status(400).json({ error: 'Please enter a valid phone number', code: 'VALIDATION_ERROR' });
    }
    if (fields.phone_number) fields.phone_number = fields.phone_number.replace(/[ ()-]/g, '');
    if (fields.full_name && fields.full_name.length > 120) {
      return res.status(400).json({ error: 'Name is too long', code: 'VALIDATION_ERROR' });
    }
    const updated = await User.update(req.user.user_id, fields);
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