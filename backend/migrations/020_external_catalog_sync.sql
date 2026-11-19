-- Frequencia40 / Fase 2: entrada controlada de catalogo pelo ERP.
-- Migration incremental. Nao editar as migrations 001..019 ja aplicadas.
ALTER TABLE external_integrations
  ADD COLUMN catalog_authority BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX ux_external_integrations_catalog_authority
  ON external_integrations(store_id) WHERE catalog_authority AND revoked_at IS NULL;

-- Identificadores de produto de cada fornecedor, sem misturar lojas.
CREATE TABLE external_product_mappings (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  external_id VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, product_id),
  UNIQUE (integration_id, external_id),
  FOREIGN KEY (integration_id, store_id) REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, store_id) REFERENCES products(id, store_id) ON DELETE RESTRICT
);

-- GTIN/EAN opcional por variante, restrito a formatos GS1 com digito verificador
-- validado na API de integracao. Dados legados permanecem nulos.
ALTER TABLE product_variants ADD COLUMN gtin VARCHAR(14);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_gtin_shape
  CHECK (gtin IS NULL OR (gtin ~ '^[0-9]+$' AND length(gtin) IN (8,12,13,14)));
CREATE UNIQUE INDEX ux_product_variants_store_gtin
  ON product_variants(store_id,gtin) WHERE gtin IS NOT NULL;

-- Versao da fonte para o produto importado: evita updates desordenados.
CREATE TABLE external_catalog_positions (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  product_id UUID NOT NULL,
  source_version BIGINT NOT NULL CHECK (source_version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, product_id),
  FOREIGN KEY (integration_id, store_id) REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, store_id) REFERENCES products(id, store_id) ON DELETE RESTRICT
);

-- Idempotencia: mesma operacao logica = mesmo payload, inclusive apos timeout.
CREATE TABLE external_catalog_operations (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  event_id UUID NOT NULL,
  product_id UUID NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  source_version BIGINT NOT NULL CHECK (source_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id,event_id),
  FOREIGN KEY (integration_id, store_id) REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, store_id) REFERENCES products(id, store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_external_catalog_operations_created
  ON external_catalog_operations(integration_id,created_at DESC);

-- Origem do evento: o ERP nao precisa consumir como novidade o que ele mesmo importou.
-- Outros conectores da mesma loja continuam recebendo os eventos.
ALTER TABLE external_change_events
  ADD COLUMN origin_integration_id UUID REFERENCES external_integrations(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION enqueue_external_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_store UUID;
  target_resource UUID;
  kind VARCHAR(40);
  origin_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN target_store := OLD.store_id;
  ELSE target_store := NEW.store_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM external_integrations WHERE store_id=target_store AND revoked_at IS NULL) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'products' THEN
    kind := 'catalog.product.changed';
    target_resource := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    kind := 'catalog.variant.changed';
    target_resource := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'order_items' THEN
    kind := 'order.changed';
    target_resource := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  ELSE
    kind := 'order.changed';
    target_resource := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  END IF;
  origin_id := NULLIF(current_setting('f40.integration_id',true),'')::uuid;
  INSERT INTO external_change_events(store_id,event_type,resource_id,origin_integration_id)
    VALUES(target_store,kind,target_resource,origin_id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
