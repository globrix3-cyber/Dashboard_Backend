const express    = require('express');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;

const { authenticateToken: authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const MAX_FILES     = 8;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// CLOUDINARY_URL is read by the SDK on its own; the three separate keys are the alternative.
if (!process.env.CLOUDINARY_URL && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}
const isConfigured = () => {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  return Boolean(cloud_name && api_key && api_secret);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Only JPG, PNG, WEBP or HEIC images can be uploaded');
    err.status = 415;
    err.code   = 'UNSUPPORTED_TYPE';
    cb(err);
  },
}).array('images', MAX_FILES);

function sellersOnly(req, res, next) {
  if (!['supplier', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only suppliers can upload product images', code: 'FORBIDDEN' });
  }
  next();
}

function receiveFiles(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE')  return res.status(413).json({ error: 'Each image must be 8 MB or smaller', code: 'FILE_TOO_LARGE' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: `Upload up to ${MAX_FILES} images at a time`, code: 'TOO_MANY_FILES' });
    next(err);
  });
}

function uploadToCloudinary(buffer, userId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:         `globrixa/products/${userId}`,
        resource_type:  'image',
        // Cap the stored original; display sizes are requested per page at delivery time.
        transformation: [{ width: 2400, height: 2400, crop: 'limit', quality: 'auto' }],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    ).end(buffer);
  });
}

// POST /api/uploads/images — multipart field "images", returns hosted URLs in upload order
router.post('/images', authenticate, sellersOnly, receiveFiles, async (req, res, next) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Image upload is not set up yet. Paste an image link instead.', code: 'UPLOADS_NOT_CONFIGURED' });
  }
  if (!req.files?.length) {
    return res.status(400).json({ error: 'Choose at least one image', code: 'NO_FILES' });
  }
  try {
    const results = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer, req.user.user_id)));
    logger.info(`Uploaded ${results.length} product image(s) for user ${req.user.user_id}`);
    res.status(201).json({
      message: 'Images uploaded',
      data: results.map(r => ({ image_url: r.secure_url, width: r.width, height: r.height })),
    });
  } catch (err) {
    logger.error('Cloudinary upload failed', { message: err.message });
    err.status = 502;
    err.code   = 'UPLOAD_FAILED';
    err.message = 'Image upload failed. Please try again.';
    next(err);
  }
});

module.exports = router;
