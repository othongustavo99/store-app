-- P2 etapa 2. Cupons por loja e tokens push vinculados ao usuário autenticado.
-- Nunca editar migrations anteriores.
CREATE TABLE store_coupons (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,24}$'),
 discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT','FIXED')),
 amount INTEGER NOT NULL CHECK (amount > 0), -- percentual em pontos-base (10000 = 100%); FIXED em centavos
 minimum_subtotal_cents BIGINT NOT NULL DEFAULT 0 CHECK (minimum_subtotal_cents >= 0),
 max_uses INTEGER CHECK (max_uses > 0),
 used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
 max_uses_per_user INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_user BETWEEN 1 AND 10),
 starts_at TIMESTAMPTZ,
 expires_at TIMESTAMPTZ,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (discount_type <> 'PERCENT' OR amount <= 10000),
 CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at),
 UNIQUE(store_id,code), UNIQUE(id,store_id)
);
CREATE TABLE order_coupons (
 order_id UUID PRIMARY KEY,
 store_id UUID NOT NULL,
 coupon_id UUID NOT NULL,
 customer_id UUID NOT NULL REFERENCES users(id),
 discount_cents BIGINT NOT NULL CHECK (discount_cents > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id),
 FOREIGN KEY(coupon_id,store_id) REFERENCES store_coupons(id,store_id)
);
CREATE INDEX ix_order_coupons_user ON order_coupons(store_id,coupon_id,customer_id);
-- orders.discount_cents ja existe desde 001_core.sql; IF NOT EXISTS evita erro de coluna duplicada.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);
CREATE TABLE push_device_tokens (
 token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
 token TEXT NOT NULL,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('ANDROID','IOS')),
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_push_tokens_target ON push_device_tokens(store_id,user_id) WHERE enabled;

-- Outbox transacional garante que alterações de estado não se percam com app fechado.
CREATE TABLE push_outbox (
 id BIGSERIAL PRIMARY KEY,
 store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
 customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 order_id UUID NOT NULL,
 status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 processed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_push_outbox_due ON push_outbox(next_attempt_at) WHERE processed_at IS NULL;
CREATE OR REPLACE FUNCTION enqueue_order_push() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
  -- Não gravar a fila quando ainda não existe um dispositivo registrado.
  IF EXISTS(SELECT 1 FROM push_device_tokens d WHERE d.store_id=NEW.store_id AND d.user_id=NEW.customer_id AND d.enabled) THEN
   INSERT INTO push_outbox(store_id,customer_id,order_id,status)
    VALUES(NEW.store_id,NEW.customer_id,NEW.id,NEW.status);
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enqueue_order_push ON orders;
CREATE TRIGGER trg_enqueue_order_push AFTER INSERT OR UPDATE OF status ON orders
 FOR EACH ROW EXECUTE FUNCTION enqueue_order_push();
