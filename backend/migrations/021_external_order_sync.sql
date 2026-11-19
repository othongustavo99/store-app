-- Frequencia40 ERP/PDV - Fase 3: reconciliacao de pedidos sem alterar pagamentos.
-- Migration incremental; nunca edite 001..020 se ja aplicadas.
ALTER TABLE external_integrations
  ADD COLUMN order_authority BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX ux_external_integrations_order_authority
  ON external_integrations(store_id) WHERE order_authority AND revoked_at IS NULL;

-- Um pedido local e um numero externo por integracao. Nunca reciclar IDs externos.
CREATE TABLE external_order_links (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  order_id UUID NOT NULL,
  external_order_id VARCHAR(180) NOT NULL,
  source_version BIGINT NOT NULL CHECK(source_version >= 1),
  external_status VARCHAR(30) NOT NULL,
  invoice JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(integration_id,order_id),
  UNIQUE(integration_id,external_order_id),
  FOREIGN KEY(integration_id,store_id) REFERENCES external_integrations(id,store_id) ON DELETE RESTRICT,
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT,
  CONSTRAINT external_order_links_invoice_object CHECK(invoice IS NULL OR jsonb_typeof(invoice)='object')
);
CREATE INDEX ix_external_order_links_store_updated ON external_order_links(store_id,updated_at DESC);

-- Chave idempotente do ERP, vinculada ao pedido e ao hash canonico da requisicao.
CREATE TABLE external_order_operations (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  event_id UUID NOT NULL,
  order_id UUID NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  source_version BIGINT NOT NULL CHECK(source_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(integration_id,event_id),
  FOREIGN KEY(integration_id,store_id) REFERENCES external_integrations(id,store_id) ON DELETE RESTRICT,
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_external_order_operations_created ON external_order_operations(integration_id,created_at DESC);

-- Preserva documentos fiscais informados pelo ERP, inclusive cancelamentos e substituicoes.
-- Isto e SOMENTE referencia documental: a autorizacao deve ser verificada no emissor/SEFAZ.
CREATE TABLE external_order_fiscal_documents (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  order_id UUID NOT NULL,
  access_key CHAR(44) NOT NULL,
  document JSONB NOT NULL CHECK(jsonb_typeof(document)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(integration_id,access_key),
  FOREIGN KEY(integration_id,order_id) REFERENCES external_order_links(integration_id,order_id) ON DELETE RESTRICT,
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_external_fiscal_docs_order ON external_order_fiscal_documents(integration_id,order_id,created_at DESC);
