// scripts/migrate-images-to-cloudinary.js
// One-time move of product images hosted elsewhere (Google Drive, picsum, ...) into Cloudinary.
//
//   node scripts/migrate-images-to-cloudinary.js --dry-run          list what would move
//   node scripts/migrate-images-to-cloudinary.js [--limit 20]       migrate (writes a backup file)
//   node scripts/migrate-images-to-cloudinary.js --rollback <file>  restore old URLs from a backup
//
// Safe to re-run: each image is stored under its product_images.id, and a row is only
// updated if its URL is still the one that was copied.
require('dotenv').config();
const fs         = require('fs');
const path       = require('path');
const cloudinary = require('cloudinary').v2;
const pool       = require('../config/db');

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const LIMIT    = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : null;
const ROLLBACK = args.includes('--rollback') ? args[args.indexOf('--rollback') + 1] : null;
const PARALLEL = 4;

const url = new URL(process.env.CLOUDINARY_URL || 'cloudinary://x:y@missing');
cloudinary.config({ cloud_name: url.hostname, api_key: decodeURIComponent(url.username), api_secret: decodeURIComponent(url.password), secure: true });

function sourceUrl(imageUrl) {
  const drive = imageUrl.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) || imageUrl.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([^&#]+)/);
  return drive ? `https://lh3.googleusercontent.com/d/${drive[1]}` : imageUrl;
}

async function rollback(file) {
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  let restored = 0;
  for (const r of rows) {
    const { rowCount } = await pool.query('UPDATE product_images SET image_url = $1 WHERE id = $2 AND image_url = $3', [r.old_url, r.id, r.new_url]);
    restored += rowCount;
  }
  console.log(`Restored ${restored} of ${rows.length} rows from ${file}`);
}

async function migrate() {
  const { rows } = await pool.query(
    `SELECT pi.id, pi.image_url, p.supplier_company_id
     FROM   product_images pi
     JOIN   products p ON p.id = pi.product_id
     WHERE  pi.image_url IS NOT NULL AND pi.image_url <> '' AND pi.image_url NOT LIKE '%res.cloudinary.com/%'
     ORDER  BY pi.created_at
     ${LIMIT ? `LIMIT ${Math.max(1, Math.floor(LIMIT))}` : ''}`
  );
  console.log(`${rows.length} image(s) to migrate${DRY_RUN ? ' (dry run)' : ''}`);
  if (DRY_RUN) {
    const hosts = {};
    rows.forEach(r => { const h = new URL(sourceUrl(r.image_url)).host; hosts[h] = (hosts[h] || 0) + 1; });
    console.table(hosts);
    return;
  }

  const backupDir  = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `image-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const failures = [];
  let done = 0;

  const queue = [...rows];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      try {
        const result = await cloudinary.uploader.upload(sourceUrl(row.image_url), {
          folder:          `globrixa/products/migrated/${row.supplier_company_id}`,
          public_id:       row.id,
          overwrite:       false,
          resource_type:   'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'],
          transformation:  [{ width: 2400, height: 2400, crop: 'limit', quality: 'auto' }],
          timeout:         60000,
        });
        const { rowCount } = await pool.query(
          'UPDATE product_images SET image_url = $1 WHERE id = $2 AND image_url = $3',
          [result.secure_url, row.id, row.image_url]
        );
        if (rowCount) fs.appendFileSync(backupFile, JSON.stringify({ id: row.id, old_url: row.image_url, new_url: result.secure_url }) + '\n');
        done += 1;
        if (done % 25 === 0) console.log(`  ${done}/${rows.length}`);
      } catch (err) {
        failures.push({ id: row.id, url: row.image_url, error: err.message || err.error?.message || String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  console.log(`Migrated ${done}, failed ${failures.length}. Backup: ${fs.existsSync(backupFile) ? backupFile : '(none)'}`);
  failures.forEach(f => console.log(`  FAILED ${f.id}  ${f.url.slice(0, 80)}  ${f.error}`));
}

(ROLLBACK ? rollback(ROLLBACK) : migrate())
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(), 500));
