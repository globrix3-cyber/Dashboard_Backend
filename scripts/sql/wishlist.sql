-- Saved wishlist (hearts). Additive + idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id    uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- PK covers lookups by user; this one serves the product-side cascade/deletes.
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product_id ON wishlist_items (product_id);
