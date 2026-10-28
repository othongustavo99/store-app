-- Fase 4.7: fretes cotados por transportadora, sem valores simulados.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_method_check
  CHECK (fulfillment_method IN ('PICKUP','DELIVERY'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_delivery_days INTEGER;

CREATE TABLE store_shipping_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
  origin_postal_code CHAR(8) NOT NULL CHECK (origin_postal_code ~ '^[0-9]{8}$'),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE shipping_variant_parcels (
  variant_id UUID NOT NULL,
  store_id UUID NOT NULL,
  weight_kg NUMERIC(7,3) NOT NULL CHECK (weight_kg >= 0.01 AND weight_kg <= 30),
  width_cm NUMERIC(7,2) NOT NULL CHECK (width_cm BETWEEN 1 AND 200),
  height_cm NUMERIC(7,2) NOT NULL CHECK (height_cm BETWEEN 1 AND 200),
  length_cm NUMERIC(7,2) NOT NULL CHECK (length_cm BETWEEN 1 AND 200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(variant_id,store_id),
  FOREIGN KEY(variant_id,store_id) REFERENCES product_variants(id,store_id) ON DELETE RESTRICT
);
CREATE TABLE shipping_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  origin_postal_code CHAR(8) NOT NULL,
  destination_postal_code CHAR(8) NOT NULL,
  cart_hash CHAR(64) NOT NULL,
  services JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,store_id)
);
CREATE INDEX ix_shipping_quotes_customer ON shipping_quotes(store_id,customer_id,expires_at DESC);
CREATE INDEX ix_shipping_quotes_expiry ON shipping_quotes(expires_at);

-- Um pedido pode ter mais de um envio futuramente; nesta fase cada pedido terá no máximo um.
CREATE UNIQUE INDEX IF NOT EXISTS ux_shipments_order ON shipments(order_id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS service_id TEXT;
