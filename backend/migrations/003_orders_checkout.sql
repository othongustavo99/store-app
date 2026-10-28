-- Fase 3: pedidos transacionais e checkout externo. Nunca editar migrations já aplicadas.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_method TEXT NOT NULL DEFAULT 'PICKUP'
  CHECK (fulfillment_method IN ('PICKUP'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
 'PENDING_PAYMENT','PAID','PREPARING','SHIPPED','DELIVERED','CANCELED','REFUNDED','PAYMENT_REVIEW'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_customer_idempotency
  ON orders(store_id, customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_orders_unpaid_expiration ON orders(reservation_expires_at)
  WHERE status='PENDING_PAYMENT';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_id UUID;
-- Estes UUIDs são snapshots de referência; não usar FK para impedir histórico após arquivamento.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS initialization_started_at TIMESTAMPTZ;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
  'PENDING','APPROVED','FAILED','CANCELED','REFUNDED','REVIEW'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_gateway_payment
  ON payments(provider,gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_order_provider ON payments(order_id, provider);
CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  store_id UUID NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_order_events_order ON order_events(order_id,created_at);
-- A reserva afeta disponibilidade, portanto notificar o catálogo também.
CREATE OR REPLACE FUNCTION notify_order_stock_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('loja_catalog_changed', NEW.store_id::text);
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS variants_stock_change ON product_variants;
CREATE TRIGGER variants_stock_change AFTER UPDATE OF reserved,on_hand ON product_variants
 FOR EACH ROW WHEN (OLD.reserved IS DISTINCT FROM NEW.reserved OR OLD.on_hand IS DISTINCT FROM NEW.on_hand)
 EXECUTE FUNCTION notify_order_stock_change();

-- Notificações de pedidos por loja e usuário; nunca incluir dados privados no SSE.
CREATE OR REPLACE FUNCTION notify_order_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('loja_order_changed',json_build_object('storeId',NEW.store_id,'customerId',NEW.customer_id)::text);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS order_status_change ON orders;
CREATE TRIGGER order_status_change AFTER INSERT OR UPDATE OF status ON orders
 FOR EACH ROW EXECUTE FUNCTION notify_order_change();
