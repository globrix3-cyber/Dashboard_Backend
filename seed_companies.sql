-- ─────────────────────────────────────────────────────────────────────────────
-- Globrixa — Seed companies for test users
-- Run: psql "DATABASE_URL" -f seed_companies.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  buyer_id    uuid;
  supplier_id uuid;
  buyer_co    uuid;
  supplier_co uuid;
BEGIN

  SELECT id INTO buyer_id    FROM users WHERE email = 'buyer@example.com'    LIMIT 1;
  SELECT id INTO supplier_id FROM users WHERE email = 'supplier@example.com' LIMIT 1;

  -- Buyer company (if not already linked)
  IF buyer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = buyer_id AND is_active = true
  ) THEN
    INSERT INTO companies (legal_name, brand_name, is_buyer, is_supplier, country, city, verified_status)
    VALUES ('Demo Buyer Pvt Ltd', 'Demo Buyer', true, false, 'IN', 'Mumbai', 'verified')
    RETURNING id INTO buyer_co;

    INSERT INTO company_users (user_id, company_id) VALUES (buyer_id, buyer_co);
    RAISE NOTICE 'Created company for buyer@example.com → %', buyer_co;
  ELSE
    RAISE NOTICE 'buyer@example.com already has a company or does not exist';
  END IF;

  -- Supplier company (if not already linked)
  IF supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM company_users WHERE user_id = supplier_id AND is_active = true
  ) THEN
    INSERT INTO companies (legal_name, brand_name, is_buyer, is_supplier, country, city, verified_status)
    VALUES ('Demo Supplier Exports', 'Demo Supplier', false, true, 'IN', 'Surat', 'verified')
    RETURNING id INTO supplier_co;

    INSERT INTO company_users (user_id, company_id) VALUES (supplier_id, supplier_co);
    RAISE NOTICE 'Created company for supplier@example.com → %', supplier_co;
  ELSE
    RAISE NOTICE 'supplier@example.com already has a company or does not exist';
  END IF;

END $$;

SELECT u.email, r.name AS role, c.legal_name, c.city, c.verified_status
FROM users u
JOIN roles r ON r.id = u.role_id
LEFT JOIN company_users cu ON cu.user_id = u.id AND cu.is_active = true
LEFT JOIN companies c ON c.id = cu.company_id
WHERE u.email IN ('buyer@example.com', 'supplier@example.com', 'admin@example.com');
