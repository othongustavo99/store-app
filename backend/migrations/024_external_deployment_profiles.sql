-- Frequencia40 F5.11. Perfil administrativo por loja e integracao.
-- NUNCA armazenar credenciais de ERP, tokens OAuth, senhas nem dados de compradores.
-- O checklist e declaratorio: NAO habilita workers nem certifica homologacao.
CREATE TABLE external_integration_deployments (
  store_id UUID NOT NULL,
  integration_id UUID NOT NULL,
  environment VARCHAR(16) NOT NULL DEFAULT 'HOMOLOGATION'
    CHECK (environment IN ('HOMOLOGATION','PRODUCTION')),
  worker_alias VARCHAR(48),
  credentials_secured BOOLEAN NOT NULL DEFAULT FALSE,
  provider_access_checked BOOLEAN NOT NULL DEFAULT FALSE,
  catalog_checked BOOLEAN NOT NULL DEFAULT FALSE,
  orders_checked BOOLEAN NOT NULL DEFAULT FALSE,
  reconciliation_checked BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, integration_id),
  FOREIGN KEY (integration_id, store_id)
    REFERENCES external_integrations(id, store_id) ON DELETE RESTRICT,
  CONSTRAINT deployment_worker_alias CHECK (
    worker_alias IS NULL OR worker_alias ~ '^[a-z0-9][a-z0-9-]{2,47}$'
  )
);
CREATE INDEX ix_external_deployment_profiles_updated
  ON external_integration_deployments(store_id, updated_at DESC);
