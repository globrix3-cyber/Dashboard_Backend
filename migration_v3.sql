-- ─────────────────────────────────────────────────────────────────────────────
-- Globrixa B2B — Migration v3: Messaging system enhancements
-- Run: psql "DATABASE_URL" -f migration_v3.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Add status + subject to conversations (messaging threads)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status  VARCHAR(20) DEFAULT 'active';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject VARCHAR(200);

-- Add message_type so we can render quote-offer cards differently
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) DEFAULT 'text';

-- Indexes for message queries
CREATE INDEX IF NOT EXISTS idx_conversations_buyer    ON conversations(buyer_company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_supplier ON conversations(supplier_company_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation  ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender        ON messages(sender_user_id);

SELECT 'Migration v3 complete' AS status;
