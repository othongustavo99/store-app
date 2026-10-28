-- Fase 4.5: solicitações de pós-venda. Não altera estados financeiros de orders/payments.
-- Nunca modificar migrations anteriores já aplicadas.
CREATE TABLE after_sales_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  order_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_type TEXT NOT NULL CHECK (request_type IN ('CANCEL','RETURN','REFUND')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION','REJECTED','CLOSED'
  )),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1200),
  staff_notes TEXT,
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT,
  UNIQUE (store_id,customer_id,idempotency_key),
  UNIQUE (id,store_id)
);
CREATE UNIQUE INDEX ux_one_active_after_sale_per_order
  ON after_sales_requests(order_id)
  WHERE status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION');
CREATE INDEX ix_after_sales_store ON after_sales_requests(store_id,created_at DESC);
CREATE INDEX ix_after_sales_customer ON after_sales_requests(store_id,customer_id,created_at DESC);

CREATE TABLE after_sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  store_id UUID NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (request_id,store_id) REFERENCES after_sales_requests(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_after_sales_events ON after_sales_events(request_id,created_at);

-- Reutiliza a infraestrutura SSE de pedidos (avisos sem dados pessoais).
CREATE OR REPLACE FUNCTION notify_after_sales_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('loja_order_changed',
    json_build_object('storeId',NEW.store_id,'customerId',NEW.customer_id)::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER after_sales_change AFTER INSERT OR UPDATE OF status ON after_sales_requests
 FOR EACH ROW EXECUTE FUNCTION notify_after_sales_changed();
