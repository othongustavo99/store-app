-- F5.22: planejamento comercial isolado por loja, SEM credenciais e SEM ativação de gateways.
-- Não modifica checkout, reembolsos nem fretes. Migração aditiva e imutável.
CREATE TABLE store_commercial_rollouts (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
  payment_provider VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (payment_provider IN ('NONE','MERCADOPAGO','OTHER')),
  payment_stage VARCHAR(26) NOT NULL DEFAULT 'NOT_PLANNED'
    CHECK (payment_stage IN ('NOT_PLANNED','PLANNED','CREDENTIALS_PENDING','HOMOLOGATION_PENDING')),
  payment_environment VARCHAR(12) NOT NULL DEFAULT 'SANDBOX'
    CHECK (payment_environment IN ('SANDBOX','PRODUCTION')),
  refund_stage VARCHAR(12) NOT NULL DEFAULT 'NOT_PLANNED'
    CHECK (refund_stage IN ('NOT_PLANNED','PLANNED')),
  carrier_provider VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (carrier_provider IN ('NONE','MELHOR_ENVIO','OTHER')),
  carrier_stage VARCHAR(26) NOT NULL DEFAULT 'NOT_PLANNED'
    CHECK (carrier_stage IN ('NOT_PLANNED','PLANNED','CREDENTIALS_PENDING','HOMOLOGATION_PENDING')),
  carrier_environment VARCHAR(12) NOT NULL DEFAULT 'SANDBOX'
    CHECK (carrier_environment IN ('SANDBOX','PRODUCTION')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commercial_payment_plan_consistency CHECK (
    (payment_provider = 'NONE' AND payment_stage = 'NOT_PLANNED' AND refund_stage = 'NOT_PLANNED')
    OR (payment_provider <> 'NONE' AND payment_stage <> 'NOT_PLANNED')
  ),
  CONSTRAINT commercial_carrier_plan_consistency CHECK (
    (carrier_provider = 'NONE' AND carrier_stage = 'NOT_PLANNED')
    OR (carrier_provider <> 'NONE' AND carrier_stage <> 'NOT_PLANNED')
  ),
  CONSTRAINT commercial_refund_provider CHECK (refund_stage = 'NOT_PLANNED' OR payment_provider = 'MERCADOPAGO')
);
CREATE INDEX ix_commercial_rollouts_updated ON store_commercial_rollouts(updated_at DESC);
