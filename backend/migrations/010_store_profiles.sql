-- Fase 4.8: identidade pública e operação independente por loja.
-- Sem credenciais de pagamento, segredos de terceiros nem dados pessoais privados.
CREATE TABLE store_profiles (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
  display_name VARCHAR(120),
  tagline VARCHAR(140) NOT NULL DEFAULT '',
  description VARCHAR(1200) NOT NULL DEFAULT '',
  logo_url TEXT,
  banner_url TEXT,
  primary_color CHAR(7) NOT NULL DEFAULT '#1C1B2F',
  support_email VARCHAR(254),
  support_phone VARCHAR(20),
  instagram_url TEXT,
  privacy_url TEXT,
  terms_url TEXT,
  returns_url TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_profiles_primary_color_hex CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT store_profiles_support_phone_digits CHECK (support_phone IS NULL OR support_phone ~ '^[0-9]{10,15}$')
);
-- Cobrir lojas existentes. Lojas novas terão valores padrão na leitura e serão criadas no primeiro salvamento.
INSERT INTO store_profiles(store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
