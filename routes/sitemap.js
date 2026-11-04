const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const logger  = require('../utils/logger');

const SITE_URL = 'https://www.globrixa.com';
const MAX_URLS = 45000;            // the sitemap protocol allows 50,000 URLs per file
const CACHE_MS = 60 * 60 * 1000;   // rebuild at most once an hour
let cached   = null;               // { xml, at }
let building = null;               // in-flight rebuild shared by concurrent requests
let retryAt  = 0;                  // after a failed rebuild, wait before trying again
const RETRY_MS = 5 * 60 * 1000;

const STATIC_PAGES = [
  { path: '/',           changefreq: 'daily',   priority: '1.0' },
  { path: '/products',   changefreq: 'daily',   priority: '0.9' },
  { path: '/categories', changefreq: 'weekly',  priority: '0.8' },
  { path: '/our-story',  changefreq: 'monthly', priority: '0.5' },
  { path: '/about',      changefreq: 'monthly', priority: '0.5' },
  { path: '/blog',       changefreq: 'weekly',  priority: '0.5' },
  { path: '/contact',    changefreq: 'monthly', priority: '0.4' },
];

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const toDate = (d) => {
  const date = d ? new Date(d) : null;
  return date && !isNaN(date) ? date.toISOString().slice(0, 10) : null;
};

const urlEntry = ({ loc, lastmod, changefreq, priority }) =>
  '  <url>\n' +
  `    <loc>${escapeXml(loc)}</loc>\n` +
  (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
  (changefreq ? `    <changefreq>${changefreq}</changefreq>\n` : '') +
  (priority ? `    <priority>${priority}</priority>\n` : '') +
  '  </url>\n';

async function buildSitemap() {
  const { rows } = await pool.query(
    `SELECT id, COALESCE(updated_at, created_at) AS lastmod
     FROM   products
     WHERE  status = 'active'
     ORDER  BY COALESCE(updated_at, created_at) DESC
     LIMIT  $1`,
    [MAX_URLS - STATIC_PAGES.length]
  );

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const page of STATIC_PAGES) {
    xml += urlEntry({ ...page, loc: `${SITE_URL}${page.path}` });
  }
  for (const p of rows) {
    xml += urlEntry({
      loc:        `${SITE_URL}/products/${encodeURIComponent(p.id)}`,
      lastmod:    toDate(p.lastmod),
      changefreq: 'weekly',
      priority:   '0.7',
    });
  }
  return xml + '</urlset>\n';
}

// Served from memory so crawlers (this route is outside the rate limiter) can't load the database.
router.get('/', async (req, res, next) => {
  try {
    const stale = !cached || Date.now() - cached.at > CACHE_MS;
    if (stale && !building && (!cached || Date.now() >= retryAt)) {
      building = buildSitemap()
        .then((xml) => { cached = { xml, at: Date.now() }; })
        .finally(() => { building = null; });
      // Background rebuilds must never reject unhandled (that would crash the process).
      building.catch((err) => {
        retryAt = Date.now() + RETRY_MS;
        logger.error('Sitemap rebuild failed', { message: err.message });
      });
    }
    if (!cached) {
      if (!building) throw Object.assign(new Error('Sitemap temporarily unavailable'), { status: 503 });
      await building;                // first request waits; later ones get the previous copy meanwhile
    }
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(cached.xml);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
