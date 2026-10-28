-- FASE 4. Não modificar migrações já aplicadas.
-- Chaves de operação tornam ajustes idempotentes inclusive com reenvios após timeout.
CREATE TABLE inventory_adjustment_requests (
  id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL,
  performed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL CHECK (delta <> 0 AND abs(delta) <= 100000),
  notes VARCHAR(300) NOT NULL,
  before_on_hand INTEGER NOT NULL CHECK (before_on_hand >= 0),
  after_on_hand INTEGER NOT NULL CHECK (after_on_hand >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, id),
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_inventory_adjustment_requests_variant ON inventory_adjustment_requests(store_id,variant_id,created_at DESC);
CREATE INDEX ix_inventory_variant_store ON product_variants(store_id,status,product_id);
