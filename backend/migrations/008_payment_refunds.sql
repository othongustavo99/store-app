-- Fase 4.6 - reembolso integral MP. Nunca modificar migrations aplicadas.
CREATE TABLE payment_refund_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  order_id UUID NOT NULL,
  after_sales_id UUID NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  gateway_payment_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  idempotency_key UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'NEEDS_RECONCILIATION'
    CHECK (status IN ('NEEDS_RECONCILIATION','MANUAL_REVIEW','CONFIRMED')),
  gateway_refund_id TEXT,
  gateway_status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT,
  FOREIGN KEY (after_sales_id,store_id) REFERENCES after_sales_requests(id,store_id) ON DELETE RESTRICT,
  UNIQUE (order_id),
  UNIQUE (after_sales_id),
  UNIQUE (store_id,gateway_payment_id),
  UNIQUE (idempotency_key)
);
CREATE INDEX ix_refunds_store ON payment_refund_operations(store_id,created_at DESC);
-- Estados de pagamentos/pedidos existentes já contemplam REFUNDED (migration 003).
