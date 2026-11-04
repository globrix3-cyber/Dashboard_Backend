// services/imageCleanup.js
// Daily removal of Cloudinary product images that no product (or company logo) uses,
// e.g. photos uploaded while listing a product that was never saved.
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const pool       = require('../config/db');
const logger     = require('../utils/logger');

const PREFIX        = 'globrixa/products/';
const GRACE_MS      = 7 * 24 * 60 * 60 * 1000;   // keep anything newer than this (listings still being drafted)
const MAX_DELETIONS = 500;
const FIRST_RUN_MS  = 10 * 60 * 1000;
const EVERY_MS      = 24 * 60 * 60 * 1000;

function configure() {
  const url = process.env.CLOUDINARY_URL;
  if (!url) return false;
  try {
    const u = new URL(url);
    cloudinary.config({ cloud_name: u.hostname, api_key: decodeURIComponent(u.username), api_secret: decodeURIComponent(u.password), secure: true });
    return Boolean(u.hostname && u.username && u.password);
  } catch { return false; }
}

// https://res.cloudinary.com/<cloud>/image/upload/[transformations/][v123/]<public_id>.<ext> → <public_id>
function publicIdFromUrl(url) {
  const m = String(url).match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(.+)$/);
  if (!m) return null;
  const parts = m[1].split('?')[0].split('/');
  const start = parts.findIndex(p => p === 'globrixa');
  if (start === -1) return null;
  return parts.slice(start).join('/').replace(/\.[a-z0-9]+$/i, '');
}

async function referencedIds() {
  const { rows } = await pool.query(
    `SELECT image_url AS url FROM product_images WHERE image_url LIKE '%res.cloudinary.com/%'
     UNION ALL
     SELECT logo_url FROM companies WHERE logo_url LIKE '%res.cloudinary.com/%'`
  );
  return new Set(rows.map(r => publicIdFromUrl(r.url)).filter(Boolean));
}

async function listAll() {
  const all = [];
  let next_cursor;
  do {
    const page = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix: PREFIX, max_results: 500, next_cursor });
    all.push(...page.resources);
    next_cursor = page.next_cursor;
  } while (next_cursor);
  return all;
}

async function runCleanup({ dryRun = false } = {}) {
  if (!configure()) return { skipped: 'not configured' };
  let resources, referenced;
  try {
    [resources, referenced] = await Promise.all([listAll(), referencedIds()]);
  } catch (err) {
    // Never delete on partial data.
    logger.error('Image cleanup skipped: could not load images or references', { message: err.message });
    return { skipped: err.message };
  }
  const cutoff = Date.now() - GRACE_MS;
  const unused = resources
    .filter(r => r.public_id.startsWith(PREFIX) && !referenced.has(r.public_id) && new Date(r.created_at).getTime() < cutoff)
    .slice(0, MAX_DELETIONS)
    .map(r => r.public_id);

  let deleted = 0;
  if (!dryRun) {
    for (let i = 0; i < unused.length; i += 100) {
      const res = await cloudinary.api.delete_resources(unused.slice(i, i + 100), { type: 'upload', resource_type: 'image' });
      deleted += Object.values(res.deleted || {}).filter(v => v === 'deleted').length;
    }
  }
  const summary = { scanned: resources.length, referenced: referenced.size, unused: unused.length, deleted, dryRun };
  logger.info(`Image cleanup: ${JSON.stringify(summary)}`);
  return { ...summary, candidates: dryRun ? unused : undefined };
}

function startImageCleanup() {
  if (!configure()) return;
  const run = () => runCleanup().catch(err => logger.error('Image cleanup failed', { message: err.message }));
  setTimeout(() => { run(); setInterval(run, EVERY_MS).unref(); }, FIRST_RUN_MS).unref();
}

module.exports = { runCleanup, startImageCleanup, publicIdFromUrl };

if (require.main === module) {
  runCleanup({ dryRun: process.argv.includes('--dry-run') })
    .then(r => console.log(r))
    .finally(() => setTimeout(() => process.exit(), 300));
}
