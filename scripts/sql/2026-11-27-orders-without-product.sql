-- Orders could never be placed from a contract: order_items.product_id was NOT NULL, but an order created
-- from a contract (a quote on a custom request) has no catalogue product. Relax the rule.
-- Undo (only if no order item has a NULL product_id): ALTER TABLE order_items ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;
