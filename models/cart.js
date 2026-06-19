const pool = require('../config/db');

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

async function list(userId) {
  const companyId = await getCompanyId(userId);
  const { rows } = await pool.query(
    `SELECT
       ci.id, ci.product_id, ci.variant_id, ci.quantity, ci.created_at,
       p.name, p.base_price, p.currency, p.min_order_quantity, p.moq_unit, p.status,
       p.supplier_company_id,
       co.legal_name      AS supplier_name,
       pv.variant_name, pv.price_modifier, pv.attributes,
       (SELECT pi.image_url FROM product_images pi
        WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image_url
     FROM   cart_items ci
     JOIN   products  p  ON p.id  = ci.product_id
     JOIN   companies co ON co.id = p.supplier_company_id
     LEFT JOIN product_variants pv ON pv.id = ci.variant_id
     WHERE  ci.buyer_company_id = $1
     ORDER  BY ci.created_at DESC`,
    [companyId]
  );
  return rows;
}

// Adding the same product+variant again increments the existing line's
// quantity rather than creating a duplicate row.
async function add(userId, { product_id, variant_id, quantity }) {
  const companyId = await getCompanyId(userId);
  const qty = Math.max(1, Math.trunc(Number(quantity)) || 1);
  const variantId = variant_id || null;

  const { rows: [existing] } = await pool.query(
    `SELECT id, quantity FROM cart_items
     WHERE buyer_company_id = $1 AND product_id = $2
       AND (variant_id = $3 OR (variant_id IS NULL AND $3::uuid IS NULL))`,
    [companyId, product_id, variantId]
  );

  if (existing) {
    const { rows: [row] } = await pool.query(
      `UPDATE cart_items SET quantity = quantity + $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [qty, existing.id]
    );
    return row;
  }

  const { rows: [row] } = await pool.query(
    `INSERT INTO cart_items (buyer_company_id, product_id, variant_id, quantity)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [companyId, product_id, variantId, qty]
  );
  return row;
}

// Sets a line item's quantity to an exact value (used when editing on the cart page).
async function setQuantity(userId, cartItemId, quantity) {
  const companyId = await getCompanyId(userId);
  const qty = Math.max(1, Math.trunc(Number(quantity)) || 1);

  const { rows: [row] } = await pool.query(
    `UPDATE cart_items SET quantity = $1, updated_at = now()
     WHERE id = $2 AND buyer_company_id = $3
     RETURNING *`,
    [qty, cartItemId, companyId]
  );
  if (!row) {
    const err = new Error('Cart item not found');
    err.status = 404;
    throw err;
  }
  return row;
}

async function remove(userId, cartItemId) {
  const companyId = await getCompanyId(userId);
  const { rowCount } = await pool.query(
    `DELETE FROM cart_items WHERE id = $1 AND buyer_company_id = $2`,
    [cartItemId, companyId]
  );
  if (!rowCount) {
    const err = new Error('Cart item not found');
    err.status = 404;
    throw err;
  }
  return true;
}

async function clear(userId) {
  const companyId = await getCompanyId(userId);
  await pool.query(`DELETE FROM cart_items WHERE buyer_company_id = $1`, [companyId]);
  return true;
}

module.exports = { list, add, setQuantity, remove, clear };
