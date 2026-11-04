const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

const SITE_URL = 'https://www.globrixa.com';

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

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, COALESCE(updated_at, created_at) AS lastmod
       FROM   products
       WHERE  status = 'active'
       ORDER  BY id`
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
    xml += '</urlset>\n';

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
