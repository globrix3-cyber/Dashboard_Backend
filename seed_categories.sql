-- ─────────────────────────────────────────────────────────────────────────────
-- Globrixa — Seed category attributes + new root categories
-- Run: psql "DATABASE_URL" -f seed_categories.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New root categories ───────────────────────────────────────────────────────
INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES
  ('Automotive Parts',      'automotive-parts',     'Auto components, spare parts and accessories',          11, true),
  ('Pharmaceuticals',       'pharmaceuticals',      'Medicines, API, nutraceuticals and medical devices',   12, true),
  ('Gems & Jewellery',      'gems-jewellery',       'Diamonds, gemstones, gold and fashion jewellery',      13, true),
  ('Building & Construction','building-construction','Cement, steel, tiles, sanitary and hardware',         14, true),
  ('Paper & Stationery',    'paper-stationery',     'Paper products, office supplies and print media',      15, true),
  ('Leather & Footwear',    'leather-footwear',     'Leather goods, shoes, bags and accessories',           16, true)
ON CONFLICT (slug) DO NOTHING;

-- ── Sub-categories for new roots ──────────────────────────────────────────────
INSERT INTO categories (name, slug, parent_id, sort_order, is_active)
SELECT 'Engine & Transmission', 'engine-transmission',
       id, 1, true FROM categories WHERE slug = 'automotive-parts' LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order, is_active)
SELECT 'API & Bulk Drugs', 'api-bulk-drugs',
       id, 1, true FROM categories WHERE slug = 'pharmaceuticals' LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order, is_active)
SELECT 'Diamond & Gold Jewellery', 'diamond-gold-jewellery',
       id, 1, true FROM categories WHERE slug = 'gems-jewellery' LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, parent_id, sort_order, is_active)
SELECT 'Cement & Concrete', 'cement-concrete',
       id, 1, true FROM categories WHERE slug = 'building-construction' LIMIT 1
ON CONFLICT (slug) DO NOTHING;

-- ── Category Attributes ───────────────────────────────────────────────────────

-- Apparel & Textiles
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Fabric Type', 'fabric-type', 'select', NULL,
  '["Cotton","Polyester","Silk","Wool","Linen","Rayon","Blended"]', true, 1
FROM categories WHERE slug = 'apparel-textiles' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'GSM / Weight', 'gsm-weight', 'number', 'GSM', NULL, false, 2
FROM categories WHERE slug = 'apparel-textiles' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Width', 'fabric-width', 'number', 'inches', NULL, false, 3
FROM categories WHERE slug = 'apparel-textiles' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Pattern', 'pattern', 'select', NULL,
  '["Plain","Printed","Embroidered","Jacquard","Striped","Checked","Solid"]', false, 4
FROM categories WHERE slug = 'apparel-textiles' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Certification', 'textile-cert', 'select', NULL,
  '["OEKO-TEX","GOTS Organic","BIS","MSME Certified","None"]', false, 5
FROM categories WHERE slug = 'apparel-textiles' LIMIT 1
ON CONFLICT DO NOTHING;

-- Electronics & Electrical
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Voltage', 'voltage', 'select', NULL,
  '["5V","12V","24V","110V","220V","240V","Universal"]', true, 1
FROM categories WHERE slug = 'electronics-electrical' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Power Rating', 'power-rating', 'number', 'W', NULL, false, 2
FROM categories WHERE slug = 'electronics-electrical' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Certifications', 'electronics-cert', 'select', NULL,
  '["BIS","CE","RoHS","UL","FCC","ISI","None"]', false, 3
FROM categories WHERE slug = 'electronics-electrical' LIMIT 1
ON CONFLICT DO NOTHING;

-- Food & Agriculture
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Organic Certified', 'organic-cert', 'select', NULL,
  '["Yes – APEDA","Yes – USDA","Yes – EU Organic","No"]', true, 1
FROM categories WHERE slug = 'food-agriculture' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Moisture Content', 'moisture-content', 'number', '%', NULL, false, 2
FROM categories WHERE slug = 'food-agriculture' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Shelf Life', 'shelf-life', 'number', 'months', NULL, false, 3
FROM categories WHERE slug = 'food-agriculture' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'FSSAI License', 'fssai-license', 'text', NULL, NULL, true, 4
FROM categories WHERE slug = 'food-agriculture' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Packaging Type', 'packaging-type', 'select', NULL,
  '["Jute Bags","HDPE Bags","Vacuum Packed","Bulk","Retail Pack","Custom"]', false, 5
FROM categories WHERE slug = 'food-agriculture' LIMIT 1
ON CONFLICT DO NOTHING;

-- Industrial & Machinery
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Machine Type', 'machine-type', 'select', NULL,
  '["CNC","Manual","Semi-Automatic","Fully Automatic","Hydraulic","Pneumatic"]', true, 1
FROM categories WHERE slug = 'industrial-machinery' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Power Source', 'power-source', 'select', NULL,
  '["Electric","Diesel","Petrol","Solar","Manual"]', false, 2
FROM categories WHERE slug = 'industrial-machinery' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Capacity', 'machine-capacity', 'number', 'units/hr', NULL, false, 3
FROM categories WHERE slug = 'industrial-machinery' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Material', 'machine-material', 'select', NULL,
  '["Stainless Steel","Mild Steel","Cast Iron","Aluminium","Plastic"]', false, 4
FROM categories WHERE slug = 'industrial-machinery' LIMIT 1
ON CONFLICT DO NOTHING;

-- Chemicals & Plastics
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Purity', 'chemical-purity', 'number', '%', NULL, true, 1
FROM categories WHERE slug = 'chemicals-plastics' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Grade', 'chemical-grade', 'select', NULL,
  '["Industrial","Food Grade","Pharmaceutical","Technical","Laboratory","Agricultural"]', true, 2
FROM categories WHERE slug = 'chemicals-plastics' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Packaging', 'chemical-packaging', 'select', NULL,
  '["25 kg Bags","50 kg Bags","200 L Drums","IBC Tanks","Bulk","Custom"]', false, 3
FROM categories WHERE slug = 'chemicals-plastics' LIMIT 1
ON CONFLICT DO NOTHING;

-- Handicrafts & Gifts
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Material', 'craft-material', 'select', NULL,
  '["Wood","Brass","Silver","Terracotta","Bamboo","Jute","Marble","Fabric"]', true, 1
FROM categories WHERE slug = 'handicrafts-gifts' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Origin State', 'craft-state', 'select', NULL,
  '["Rajasthan","Uttar Pradesh","Gujarat","West Bengal","Tamil Nadu","Maharashtra","Kerala","Karnataka","Odisha","Manipur"]', true, 2
FROM categories WHERE slug = 'handicrafts-gifts' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'GI Tag', 'gi-tag', 'select', NULL,
  '["Yes – Registered","Applied","No"]', false, 3
FROM categories WHERE slug = 'handicrafts-gifts' LIMIT 1
ON CONFLICT DO NOTHING;

-- Beauty & Personal Care
INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Formulation', 'formulation', 'select', NULL,
  '["Cream","Gel","Serum","Oil","Powder","Liquid","Spray","Tablet","Capsule"]', true, 1
FROM categories WHERE slug = 'beauty-personal-care' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO category_attributes (category_id, name, slug, data_type, unit, options, is_required, sort_order)
SELECT id, 'Certifications', 'beauty-cert', 'select', NULL,
  '["Ayush Approved","ISO 22716","Cruelty Free","Vegan","Organic","None"]', false, 2
FROM categories WHERE slug = 'beauty-personal-care' LIMIT 1
ON CONFLICT DO NOTHING;

-- Verify
SELECT
  c.name AS category,
  COUNT(ca.id) AS attribute_count
FROM categories c
LEFT JOIN category_attributes ca ON ca.category_id = c.id
WHERE c.parent_id IS NULL
GROUP BY c.id, c.name
ORDER BY c.sort_order;
