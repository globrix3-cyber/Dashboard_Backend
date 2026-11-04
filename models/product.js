const pool = require('../config/db');
const { normalizeProductImages } = require('../utils/productImages');

/* ─────────────────────────────────────────────────────────────────────────────
   Helper — resolve supplier's company_id from JWT user_id
────────────────────────────────────────────────────────────────────────────── */
async function getCompanyId(userId) {
  const { rows } = await pool.query(
    `SELECT company_id FROM company_users WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (!rows.length) {
    const err = new Error('No company linked to this account');
    err.status = 403;
    throw err;
  }
  return rows[0].company_id;
}

/* ─────────────────────────────────────────────────────────────────────────────
   findAll
   Supplier → own products (all statuses)
   Buyer    → active products only
────────────────────────────────────────────────────────────────────────────── */
async function findAll({ userId, role, limit = null }) {
  if (role === 'supplier') {
    let companyId;
    try { companyId = await getCompanyId(userId); } catch { return []; }
    const { rows } = await pool.query(
      `SELECT
         p.*,
         c.name AS category_name,
         (
           SELECT json_agg(pi2 ORDER BY pi2.sort_order)
           FROM   product_images pi2
           WHERE  pi2.product_id = p.id
         ) AS images
       FROM   products p
       JOIN   categories c ON c.id = p.category_id
       WHERE  p.supplier_company_id = $1
       ORDER  BY p.created_at DESC
       LIMIT  $2`,
      [companyId, limit]
    );
    return rows;
  }

  // buyer / admin — active only
  const { rows } = await pool.query(
    `SELECT
       p.*,
       c.name AS category_name,
       (
         SELECT json_agg(pi2 ORDER BY pi2.sort_order)
         FROM   product_images pi2
         WHERE  pi2.product_id = p.id
       ) AS images
     FROM   products p
     JOIN   categories c ON c.id = p.category_id
     WHERE  p.status = 'active'
     ORDER  BY p.created_at DESC
     LIMIT  $1`,
    [limit]
  );
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────────────
   findById — full detail with images, specs, variants, tags
────────────────────────────────────────────────────────────────────────────── */
async function findById(productId) {
  const { rows: [product] } = await pool.query(
    `SELECT
       p.*,
       c.name              AS category_name,
       co.id               AS supplier_id,
       co.brand_name       AS supplier_brand_name,
       co.legal_name       AS supplier_legal_name,
       co.logo_url         AS supplier_logo_url,
       co.city             AS supplier_city,
       co.state_province   AS supplier_state,
       co.country          AS supplier_country,
       co.verified_status  AS supplier_verified_status
     FROM   products p
     JOIN   categories c  ON c.id  = p.category_id
     JOIN   companies  co ON co.id = p.supplier_company_id
     WHERE  p.id = $1`,
    [productId]
  );
  if (!product) return null;

  const [images, specs, variants, tags] = await Promise.all([
    pool.query(
      `SELECT id, image_url, alt_text, sort_order
       FROM   product_images
       WHERE  product_id = $1
       ORDER  BY sort_order`,
      [productId]
    ),
    pool.query(
      `SELECT
         ps.id,
         ps.value_text,
         ps.value_numeric,
         ps.value_numeric_max,
         ca.name      AS attr_name,
         ca.slug      AS attr_slug,
         ca.data_type,
         ca.unit
       FROM   product_specifications ps
       JOIN   category_attributes    ca ON ca.id = ps.category_attribute_id
       WHERE  ps.product_id = $1
       ORDER  BY ca.sort_order`,
      [productId]
    ),
    pool.query(
      `SELECT id, variant_name, sku, price_modifier, attributes, is_active
       FROM   product_variants
       WHERE  product_id = $1
       ORDER  BY created_at`,
      [productId]
    ),
    pool.query(
      `SELECT t.id, t.name, t.slug
       FROM   product_tags pt
       JOIN   tags         t  ON t.id = pt.tag_id
       WHERE  pt.product_id = $1`,
      [productId]
    ),
  ]);

  return {
    ...product,
    images:   images.rows,
    specs:    specs.rows,
    variants: variants.rows,
    tags:     tags.rows,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   create
────────────────────────────────────────────────────────────────────────────── */
async function create(userId, body) {
  const companyId = await getCompanyId(userId);
  const images    = Array.isArray(body.images) ? normalizeProductImages(body.images, { userId, companyId }) : [];
  const client    = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert core product
    const { rows: [product] } = await client.query(
      `INSERT INTO products
         (supplier_company_id, category_id, name, description,
          min_order_quantity, moq_unit, base_price, currency,
          lead_time_days, hs_code, country_of_origin, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        companyId,
        body.category_id,
        body.name,
        body.description        || null,
        body.min_order_quantity || 1,
        body.moq_unit           || 'pieces',
        body.base_price         || null,
        body.currency           || 'INR',
        body.lead_time_days     || null,
        body.hs_code            || null,
        body.country_of_origin  || 'IN',
        body.status             || 'draft',
      ]
    );

    const productId = product.id;

    // 2. Images — parameterized to prevent SQL injection
    for (const img of images) {
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [productId, img.image_url, img.alt_text, img.sort_order]
      );
    }

    // 3. Variants
    if (Array.isArray(body.variants) && body.variants.length) {
      for (const v of body.variants) {
        await client.query(
          `INSERT INTO product_variants
             (product_id, variant_name, sku, price_modifier, attributes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            productId,
            v.variant_name,
            v.sku            || null,
            v.price_modifier || 0,
            v.attributes     ? JSON.stringify(v.attributes) : null,
          ]
        );
      }
    }

    // 4. Specifications
    if (Array.isArray(body.specs) && body.specs.length) {
      for (const s of body.specs) {
        await client.query(
          `INSERT INTO product_specifications
             (product_id, category_attribute_id, value_text, value_numeric, value_numeric_max)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            productId,
            s.category_attribute_id,
            s.value_text        || null,
            s.value_numeric     || null,
            s.value_numeric_max || null,
          ]
        );
      }
    }

    // 5. Tags
    if (Array.isArray(body.tag_ids) && body.tag_ids.length) {
      for (const tagId of body.tag_ids) {
        await client.query(
          `INSERT INTO product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [productId, tagId]
        );
      }
    }

    await client.query('COMMIT');
    return findById(productId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   update — replaces images / variants / specs / tags wholesale
────────────────────────────────────────────────────────────────────────────── */
async function update(userId, productId, body) {
  const companyId = await getCompanyId(userId);

  // Ownership check
  const { rows: [existing] } = await pool.query(
    `SELECT id FROM products WHERE id = $1 AND supplier_company_id = $2`,
    [productId, companyId]
  );
  if (!existing) {
    const err = new Error('Product not found or access denied');
    err.status = 404;
    throw err;
  }

  // Photos already on this product (e.g. legacy links that couldn't be migrated) may be kept as-is.
  let images = null;
  if (Array.isArray(body.images)) {
    const { rows: current } = await pool.query(
      `SELECT image_url FROM product_images WHERE product_id = $1`,
      [productId]
    );
    images = normalizeProductImages(body.images, {
      userId,
      companyId,
      existingUrls: current.map((r) => r.image_url),
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Core fields — only update what is sent
    await client.query(
      `UPDATE products SET
         category_id        = COALESCE($1,  category_id),
         name               = COALESCE($2,  name),
         description        = COALESCE($3,  description),
         min_order_quantity = COALESCE($4,  min_order_quantity),
         moq_unit           = COALESCE($5,  moq_unit),
         base_price         = COALESCE($6,  base_price),
         currency           = COALESCE($7,  currency),
         lead_time_days     = COALESCE($8,  lead_time_days),
         hs_code            = COALESCE($9,  hs_code),
         country_of_origin  = COALESCE($10, country_of_origin),
         status             = COALESCE($11, status),
         updated_at         = now()
       WHERE id = $12`,
      [
        body.category_id        || null,
        body.name               || null,
        body.description        || null,
        body.min_order_quantity || null,
        body.moq_unit           || null,
        body.base_price         || null,
        body.currency           || null,
        body.lead_time_days     || null,
        body.hs_code            || null,
        body.country_of_origin  || null,
        body.status             || null,
        productId,
      ]
    );

    // Replace images if provided
    if (images) {
      await client.query(`DELETE FROM product_images WHERE product_id = $1`, [productId]);
      for (const img of images) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, alt_text, sort_order)
           VALUES ($1,$2,$3,$4)`,
          [productId, img.image_url, img.alt_text, img.sort_order]
        );
      }
    }

    // Replace variants if provided
    if (Array.isArray(body.variants)) {
      await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);
      for (const v of body.variants) {
        await client.query(
          `INSERT INTO product_variants (product_id, variant_name, sku, price_modifier, attributes)
           VALUES ($1,$2,$3,$4,$5)`,
          [productId, v.variant_name, v.sku || null, v.price_modifier || 0, v.attributes ? JSON.stringify(v.attributes) : null]
        );
      }
    }

    // Replace specs if provided
    if (Array.isArray(body.specs)) {
      await client.query(`DELETE FROM product_specifications WHERE product_id = $1`, [productId]);
      for (const s of body.specs) {
        await client.query(
          `INSERT INTO product_specifications (product_id, category_attribute_id, value_text, value_numeric, value_numeric_max)
           VALUES ($1,$2,$3,$4,$5)`,
          [productId, s.category_attribute_id, s.value_text || null, s.value_numeric || null, s.value_numeric_max || null]
        );
      }
    }

    // Replace tags if provided
    if (Array.isArray(body.tag_ids)) {
      await client.query(`DELETE FROM product_tags WHERE product_id = $1`, [productId]);
      for (const tagId of body.tag_ids) {
        await client.query(
          `INSERT INTO product_tags (product_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [productId, tagId]
        );
      }
    }

    await client.query('COMMIT');
    return findById(productId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   remove — cascades via FK
────────────────────────────────────────────────────────────────────────────── */
async function remove(userId, productId) {
  const companyId = await getCompanyId(userId);
  const { rowCount } = await pool.query(
    `DELETE FROM products WHERE id = $1 AND supplier_company_id = $2`,
    [productId, companyId]
  );
  if (!rowCount) {
    const err = new Error('Product not found or access denied');
    err.status = 404;
    throw err;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Categories helpers
────────────────────────────────────────────────────────────────────────────── */
async function getCategories() {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.parent_id, c.description, c.icon_url, c.sort_order,
            (SELECT COUNT(*)::int
             FROM   products p
             JOIN   categories pc ON pc.id = p.category_id
             WHERE  p.status = 'active' AND (pc.id = c.id OR pc.parent_id = c.id)) AS product_count
     FROM   categories c
     WHERE  c.is_active = true
     ORDER  BY c.sort_order, c.name`
  );
  return rows;
}

async function getCategoryAttributes(categoryId) {
  const { rows } = await pool.query(
    `SELECT id, name, slug, data_type, unit, options, is_required, sort_order
     FROM   category_attributes
     WHERE  category_id = $1
     ORDER  BY sort_order, name`,
    [categoryId]
  );
  return rows;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tags helpers
────────────────────────────────────────────────────────────────────────────── */
async function getAllTags() {
  const { rows } = await pool.query(`SELECT id, name, slug FROM tags ORDER BY name`);
  return rows;
}

async function upsertTag(name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const { rows: [tag] } = await pool.query(
    `INSERT INTO tags (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, slug`,
    [name, slug]
  );
  return tag;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
  getCategories,
  getCategoryAttributes,
  getAllTags,
  upsertTag,
};