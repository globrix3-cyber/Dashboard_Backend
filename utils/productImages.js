// Validates product photo lists so listings can only point at images we host on Cloudinary.

const MAX_IMAGES   = 10;
const MAX_ALT_TEXT = 200;

// Same sources as routes/uploads.js cloudinaryKeys(): CLOUDINARY_URL (cloudinary://key:secret@cloud) or CLOUDINARY_CLOUD_NAME.
function cloudName() {
  const url = process.env.CLOUDINARY_URL;
  if (url) {
    try { return new URL(url).hostname || null; } catch { return null; }
  }
  return process.env.CLOUDINARY_CLOUD_NAME || null;
}

const VERSION_SEGMENT = /^v\d+$/;
// One transformation step, e.g. "f_auto,q_auto" or "c_limit,h_2400,w_2400".
const TRANSFORM_SEGMENT = /^[a-z]{1,3}_[A-Za-z0-9_.:!$-]+(,[a-z]{1,3}_[A-Za-z0-9_.:!$-]+)*$/;

function imageError(message, code) {
  const err = new Error(message);
  err.status = 422;
  err.code   = code;
  return err;
}

// Returns the public_id path segments (after transformations/version) or null when the URL isn't one of our Cloudinary images.
function publicIdSegments(imageUrl) {
  const cloud = cloudName();
  if (!cloud) return null;

  let u;
  try { u = new URL(imageUrl); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return null;
  if (u.username || u.password || u.port || u.search || u.hash) return null;

  const prefix = `/${cloud}/image/upload/`;
  if (!u.pathname.startsWith(prefix)) return null;

  const segments = [];
  for (const raw of u.pathname.slice(prefix.length).split('/')) {
    let seg;
    try { seg = decodeURIComponent(raw); } catch { return null; }
    if (!seg || seg === '.' || seg === '..' || seg.includes('/') || seg.includes('\\')) return null;
    segments.push(seg);
  }

  // Skip transformation steps and the version, which Cloudinary allows before the public_id.
  const start = segments.indexOf('globrixa');
  if (start === -1) return null;
  const leading = segments.slice(0, start);
  if (!leading.every((s, i) => VERSION_SEGMENT.test(s) ? i === leading.length - 1 : TRANSFORM_SEGMENT.test(s))) return null;

  return segments.slice(start);
}

// True when the URL is a Cloudinary image in the uploader's own folder or their company's migrated folder.
function isOwnedImageUrl(imageUrl, { userId, companyId }) {
  const path = publicIdSegments(imageUrl);
  if (!path || path[0] !== 'globrixa' || path[1] !== 'products') return false;
  if (path[2] === 'migrated') {
    return path.length > 4 && companyId != null && path[3] === String(companyId);
  }
  return path.length > 3 && userId != null && path[2] === String(userId);
}

/**
 * Cleans body.images and enforces hosting rules. Throws a 422 error (with code) on violation.
 * existingUrls: URLs already stored for this product (update only) — allowed unchanged.
 */
function normalizeProductImages(images, { userId, companyId, existingUrls = [] }) {
  const legacy = new Set(existingUrls);

  const cleaned = images
    .filter((img) => img && typeof img.image_url === 'string' && img.image_url.trim())
    .map((img, i) => {
      const altText = typeof img.alt_text === 'string' ? img.alt_text.trim().slice(0, MAX_ALT_TEXT) : '';
      return {
        image_url:  img.image_url.trim(),
        alt_text:   altText || null,
        sort_order: Number.isInteger(img.sort_order) ? img.sort_order : i,
      };
    });

  if (cleaned.length > MAX_IMAGES) {
    throw imageError(`A product can have at most ${MAX_IMAGES} photos`, 'TOO_MANY_IMAGES');
  }

  for (const img of cleaned) {
    if (legacy.has(img.image_url)) continue;
    if (!isOwnedImageUrl(img.image_url, { userId, companyId })) {
      throw imageError('Photos must be uploaded through the listing form', 'INVALID_IMAGE');
    }
  }

  return cleaned;
}

module.exports = { normalizeProductImages, isOwnedImageUrl, MAX_IMAGES };
