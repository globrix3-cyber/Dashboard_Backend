const express     = require('express');
const router      = express.Router();
const authService = require('../services/authService');
const validate    = require('../middleware/validate');
const { authenticateToken } = require('../middleware/auth');

router.post('/register',
  validate({
    email:    { required: true, type: 'string', isEmail: true },
    password: { required: true, type: 'string', minLength: 8 },
    role:     { required: true, type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({ message: 'Registration successful', data: result });
    } catch (err) { next(err); }
  }
);

router.post('/login',
  validate({
    email:    { required: true, type: 'string', isEmail: true },
    password: { required: true, type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login({
        email,
        password,
        device_info: req.headers['user-agent'],
        ip_address:  req.ip,
      });
      res.json({ message: 'Login successful', data: result });
    } catch (err) { next(err); }
  }
);

router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token is required', code: 'VALIDATION_ERROR' });
    }
    const result = await authService.refresh({
      refresh_token,
      device_info: req.headers['user-agent'],
      ip_address:  req.ip,
    });
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    await authService.logout({ refresh_token });
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
});

module.exports = router;