-- Client's after-login category list (Canva "B2B website design changes V2", page 14).
-- Additive and idempotent: existing categories and products are untouched; re-running inserts nothing.
-- Undo (only while no product uses them):
--   DELETE FROM categories WHERE slug IN ('side-tables','bedside-tables','console-tables','coffee-tables',
--     'table-lamps-shades','chairs','vegan-leather-bags','genuine-leather-bags','jute-bags','cotton-bags',
--     'wooden-serveware','wall-home-decor');
INSERT INTO categories (name, slug, sort_order, is_active) VALUES
  ('Side Tables',            'side-tables',            101, true),
  ('Bedside Tables',         'bedside-tables',         102, true),
  ('Console Tables',         'console-tables',         103, true),
  ('Coffee Tables',          'coffee-tables',          104, true),
  ('Table Lamps & Shades',   'table-lamps-shades',     105, true),
  ('Chairs',                 'chairs',                 106, true),
  ('Vegan Leather Bags',     'vegan-leather-bags',     107, true),
  ('Genuine Leather Bags',   'genuine-leather-bags',   108, true),
  ('Jute Bags',              'jute-bags',              109, true),
  ('Cotton Bags',            'cotton-bags',            110, true),
  ('Wooden Serveware',       'wooden-serveware',       111, true),
  ('Wall & Home Decor',      'wall-home-decor',        112, true)
ON CONFLICT (slug) DO NOTHING;
