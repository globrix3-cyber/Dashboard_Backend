-- Suppliers could never send a quote: rfq_responses.product_id was NOT NULL but quotes answer a buyer's
-- request (often for a custom item) and the quote endpoint has no product to send. Relax the rule.
-- Undo (only if no quote has a NULL product_id): ALTER TABLE rfq_responses ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE rfq_responses ALTER COLUMN product_id DROP NOT NULL;
