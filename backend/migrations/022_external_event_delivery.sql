-- Frequencia40 ERP/PDV - Fase 4: fila duravel de entrega por integracao.
-- Aplicar APOS 019, 020 e 021. NUNCA alterar migrations anteriores.
-- Modo POLL e o padrao: nenhuma integracao antiga muda de comportamento so pelo deploy.
ALTER TABLE external_integrations
  ADD COLUMN delivery_mode VARCHAR(12) NOT NULL DEFAULT 'POLL'
  CONSTRAINT external_integrations_delivery_mode_chk CHECK (delivery_mode IN ('POLL','LEASED'));

-- FK composta impede entregar evento de outra loja mesmo em caso de erro de aplicacao.
ALTER TABLE external_change_events ADD CONSTRAINT ux_external_change_events_id_store UNIQUE(id,store_id);

CREATE TABLE external_event_deliveries (
  integration_id UUID NOT NULL,
  store_id UUID NOT NULL,
  event_id BIGINT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_FLIGHT','ACKED','DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1000),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  lease_token_hash CHAR(64),
  last_error_code VARCHAR(48),
  last_error_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id,event_id),
  FOREIGN KEY (integration_id,store_id) REFERENCES external_integrations(id,store_id) ON DELETE RESTRICT,
  FOREIGN KEY (event_id,store_id) REFERENCES external_change_events(id,store_id) ON DELETE RESTRICT,
  CHECK ((status='IN_FLIGHT' AND lease_expires_at IS NOT NULL AND lease_token_hash IS NOT NULL)
    OR (status='ACKED' AND lease_expires_at IS NULL AND lease_token_hash IS NOT NULL)
    OR (status IN ('PENDING','DEAD') AND lease_expires_at IS NULL AND lease_token_hash IS NULL))
);
CREATE INDEX ix_external_event_deliveries_due
  ON external_event_deliveries(integration_id,status,next_attempt_at,event_id)
  WHERE status IN ('PENDING','IN_FLIGHT');
CREATE INDEX ix_external_event_deliveries_lease
  ON external_event_deliveries(integration_id,lease_expires_at)
  WHERE status='IN_FLIGHT';
CREATE INDEX ix_external_event_deliveries_dead
  ON external_event_deliveries(integration_id,event_id)
  WHERE status='DEAD';
