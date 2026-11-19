-- Frequencia40: base de integracoes externas ERP/PDV. NUNCA alterar migrations anteriores.
-- Nenhuma credencial e armazenada em texto puro. A integracao fica desativada ate criacao explicita pelo proprietario.
CREATE TABLE external_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  token_prefix VARCHAR(18) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  stock_authority BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (id, store_id),
  CONSTRAINT external_integrations_scopes CHECK (array_length(scopes, 1) BETWEEN 1 AND 8)
);
CREATE UNIQUE INDEX ux_external_integrations_stock_authority
  ON external_integrations(store_id) WHERE stock_authority AND revoked_at IS NULL;
CREATE INDEX ix_external_integrations_store ON external_integrations(store_id, created_at DESC);

-- Liga identificador externo a uma variante interna, sempre dentro do mesmo estabelecimento.
CREATE TABLE external_variant_mappings (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  external_id VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, variant_id),
  UNIQUE (integration_id, external_id),
  FOREIGN KEY (integration_id, store_id) REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id, store_id) ON DELETE RESTRICT
);

-- Versao monotonicamente crescente fornecida pelo ERP. Impede snapshots atrasados de sobrescrever os recentes.
CREATE TABLE external_stock_positions (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  source_version BIGINT NOT NULL CHECK (source_version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, variant_id),
  FOREIGN KEY (integration_id, store_id) REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id, store_id) ON DELETE RESTRICT
);

-- Idempotencia de entrada, uma chave por chamada logica de sincronizacao.
CREATE TABLE external_stock_operations (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  event_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  source_version BIGINT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 0 AND 1000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, event_id),
  FOREIGN KEY (integration_id, store_id) REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id, store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_external_stock_operations_created
  ON external_stock_operations(integration_id, created_at DESC);

-- Registro de alteracoes confirmado na MESMA transacao do negocio (outbox para polling).
-- Os eventos nao expoem PII; o consumidor consulta o recurso atualizado por API.
CREATE TABLE external_change_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  event_type VARCHAR(40) NOT NULL,
  resource_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_external_change_events_store_id ON external_change_events(store_id, id);
-- Confirmacoes por integracao: nenhum evento e descartado por cursors que ultrapassam transacoes ainda abertas.
CREATE TABLE external_event_acks (
  integration_id UUID NOT NULL REFERENCES external_integrations(id) ON DELETE RESTRICT,
  event_id BIGINT NOT NULL REFERENCES external_change_events(id) ON DELETE RESTRICT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id,event_id)
);
CREATE INDEX ix_external_event_acks_event ON external_event_acks(event_id);


CREATE FUNCTION enqueue_external_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_store UUID;
  target_resource UUID;
  kind VARCHAR(40);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    target_store := OLD.store_id;
  ELSE
    target_store := NEW.store_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM external_integrations WHERE store_id = target_store AND revoked_at IS NULL) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'products' THEN
    kind := 'catalog.product.changed';
    target_resource := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    kind := 'catalog.variant.changed';
    target_resource := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'order_items' THEN
    kind := 'order.changed';
    target_resource := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  ELSE
    kind := 'order.changed';
    target_resource := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  END IF;
  INSERT INTO external_change_events(store_id, event_type, resource_id)
    VALUES(target_store, kind, target_resource);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER products_external_events AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION enqueue_external_change();
CREATE TRIGGER variants_external_events AFTER INSERT OR UPDATE OR DELETE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION enqueue_external_change();
CREATE TRIGGER orders_external_events AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION enqueue_external_change();
CREATE TRIGGER order_items_external_events AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION enqueue_external_change();
