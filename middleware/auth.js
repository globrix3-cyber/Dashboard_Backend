const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided', code: 'AUTH_NO_TOKEN' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || !payload.user_id) {
      return res.status(403).json({ error: 'Invalid token payload', code: 'AUTH_INVALID_TOKEN' });
    }

    const { rows } = await pool.query(
      `SELECT
         u.id       AS user_id,
         u.email,
         u.is_active,
         u.role_id,
         r.name     AS role
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [payload.user_id]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'User not found', code: 'AUTH_INVALID_USER' });
    }

    const u = rows[0];

    if (!u.is_active) {
      return res.status(403).json({ error: 'Account deactivated', code: 'AUTH_INACTIVE' });
    }

    req.user = {
      user_id: u.user_id,
      email:   u.email,
      role_id: u.role_id || null,
      role:    u.role    || null,
    };

    next();
  } catch (err) {
    console.error('authenticateToken error:', err?.message);
    return res.status(403).json({ error: 'Invalid token', code: 'AUTH_INVALID_TOKEN' });
  }
};

const checkPermission = (module, action) => {
  return async (req, res, next) => {
    if (!req.user?.role_id) {
      return res.status(403).json({ error: 'No role assigned', code: 'PERM_DENIED' });
    }

    try {
      const { rows } = await pool.query(
        `SELECT p.${action}
         FROM permissions p
         JOIN roles r ON r.id = p.role_id
         WHERE p.role_id  = $1
           AND p.module   = $2
           AND r.is_active = true`,
        [req.user.role_id, module]
      );

      if (rows.length > 0 && rows[0][action]) return next();

      return res.status(403).json({ error: 'Permission denied', code: 'PERM_DENIED' });
    } catch (err) {
      console.error('checkPermission error:', err?.message);
      return res.status(500).json({ error: 'Permission check failed', code: 'PERM_CHECK_FAILED' });
    }
  };
};

module.exports = { authenticateToken, checkPermission };