require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;

const { authenticateToken: authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const MAX_FILES     = 8;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_SIZE, files: MAX_FILES, fields: 5, fieldSize: 1024, fieldNameSize: 100, parts: MAX_FILES + 5 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Only JPG, PNG, WEBP or HEIC images can be uploaded');
    err.status = 415;
    err.code   = 'UNSUPPORTED_TYPE';
    cb(err);
  },
}).array('images', MAX_FILES);

// The browser-reported type is only a hint; check each file's real signature.
function looksLikeImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;                           // JPEG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // PNG
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true; // WEBP
  if (buf.toString('ascii', 4, 8) === 'ftyp') {                                                     // HEIC / HEIF
    return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(buf.toString('ascii', 8, 12));
  }
  return false;
}

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
    if (typeof err.code === 'string' && err.code.startsWith('LIMIT_')) return res.status(413).json({ error: 'Upload request is too large', code: 'REQUEST_TOO_LARGE' });
    next(err);
  });
}

function uploadToCloudinary(buffer, userId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:         `globrixa/products/${userId}`,
        resource_type:  'image',
        allowed_formats: ['jpg', 'png', 'webp', 'heic', 'heif'],
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
  if (req.files.some(f => !looksLikeImage(f.buffer))) {
    return res.status(415).json({ error: 'Only JPG, PNG, WEBP or HEIC images can be uploaded', code: 'UNSUPPORTED_TYPE' });
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
