-- Frequencia40 F5.9: ultimo ciclo reportado pelo processo do conector.
-- Esta tabela NAO representa status online do ERP, nem confirma pedidos.
-- Aplicar apos 022; nao alterar migrations anteriores.
CREATE TABLE external_connector_health (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  component VARCHAR(16) NOT NULL DEFAULT 'ORDERS'
    CHECK (component IN ('ORDERS')),
  last_result VARCHAR(12) NOT NULL
    CHECK (last_result IN ('OK','WARNING','ERROR')),
  last_error_code VARCHAR(48),
  last_summary JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(last_summary) = 'object'),
  last_report_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at TIMESTAMPTZ,
  PRIMARY KEY (integration_id, component),
  FOREIGN KEY (integration_id, store_id)
    REFERENCES external_integrations(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_external_connector_health_store ON external_connector_health(store_id,last_report_at DESC);
