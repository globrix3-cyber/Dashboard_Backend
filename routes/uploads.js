require('dotenv').config();
const express    = require('express');
const cloudinary = require('cloudinary').v2;
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');

const { authenticateToken: authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Signed into every upload; the browser must send exactly these values to Cloudinary.
const ALLOWED_FORMATS = 'jpg,png,webp,heic,heif';
// Cap the stored original; display sizes are requested per page at delivery time.
const TRANSFORMATION  = 'c_limit,h_2400,q_auto,w_2400';

// Either CLOUDINARY_URL (cloudinary://key:secret@cloud) or the three separate keys.
function cloudinaryKeys() {
  const url = process.env.CLOUDINARY_URL;
  if (url) {
    try {
      const u = new URL(url);
      return { cloud_name: u.hostname, api_key: decodeURIComponent(u.username), api_secret: decodeURIComponent(u.password) };
    } catch { return {}; }
  }
  return {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };
}
cloudinary.config({ ...cloudinaryKeys(), secure: true });
const isConfigured = () => {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  return Boolean(cloud_name && api_key && api_secret);
};

const signatureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `upload-sig:${req.user.user_id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads in a short time. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
});

function sellersOnly(req, res, next) {
  if (!['supplier', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only suppliers can upload product images', code: 'FORBIDDEN' });
  }
  next();
}

// POST /api/uploads/signature — the browser uploads straight to Cloudinary with these
// signed params, so image bytes never pass through (or sit in the memory of) this server.
router.post('/signature', authenticate, sellersOnly, signatureLimiter, (req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Image upload is not set up yet. Paste an image link instead.', code: 'UPLOADS_NOT_CONFIGURED' });
  }
  try {
    const { cloud_name, api_key, api_secret } = cloudinary.config();
    // A fixed public_id with overwrite off means each signature can create at most one image.
    const params = {
      allowed_formats: ALLOWED_FORMATS,
      folder:          `globrixa/products/${req.user.user_id}`,
      overwrite:       false,
      public_id:       crypto.randomUUID(),
      timestamp:       Math.round(Date.now() / 1000),
      transformation:  TRANSFORMATION,
    };
    // iPhone HEIC/HEIF can't be decoded in most browsers, so have Cloudinary store a JPG instead.
    const heic = req.body?.heic === true;
    if (heic) params.transformation = `${TRANSFORMATION},f_jpg`;
    const signature = cloudinary.utils.api_sign_request(params, api_secret);
    logger.info(`Issued upload signature for user ${req.user.user_id}`);
    res.json({
      message: 'Upload signature issued',
      data: {
        upload_url: `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
        api_key,
        timestamp:       params.timestamp,
        signature,
        folder:          params.folder,
        allowed_formats: params.allowed_formats,
        transformation:  params.transformation,
        public_id:       params.public_id,
        overwrite:       'false',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
