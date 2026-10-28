-- Fase 4.2: convites temporários para equipes. Nunca salvar código em texto claro.
CREATE TABLE store_team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  email TEXT NOT NULL CHECK (email = lower(email)),
  role TEXT NOT NULL CHECK (role IN ('MANAGER','STAFF')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT invite_accepted_consistent CHECK (
    (accepted_at IS NULL AND accepted_by IS NULL) OR
    (accepted_at IS NOT NULL AND accepted_by IS NOT NULL)
  )
);
CREATE INDEX ix_team_invites_store_created ON store_team_invitations(store_id, created_at DESC);
CREATE INDEX ix_team_invites_pending ON store_team_invitations(store_id, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
