require('dotenv').config();
const express    = require('express');
const cloudinary = require('cloudinary').v2;

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

function sellersOnly(req, res, next) {
  if (!['supplier', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only suppliers can upload product images', code: 'FORBIDDEN' });
  }
  next();
}

// POST /api/uploads/signature — the browser uploads straight to Cloudinary with these
// signed params, so image bytes never pass through (or sit in the memory of) this server.
router.post('/signature', authenticate, sellersOnly, (req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Image upload is not set up yet. Paste an image link instead.', code: 'UPLOADS_NOT_CONFIGURED' });
  }
  try {
    const { cloud_name, api_key, api_secret } = cloudinary.config();
    const params = {
      allowed_formats: ALLOWED_FORMATS,
      folder:          `globrixa/products/${req.user.user_id}`,
      timestamp:       Math.round(Date.now() / 1000),
      transformation:  TRANSFORMATION,
    };
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
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
