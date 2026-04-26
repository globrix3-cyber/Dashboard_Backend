const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const pool    = require('../config/db');
const User    = require('../models/user');
const Session = require('../models/session');

const SALT_ROUNDS        = 12;
const ACCESS_EXPIRES     = '15m';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

function generateAccessToken(user_id) {
  return jwt.sign({ user_id }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function register({ email, password, phone_number, preferred_language, role, name, full_name, company }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolvedName = full_name || name || null;

    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1`, [email]
    );
    if (existing.rows.length > 0) {
      const err = new Error('Email already in use'); 
      err.status = 409; 
      throw err;
    }

    // Validate role — only buyer or supplier allowed on register
    const allowedRoles = ['buyer', 'supplier'];
    if (!allowedRoles.includes(role)) {
      const err = new Error('Invalid role. Must be buyer or supplier'); 
      err.status = 400; 
      throw err;
    }

    const { rows: roleRows } = await client.query(
      `SELECT id FROM roles WHERE name = $1 AND is_active = true`,
      [role]
    );
    if (!roleRows.length) {
      const err = new Error('Role not found'); 
      err.status = 500; 
      throw err;
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, phone_number, preferred_language, role_id, full_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name`,
      [email, password_hash, phone_number || null, preferred_language || 'en', roleRows[0].id, resolvedName]
    );

    // Auto-create company if name provided
    if (company) {
      const { rows: [co] } = await client.query(
        `INSERT INTO companies (legal_name, is_buyer, is_supplier, country)
         VALUES ($1, $2, $3, 'IN') RETURNING id`,
        [company, role === 'buyer', role === 'supplier']
      );
      await client.query(
        `INSERT INTO company_users (user_id, company_id) VALUES ($1, $2)`,
        [userRows[0].id, co.id]
      );
    }

    await client.query('COMMIT');

    // Return minimal user info (frontend will get full user after login if needed)
    return { 
      user: userRows[0],
      message: 'Registration successful. You can now login.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function login({ email, password, device_info, ip_address }) {
  const user = await User.findByEmail(email);
  if (!user) {
    const err = new Error('Invalid credentials'); 
    err.status = 401; 
    throw err;
  }
  if (!user.is_active) {
    const err = new Error('Account deactivated'); 
    err.status = 403; 
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials'); 
    err.status = 401; 
    throw err;
  }

  const accessToken  = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  const expires_at   = new Date(Date.now() + REFRESH_EXPIRES_MS);

  await Session.create({
    user_id:            user.id,
    refresh_token_hash: hashToken(refreshToken),
    device_info,
    ip_address,
    expires_at,
  });

  // Get role + full_name
  const { rows } = await pool.query(
    `SELECT r.name AS role, u.full_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [user.id]
  );

  return {
    token:         accessToken,
    refresh_token: refreshToken,
    user: {
      id:    user.id,
      email: user.email,
      role:  rows[0]?.role  || null,
      name:  rows[0]?.full_name || user.email.split('@')[0],
    },
  };
}

async function refresh({ refresh_token, device_info, ip_address }) {
  const tokenHash = hashToken(refresh_token);
  const session   = await Session.findByTokenHash(tokenHash);

  if (!session) {
    const err = new Error('Invalid or expired refresh token'); 
    err.status = 401; 
    throw err;
  }

  await Session.deleteByTokenHash(tokenHash);

  const newAccess  = generateAccessToken(session.user_id);
  const newRefresh = generateRefreshToken();
  const expires_at = new Date(Date.now() + REFRESH_EXPIRES_MS);

  await Session.create({
    user_id:            session.user_id,
    refresh_token_hash: hashToken(newRefresh),
    device_info,
    ip_address,
    expires_at,
  });

  return {
    token:         newAccess,      // ← Changed to token for consistency
    refresh_token: newRefresh,
  };
}

async function logout({ refresh_token }) {
  if (!refresh_token) return;
  await Session.deleteByTokenHash(hashToken(refresh_token));
}

module.exports = { register, login, refresh, logout };