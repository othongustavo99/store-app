-- P0: demonstracao opt-in por loja. Nunca alterar migrations anteriores.
ALTER TABLE stores ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX ix_orders_demo_store ON orders(store_id, created_at DESC) WHERE is_demo;
