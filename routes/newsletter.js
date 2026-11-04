const express   = require('express');
const rateLimit = require('express-rate-limit');
const pool      = require('../config/db');
const logger    = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Table: scripts/sql/newsletter.sql

const MAX_EMAIL_LENGTH = 254;
// Deliberately simple: one @, no spaces, a dot in the domain. Real validation is the inbox.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Please try again in a few minutes.', code: 'RATE_LIMITED' },
});

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

const SUBSCRIBED = { message: "You're subscribed" };

// POST /api/newsletter/subscribe — public. Always 200 for a valid email so the
// response never reveals whether the address was already on the list.
router.post('/subscribe', subscribeLimiter, async (req, res) => {
  const body = req.body || {};

  // Honeypot: real users never see or fill the "company" field.
  if (typeof body.company === 'string' ? body.company.trim() : body.company) {
    return res.json(SUBSCRIBED);
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return res.status(422).json({ error: 'Please enter a valid email address', code: 'INVALID_EMAIL' });
  }

  try {
    await pool.query(
      `INSERT INTO newsletter_subscribers (email, source)
       VALUES ($1, $2)
       ON CONFLICT ((lower(email))) DO UPDATE
         SET unsubscribed_at = NULL
         WHERE newsletter_subscribers.unsubscribed_at IS NOT NULL`,
      [email, 'homepage']
    );
    return res.json(SUBSCRIBED);
  } catch (err) {
    logger.error('Newsletter subscribe failed', { message: err.message });
    return res.status(500).json({ error: 'Could not subscribe right now. Please try again later.', code: 'SERVER_ERROR' });
  }
});

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  }
  next();
}

function csvCell(value) {
  let s = value instanceof Date ? value.toISOString() : String(value ?? '');
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/newsletter/subscribers[?format=csv] — admin only, active subscribers, newest first.
router.get('/subscribers', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT email, created_at
         FROM newsletter_subscribers
        WHERE unsubscribed_at IS NULL
        ORDER BY created_at DESC, id DESC`
    );

    if (req.query.format === 'csv') {
      const lines = ['email,created_at', ...rows.map(r => `${csvCell(r.email)},${csvCell(r.created_at)}`)];
      const date  = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="newsletter-subscribers-${date}.csv"`);
      return res.send(lines.join('\r\n') + '\r\n');
    }

    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error('Newsletter subscribers list failed', { message: err.message });
    return res.status(500).json({ error: 'Could not load subscribers', code: 'SERVER_ERROR' });
  }
});

module.exports = router;
