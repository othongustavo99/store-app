-- P1: identidade e opções locais são opt-in; nenhum pagamento externo é ativado.
ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) NOT NULL DEFAULT '#E94560'
  CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE store_profiles ADD COLUMN IF NOT EXISTS offline_methods TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE store_profiles ADD CONSTRAINT store_profiles_offline_methods_check
  CHECK (offline_methods <@ ARRAY['PAY_ON_PICKUP','MANUAL_PIX','WHATSAPP']::TEXT[]);
