-- Client Canva p45: remove the dummy listings from the website.
-- These six products belong to the two seeded test suppliers ("Jaipur Looms Private Limited",
-- "Surat Silk & Weaves Pvt Ltd", created 2026-06-08) and use unrelated stock photos.
-- Reversible: products are hidden (status 'inactive'), not deleted. The site only lists status = 'active'.
-- Undo: UPDATE products SET status = 'active' WHERE id IN (SELECT ... same filter ...);
UPDATE products
SET    status = 'inactive', updated_at = NOW()
WHERE  status = 'active'
  AND  supplier_company_id IN (
         SELECT id FROM companies
         WHERE  legal_name IN ('Jaipur Looms Private Limited', 'Surat Silk & Weaves Pvt Ltd')
       )
  AND  name IN (
         'Hand Block-Printed Cotton Fabric — Sanganeri Print',
         'Organic Khadi Cotton Yardage — Natural Indigo Dye',
         'Rajasthani Bandhani Dupattas — Bulk Pack of 12',
         'Banarasi Silk Sarees — Wedding Collection',
         'Embroidered Georgette Kurta Sets — Pack of 6',
         'Men''s Cotton Formal Shirts — Wholesale Carton of 10'
       );
