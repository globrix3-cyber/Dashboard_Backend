-- ─────────────────────────────────────────────────────────────────────────────
-- Globrixa B2B Platform — Migration v2
-- Run against Aiven PostgreSQL:
--   psql "DATABASE_URL" -f migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add full_name to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200);

-- 2. Seed roles (safe — ON CONFLICT does nothing if already exists)
INSERT INTO roles (name, is_active)
VALUES ('buyer', true), ('supplier', true), ('admin', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Add KYC review tracking to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMP WITH TIME ZONE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS reviewed_by  INTEGER REFERENCES users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- 4. Ensure verified_status default is 'pending' for new companies
ALTER TABLE companies ALTER COLUMN verified_status SET DEFAULT 'pending';

-- 5. Add response_count helper index on rfq_responses
CREATE INDEX IF NOT EXISTS idx_rfq_responses_rfq_id ON rfq_responses(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_responses_supplier ON rfq_responses(supplier_company_id);

-- 6. Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rfqs_buyer_company    ON rfqs(buyer_company_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_status           ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_company  ON orders(buyer_company_id);
CREATE INDEX IF NOT EXISTS idx_orders_supplier       ON orders(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);

-- Verify
SELECT 'Migration v2 complete' AS status;
