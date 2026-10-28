-- Fase 5.3. Endereços privados associados ao usuário autenticado.
-- Não migrar automaticamente entradas anônimas do SharedPreferences.
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(60) NOT NULL,
  zip_code CHAR(8) NOT NULL CHECK (zip_code ~ '^[0-9]{8}$'),
  street VARCHAR(160) NOT NULL,
  number VARCHAR(30) NOT NULL,
  complement VARCHAR(120) NOT NULL DEFAULT '',
  neighborhood VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_customer_addresses_user ON customer_addresses (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_addresses_primary
  ON customer_addresses (user_id) WHERE is_primary;
