-- Etapa 04: retirada informada e entrega organizada pela própria loja.
CREATE TABLE store_fulfillment_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
  pickup_address TEXT NOT NULL DEFAULT '',
  pickup_hours TEXT NOT NULL DEFAULT '',
  local_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  local_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (local_fee_cents BETWEEN 0 AND 100000),
  local_estimate TEXT NOT NULL DEFAULT '',
  local_postal_ranges JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(local_postal_ranges)='array'),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE shipping_quotes ADD COLUMN provider TEXT NOT NULL DEFAULT 'CARRIER'
  CHECK (provider IN ('CARRIER','LOCAL'));
